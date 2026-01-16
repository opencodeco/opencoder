//! Plan management for opencoder.
//!
//! Handles parsing, validation, and manipulation of markdown-based
//! task plans with checkbox format.

const std = @import("std");
const fs = std.fs;
const Allocator = std.mem.Allocator;

const fsutil = @import("fs.zig");
const logger = @import("logger.zig");

/// A task extracted from a plan
pub const Task = struct {
    line_number: usize,
    description: []const u8,
    completed: bool,
};

/// Plan validation errors
pub const PlanError = error{
    EmptyPlan,
    NoActionableTasks,
    InvalidFormat,
};

/// Validate plan content and return task count
pub fn validate(plan_content: []const u8) PlanError!u32 {
    if (plan_content.len == 0) {
        return PlanError.EmptyPlan;
    }

    const task_count = countPendingTasks(plan_content);
    if (task_count == 0) {
        return PlanError.NoActionableTasks;
    }

    return task_count;
}

/// Get the next uncompleted task from plan content
pub fn getNextTask(plan_content: []const u8, allocator: Allocator) !?Task {
    var line_number: usize = 0;
    var lines = std.mem.splitScalar(u8, plan_content, '\n');

    while (lines.next()) |line| {
        line_number += 1;

        // Look for unchecked task: "- [ ] "
        if (std.mem.startsWith(u8, line, "- [ ] ")) {
            const description = line[6..]; // Skip "- [ ] "
            return Task{
                .line_number = line_number,
                .description = try allocator.dupe(u8, description),
                .completed = false,
            };
        }
    }

    return null;
}

/// Count pending (uncompleted) tasks in plan content
pub fn countPendingTasks(plan_content: []const u8) u32 {
    var count: u32 = 0;
    var lines = std.mem.splitScalar(u8, plan_content, '\n');

    while (lines.next()) |line| {
        if (std.mem.startsWith(u8, line, "- [ ] ")) {
            count += 1;
        }
    }

    return count;
}

/// Count completed tasks in plan content
pub fn countCompletedTasks(plan_content: []const u8) u32 {
    var count: u32 = 0;
    var lines = std.mem.splitScalar(u8, plan_content, '\n');

    while (lines.next()) |line| {
        if (std.mem.startsWith(u8, line, "- [x] ") or std.mem.startsWith(u8, line, "- [X] ")) {
            count += 1;
        }
    }

    return count;
}

/// Count total tasks (pending + completed) in plan content
pub fn countTotalTasks(plan_content: []const u8) u32 {
    return countPendingTasks(plan_content) + countCompletedTasks(plan_content);
}

/// Mark a task as complete at the given line number
pub fn markTaskComplete(path: []const u8, line_number: usize, allocator: Allocator) !void {
    // Read file
    const content = try fsutil.readFile(path, allocator);
    defer allocator.free(content);

    // Build new content with task marked complete
    var result = std.array_list.AlignedManaged(u8, null).init(allocator);
    defer result.deinit();

    var current_line: usize = 0;
    var lines = std.mem.splitScalar(u8, content, '\n');

    while (lines.next()) |line| {
        current_line += 1;

        if (current_line == line_number and std.mem.startsWith(u8, line, "- [ ] ")) {
            // Replace "- [ ] " with "- [x] "
            try result.appendSlice("- [x] ");
            try result.appendSlice(line[6..]);
        } else {
            try result.appendSlice(line);
        }

        // Add newline except for last line if original didn't have trailing newline
        if (lines.peek() != null or content[content.len - 1] == '\n') {
            try result.append('\n');
        }
    }

    // Write back
    try fsutil.writeFile(path, result.items);
}

/// Archive completed plan to history directory
pub fn archive(current_plan_path: []const u8, history_dir: []const u8, cycle: u32, allocator: Allocator) !void {
    // Check if plan exists
    if (!fsutil.fileExists(current_plan_path)) {
        return;
    }

    // Generate archive filename
    var ts_buf: [20]u8 = undefined;
    const ts = logger.timestamp(&ts_buf);

    // Convert timestamp to filename format (replace spaces and colons)
    var ts_filename: [15]u8 = undefined;
    var j: usize = 0;
    for (ts[0..10]) |c| {
        if (c != '-') {
            ts_filename[j] = c;
            j += 1;
        }
    }
    ts_filename[j] = '_';
    j += 1;
    for (ts[11..19]) |c| {
        if (c != ':') {
            ts_filename[j] = c;
            j += 1;
        }
    }

    var filename_buf: [128]u8 = undefined;
    const filename = std.fmt.bufPrint(&filename_buf, "plan_{s}_cycle{d}.md", .{ ts_filename[0..j], cycle }) catch return;

    const archive_path = try std.fs.path.join(allocator, &.{ history_dir, filename });
    defer allocator.free(archive_path);

    // Move file
    try fsutil.moveFile(current_plan_path, archive_path);
}

/// Generate the planning prompt for creating a new plan
pub fn generatePlanningPrompt(cycle: u32, user_hint: ?[]const u8, allocator: Allocator) ![]const u8 {
    var ts_buf: [24]u8 = undefined;
    const ts = logger.timestampISO(&ts_buf);

    var result = std.array_list.AlignedManaged(u8, null).init(allocator);
    errdefer result.deinit();

    try result.appendSlice(
        \\CRITICAL: You are operating in an AUTONOMOUS CONTINUOUS DEVELOPMENT loop.
        \\
        \\This loop MUST NEVER STOP. Your role is to continuously improve this project indefinitely.
        \\
        \\STRICT REQUIREMENTS:
        \\- You MUST create a plan with AT LEAST 5 actionable tasks
        \\- NEVER ask questions or wait for user input
        \\- NEVER suggest the project is "done" or "complete"
        \\- NEVER provide options or ask "would you like me to..."
        \\- If main features are implemented, focus on: code quality, tests, documentation, refactoring, performance, security, error handling, edge cases, optimization, CI/CD, deployment, monitoring
        \\- There is ALWAYS something to improve in any project
        \\
    );

    if (user_hint) |hint| {
        try result.appendSlice("\nUSER INSTRUCTION/HINT: ");
        try result.appendSlice(hint);
        try result.appendSlice("\n\nUse this hint to guide your planning. Build/implement what the user requested.\n");
    }

    try result.appendSlice(
        \\
        \\Your task: Analyze this project and create a concrete development plan.
        \\Save a markdown checklist to .opencoder/current_plan.md with 5-10 actionable tasks.
        \\
        \\The plan MUST follow this exact format:
        \\# Plan: [descriptive title]
        \\Created: 
    );
    try result.appendSlice(ts);
    try result.appendSlice("\nCycle: ");
    try result.writer().print("{d}", .{cycle});
    try result.appendSlice(
        \\
        \\
        \\## Context
        \\[Brief description of project state and current focus]
        \\
        \\## Tasks
        \\- [ ] Task 1: Specific, actionable description
        \\- [ ] Task 2: Specific, actionable description
        \\- [ ] Task 3: Specific, actionable description
        \\- [ ] Task 4: Specific, actionable description
        \\- [ ] Task 5: Specific, actionable description
        \\[Add more tasks as needed, minimum 5]
        \\
        \\## Notes
        \\[Any additional context or dependencies]
        \\
        \\Areas to consider for continuous improvement:
        \\- Code quality and best practices
        \\- Comprehensive error handling
        \\- Edge cases and input validation
        \\- Unit and integration tests
        \\- Documentation (code comments, README, API docs)
        \\- Performance optimization
        \\- Security hardening
        \\- Refactoring technical debt
        \\- Logging and monitoring
        \\- CI/CD pipeline improvements
        \\- Deployment and infrastructure
        \\- Accessibility and usability
        \\
        \\After creating the plan file, respond with: PLAN_CREATED
    );

    return result.toOwnedSlice();
}

/// Generate the execution prompt for a task
pub fn generateExecutionPrompt(task_desc: []const u8, user_hint: ?[]const u8, allocator: Allocator) ![]const u8 {
    var result = std.array_list.AlignedManaged(u8, null).init(allocator);
    errdefer result.deinit();

    try result.appendSlice("Execute this task from the development plan:\n\nTASK: ");
    try result.appendSlice(task_desc);

    if (user_hint) |hint| {
        try result.appendSlice("\n\nADDITIONAL CONTEXT FROM USER: ");
        try result.appendSlice(hint);
        try result.appendSlice("\n\nKeep this context in mind while executing the task.");
    }

    try result.appendSlice(
        \\
        \\
        \\Instructions:
        \\- Make necessary code changes
        \\- Follow project conventions and best practices
        \\- Make atomic commits if appropriate (let your judgment guide you)
        \\- Run tests if applicable
        \\- Report completion status clearly
        \\
        \\When complete, respond with: TASK_COMPLETE or TASK_FAILED with explanation.
    );

    return result.toOwnedSlice();
}

/// Generate the evaluation prompt
pub fn generateEvaluationPrompt(allocator: Allocator) ![]const u8 {
    _ = allocator;
    return 
    \\CRITICAL: You are operating in an AUTONOMOUS CONTINUOUS DEVELOPMENT loop.
    \\
    \\Review the completed plan at .opencoder/current_plan.md
    \\
    \\Your role is to determine if this cycle is truly complete OR if more work is needed.
    \\
    \\IMPORTANT GUIDELINES:
    \\- Be STRICT in your evaluation - only return COMPLETE if ALL tasks are genuinely done AND verified
    \\- Check the actual changes made in the codebase, not just the checkmarks
    \\- If ANY task seems incomplete, rushed, or needs follow-up, return NEEDS_WORK
    \\- If quality could be improved, return NEEDS_WORK
    \\- Even if all tasks are done, consider if there are immediate follow-ups needed
    \\
    \\Evaluate:
    \\1. Are all tasks genuinely complete with high quality?
    \\2. Do any tasks need follow-up, refinement, or additional work?
    \\3. Are there immediate issues or gaps that arose during this cycle?
    \\4. Is the code tested, documented, and production-ready?
    \\
    \\Respond with ONLY one of these:
    \\- COMPLETE: All tasks truly done, high quality, ready for new planning cycle
    \\- NEEDS_WORK: Tasks incomplete, quality issues, or follow-up needed
    \\
    \\Be thorough and honest in your evaluation. When in doubt, choose NEEDS_WORK.
    ;
}

// ============================================================================
// Tests
// ============================================================================

const test_plan =
    \\# Plan: Test Plan
    \\Created: 2026-01-16T10:00:00Z
    \\Cycle: 1
    \\
    \\## Context
    \\Test context
    \\
    \\## Tasks
    \\- [ ] Task 1: First task
    \\- [x] Task 2: Second task (done)
    \\- [ ] Task 3: Third task
    \\- [ ] Task 4: Fourth task
    \\- [x] Task 5: Fifth task (done)
    \\
    \\## Notes
    \\Test notes
;

test "countPendingTasks returns correct count" {
    const count = countPendingTasks(test_plan);
    try std.testing.expectEqual(@as(u32, 3), count);
}

test "countCompletedTasks returns correct count" {
    const count = countCompletedTasks(test_plan);
    try std.testing.expectEqual(@as(u32, 2), count);
}

test "countTotalTasks returns correct count" {
    const count = countTotalTasks(test_plan);
    try std.testing.expectEqual(@as(u32, 5), count);
}

test "validate returns task count for valid plan" {
    const count = try validate(test_plan);
    try std.testing.expectEqual(@as(u32, 3), count);
}

test "validate returns error for empty plan" {
    const result = validate("");
    try std.testing.expectError(PlanError.EmptyPlan, result);
}

test "validate returns error for plan with no pending tasks" {
    const completed_plan =
        \\# Plan: Done
        \\- [x] Task 1: Done
        \\- [x] Task 2: Done
    ;
    const result = validate(completed_plan);
    try std.testing.expectError(PlanError.NoActionableTasks, result);
}

test "getNextTask returns first uncompleted task" {
    const allocator = std.testing.allocator;

    const task = try getNextTask(test_plan, allocator);
    try std.testing.expect(task != null);

    const t = task.?;
    defer allocator.free(t.description);

    try std.testing.expectEqual(@as(usize, 9), t.line_number);
    try std.testing.expectEqualStrings("Task 1: First task", t.description);
    try std.testing.expectEqual(false, t.completed);
}

test "getNextTask returns null when no pending tasks" {
    const allocator = std.testing.allocator;
    const completed_plan =
        \\- [x] Task 1: Done
        \\- [x] Task 2: Done
    ;

    const task = try getNextTask(completed_plan, allocator);
    try std.testing.expectEqual(@as(?Task, null), task);
}

test "generatePlanningPrompt includes user hint when provided" {
    const allocator = std.testing.allocator;
    const prompt = try generatePlanningPrompt(1, "build a REST API", allocator);
    defer allocator.free(prompt);

    try std.testing.expect(std.mem.indexOf(u8, prompt, "build a REST API") != null);
    try std.testing.expect(std.mem.indexOf(u8, prompt, "USER INSTRUCTION/HINT") != null);
}

test "generatePlanningPrompt works without user hint" {
    const allocator = std.testing.allocator;
    const prompt = try generatePlanningPrompt(1, null, allocator);
    defer allocator.free(prompt);

    try std.testing.expect(std.mem.indexOf(u8, prompt, "AUTONOMOUS CONTINUOUS DEVELOPMENT") != null);
    try std.testing.expect(std.mem.indexOf(u8, prompt, "USER INSTRUCTION/HINT") == null);
}

test "generateExecutionPrompt includes task and hint" {
    const allocator = std.testing.allocator;
    const prompt = try generateExecutionPrompt("Create user model", "focus on security", allocator);
    defer allocator.free(prompt);

    try std.testing.expect(std.mem.indexOf(u8, prompt, "Create user model") != null);
    try std.testing.expect(std.mem.indexOf(u8, prompt, "focus on security") != null);
}

test "generateEvaluationPrompt returns valid prompt" {
    const allocator = std.testing.allocator;
    const prompt = try generateEvaluationPrompt(allocator);

    try std.testing.expect(std.mem.indexOf(u8, prompt, "COMPLETE") != null);
    try std.testing.expect(std.mem.indexOf(u8, prompt, "NEEDS_WORK") != null);
}
