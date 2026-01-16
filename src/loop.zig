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
const evaluator = @import("evaluator.zig");
const Logger = @import("logger.zig").Logger;
const Executor = @import("executor.zig").Executor;
const ExecutionResult = @import("executor.zig").ExecutionResult;

/// Shutdown flag for signal handling
var shutdown_requested: bool = false;

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

        self.log.say("Running continuously (Ctrl+C to stop)");
        self.log.say("");

        while (!shutdown_requested) {
            self.log.say("");
            self.log.sayFmt("[Cycle {d}]", .{self.st.cycle});
            self.log.setCycle(self.st.cycle);

            // Planning phase
            if (!fsutil.fileExists(self.paths.current_plan) or self.st.phase == .planning) {
                const result = self.executor.runPlanning(self.st.cycle) catch |err| {
                    self.log.logErrorFmt("Planning failed: {}", .{err});
                    self.backoffSleep();
                    continue;
                };

                if (result == .failure) {
                    self.log.logError("Failed to create plan, waiting before retry...");
                    self.backoffSleep();
                    continue;
                }

                // Validate plan was created
                if (!fsutil.fileExists(self.paths.current_plan)) {
                    self.log.logError("Plan file not created");
                    self.backoffSleep();
                    continue;
                }

                // Validate plan content
                const plan_content = fsutil.readFile(self.paths.current_plan, self.allocator) catch {
                    self.log.logError("Failed to read plan file");
                    self.backoffSleep();
                    continue;
                };
                defer self.allocator.free(plan_content);

                const task_count = plan.validate(plan_content) catch {
                    self.log.logError("Plan validation failed");
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

            // Execution phase
            self.log.logFmt("[Cycle {d}] Executing tasks...", .{self.st.cycle});

            while (!shutdown_requested) {
                const plan_content = fsutil.readFile(self.paths.current_plan, self.allocator) catch {
                    self.log.logError("Failed to read plan file");
                    break;
                };
                defer self.allocator.free(plan_content);

                const next_task = plan.getNextTask(plan_content, self.allocator) catch {
                    self.log.logError("Failed to get next task");
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
                    self.log.logErrorFmt("Task execution error: {}", .{err});
                    continue;
                };

                if (result == .success) {
                    self.log.sayFmt("[Cycle {d}] Task {d}/{d} complete", .{
                        self.st.cycle,
                        self.st.current_task_num,
                        self.st.total_tasks,
                    });
                } else {
                    self.log.sayFmt("[Cycle {d}] Task {d}/{d} failed, skipping", .{
                        self.st.cycle,
                        self.st.current_task_num,
                        self.st.total_tasks,
                    });
                }

                // Mark task complete regardless of result to not get stuck
                plan.markTaskComplete(self.paths.current_plan, task.line_number, self.allocator) catch {
                    self.log.logError("Failed to mark task complete");
                };

                try self.st.save(self.paths.state_file, self.allocator);

                // Small pause between tasks
                std.Thread.sleep(2 * std.time.ns_per_s);
            }

            // Evaluation phase
            const eval_result = evaluator.evaluate(
                self.executor,
                self.paths.current_plan,
                self.st.cycle,
                self.allocator,
            ) catch |err| {
                self.log.logErrorFmt("Evaluation error: {}", .{err});
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
                    self.log.logErrorFmt("Failed to archive plan: {}", .{err});
                };

                // Start new cycle
                self.st.cycle += 1;
                self.st.phase = .planning;
                self.st.task_index = 0;
                self.st.current_task_num = 0;
                self.st.total_tasks = 0;
                self.executor.resetSession();
            } else {
                // Check if there are actually pending tasks
                if (!evaluator.hasPendingTasks(self.paths.current_plan, self.allocator)) {
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
                    self.executor.resetSession();
                } else {
                    self.log.sayFmt("[Cycle {d}] Needs more work, continuing", .{self.st.cycle});
                    self.st.phase = .execution;
                }
            }

            try self.st.save(self.paths.state_file, self.allocator);
            self.log.sayFmt("[Cycle {d}] Complete", .{self.st.cycle -| 1});
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
    shutdown_requested = true;
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

test "shutdown flag management" {
    // Reset state
    shutdown_requested = false;

    try std.testing.expect(!isShutdownRequested());

    requestShutdown();

    try std.testing.expect(isShutdownRequested());

    // Reset for other tests
    shutdown_requested = false;
}
