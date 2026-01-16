//! Evaluation logic for opencoder.
//!
//! Determines whether a plan cycle is complete or needs more work
//! based on executor output and plan state.

const std = @import("std");
const Allocator = std.mem.Allocator;

const Executor = @import("executor.zig").Executor;
const plan = @import("plan.zig");
const fsutil = @import("fs.zig");
const Logger = @import("logger.zig").Logger;

/// Result of plan evaluation
pub const EvaluationResult = enum {
    /// All tasks complete, ready for new cycle
    complete,
    /// More work needed in current cycle
    needs_work,
};

/// Evaluate plan completion status
pub fn evaluate(
    executor: *Executor,
    plan_path: []const u8,
    cycle: u32,
    allocator: Allocator,
) !EvaluationResult {
    // First check if all tasks are marked complete
    const pending_tasks = blk: {
        const content = fsutil.readFile(plan_path, allocator) catch |err| {
            if (err == error.FileNotFound) {
                // No plan file, needs work (planning)
                return .needs_work;
            }
            return err;
        };
        defer allocator.free(content);
        break :blk plan.countPendingTasks(content);
    };

    // Run AI evaluation
    const result = try executor.runEvaluation(cycle);

    // Determine final result
    if (std.mem.eql(u8, result, "COMPLETE") and pending_tasks == 0) {
        return .complete;
    } else if (std.mem.eql(u8, result, "NEEDS_WORK")) {
        return .needs_work;
    } else {
        // Some tasks still pending
        return .needs_work;
    }
}

/// Quick check if plan has pending tasks without AI evaluation
pub fn hasPendingTasks(plan_path: []const u8, allocator: Allocator) bool {
    const content = fsutil.readFile(plan_path, allocator) catch {
        return false;
    };
    defer allocator.free(content);
    return plan.countPendingTasks(content) > 0;
}

// ============================================================================
// Tests
// ============================================================================

test "EvaluationResult enum values" {
    try std.testing.expectEqual(EvaluationResult.complete, EvaluationResult.complete);
    try std.testing.expectEqual(EvaluationResult.needs_work, EvaluationResult.needs_work);
}

test "hasPendingTasks returns false for missing file" {
    const allocator = std.testing.allocator;
    const result = hasPendingTasks("/tmp/nonexistent_plan.md", allocator);
    try std.testing.expect(!result);
}

test "hasPendingTasks returns true for plan with pending tasks" {
    const allocator = std.testing.allocator;
    const test_path = "/tmp/opencoder_test_pending.md";

    // Write test plan
    try fsutil.writeFile(test_path, "- [ ] Task 1\n- [x] Task 2\n");

    const result = hasPendingTasks(test_path, allocator);
    try std.testing.expect(result);

    // Clean up
    std.fs.cwd().deleteFile(test_path) catch {};
}

test "hasPendingTasks returns false for completed plan" {
    const allocator = std.testing.allocator;
    const test_path = "/tmp/opencoder_test_completed.md";

    // Write test plan
    try fsutil.writeFile(test_path, "- [x] Task 1\n- [x] Task 2\n");

    const result = hasPendingTasks(test_path, allocator);
    try std.testing.expect(!result);

    // Clean up
    std.fs.cwd().deleteFile(test_path) catch {};
}
