//! State management for opencoder.
//!
//! Handles persistence and recovery of execution state using JSON format.
//! Allows opencoder to resume from where it left off after interruptions.

const std = @import("std");
const json = std.json;
const fs = std.fs;
const Allocator = std.mem.Allocator;

const fsutil = @import("fs.zig");
const logger = @import("logger.zig");

/// Execution phase
pub const Phase = enum {
    init,
    planning,
    execution,
    evaluation,

    /// Convert phase to string for JSON serialization
    pub fn toString(self: Phase) []const u8 {
        return switch (self) {
            .init => "init",
            .planning => "planning",
            .execution => "execution",
            .evaluation => "evaluation",
        };
    }

    /// Parse phase from string
    pub fn fromString(str: []const u8) ?Phase {
        const map = std.StaticStringMap(Phase).initComptime(.{
            .{ "init", .init },
            .{ "planning", .planning },
            .{ "execution", .execution },
            .{ "evaluation", .evaluation },
        });
        return map.get(str);
    }
};

/// Execution state persisted to JSON
pub const State = struct {
    cycle: u32 = 1,
    phase: Phase = .planning,
    task_index: u32 = 0,
    session_id: ?[]const u8 = null,
    last_update: []const u8 = "",

    // Runtime state (not persisted)
    total_tasks: u32 = 0,
    current_task_num: u32 = 0,
    current_task_desc: []const u8 = "",

    /// Create default initial state
    pub fn default() State {
        return State{};
    }

    /// Free allocated memory for state fields
    pub fn deinit(self: *State, allocator: Allocator) void {
        if (self.session_id) |sid| {
            allocator.free(sid);
        }
        if (self.last_update.len > 0) {
            allocator.free(self.last_update);
        }
    }

    /// Save state to JSON file
    pub fn save(self: *const State, path: []const u8, allocator: Allocator) !void {
        // Generate current timestamp
        var ts_buf: [24]u8 = undefined;
        const ts = logger.timestampISO(&ts_buf);

        // Create JSON object
        const state_json = StateJson{
            .cycle = self.cycle,
            .phase = self.phase.toString(),
            .task_index = self.task_index,
            .session_id = self.session_id,
            .last_update = ts,
        };

        // Serialize to string using Zig 0.15 API
        const json_str = try std.json.Stringify.valueAlloc(allocator, state_json, .{ .whitespace = .indent_2 });
        defer allocator.free(json_str);

        // Build content with trailing newline
        var buf = std.ArrayListUnmanaged(u8){};
        defer buf.deinit(allocator);
        try buf.appendSlice(allocator, json_str);
        try buf.append(allocator, '\n');

        // Write to file
        try fsutil.writeFile(path, buf.items);
    }

    /// Load state from JSON file
    pub fn load(path: []const u8, allocator: Allocator) !?State {
        // Read file contents
        const content = fsutil.readFile(path, allocator) catch |err| {
            if (err == error.FileNotFound) {
                return null;
            }
            return err;
        };
        defer allocator.free(content);

        // Parse JSON
        const parsed = json.parseFromSlice(StateJson, allocator, content, .{
            .ignore_unknown_fields = true,
        }) catch {
            return null;
        };
        defer parsed.deinit();

        // Convert to State
        const phase = Phase.fromString(parsed.value.phase) orelse .planning;

        return State{
            .cycle = parsed.value.cycle,
            .phase = phase,
            .task_index = parsed.value.task_index,
            .session_id = if (parsed.value.session_id) |sid| try allocator.dupe(u8, sid) else null,
            .last_update = try allocator.dupe(u8, parsed.value.last_update),
        };
    }
};

/// JSON representation of state (for serialization)
const StateJson = struct {
    cycle: u32,
    phase: []const u8,
    task_index: u32,
    session_id: ?[]const u8,
    last_update: []const u8,
};

// ============================================================================
// Tests
// ============================================================================

test "Phase.toString returns correct strings" {
    try std.testing.expectEqualStrings("init", Phase.init.toString());
    try std.testing.expectEqualStrings("planning", Phase.planning.toString());
    try std.testing.expectEqualStrings("execution", Phase.execution.toString());
    try std.testing.expectEqualStrings("evaluation", Phase.evaluation.toString());
}

test "Phase.fromString parses valid phases" {
    try std.testing.expectEqual(Phase.init, Phase.fromString("init").?);
    try std.testing.expectEqual(Phase.planning, Phase.fromString("planning").?);
    try std.testing.expectEqual(Phase.execution, Phase.fromString("execution").?);
    try std.testing.expectEqual(Phase.evaluation, Phase.fromString("evaluation").?);
}

test "Phase.fromString returns null for invalid phase" {
    try std.testing.expectEqual(@as(?Phase, null), Phase.fromString("invalid"));
    try std.testing.expectEqual(@as(?Phase, null), Phase.fromString(""));
}

test "State.default creates initial state" {
    const state = State.default();
    try std.testing.expectEqual(@as(u32, 1), state.cycle);
    try std.testing.expectEqual(Phase.planning, state.phase);
    try std.testing.expectEqual(@as(u32, 0), state.task_index);
    try std.testing.expectEqual(@as(?[]const u8, null), state.session_id);
}

test "State save and load round-trip" {
    const allocator = std.testing.allocator;
    const test_path = "/tmp/opencoder_test_state.json";

    // Create state
    var state = State{
        .cycle = 5,
        .phase = .execution,
        .task_index = 3,
        .session_id = "test_session",
        .last_update = "",
    };

    // Save state
    try state.save(test_path, allocator);

    // Load state
    const loaded = try State.load(test_path, allocator);
    try std.testing.expect(loaded != null);

    const loaded_state = loaded.?;
    defer {
        if (loaded_state.session_id) |sid| allocator.free(sid);
        allocator.free(loaded_state.last_update);
    }

    try std.testing.expectEqual(@as(u32, 5), loaded_state.cycle);
    try std.testing.expectEqual(Phase.execution, loaded_state.phase);
    try std.testing.expectEqual(@as(u32, 3), loaded_state.task_index);
    try std.testing.expectEqualStrings("test_session", loaded_state.session_id.?);

    // Clean up
    fs.cwd().deleteFile(test_path) catch {};
}

test "State.load returns null for missing file" {
    const allocator = std.testing.allocator;
    const result = try State.load("/tmp/nonexistent_state_file.json", allocator);
    try std.testing.expectEqual(@as(?State, null), result);
}

test "State.load returns null for invalid JSON" {
    const allocator = std.testing.allocator;
    const test_path = "/tmp/opencoder_test_invalid_state.json";

    // Write invalid JSON
    try fsutil.writeFile(test_path, "not valid json {{{");

    // Load should return null
    const result = try State.load(test_path, allocator);
    try std.testing.expectEqual(@as(?State, null), result);

    // Clean up
    fs.cwd().deleteFile(test_path) catch {};
}
