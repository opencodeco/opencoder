//! OpenCode CLI executor for opencoder.
//!
//! Spawns and manages opencode CLI processes for planning,
//! task execution, and evaluation phases.

const std = @import("std");
const Allocator = std.mem.Allocator;

const config = @import("config.zig");
const Logger = @import("logger.zig").Logger;
const plan = @import("plan.zig");

/// Result of an execution
pub const ExecutionResult = enum {
    success,
    failure,
};

/// Executor for running opencode CLI commands
pub const Executor = struct {
    cfg: *const config.Config,
    log: *Logger,
    allocator: Allocator,
    session_id: ?[]const u8,

    /// Initialize executor
    pub fn init(cfg: *const config.Config, log: *Logger, allocator: Allocator) Executor {
        return Executor{
            .cfg = cfg,
            .log = log,
            .allocator = allocator,
            .session_id = null,
        };
    }

    /// Cleanup executor resources
    pub fn deinit(self: *Executor) void {
        if (self.session_id) |sid| {
            self.allocator.free(sid);
        }
    }

    /// Run planning phase
    pub fn runPlanning(self: *Executor, cycle: u32) !ExecutionResult {
        self.log.statusFmt("[Cycle {d}] Planning...", .{cycle});

        const prompt = try plan.generatePlanningPrompt(cycle, self.cfg.user_hint, self.allocator);
        defer self.allocator.free(prompt);

        var title_buf: [64]u8 = undefined;
        const title = std.fmt.bufPrint(&title_buf, "Opencoder Planning Cycle {d}", .{cycle}) catch "Opencoder Planning";

        const result = try self.runWithRetry(self.cfg.planning_model, title, prompt, false);

        if (result == .success) {
            // Reset session for new cycle
            self.resetSession();
        }

        return result;
    }

    /// Run task execution
    pub fn runTask(self: *Executor, task_desc: []const u8, cycle: u32, task_num: u32, total_tasks: u32) !ExecutionResult {
        self.log.statusFmt("[Cycle {d}] Task {d}/{d}: {s}", .{ cycle, task_num, total_tasks, task_desc });

        const prompt = try plan.generateExecutionPrompt(task_desc, self.cfg.user_hint, self.allocator);
        defer self.allocator.free(prompt);

        var title_buf: [64]u8 = undefined;
        const title = std.fmt.bufPrint(&title_buf, "Opencoder Execution Cycle {d}", .{cycle}) catch "Opencoder Execution";

        const continue_session = self.session_id != null;
        const result = try self.runWithRetry(self.cfg.execution_model, title, prompt, continue_session);

        if (result == .success and self.session_id == null) {
            // Set session ID after first successful task (allocate owned memory)
            self.session_id = try std.fmt.allocPrint(self.allocator, "cycle_{d}", .{cycle});
        }

        return result;
    }

    /// Run evaluation phase
    pub fn runEvaluation(self: *Executor, cycle: u32) ![]const u8 {
        self.log.statusFmt("[Cycle {d}] Evaluating...", .{cycle});

        const prompt = try plan.generateEvaluationPrompt(self.allocator);

        var title_buf: [64]u8 = undefined;
        const title = std.fmt.bufPrint(&title_buf, "Opencoder Evaluation Cycle {d}", .{cycle}) catch "Opencoder Evaluation";

        // Run opencode and capture output
        var attempt: u32 = 0;
        while (attempt < self.cfg.max_retries) : (attempt += 1) {
            if (attempt > 0) {
                self.log.statusFmt("[Cycle {d}] Evaluating (retry {d}/{d})...", .{ cycle, attempt + 1, self.cfg.max_retries });
            }

            const result = self.runOpencode(self.cfg.planning_model, title, prompt, false);
            if (result) |output| {
                // Check for COMPLETE or NEEDS_WORK in output
                if (std.mem.indexOf(u8, output, "COMPLETE") != null) {
                    self.allocator.free(output);
                    return "COMPLETE";
                } else if (std.mem.indexOf(u8, output, "NEEDS_WORK") != null) {
                    self.allocator.free(output);
                    return "NEEDS_WORK";
                }
                self.allocator.free(output);
            } else |_| {
                // Error running opencode
            }

            // Backoff before retry
            if (attempt + 1 < self.cfg.max_retries) {
                const sleep_time = self.cfg.backoff_base * std.math.pow(u32, 2, attempt);
                self.log.statusFmt("[Cycle {d}] Retrying evaluation in {d}s...", .{ cycle, sleep_time });
                std.Thread.sleep(@as(u64, sleep_time) * std.time.ns_per_s);
            }
        }

        // Default to NEEDS_WORK if we couldn't determine
        self.log.logError("Failed to get evaluation result, defaulting to NEEDS_WORK");
        return "NEEDS_WORK";
    }

    /// Reset session for new cycle
    pub fn resetSession(self: *Executor) void {
        if (self.session_id) |sid| {
            self.allocator.free(sid);
        }
        self.session_id = null;
    }

    // Internal helper to run with retry logic
    fn runWithRetry(self: *Executor, model: []const u8, title: []const u8, prompt: []const u8, continue_session: bool) !ExecutionResult {
        var attempt: u32 = 0;

        while (attempt < self.cfg.max_retries) : (attempt += 1) {
            if (attempt > 0) {
                self.log.logFmt("Attempt {d}/{d}", .{ attempt + 1, self.cfg.max_retries });
            }

            const result = self.runOpencode(model, title, prompt, continue_session);
            if (result) |output| {
                self.allocator.free(output);
                return .success;
            } else |_| {
                self.log.logErrorFmt("opencode failed (attempt {d})", .{attempt + 1});
            }

            // Backoff before retry
            if (attempt + 1 < self.cfg.max_retries) {
                const sleep_time = self.cfg.backoff_base * std.math.pow(u32, 2, attempt);
                self.log.logFmt("Retrying in {d}s...", .{sleep_time});
                std.Thread.sleep(@as(u64, sleep_time) * std.time.ns_per_s);
            }
        }

        return .failure;
    }

    // Run opencode CLI and return output
    fn runOpencode(self: *Executor, model: []const u8, title: []const u8, prompt: []const u8, continue_session: bool) ![]u8 {
        var args = std.ArrayListUnmanaged([]const u8){};
        defer args.deinit(self.allocator);

        try args.append(self.allocator, "opencode");
        try args.append(self.allocator, "run");
        try args.append(self.allocator, "--model");
        try args.append(self.allocator, model);
        try args.append(self.allocator, "--title");
        try args.append(self.allocator, title);

        if (continue_session) {
            if (self.session_id) |sid| {
                try args.append(self.allocator, "--session");
                try args.append(self.allocator, sid);
            }
        }

        try args.append(self.allocator, prompt);

        self.log.logVerbose("Running opencode...");

        var child = std.process.Child.init(args.items, self.allocator);
        child.cwd = null; // Use current working directory

        // Inherit stderr for opencode output, capture stdout for result checking
        child.stderr_behavior = .Inherit;
        child.stdout_behavior = .Pipe;

        try child.spawn();

        // Read stdout
        var stdout_list = std.ArrayListUnmanaged(u8){};
        errdefer stdout_list.deinit(self.allocator);

        if (child.stdout) |stdout| {
            var buf: [4096]u8 = undefined;
            while (true) {
                const n = stdout.read(&buf) catch break;
                if (n == 0) break;
                try stdout_list.appendSlice(self.allocator, buf[0..n]);
            }
        }

        const term = try child.wait();

        switch (term) {
            .Exited => |code| {
                if (code == 0) {
                    return stdout_list.toOwnedSlice(self.allocator);
                }
                self.log.logErrorFmt("opencode exited with code {d}", .{code});
            },
            .Signal => |sig| {
                self.log.logErrorFmt("opencode terminated by signal {d}", .{sig});
            },
            .Stopped => |sig| {
                self.log.logErrorFmt("opencode stopped by signal {d}", .{sig});
            },
            .Unknown => |status| {
                self.log.logErrorFmt("opencode terminated with unknown status {d}", .{status});
            },
        }

        stdout_list.deinit(self.allocator);
        return error.OpencodeFailed;
    }
};

// ============================================================================
// Tests
// ============================================================================

test "Executor.init creates executor" {
    // We can't fully test without a Logger, but we can test initialization structure
    // This is more of a compile-time check
    const allocator = std.testing.allocator;
    _ = allocator;
}

test "ExecutionResult enum values" {
    try std.testing.expectEqual(ExecutionResult.success, ExecutionResult.success);
    try std.testing.expectEqual(ExecutionResult.failure, ExecutionResult.failure);
}
