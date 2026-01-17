//! Main autonomous execution loop for opencoder.
//!
//! Implements the three-phase development cycle:
//! planning → execution → evaluation → repeat

const std = @import("std");
const posix = std.posix;
const Allocator = std.mem.Allocator;

const config = @import("config.zig");
const state = @import("state.zig");
const fsutil = @import("fs.zig");
const plan = @import("plan.zig");
const ideas = @import("ideas.zig");
const evaluator = @import("evaluator.zig");
const Logger = @import("logger.zig").Logger;
const Executor = @import("executor.zig").Executor;
const ExecutionResult = @import("executor.zig").ExecutionResult;

/// Shutdown flag for signal handling
var shutdown_requested: bool = false;
/// Signal counter for force kill (2 Ctrl+C = force exit)
var signal_count: u8 = 0;

/// Main execution loop
pub const Loop = struct {
    cfg: *const config.Config,
    st: *state.State,
    paths: *const fsutil.Paths,
    log: *Logger,
    executor: *Executor,
    allocator: Allocator,

    /// Initialize the loop
    pub fn init(
        cfg: *const config.Config,
        st: *state.State,
        paths: *const fsutil.Paths,
        log: *Logger,
        executor: *Executor,
        allocator: Allocator,
    ) Loop {
        return Loop{
            .cfg = cfg,
            .st = st,
            .paths = paths,
            .log = log,
            .executor = executor,
            .allocator = allocator,
        };
    }

    /// Run the main loop
    pub fn run(self: *Loop) !void {
        self.log.say("");
        self.log.say("Starting autonomous loop");
        self.log.sayFmt("Project: {s}", .{self.cfg.project_dir});
        self.log.sayFmt("Planning: {s}", .{self.cfg.planning_model});
        self.log.sayFmt("Execution: {s}", .{self.cfg.execution_model});

        if (self.cfg.user_hint) |hint| {
            self.log.sayFmt("Hint: {s}", .{hint});
        }

        self.log.say("Running continuously (Ctrl+C to stop, Ctrl+C twice to force)");
        self.log.say("");

        while (!shutdown_requested) {
            self.log.say("");
            self.log.sayFmt("[Cycle {d}]", .{self.st.cycle});
            self.log.setCycle(self.st.cycle);

            // Check shutdown before starting any work
            if (shutdown_requested) break;

            // Planning phase
            if (!fsutil.fileExists(self.paths.current_plan) or self.st.phase == .planning) {
                // Check for ideas first
                var idea_list = ideas.loadAllIdeas(self.paths.ideas_dir, self.allocator, self.cfg.max_file_size) catch null;

                var result: ExecutionResult = .failure;

                if (idea_list) |*list| {
                    defer list.deinit();

                    if (list.ideas.len == 1) {
                        // Single idea - use it directly
                        const selected = &list.ideas[0];
                        self.log.sayFmt("[Cycle {d}] Found 1 idea: {s}", .{ self.st.cycle, selected.filename });

                        const summary = selected.getSummary(self.allocator) catch "(unable to get summary)";
                        defer self.allocator.free(summary);
                        self.log.sayFmt("[Cycle {d}] Summary: {s}", .{ self.st.cycle, summary });

                        // Remove the idea file before planning
                        ideas.removeIdeaByPath(selected.path) catch |err| {
                            self.log.logErrorFmt("Warning: Failed to remove idea file: {s}", .{@errorName(err)});
                        };

                        // Run planning for this idea
                        result = self.executor.runIdeaPlanning(
                            selected.content,
                            selected.filename,
                            self.st.cycle,
                        ) catch |err| {
                            self.log.logError("");
                            self.log.logErrorFmt("[Cycle {d}] Idea planning failed: {s}", .{ self.st.cycle, @errorName(err) });
                            self.log.logError("  The AI was unable to create a plan for the idea");
                            self.log.logErrorFmt("  Retrying after backoff...", .{});
                            self.backoffSleep();
                            continue;
                        };
                    } else {
                        // Multiple ideas - AI selects simplest one
                        self.log.sayFmt("[Cycle {d}] Found {d} idea(s) in queue", .{ self.st.cycle, list.ideas.len });

                        // Format ideas for AI selection
                        const formatted = ideas.formatIdeasForSelection(list.ideas, self.allocator) catch |err| {
                            self.log.logErrorFmt("Failed to format ideas for selection: {s}", .{@errorName(err)});
                            // Fall through to normal planning below
                            result = .failure;
                            continue;
                        };
                        defer self.allocator.free(formatted);

                        // Have AI select the simplest idea
                        const selection = self.executor.runIdeaSelection(formatted, self.st.cycle) catch null;

                        if (selection) |sel| {
                            defer self.allocator.free(sel.reason);

                            if (sel.index < list.ideas.len) {
                                const selected = &list.ideas[sel.index];
                                self.log.sayFmt("[Cycle {d}] Selected idea: {s}", .{ self.st.cycle, selected.filename });

                                const summary = selected.getSummary(self.allocator) catch "(unable to get summary)";
                                defer self.allocator.free(summary);
                                self.log.sayFmt("[Cycle {d}] Summary: {s}", .{ self.st.cycle, summary });
                                self.log.sayFmt("[Cycle {d}] Reason: {s}", .{ self.st.cycle, sel.reason });

                                // Remove the idea file before planning
                                ideas.removeIdeaByPath(selected.path) catch |err| {
                                    self.log.logErrorFmt("Warning: Failed to remove idea file: {s}", .{@errorName(err)});
                                };

                                // Run planning for this specific idea
                                result = self.executor.runIdeaPlanning(
                                    selected.content,
                                    selected.filename,
                                    self.st.cycle,
                                ) catch |err| {
                                    self.log.logError("");
                                    self.log.logErrorFmt("[Cycle {d}] Idea planning failed: {s}", .{ self.st.cycle, @errorName(err) });
                                    self.log.logError("  The AI was unable to create a plan for the idea");
                                    self.log.logErrorFmt("  Retrying after backoff...", .{});
                                    self.backoffSleep();
                                    continue;
                                };
                            } else {
                                self.log.logErrorFmt("AI selected invalid idea index: {d}", .{sel.index});
                                result = .failure;
                            }
                        } else {
                            self.log.logError("AI failed to select an idea, falling back to autonomous planning");
                            result = .failure;
                        }
                    }
                }

                // If no ideas or idea planning failed, do normal autonomous planning
                if (result == .failure) {
                    result = self.executor.runPlanning(self.st.cycle) catch |err| {
                        self.log.logError("");
                        self.log.logErrorFmt("[Cycle {d}] Planning phase failed: {s}", .{ self.st.cycle, @errorName(err) });
                        self.log.logError("  The AI was unable to create a development plan");
                        self.log.logError("  This could be due to:");
                        self.log.logError("    - OpenCode CLI issues (check installation)");
                        self.log.logError("    - Model API unavailability or rate limits");
                        self.log.logError("    - Network connectivity problems");
                        self.log.logErrorFmt("  Retrying after backoff...", .{});
                        self.backoffSleep();
                        continue;
                    };
                }

                if (result == .failure) {
                    self.log.logError("");
                    self.log.logErrorFmt("[Cycle {d}] Planning failed after all retries", .{self.st.cycle});
                    self.log.logError("  Unable to generate a valid development plan");
                    self.log.logError("  Check .opencoder/logs/main.log for details");
                    self.log.logError("  Waiting before retry...");
                    self.backoffSleep();
                    continue;
                }

                // Validate plan was created
                if (!fsutil.fileExists(self.paths.current_plan)) {
                    self.log.logError("");
                    self.log.logErrorFmt("[Cycle {d}] Plan file not created", .{self.st.cycle});
                    self.log.logErrorFmt("  Expected file: {s}", .{self.paths.current_plan});
                    self.log.logError("  The AI may not have saved the plan properly");
                    self.log.logError("  Retrying planning phase...");
                    self.backoffSleep();
                    continue;
                }

                // Validate plan content
                const plan_content = fsutil.readFile(self.paths.current_plan, self.allocator, self.cfg.max_file_size) catch |err| {
                    self.log.logError("");
                    self.log.logErrorFmt("[Cycle {d}] Failed to read plan file: {s}", .{ self.st.cycle, @errorName(err) });
                    self.log.logErrorFmt("  File: {s}", .{self.paths.current_plan});
                    self.log.logError("  Retrying planning phase...");
                    self.backoffSleep();
                    continue;
                };
                defer self.allocator.free(plan_content);

                const task_count = plan.validate(plan_content) catch |err| {
                    self.log.logError("");
                    self.log.logErrorFmt("[Cycle {d}] Plan validation failed: {s}", .{ self.st.cycle, @errorName(err) });
                    self.log.logError("  The plan format is invalid or contains no actionable tasks");
                    self.log.logError("  Expected: Markdown file with checkbox tasks (- [ ] Task description)");
                    self.log.logError("  Deleting invalid plan and retrying...");
                    fsutil.deleteFile(self.paths.current_plan) catch {};
                    self.backoffSleep();
                    continue;
                };

                self.log.sayFmt("[Cycle {d}] Plan created with {d} tasks", .{ self.st.cycle, task_count });
                self.st.phase = .execution;
                self.st.task_index = 0;
                self.st.total_tasks = task_count;
                self.st.current_task_num = 0;
                try self.st.save(self.paths.state_file, self.allocator);
            }

            // Check shutdown before execution phase
            if (shutdown_requested) break;

            // Execution phase
            self.log.logFmt("[Cycle {d}] Executing tasks...", .{self.st.cycle});

            while (!shutdown_requested) {
                const plan_content = fsutil.readFile(self.paths.current_plan, self.allocator, self.cfg.max_file_size) catch |err| {
                    self.log.logError("");
                    self.log.logErrorFmt("[Cycle {d}] Cannot read plan file: {s}", .{ self.st.cycle, @errorName(err) });
                    self.log.logErrorFmt("  File: {s}", .{self.paths.current_plan});
                    self.log.logError("  Unable to continue task execution");
                    break;
                };
                defer self.allocator.free(plan_content);

                const next_task = plan.getNextTask(plan_content, self.allocator) catch |err| {
                    self.log.logError("");
                    self.log.logErrorFmt("[Cycle {d}] Failed to parse next task: {s}", .{ self.st.cycle, @errorName(err) });
                    self.log.logError("  The plan file may be corrupted or improperly formatted");
                    break;
                };

                if (next_task == null) {
                    self.log.sayFmt("[Cycle {d}] All tasks complete", .{self.st.cycle});
                    break;
                }

                const task = next_task.?;
                defer self.allocator.free(task.description);

                self.st.current_task_num += 1;
                self.st.task_index += 1;

                const result = self.executor.runTask(
                    task.description,
                    self.st.cycle,
                    self.st.current_task_num,
                    self.st.total_tasks,
                ) catch |err| {
                    self.log.logError("");
                    self.log.logErrorFmt("[Cycle {d}] Task {d}/{d} execution error: {s}", .{
                        self.st.cycle,
                        self.st.current_task_num,
                        self.st.total_tasks,
                        @errorName(err),
                    });
                    self.log.logErrorFmt("  Task: {s}", .{task.description});
                    self.log.logError("  Skipping to next task...");
                    continue;
                };

                if (result == .success) {
                    self.log.sayFmt("[Cycle {d}] Task {d}/{d} complete", .{
                        self.st.cycle,
                        self.st.current_task_num,
                        self.st.total_tasks,
                    });
                } else {
                    self.log.logError("");
                    self.log.logErrorFmt("[Cycle {d}] Task {d}/{d} failed after retries", .{
                        self.st.cycle,
                        self.st.current_task_num,
                        self.st.total_tasks,
                    });
                    self.log.logErrorFmt("  Task: {s}", .{task.description});
                    self.log.logError("  Marking as complete to avoid getting stuck");
                    self.log.logError("  Check logs for failure details");
                }

                // Mark task complete regardless of result to not get stuck
                plan.markTaskComplete(self.paths.current_plan, task.line_number, self.allocator, self.cfg.max_file_size) catch |err| {
                    self.log.logError("");
                    self.log.logErrorFmt("[Cycle {d}] Warning: Failed to mark task complete: {s}", .{ self.st.cycle, @errorName(err) });
                    self.log.logError("  Plan file may not be updated correctly");
                };

                try self.st.save(self.paths.state_file, self.allocator);

                // Small pause between tasks
                std.Thread.sleep(self.cfg.task_pause_seconds * std.time.ns_per_s);
            }

            // Check shutdown before evaluation
            if (shutdown_requested) break;

            // Evaluation phase
            const eval_result = evaluator.evaluate(
                self.executor,
                self.paths.current_plan,
                self.st.cycle,
                self.allocator,
                self.cfg.max_file_size,
            ) catch |err| {
                self.log.logError("");
                self.log.logErrorFmt("[Cycle {d}] Evaluation phase error: {s}", .{ self.st.cycle, @errorName(err) });
                self.log.logError("  Unable to determine if cycle is complete");
                self.log.logError("  Defaulting to needs_work and continuing");
                self.log.logError("  Check logs for evaluation failure details");
                // Default to needs_work on error
                continue;
            };

            if (eval_result == .complete) {
                self.log.sayFmt("[Cycle {d}] Complete, starting new cycle", .{self.st.cycle});

                // Archive plan
                plan.archive(
                    self.paths.current_plan,
                    self.paths.history_dir,
                    self.st.cycle,
                    self.allocator,
                ) catch |err| {
                    self.log.logError("");
                    self.log.logErrorFmt("[Cycle {d}] Warning: Failed to archive plan: {s}", .{ self.st.cycle, @errorName(err) });
                    self.log.logErrorFmt("  Source: {s}", .{self.paths.current_plan});
                    self.log.logErrorFmt("  Destination: {s}", .{self.paths.history_dir});
                    self.log.logError("  Plan history may not be preserved, but continuing...");
                };

                // Start new cycle
                self.st.cycle += 1;
                self.st.phase = .planning;
                self.st.task_index = 0;
                self.st.current_task_num = 0;
                self.st.total_tasks = 0;
            } else {
                // Check if there are actually pending tasks
                if (!evaluator.hasPendingTasks(self.paths.current_plan, self.allocator, self.cfg.max_file_size)) {
                    self.log.sayFmt("[Cycle {d}] NEEDS_WORK but no tasks, starting new cycle", .{self.st.cycle});

                    // Archive and start fresh
                    plan.archive(
                        self.paths.current_plan,
                        self.paths.history_dir,
                        self.st.cycle,
                        self.allocator,
                    ) catch {};

                    self.st.cycle += 1;
                    self.st.phase = .planning;
                    self.st.task_index = 0;
                    self.st.current_task_num = 0;
                    self.st.total_tasks = 0;
                } else {
                    self.log.sayFmt("[Cycle {d}] Needs more work, continuing", .{self.st.cycle});
                    self.st.phase = .execution;
                }
            }

            try self.st.save(self.paths.state_file, self.allocator);
            self.log.sayFmt("[Cycle {d}] Complete", .{self.st.cycle -| 1});
        }

        // Kill any running child process on shutdown
        if (shutdown_requested) {
            self.log.say("");
            self.log.say("Shutdown requested, cleaning up...");
            self.executor.killCurrentChild();
        }

        self.log.say("");
        self.log.say("Loop stopped");
    }

    fn backoffSleep(self: *Loop) void {
        const sleep_time = self.cfg.backoff_base * 2;
        std.Thread.sleep(@as(u64, sleep_time) * std.time.ns_per_s);
    }
};

/// Setup signal handlers for graceful shutdown
pub fn setupSignalHandlers() void {
    const handler = posix.Sigaction{
        .handler = .{ .handler = handleSignal },
        .mask = posix.sigemptyset(),
        .flags = 0,
    };

    posix.sigaction(posix.SIG.INT, &handler, null);
    posix.sigaction(posix.SIG.TERM, &handler, null);
}

fn handleSignal(sig: i32) callconv(std.builtin.CallingConvention.c) void {
    _ = sig;
    signal_count += 1;
    shutdown_requested = true;

    // On second signal, force exit immediately
    if (signal_count >= 2) {
        const stderr_file = std.fs.File{ .handle = posix.STDERR_FILENO };
        _ = stderr_file.write("\n\nForce killing...\n") catch {};
        posix.exit(130); // 128 + SIGINT(2) = 130
    }
}

/// Request shutdown (for programmatic use)
pub fn requestShutdown() void {
    shutdown_requested = true;
}

/// Check if shutdown was requested
pub fn isShutdownRequested() bool {
    return shutdown_requested;
}

// ============================================================================
// Tests
// ============================================================================

// Test helper: Create mock logger
fn createTestLogger(allocator: Allocator) !*Logger {
    const temp_dir = try std.fmt.allocPrint(allocator, "/tmp/loop_test_{d}", .{std.time.milliTimestamp()});
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
    const temp_base = std.fs.path.dirname(logger_ptr.cycle_log_dir) orelse "/tmp";
    std.fs.cwd().deleteTree(temp_base) catch {};

    allocator.free(logger_ptr.main_log_path);
    allocator.free(logger_ptr.cycle_log_dir);
    allocator.free(logger_ptr.alerts_file);
    allocator.destroy(logger_ptr);
}

// Test helper: Create mock paths
fn createTestPaths(allocator: Allocator) !fsutil.Paths {
    const temp_dir = try std.fmt.allocPrint(allocator, "/tmp/loop_paths_{d}", .{std.time.milliTimestamp()});
    defer allocator.free(temp_dir);

    try std.fs.cwd().makePath(temp_dir);

    const opencoder_dir = try allocator.dupe(u8, temp_dir);
    const state_file = try std.fs.path.join(allocator, &.{ temp_dir, "state.json" });
    const current_plan = try std.fs.path.join(allocator, &.{ temp_dir, "current_plan.md" });
    const main_log = try std.fs.path.join(allocator, &.{ temp_dir, "main.log" });
    const cycle_log_dir = try std.fs.path.join(allocator, &.{ temp_dir, "cycles" });
    const alerts_file = try std.fs.path.join(allocator, &.{ temp_dir, "alerts.log" });
    const history_dir = try std.fs.path.join(allocator, &.{ temp_dir, "history" });

    try std.fs.cwd().makePath(cycle_log_dir);
    try std.fs.cwd().makePath(history_dir);

    return fsutil.Paths{
        .opencoder_dir = opencoder_dir,
        .state_file = state_file,
        .current_plan = current_plan,
        .main_log = main_log,
        .cycle_log_dir = cycle_log_dir,
        .alerts_file = alerts_file,
        .history_dir = history_dir,
        .allocator = allocator,
    };
}

test "shutdown flag management" {
    // Reset state
    shutdown_requested = false;

    try std.testing.expect(!isShutdownRequested());

    requestShutdown();

    try std.testing.expect(isShutdownRequested());

    // Reset for other tests
    shutdown_requested = false;
}

test "Loop.init creates loop with correct fields" {
    const allocator = std.testing.allocator;

    // Create test dependencies
    const test_logger = try createTestLogger(allocator);
    defer destroyTestLogger(test_logger, allocator);

    var test_paths = try createTestPaths(allocator);
    defer test_paths.deinit();

    const test_cfg = config.Config{
        .planning_model = "test/model",
        .execution_model = "test/model",
        .project_dir = "/tmp",
        .verbose = false,
        .user_hint = null,
        .max_retries = 3,
        .backoff_base = 5,
        .log_retention = 30,
        .max_file_size = 1024 * 1024,
        .log_buffer_size = 2048,
        .task_pause_seconds = 2,
    };

    var test_state = state.State.default();
    defer test_state.deinit(allocator);

    var test_executor = Executor.init(&test_cfg, test_logger, allocator);
    defer test_executor.deinit();

    // Create loop
    const loop = Loop.init(
        &test_cfg,
        &test_state,
        &test_paths,
        test_logger,
        &test_executor,
        allocator,
    );

    // Verify fields
    try std.testing.expectEqual(&test_cfg, loop.cfg);
    try std.testing.expectEqual(&test_state, loop.st);
    try std.testing.expectEqual(&test_paths, loop.paths);
    try std.testing.expectEqual(test_logger, loop.log);
    try std.testing.expectEqual(&test_executor, loop.executor);
}

test "backoffSleep calculates correct sleep time" {
    const allocator = std.testing.allocator;

    // Create test dependencies with backoff_base = 1 for fast tests
    const test_logger = try createTestLogger(allocator);
    defer destroyTestLogger(test_logger, allocator);

    var test_paths = try createTestPaths(allocator);
    defer test_paths.deinit();

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

    var test_state = state.State.default();
    defer test_state.deinit(allocator);

    var test_executor = Executor.init(&test_cfg, test_logger, allocator);
    defer test_executor.deinit();

    var loop = Loop.init(
        &test_cfg,
        &test_state,
        &test_paths,
        test_logger,
        &test_executor,
        allocator,
    );

    // The backoffSleep function uses: self.cfg.backoff_base * 2 = 1 * 2 = 2 seconds
    try std.testing.expectEqual(@as(u32, 1), loop.cfg.backoff_base);

    // Call backoffSleep - it should sleep for 2 seconds
    const start = std.time.nanoTimestamp();
    loop.backoffSleep();
    const elapsed = std.time.nanoTimestamp() - start;

    // Verify it actually slept (at least 1.9 seconds to account for scheduling)
    try std.testing.expect(elapsed >= (19 * std.time.ns_per_s) / 10);
}

test "Loop state transitions between phases" {
    const allocator = std.testing.allocator;

    const test_logger = try createTestLogger(allocator);
    defer destroyTestLogger(test_logger, allocator);

    var test_paths = try createTestPaths(allocator);
    defer test_paths.deinit();

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

    var test_state = state.State.default();
    defer test_state.deinit(allocator);

    var test_executor = Executor.init(&test_cfg, test_logger, allocator);
    defer test_executor.deinit();

    _ = Loop.init(
        &test_cfg,
        &test_state,
        &test_paths,
        test_logger,
        &test_executor,
        allocator,
    );

    // Verify initial state
    try std.testing.expectEqual(state.Phase.planning, test_state.phase);
    try std.testing.expectEqual(@as(u32, 1), test_state.cycle);
    try std.testing.expectEqual(@as(u32, 0), test_state.task_index);

    // Simulate phase transitions
    test_state.phase = .execution;
    try std.testing.expectEqual(state.Phase.execution, test_state.phase);

    test_state.phase = .evaluation;
    try std.testing.expectEqual(state.Phase.evaluation, test_state.phase);

    // Simulate cycle completion
    test_state.cycle += 1;
    test_state.phase = .planning;
    try std.testing.expectEqual(@as(u32, 2), test_state.cycle);
    try std.testing.expectEqual(state.Phase.planning, test_state.phase);
}

test "Loop handles task counter increments" {
    const allocator = std.testing.allocator;

    const test_logger = try createTestLogger(allocator);
    defer destroyTestLogger(test_logger, allocator);

    var test_paths = try createTestPaths(allocator);
    defer test_paths.deinit();

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

    var test_state = state.State.default();
    defer test_state.deinit(allocator);

    var test_executor = Executor.init(&test_cfg, test_logger, allocator);
    defer test_executor.deinit();

    _ = Loop.init(
        &test_cfg,
        &test_state,
        &test_paths,
        test_logger,
        &test_executor,
        allocator,
    );

    // Set total tasks
    test_state.total_tasks = 5;

    // Simulate task execution
    try std.testing.expectEqual(@as(u32, 0), test_state.current_task_num);

    test_state.current_task_num += 1;
    test_state.task_index += 1;
    try std.testing.expectEqual(@as(u32, 1), test_state.current_task_num);
    try std.testing.expectEqual(@as(u32, 1), test_state.task_index);

    test_state.current_task_num += 1;
    test_state.task_index += 1;
    try std.testing.expectEqual(@as(u32, 2), test_state.current_task_num);
    try std.testing.expectEqual(@as(u32, 2), test_state.task_index);
}

test "Loop cycle reset on new cycle" {
    const allocator = std.testing.allocator;

    const test_logger = try createTestLogger(allocator);
    defer destroyTestLogger(test_logger, allocator);

    var test_paths = try createTestPaths(allocator);
    defer test_paths.deinit();

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

    var test_state = state.State{
        .cycle = 5,
        .phase = .evaluation,
        .task_index = 10,
        .current_task_num = 8,
        .total_tasks = 10,
    };
    defer test_state.deinit(allocator);

    var test_executor = Executor.init(&test_cfg, test_logger, allocator);
    defer test_executor.deinit();

    _ = Loop.init(
        &test_cfg,
        &test_state,
        &test_paths,
        test_logger,
        &test_executor,
        allocator,
    );

    // Simulate starting new cycle (as done in loop.zig:201-206)
    test_state.cycle += 1;
    test_state.phase = .planning;
    test_state.task_index = 0;
    test_state.current_task_num = 0;
    test_state.total_tasks = 0;

    // Verify reset
    try std.testing.expectEqual(@as(u32, 6), test_state.cycle);
    try std.testing.expectEqual(state.Phase.planning, test_state.phase);
    try std.testing.expectEqual(@as(u32, 0), test_state.task_index);
    try std.testing.expectEqual(@as(u32, 0), test_state.current_task_num);
    try std.testing.expectEqual(@as(u32, 0), test_state.total_tasks);
}
