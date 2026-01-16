//! File system utilities for opencoder.
//!
//! Handles directory structure creation and path management
//! for the .opencoder workspace.

const std = @import("std");
const fs = std.fs;
const Allocator = std.mem.Allocator;

/// Paths to opencoder workspace files and directories
pub const Paths = struct {
    opencoder_dir: []const u8,
    state_file: []const u8,
    current_plan: []const u8,
    main_log: []const u8,
    cycle_log_dir: []const u8,
    alerts_file: []const u8,
    history_dir: []const u8,
    allocator: Allocator,

    /// Free all allocated paths
    pub fn deinit(self: *Paths) void {
        self.allocator.free(self.opencoder_dir);
        self.allocator.free(self.state_file);
        self.allocator.free(self.current_plan);
        self.allocator.free(self.main_log);
        self.allocator.free(self.cycle_log_dir);
        self.allocator.free(self.alerts_file);
        self.allocator.free(self.history_dir);
    }
};

/// Initialize the .opencoder directory structure
pub fn initDirectories(project_dir: []const u8, allocator: Allocator) !Paths {
    // Build all paths
    const opencoder_dir = try std.fs.path.join(allocator, &.{ project_dir, ".opencoder" });
    errdefer allocator.free(opencoder_dir);

    const state_file = try std.fs.path.join(allocator, &.{ opencoder_dir, "state.json" });
    errdefer allocator.free(state_file);

    const current_plan = try std.fs.path.join(allocator, &.{ opencoder_dir, "current_plan.md" });
    errdefer allocator.free(current_plan);

    const logs_dir = try std.fs.path.join(allocator, &.{ opencoder_dir, "logs" });
    defer allocator.free(logs_dir);

    const main_log = try std.fs.path.join(allocator, &.{ logs_dir, "main.log" });
    errdefer allocator.free(main_log);

    const cycle_log_dir = try std.fs.path.join(allocator, &.{ logs_dir, "cycles" });
    errdefer allocator.free(cycle_log_dir);

    const alerts_file = try std.fs.path.join(allocator, &.{ opencoder_dir, "alerts.log" });
    errdefer allocator.free(alerts_file);

    const history_dir = try std.fs.path.join(allocator, &.{ opencoder_dir, "history" });
    errdefer allocator.free(history_dir);

    // Create directories
    try ensureDir(opencoder_dir);
    try ensureDir(logs_dir);
    try ensureDir(cycle_log_dir);
    try ensureDir(history_dir);

    return Paths{
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

/// Ensure a directory exists, creating it if necessary
pub fn ensureDir(path: []const u8) !void {
    fs.cwd().makePath(path) catch |err| {
        if (err != error.PathAlreadyExists) {
            return err;
        }
    };
}

/// Check if a file exists
pub fn fileExists(path: []const u8) bool {
    fs.cwd().access(path, .{}) catch return false;
    return true;
}

/// Read entire file contents
pub fn readFile(path: []const u8, allocator: Allocator) ![]u8 {
    const file = try fs.cwd().openFile(path, .{});
    defer file.close();
    return try file.readToEndAlloc(allocator, 1024 * 1024); // 1MB max
}

/// Write contents to file
pub fn writeFile(path: []const u8, contents: []const u8) !void {
    const file = try fs.cwd().createFile(path, .{});
    defer file.close();
    try file.writeAll(contents);
}

/// Delete a file if it exists
pub fn deleteFile(path: []const u8) !void {
    fs.cwd().deleteFile(path) catch |err| {
        if (err != error.FileNotFound) {
            return err;
        }
    };
}

/// Move/rename a file
pub fn moveFile(old_path: []const u8, new_path: []const u8) !void {
    try fs.cwd().rename(old_path, new_path);
}

// ============================================================================
// Tests
// ============================================================================

test "ensureDir creates directory" {
    const test_dir = "/tmp/opencoder_test_dir";

    // Clean up first
    fs.cwd().deleteTree(test_dir) catch {};

    // Create directory
    try ensureDir(test_dir);

    // Verify it exists
    try std.testing.expect(fileExists(test_dir));

    // Should not error if already exists
    try ensureDir(test_dir);

    // Clean up
    fs.cwd().deleteTree(test_dir) catch {};
}

test "fileExists returns correct values" {
    const test_file = "/tmp/opencoder_test_exists";

    // Should not exist initially
    fs.cwd().deleteFile(test_file) catch {};
    try std.testing.expect(!fileExists(test_file));

    // Create file
    const file = try fs.cwd().createFile(test_file, .{});
    file.close();

    // Should exist now
    try std.testing.expect(fileExists(test_file));

    // Clean up
    fs.cwd().deleteFile(test_file) catch {};
}

test "readFile and writeFile work correctly" {
    const allocator = std.testing.allocator;
    const test_file = "/tmp/opencoder_test_rw";
    const content = "Hello, opencoder!";

    // Write file
    try writeFile(test_file, content);

    // Read file
    const read_content = try readFile(test_file, allocator);
    defer allocator.free(read_content);

    try std.testing.expectEqualStrings(content, read_content);

    // Clean up
    fs.cwd().deleteFile(test_file) catch {};
}

test "Paths construction" {
    const allocator = std.testing.allocator;
    var paths = try initDirectories("/tmp/opencoder_test_paths", allocator);
    defer paths.deinit();

    try std.testing.expectEqualStrings("/tmp/opencoder_test_paths/.opencoder", paths.opencoder_dir);
    try std.testing.expectEqualStrings("/tmp/opencoder_test_paths/.opencoder/state.json", paths.state_file);
    try std.testing.expectEqualStrings("/tmp/opencoder_test_paths/.opencoder/current_plan.md", paths.current_plan);
    try std.testing.expectEqualStrings("/tmp/opencoder_test_paths/.opencoder/history", paths.history_dir);

    // Clean up
    fs.cwd().deleteTree("/tmp/opencoder_test_paths") catch {};
}
