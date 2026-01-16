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
    opencode_cmd: []const u8,

    /// Initialize executor
    pub fn init(cfg: *const config.Config, log: *Logger, allocator: Allocator) Executor {
        return Executor{
            .cfg = cfg,
            .log = log,
            .allocator = allocator,
            .session_id = null,
            .opencode_cmd = "opencode",
        };
    }

    /// Initialize executor with custom opencode command (for testing)
    pub fn initWithCmd(cfg: *const config.Config, log: *Logger, allocator: Allocator, opencode_cmd: []const u8) Executor {
        return Executor{
            .cfg = cfg,
            .log = log,
            .allocator = allocator,
            .session_id = null,
            .opencode_cmd = opencode_cmd,
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

        try args.append(self.allocator, self.opencode_cmd);
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

        if (child.stdout) |stdout| {
            var buf: [4096]u8 = undefined;
            while (true) {
                const n = stdout.read(&buf) catch break;
                if (n == 0) break;
                stdout_list.appendSlice(self.allocator, buf[0..n]) catch |err| {
                    stdout_list.deinit(self.allocator);
                    return err;
                };
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

// Test helper: Create a minimal mock logger for testing
fn createTestLogger(allocator: Allocator) !*Logger {
    // Create a temp directory for logging
    const temp_dir = try std.fmt.allocPrint(allocator, "/tmp/opencoder_test_{d}", .{std.time.milliTimestamp()});
    defer allocator.free(temp_dir);

    try std.fs.cwd().makePath(temp_dir);

    const cycle_log_dir = try std.fs.path.join(allocator, &.{ temp_dir, "cycles" });
    const alerts_file = try std.fs.path.join(allocator, &.{ temp_dir, "alerts.log" });

    try std.fs.cwd().makePath(cycle_log_dir);

    const logger_ptr = try allocator.create(Logger);
    logger_ptr.* = Logger{
        .main_log = null,
        .cycle_log_dir = cycle_log_dir,
        .alerts_file = alerts_file,
        .cycle = 0,
        .verbose = false,
        .allocator = allocator,
    };
    return logger_ptr;
}

fn destroyTestLogger(logger_ptr: *Logger, allocator: Allocator) void {
    // Clean up temp directory
    const temp_base = std.fs.path.dirname(logger_ptr.cycle_log_dir) orelse "/tmp";
    std.fs.cwd().deleteTree(temp_base) catch {};

    allocator.free(logger_ptr.cycle_log_dir);
    allocator.free(logger_ptr.alerts_file);
    allocator.destroy(logger_ptr);
}

test "Executor.init creates executor" {
    const allocator = std.testing.allocator;
    const test_logger = try createTestLogger(allocator);
    defer destroyTestLogger(test_logger, allocator);

    const test_cfg = config.Config{
        .planning_model = "test/model",
        .execution_model = "test/model",
        .project_dir = "/tmp",
        .verbose = false,
        .user_hint = null,
        .max_retries = 3,
        .backoff_base = 1,
        .log_retention = 30,
    };

    const executor = Executor.init(&test_cfg, test_logger, allocator);
    try std.testing.expectEqualStrings("opencode", executor.opencode_cmd);
    try std.testing.expect(executor.session_id == null);
}

test "Executor.initWithCmd creates executor with custom command" {
    const allocator = std.testing.allocator;
    const test_logger = try createTestLogger(allocator);
    defer destroyTestLogger(test_logger, allocator);

    const test_cfg = config.Config{
        .planning_model = "test/model",
        .execution_model = "test/model",
        .project_dir = "/tmp",
        .verbose = false,
        .user_hint = null,
        .max_retries = 3,
        .backoff_base = 1,
        .log_retention = 30,
    };

    const executor = Executor.initWithCmd(&test_cfg, test_logger, allocator, "./test_helpers/mock_opencode.sh");
    try std.testing.expectEqualStrings("./test_helpers/mock_opencode.sh", executor.opencode_cmd);
}

test "ExecutionResult enum values" {
    try std.testing.expectEqual(ExecutionResult.success, ExecutionResult.success);
    try std.testing.expectEqual(ExecutionResult.failure, ExecutionResult.failure);
}

test "runOpencode handles successful execution" {
    const allocator = std.testing.allocator;
    const test_logger = try createTestLogger(allocator);
    defer destroyTestLogger(test_logger, allocator);

    const test_cfg = config.Config{
        .planning_model = "test/model",
        .execution_model = "test/model",
        .project_dir = "/tmp",
        .verbose = false,
        .user_hint = null,
        .max_retries = 3,
        .backoff_base = 1,
        .log_retention = 30,
    };

    // Get absolute path to mock script
    var cwd_buf: [std.fs.max_path_bytes]u8 = undefined;
    const cwd = try std.fs.cwd().realpath(".", &cwd_buf);
    const mock_path = try std.fs.path.join(allocator, &.{ cwd, "test_helpers/mock_opencode_success.sh" });
    defer allocator.free(mock_path);

    var executor = Executor.initWithCmd(&test_cfg, test_logger, allocator, mock_path);
    defer executor.deinit();

    const result = try executor.runOpencode("test/model", "Test", "test prompt", false);
    defer allocator.free(result);

    try std.testing.expect(result.len > 0);
    try std.testing.expect(std.mem.indexOf(u8, result, "Mock opencode output") != null);
}

test "runOpencode handles process failure" {
    const allocator = std.testing.allocator;
    const test_logger = try createTestLogger(allocator);
    defer destroyTestLogger(test_logger, allocator);

    const test_cfg = config.Config{
        .planning_model = "test/model",
        .execution_model = "test/model",
        .project_dir = "/tmp",
        .verbose = false,
        .user_hint = null,
        .max_retries = 3,
        .backoff_base = 1,
        .log_retention = 30,
    };

    // Get absolute path to mock script
    var cwd_buf: [std.fs.max_path_bytes]u8 = undefined;
    const cwd = try std.fs.cwd().realpath(".", &cwd_buf);
    const mock_path = try std.fs.path.join(allocator, &.{ cwd, "test_helpers/mock_opencode_failure.sh" });
    defer allocator.free(mock_path);

    var executor = Executor.initWithCmd(&test_cfg, test_logger, allocator, mock_path);
    defer executor.deinit();

    const result = executor.runOpencode("test/model", "Test", "test prompt", false);
    try std.testing.expectError(error.OpencodeFailed, result);
}

test "runOpencode passes session ID when continuing" {
    const allocator = std.testing.allocator;
    const test_logger = try createTestLogger(allocator);
    defer destroyTestLogger(test_logger, allocator);

    const test_cfg = config.Config{
        .planning_model = "test/model",
        .execution_model = "test/model",
        .project_dir = "/tmp",
        .verbose = false,
        .user_hint = null,
        .max_retries = 3,
        .backoff_base = 1,
        .log_retention = 30,
    };

    // Get absolute path to mock script
    var cwd_buf: [std.fs.max_path_bytes]u8 = undefined;
    const cwd = try std.fs.cwd().realpath(".", &cwd_buf);
    const mock_path = try std.fs.path.join(allocator, &.{ cwd, "test_helpers/mock_opencode_success.sh" });
    defer allocator.free(mock_path);

    var executor = Executor.initWithCmd(&test_cfg, test_logger, allocator, mock_path);
    defer executor.deinit();

    // Set a session ID
    executor.session_id = try std.fmt.allocPrint(allocator, "test_session_123", .{});

    const result = try executor.runOpencode("test/model", "Test", "test prompt", true);
    defer allocator.free(result);

    try std.testing.expect(result.len > 0);
}
