//! OpenCode CLI executor for opencoder.
//!
//! Spawns and manages opencode CLI processes for planning,
//! task execution, and evaluation phases.

const std = @import("std");
const posix = std.posix;
const Allocator = std.mem.Allocator;

const config = @import("config.zig");
const Logger = @import("logger.zig").Logger;
const plan = @import("plan.zig");

/// Result of an execution
pub const ExecutionResult = enum {
    success,
    failure,
};

/// Result of idea selection containing index and reason
pub const IdeaSelection = struct {
    index: usize,
    reason: []const u8,
};

/// Graceful shutdown timeout in seconds
const GRACEFUL_SHUTDOWN_TIMEOUT_SECS: u64 = 5;

/// Executor for running opencode CLI commands
pub const Executor = struct {
    cfg: *const config.Config,
    log: *Logger,
    allocator: Allocator,
    opencode_cmd: []const u8,
    current_child_pid: ?std.posix.pid_t,
    current_child_pgid: ?std.posix.pid_t,

    /// Initialize executor
    pub fn init(cfg: *const config.Config, log: *Logger, allocator: Allocator) Executor {
        return Executor{
            .cfg = cfg,
            .log = log,
            .allocator = allocator,
            .opencode_cmd = "opencode",
            .current_child_pid = null,
            .current_child_pgid = null,
        };
    }

    /// Initialize executor with custom opencode command (for testing)
    pub fn initWithCmd(cfg: *const config.Config, log: *Logger, allocator: Allocator, opencode_cmd: []const u8) Executor {
        return Executor{
            .cfg = cfg,
            .log = log,
            .allocator = allocator,
            .opencode_cmd = opencode_cmd,
            .current_child_pid = null,
            .current_child_pgid = null,
        };
    }

    /// Cleanup executor resources
    pub fn deinit(self: *Executor) void {
        _ = self;
    }

    /// Run planning phase
    pub fn runPlanning(self: *Executor, cycle: u32) !ExecutionResult {
        self.log.statusFmt("[Cycle {d}] Planning...", .{cycle});

        const prompt = try plan.generatePlanningPrompt(cycle, self.cfg.user_hint, self.allocator);
        defer self.allocator.free(prompt);

        var title_buf: [64]u8 = undefined;
        const title = std.fmt.bufPrint(&title_buf, "Opencoder Planning Cycle {d}", .{cycle}) catch "Opencoder Planning";

        return try self.runWithRetry(self.cfg.planning_model, title, prompt);
    }

    /// Run task execution
    pub fn runTask(self: *Executor, task_desc: []const u8, cycle: u32, task_num: u32, total_tasks: u32) !ExecutionResult {
        self.log.sayFmt("[Cycle {d}] Task {d}/{d}: {s}", .{ cycle, task_num, total_tasks, task_desc });

        const prompt = try plan.generateExecutionPrompt(task_desc, self.cfg.user_hint, self.allocator);
        defer self.allocator.free(prompt);

        var title_buf: [64]u8 = undefined;
        const title = std.fmt.bufPrint(&title_buf, "Opencoder Execution Cycle {d}", .{cycle}) catch "Opencoder Execution";

        return try self.runWithRetry(self.cfg.execution_model, title, prompt);
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
                self.log.statusFmt("[Cycle {d}] Evaluation retry {d}/{d}", .{ cycle, attempt + 1, self.cfg.max_retries });
            }

            const result = self.runOpencode(self.cfg.planning_model, title, prompt);
            if (result) |output| {
                // Check for COMPLETE or NEEDS_WORK in output
                if (std.mem.indexOf(u8, output, "COMPLETE") != null) {
                    self.log.logFmt("[Cycle {d}] Evaluation result: COMPLETE", .{cycle});
                    self.allocator.free(output);
                    return "COMPLETE";
                } else if (std.mem.indexOf(u8, output, "NEEDS_WORK") != null) {
                    self.log.logFmt("[Cycle {d}] Evaluation result: NEEDS_WORK", .{cycle});
                    self.allocator.free(output);
                    return "NEEDS_WORK";
                } else {
                    self.log.logErrorFmt("[Cycle {d}] Evaluation returned unexpected response", .{cycle});
                    self.log.logError("  Expected: 'COMPLETE' or 'NEEDS_WORK'");
                    self.log.logError("  Hint: The evaluation model may need more specific instructions");
                }
                self.allocator.free(output);
            } else |err| {
                self.log.logErrorFmt("[Cycle {d}] Evaluation attempt {d} failed: {s}", .{ cycle, attempt + 1, @errorName(err) });
            }

            // Backoff before retry
            if (attempt + 1 < self.cfg.max_retries) {
                const sleep_time = self.cfg.backoff_base * std.math.pow(u32, 2, attempt);
                self.log.statusFmt("[Cycle {d}] Waiting {d}s before retry...", .{ cycle, sleep_time });
                std.Thread.sleep(@as(u64, sleep_time) * std.time.ns_per_s);
            }
        }

        // Default to NEEDS_WORK if we couldn't determine
        self.log.logError("");
        self.log.logErrorFmt("[Cycle {d}] Failed to get evaluation result after {d} attempts", .{ cycle, self.cfg.max_retries });
        self.log.logError("  Defaulting to NEEDS_WORK to continue safely");
        self.log.logError("  Possible causes:");
        self.log.logError("    - Model API unavailable or rate limited");
        self.log.logError("    - Evaluation prompt not producing expected output");
        self.log.logError("    - Network connectivity issues");
        return "NEEDS_WORK";
    }

    /// Run idea selection - AI picks simplest idea considering dependencies
    /// Returns IdeaSelection with 0-indexed idea number and reason, or null if parsing fails
    pub fn runIdeaSelection(self: *Executor, ideas_formatted: []const u8, cycle: u32) !?IdeaSelection {
        self.log.statusFmt("[Cycle {d}] Selecting idea...", .{cycle});

        const prompt = try plan.generateIdeaSelectionPrompt(ideas_formatted, self.allocator);
        defer self.allocator.free(prompt);

        var title_buf: [64]u8 = undefined;
        const title = std.fmt.bufPrint(&title_buf, "Opencoder Idea Selection Cycle {d}", .{cycle}) catch "Opencoder Idea Selection";

        // Run and capture output
        const output = self.runOpencode(self.cfg.planning_model, title, prompt) catch |err| {
            self.log.logErrorFmt("[Cycle {d}] Idea selection failed: {s}", .{ cycle, @errorName(err) });
            return null;
        };
        defer self.allocator.free(output);

        // Parse "SELECTED_IDEA: <number>" from output
        var selected_index: ?usize = null;
        if (std.mem.indexOf(u8, output, "SELECTED_IDEA:")) |start| {
            const after_colon = output[start + 14 ..]; // Skip "SELECTED_IDEA:"
            const trimmed = std.mem.trim(u8, after_colon, " \t\n\r");

            // Parse the first number found
            var end: usize = 0;
            while (end < trimmed.len and trimmed[end] >= '0' and trimmed[end] <= '9') : (end += 1) {}

            if (end > 0) {
                const num = std.fmt.parseInt(usize, trimmed[0..end], 10) catch return null;
                if (num >= 1) {
                    selected_index = num - 1; // Convert to 0-indexed
                }
            }
        }

        if (selected_index == null) {
            self.log.logError("Failed to parse SELECTED_IDEA from AI response");
            return null;
        }

        // Parse "REASON: <text>" from output
        var reason: []const u8 = "No reason provided";
        if (std.mem.indexOf(u8, output, "REASON:")) |start| {
            const after_colon = output[start + 7 ..]; // Skip "REASON:"
            const trimmed = std.mem.trim(u8, after_colon, " \t");

            // Find end of line or end of string
            const end = std.mem.indexOf(u8, trimmed, "\n") orelse trimmed.len;
            reason = std.mem.trim(u8, trimmed[0..end], " \t\n\r");
        }

        return IdeaSelection{
            .index = selected_index.?,
            .reason = try self.allocator.dupe(u8, reason),
        };
    }

    /// Run planning phase for a specific idea
    pub fn runIdeaPlanning(self: *Executor, idea_content: []const u8, idea_filename: []const u8, cycle: u32) !ExecutionResult {
        self.log.statusFmt("[Cycle {d}] Planning for idea: {s}", .{ cycle, idea_filename });

        const prompt = try plan.generateIdeaPlanningPrompt(cycle, idea_content, idea_filename, self.allocator);
        defer self.allocator.free(prompt);

        var title_buf: [64]u8 = undefined;
        const title = std.fmt.bufPrint(&title_buf, "Opencoder Planning Cycle {d}", .{cycle}) catch "Opencoder Planning";

        return try self.runWithRetry(self.cfg.planning_model, title, prompt);
    }

    /// Check if a child process is still running
    pub fn isChildRunning(self: *Executor) bool {
        if (self.current_child_pid) |pid| {
            return posix.kill(pid, 0) == null;
        }
        return false;
    }

    /// Kill current child process gracefully (SIGTERM, then SIGKILL if needed)
    pub fn killCurrentChild(self: *Executor) void {
        if (self.current_child_pid == null) return;

        // Try graceful shutdown first
        const gracefully_terminated = self.terminateChildGracefully();

        if (!gracefully_terminated) {
            self.log.logError("Graceful termination timed out, forcing kill...");
            self.killCurrentChildForce();
        }

        self.current_child_pid = null;
        self.current_child_pgid = null;
    }

    /// Attempt to gracefully terminate the child process with timeout
    /// Returns true if process terminated gracefully, false if force kill needed
    fn terminateChildGracefully(self: *Executor) bool {
        const pid = self.current_child_pid orelse return true;
        const pgid = self.current_child_pgid;

        // Send SIGTERM to the entire process group
        if (pgid) |group| {
            posix.kill(-group, posix.SIG.TERM) catch {};
        } else {
            posix.kill(pid, posix.SIG.TERM) catch {};
        }

        // Wait for process to terminate with timeout
        const timeout_ns = GRACEFUL_SHUTDOWN_TIMEOUT_SECS * std.time.ns_per_s;
        const start = std.time.nanoTimestamp();

        while (std.time.nanoTimestamp() - start < timeout_ns) {
            // Check if process is still running
            if (posix.kill(pid, 0) == error.ProcessNotFound) {
                self.log.logFmt("Child process (PID: {d}) terminated gracefully", .{pid});
                return true;
            }
            // Sleep for a short interval before checking again
            std.Thread.sleep(50 * std.time.ns_per_ms);
        }

        self.log.logErrorFmt("Child process (PID: {d}) did not terminate within {d}s, force killing...", .{
            pid,
            GRACEFUL_SHUTDOWN_TIMEOUT_SECS,
        });
        return false;
    }

    /// Force kill the current child process and its entire process group
    fn killCurrentChildForce(self: *Executor) void {
        const pid = self.current_child_pid orelse return;
        const pgid = self.current_child_pgid;

        // Send SIGKILL to the entire process group
        if (pgid) |group| {
            posix.kill(-group, posix.SIG.KILL) catch |err| {
                self.log.logErrorFmt("Failed to kill process group {d}: {s}", .{ group, @errorName(err) });
            };
        } else {
            posix.kill(pid, posix.SIG.KILL) catch |err| {
                self.log.logErrorFmt("Failed to kill process {d}: {s}", .{ pid, @errorName(err) });
            };
        }

        // Wait for the process to be reaped
        _ = posix.waitpid(pid, 0);

        self.log.logFmt("Force killed child process (PID: {d})", .{pid});
    }

    /// Kill all child processes (for emergency shutdown)
    pub fn killAllChildren(self: *Executor) void {
        if (self.current_child_pid != null) {
            self.killCurrentChild();
        }
    }

    // Internal helper to run with retry logic
    fn runWithRetry(self: *Executor, model: []const u8, title: []const u8, prompt: []const u8) !ExecutionResult {
        var attempt: u32 = 0;

        while (attempt < self.cfg.max_retries) : (attempt += 1) {
            if (attempt > 0) {
                self.log.logFmt("Retry attempt {d}/{d}", .{ attempt + 1, self.cfg.max_retries });
            }

            const result = self.runOpencode(model, title, prompt);
            if (result) |output| {
                self.allocator.free(output);
                return .success;
            } else |err| {
                self.log.logErrorFmt("OpenCode execution failed (attempt {d}/{d})", .{ attempt + 1, self.cfg.max_retries });
                self.log.logErrorFmt("  Model: {s}", .{model});
                self.log.logErrorFmt("  Error: {s}", .{@errorName(err)});

                if (attempt + 1 == self.cfg.max_retries) {
                    // Last attempt, provide detailed troubleshooting
                    self.log.logError("");
                    self.log.logError("All retry attempts exhausted. Troubleshooting tips:");
                    self.log.logError("  1. Verify 'opencode' CLI is installed: which opencode");
                    self.log.logError("  2. Check if opencode works directly: opencode --version");
                    self.log.logError("  3. Verify model is available: opencode models list");
                    self.log.logError("  4. Check API credentials are configured properly");
                    self.log.logError("  5. Review network connectivity and API rate limits");
                    self.log.logErrorFmt("  6. Try increasing OPENCODER_MAX_RETRIES (current: {d})", .{self.cfg.max_retries});
                }
            }

            // Backoff before retry
            if (attempt + 1 < self.cfg.max_retries) {
                const sleep_time = self.cfg.backoff_base * std.math.pow(u32, 2, attempt);
                self.log.logFmt("Waiting {d}s before retry...", .{sleep_time});
                std.Thread.sleep(@as(u64, sleep_time) * std.time.ns_per_s);
            }
        }

        return .failure;
    }

    // Run opencode CLI and return output with real-time stdout/stderr display
    fn runOpencode(self: *Executor, model: []const u8, title: []const u8, prompt: []const u8) ![]u8 {
        var args = std.ArrayListUnmanaged([]const u8){};
        defer args.deinit(self.allocator);

        try args.append(self.allocator, self.opencode_cmd);
        try args.append(self.allocator, "run");
        try args.append(self.allocator, "--model");
        try args.append(self.allocator, model);
        try args.append(self.allocator, "--title");
        try args.append(self.allocator, title);
        try args.append(self.allocator, prompt);

        self.log.logVerbose("Running opencode...");

        var child = std.process.Child.init(args.items, self.allocator);
        child.cwd = null; // Use current working directory

        // Capture both stdout and stderr for real-time display
        child.stdout_behavior = .Pipe;
        child.stderr_behavior = .Pipe;

        // Create a new process group for the child so we can kill all descendants
        child.pgid = 0; // 0 means child creates its own process group

        try child.spawn();

        // Store PID and PGID for potential termination
        self.current_child_pid = child.id;
        self.current_child_pgid = child.id; // Child is leader of its own process group
        defer {
            self.current_child_pid = null;
            self.current_child_pgid = null;
        }

        // Read stdout and stderr in real-time, displaying output as it arrives
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
                // Display output in real-time
                const chunk = buf[0..n];
                self.log.logVerbose(chunk);
            }
        }

        // Read stderr in real-time
        if (child.stderr) |stderr| {
            var buf: [4096]u8 = undefined;
            while (true) {
                const n = stderr.read(&buf) catch break;
                if (n == 0) break;
                // Display stderr output in real-time (prefixed to distinguish from stdout)
                const chunk = buf[0..n];
                self.log.logVerbose(chunk);
            }
        }

        const term = try child.wait();

        switch (term) {
            .Exited => |code| {
                if (code == 0) {
                    return stdout_list.toOwnedSlice(self.allocator);
                }
                self.log.logErrorFmt("OpenCode process exited with non-zero status", .{});
                self.log.logErrorFmt("  Exit code: {d}", .{code});
                self.log.logErrorFmt("  Model: {s}", .{model});
                self.log.logErrorFmt("  Title: {s}", .{title});

                // Provide context based on exit code
                if (code == 1) {
                    self.log.logError("  Common causes: Invalid arguments, API authentication failure");
                } else if (code == 2) {
                    self.log.logError("  Common causes: Model not found, invalid model specification");
                } else if (code >= 126 and code <= 127) {
                    self.log.logError("  Common causes: opencode CLI not found or not executable");
                    self.log.logError("  Hint: Verify installation with 'which opencode'");
                }
            },
            .Signal => |sig| {
                self.log.logErrorFmt("OpenCode process terminated by signal {d}", .{sig});
                self.log.logErrorFmt("  Model: {s}", .{model});
                self.log.logError("  This usually indicates the process was killed externally");
                self.log.logError("  Hint: Check system resources (memory, CPU) and logs");
            },
            .Stopped => |sig| {
                self.log.logErrorFmt("OpenCode process stopped by signal {d}", .{sig});
                self.log.logErrorFmt("  Model: {s}", .{model});
            },
            .Unknown => |status| {
                self.log.logErrorFmt("OpenCode process terminated with unknown status {d}", .{status});
                self.log.logErrorFmt("  Model: {s}", .{model});
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

    const main_log_path = try std.fs.path.join(allocator, &.{ temp_dir, "main.log" });
    const cycle_log_dir = try std.fs.path.join(allocator, &.{ temp_dir, "cycles" });
    const alerts_file = try std.fs.path.join(allocator, &.{ temp_dir, "alerts.log" });

    try std.fs.cwd().makePath(cycle_log_dir);

    const logger_ptr = try allocator.create(Logger);
    logger_ptr.* = Logger{
        .main_log = null,
        .main_log_path = main_log_path,
        .cycle_log_dir = cycle_log_dir,
        .alerts_file = alerts_file,
        .cycle = 0,
        .verbose = false,
        .allocator = allocator,
        .buffer_size = 2048,
    };
    return logger_ptr;
}

fn destroyTestLogger(logger_ptr: *Logger, allocator: Allocator) void {
    // Clean up temp directory
    const temp_base = std.fs.path.dirname(logger_ptr.cycle_log_dir) orelse "/tmp";
    std.fs.cwd().deleteTree(temp_base) catch {};

    allocator.free(logger_ptr.main_log_path);
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
        .max_file_size = 1024 * 1024,
        .log_buffer_size = 2048,
        .task_pause_seconds = 2,
    };

    const executor = Executor.init(&test_cfg, test_logger, allocator);
    try std.testing.expectEqualStrings("opencode", executor.opencode_cmd);
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
        .max_file_size = 1024 * 1024,
        .log_buffer_size = 2048,
        .task_pause_seconds = 2,
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
        .max_file_size = 1024 * 1024,
        .log_buffer_size = 2048,
        .task_pause_seconds = 2,
    };

    // Get absolute path to mock script
    var cwd_buf: [std.fs.max_path_bytes]u8 = undefined;
    const cwd = try std.fs.cwd().realpath(".", &cwd_buf);
    const mock_path = try std.fs.path.join(allocator, &.{ cwd, "test_helpers/mock_opencode_success.sh" });
    defer allocator.free(mock_path);

    var executor = Executor.initWithCmd(&test_cfg, test_logger, allocator, mock_path);
    defer executor.deinit();

    const result = try executor.runOpencode("test/model", "Test", "test prompt");
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
        .max_file_size = 1024 * 1024,
        .log_buffer_size = 2048,
        .task_pause_seconds = 2,
    };

    // Get absolute path to mock script
    var cwd_buf: [std.fs.max_path_bytes]u8 = undefined;
    const cwd = try std.fs.cwd().realpath(".", &cwd_buf);
    const mock_path = try std.fs.path.join(allocator, &.{ cwd, "test_helpers/mock_opencode_failure.sh" });
    defer allocator.free(mock_path);

    var executor = Executor.initWithCmd(&test_cfg, test_logger, allocator, mock_path);
    defer executor.deinit();

    const result = executor.runOpencode("test/model", "Test", "test prompt");
    try std.testing.expectError(error.OpencodeFailed, result);
}
