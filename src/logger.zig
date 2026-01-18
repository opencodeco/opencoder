//! Logging infrastructure for opencoder.
//!
//! Provides file and console logging with timestamp formatting,
//! status line updates, and cycle-specific log files.

const std = @import("std");
const fs = std.fs;
const Allocator = std.mem.Allocator;

const fsutil = @import("fs.zig");

const stdout_file = fs.File{ .handle = std.posix.STDOUT_FILENO };

/// Logger for opencoder operations
pub const Logger = struct {
    main_log: ?fs.File,
    main_log_path: []const u8,
    cycle_log_dir: []const u8,
    alerts_file: []const u8,
    cycle: u32,
    verbose: bool,
    allocator: Allocator,
    buffer_size: usize,

    /// Initialize logger with opencoder directory
    pub fn init(
        opencoder_dir: []const u8,
        verbose: bool,
        allocator: Allocator,
        buffer_size: usize,
    ) !Logger {
        // Open main log file
        const main_log_path = try std.fs.path.join(allocator, &.{ opencoder_dir, "logs", "main.log" });
        errdefer allocator.free(main_log_path);

        const main_log = fs.cwd().openFile(main_log_path, .{ .mode = .write_only }) catch |err| blk: {
            if (err == error.FileNotFound) {
                break :blk try fs.cwd().createFile(main_log_path, .{});
            }
            return err;
        };
        try main_log.seekFromEnd(0);

        // Store paths
        const cycle_log_dir = try std.fs.path.join(allocator, &.{ opencoder_dir, "logs", "cycles" });
        const alerts_file = try std.fs.path.join(allocator, &.{ opencoder_dir, "alerts.log" });

        return Logger{
            .main_log = main_log,
            .main_log_path = main_log_path,
            .cycle_log_dir = cycle_log_dir,
            .alerts_file = alerts_file,
            .cycle = 1,
            .verbose = verbose,
            .allocator = allocator,
            .buffer_size = buffer_size,
        };
    }

    /// Clean up logger resources
    pub fn deinit(self: *Logger) void {
        if (self.main_log) |main_log_file| {
            main_log_file.close();
        }
        self.allocator.free(self.main_log_path);
        self.allocator.free(self.cycle_log_dir);
        self.allocator.free(self.alerts_file);
    }

    /// Rotate the main log file by renaming it with a timestamp
    pub fn rotate(self: *Logger) !void {
        if (self.main_log) |main_log_file| {
            main_log_file.close();
            self.main_log = null;
        }

        var ts_buf: [24]u8 = undefined;
        const ts = timestampISO(&ts_buf);

        var rotated_path_buf: [512]u8 = undefined;
        const rotated_path = std.fmt.bufPrint(&rotated_path_buf, "{s}.{s}", .{
            self.main_log_path,
            ts,
        }) catch return error.PathTooLong;

        fs.cwd().rename(self.main_log_path, rotated_path) catch |err| {
            if (err != error.FileNotFound) {
                return err;
            }
        };

        const new_log = fs.cwd().createFile(self.main_log_path, .{}) catch {
            return error.CreationFailed;
        };
        self.main_log = new_log;
    }

    /// Clean up old log files based on retention period (in days)
    pub fn cleanup(self: *Logger, log_retention: u32) !void {
        const now = std.time.timestamp();
        const cutoff_timestamp = now - (@as(i64, log_retention) * 24 * 60 * 60);

        const logs_dir_name = std.fs.path.dirname(self.main_log_path) orelse return;
        var dir = try fs.cwd().openDir(logs_dir_name, .{ .iterate = true });
        defer dir.close();

        var walker = try dir.walk(self.allocator);
        defer walker.deinit();

        while (try walker.next()) |entry| {
            if (entry.kind != .file) continue;

            const path = entry.path;
            if (!std.mem.endsWith(u8, path, ".log")) continue;
            if (std.mem.endsWith(u8, path, "main.log")) continue;

            const full_path = try std.fs.path.join(self.allocator, &.{ logs_dir_name, path });
            defer self.allocator.free(full_path);

            const file = try dir.openFile(path, .{});
            defer file.close();

            const stat = try file.stat();
            const mtime_secs = @divFloor(stat.mtime, std.time.ns_per_s);

            if (mtime_secs < cutoff_timestamp) {
                dir.deleteFile(path) catch {};
            }
        }

        self.cleanupRotatedLogs(cutoff_timestamp) catch {};
        self.cleanupCycleLogs(log_retention) catch {};
    }

    fn cleanupRotatedLogs(self: *Logger, cutoff_timestamp: i64) !void {
        const logs_dir = std.fs.path.dirname(self.main_log_path) orelse return;

        var dir = try fs.cwd().openDir(logs_dir, .{ .iterate = true });
        defer dir.close();

        var walker = try dir.walk(self.allocator);
        defer walker.deinit();

        while (try walker.next()) |entry| {
            if (entry.kind != .file) continue;

            const path = entry.path;
            if (!std.mem.startsWith(u8, path, "main.log.")) continue;

            const full_path = try std.fs.path.join(self.allocator, &.{ logs_dir, path });
            defer self.allocator.free(full_path);

            const file = try dir.openFile(path, .{});
            defer file.close();

            const stat = try file.stat();
            const mtime_secs = @divFloor(stat.mtime, std.time.ns_per_s);

            if (mtime_secs < cutoff_timestamp) {
                dir.deleteFile(path) catch {};
            }
        }
    }

    fn cleanupCycleLogs(self: *Logger, log_retention: u32) !void {
        const now = std.time.timestamp();
        const cutoff_timestamp = now - (@as(i64, log_retention) * 24 * 60 * 60);

        var dir = try fs.cwd().openDir(self.cycle_log_dir, .{ .iterate = true });
        defer dir.close();

        var walker = try dir.walk(self.allocator);
        defer walker.deinit();

        while (try walker.next()) |entry| {
            if (entry.kind != .file) continue;

            const path = entry.path;
            if (!std.mem.startsWith(u8, path, "cycle_") or !std.mem.endsWith(u8, path, ".log")) continue;

            const file = try dir.openFile(path, .{});
            defer file.close();

            const stat = try file.stat();
            const mtime_secs = @divFloor(stat.mtime, std.time.ns_per_s);

            if (mtime_secs < cutoff_timestamp) {
                dir.deleteFile(path) catch {};
            }
        }
    }

    /// Set current cycle number
    pub fn setCycle(self: *Logger, cycle: u32) void {
        self.cycle = cycle;
    }

    /// Log message to file only (silent)
    pub fn log(self: *Logger, msg: []const u8) void {
        self.writeToLogs(msg);
    }

    /// Log message with formatting
    pub fn logFmt(self: *Logger, comptime fmt: []const u8, args: anytype) void {
        const buf = self.allocator.alloc(u8, self.buffer_size) catch return;
        defer self.allocator.free(buf);
        const msg = std.fmt.bufPrint(buf, fmt, args) catch return;
        self.log(msg);
    }

    /// Say something to the user (console + file)
    pub fn say(self: *Logger, msg: []const u8) void {
        self.writeToLogs(msg);
        self.clearLine();
        _ = stdout_file.write(msg) catch {};
        _ = stdout_file.write("\n") catch {};
    }

    /// Say with formatting
    pub fn sayFmt(self: *Logger, comptime fmt: []const u8, args: anytype) void {
        const buf = self.allocator.alloc(u8, self.buffer_size) catch return;
        defer self.allocator.free(buf);
        const msg = std.fmt.bufPrint(buf, fmt, args) catch return;
        self.say(msg);
    }

    /// Update status line (single-line, overwritten)
    pub fn status(self: *Logger, msg: []const u8) void {
        self.writeToLogs(msg);
        self.clearLine();
        _ = stdout_file.write(msg) catch {};
    }

    /// Status with formatting
    pub fn statusFmt(self: *Logger, comptime fmt: []const u8, args: anytype) void {
        const buf = self.allocator.alloc(u8, self.buffer_size) catch return;
        defer self.allocator.free(buf);
        const msg = std.fmt.bufPrint(buf, fmt, args) catch return;
        self.status(msg);
    }

    /// Log error (console + file + alerts)
    pub fn logError(self: *Logger, msg: []const u8) void {
        self.say(msg);
        self.writeToAlerts(msg);
    }

    /// Log error with formatting
    pub fn logErrorFmt(self: *Logger, comptime fmt: []const u8, args: anytype) void {
        const buf = self.allocator.alloc(u8, self.buffer_size) catch return;
        defer self.allocator.free(buf);
        const msg = std.fmt.bufPrint(buf, fmt, args) catch return;
        self.logError(msg);
    }

    /// Log verbose (only if verbose mode enabled)
    pub fn logVerbose(self: *Logger, msg: []const u8) void {
        if (self.verbose) {
            const buf = self.allocator.alloc(u8, self.buffer_size) catch return;
            defer self.allocator.free(buf);
            const verbose_msg = std.fmt.bufPrint(buf, "VERBOSE: {s}", .{msg}) catch return;
            self.say(verbose_msg);
        }
    }

    // Internal helper functions

    fn clearLine(_: *Logger) void {
        _ = stdout_file.write("\r\x1b[K") catch {};
    }

    fn writeToLogs(self: *Logger, msg: []const u8) void {
        var ts_buf: [20]u8 = undefined;
        const ts = timestamp(&ts_buf);

        // Write to main log
        if (self.main_log) |main_log_file| {
            var log_buf: [2100]u8 = undefined;
            const log_line = std.fmt.bufPrint(&log_buf, "[{s}] {s}\n", .{ ts, msg }) catch return;
            _ = main_log_file.write(log_line) catch {};
        }

        // Write to cycle log
        self.writeToCycleLog(ts, msg);
    }

    fn writeToCycleLog(self: *Logger, ts: []const u8, msg: []const u8) void {
        var path_buf: [512]u8 = undefined;
        const cycle_log_path = std.fmt.bufPrint(&path_buf, "{s}/cycle_{d:0>3}.log", .{ self.cycle_log_dir, self.cycle }) catch return;

        const file = fs.cwd().openFile(cycle_log_path, .{ .mode = .write_only }) catch |err| blk: {
            if (err == error.FileNotFound) {
                break :blk fs.cwd().createFile(cycle_log_path, .{}) catch return;
            }
            return;
        };
        defer file.close();
        file.seekFromEnd(0) catch {};

        var log_buf: [2100]u8 = undefined;
        const log_line = std.fmt.bufPrint(&log_buf, "[{s}] {s}\n", .{ ts, msg }) catch return;
        _ = file.write(log_line) catch {};
    }

    fn writeToAlerts(self: *Logger, msg: []const u8) void {
        var ts_buf: [20]u8 = undefined;
        const ts = timestamp(&ts_buf);

        const file = fs.cwd().openFile(self.alerts_file, .{ .mode = .write_only }) catch |err| blk: {
            if (err == error.FileNotFound) {
                break :blk fs.cwd().createFile(self.alerts_file, .{}) catch return;
            }
            return;
        };
        defer file.close();
        file.seekFromEnd(0) catch {};

        var log_buf: [2100]u8 = undefined;
        const log_line = std.fmt.bufPrint(&log_buf, "{s} - {s}\n", .{ ts, msg }) catch return;
        _ = file.write(log_line) catch {};
    }
};

/// Generate timestamp string in "YYYY-MM-DD HH:MM:SS" format
pub fn timestamp(buf: *[20]u8) []const u8 {
    const now = std.time.timestamp();
    const epoch_seconds = std.time.epoch.EpochSeconds{ .secs = @intCast(now) };
    const day_seconds = epoch_seconds.getDaySeconds();
    const year_day = epoch_seconds.getEpochDay().calculateYearDay();
    const month_day = year_day.calculateMonthDay();

    const year = year_day.year;
    const month = month_day.month.numeric();
    const day = month_day.day_index + 1;
    const hour = day_seconds.getHoursIntoDay();
    const minute = day_seconds.getMinutesIntoHour();
    const second = day_seconds.getSecondsIntoMinute();

    _ = std.fmt.bufPrint(buf, "{d:0>4}-{d:0>2}-{d:0>2} {d:0>2}:{d:0>2}:{d:0>2}", .{
        year, month, day, hour, minute, second,
    }) catch {};

    return buf[0..19];
}

/// Generate ISO 8601 timestamp string
pub fn timestampISO(buf: *[24]u8) []const u8 {
    const now = std.time.timestamp();
    const epoch_seconds = std.time.epoch.EpochSeconds{ .secs = @intCast(now) };
    const day_seconds = epoch_seconds.getDaySeconds();
    const year_day = epoch_seconds.getEpochDay().calculateYearDay();
    const month_day = year_day.calculateMonthDay();

    const year = year_day.year;
    const month = month_day.month.numeric();
    const day = month_day.day_index + 1;
    const hour = day_seconds.getHoursIntoDay();
    const minute = day_seconds.getMinutesIntoHour();
    const second = day_seconds.getSecondsIntoMinute();

    _ = std.fmt.bufPrint(buf, "{d:0>4}-{d:0>2}-{d:0>2}T{d:0>2}:{d:0>2}:{d:0>2}Z", .{
        year, month, day, hour, minute, second,
    }) catch {};

    return buf[0..20];
}

// ============================================================================
// Tests
// ============================================================================

test "timestamp generates valid format" {
    var buf: [20]u8 = undefined;
    const ts = timestamp(&buf);

    // Should be 19 characters: "YYYY-MM-DD HH:MM:SS"
    try std.testing.expectEqual(@as(usize, 19), ts.len);

    // Check format characters
    try std.testing.expectEqual(@as(u8, '-'), ts[4]);
    try std.testing.expectEqual(@as(u8, '-'), ts[7]);
    try std.testing.expectEqual(@as(u8, ' '), ts[10]);
    try std.testing.expectEqual(@as(u8, ':'), ts[13]);
    try std.testing.expectEqual(@as(u8, ':'), ts[16]);
}

test "timestampISO generates valid ISO 8601 format" {
    var buf: [24]u8 = undefined;
    const ts = timestampISO(&buf);

    // Should be 20 characters: "YYYY-MM-DDTHH:MM:SSZ"
    try std.testing.expectEqual(@as(usize, 20), ts.len);

    // Check format characters
    try std.testing.expectEqual(@as(u8, '-'), ts[4]);
    try std.testing.expectEqual(@as(u8, '-'), ts[7]);
    try std.testing.expectEqual(@as(u8, 'T'), ts[10]);
    try std.testing.expectEqual(@as(u8, ':'), ts[13]);
    try std.testing.expectEqual(@as(u8, ':'), ts[16]);
    try std.testing.expectEqual(@as(u8, 'Z'), ts[19]);
}

test "rotate creates rotated log file" {
    const test_dir = "/tmp/opencoder_test_rotate";
    const allocator = std.testing.allocator;

    fs.cwd().deleteTree(test_dir) catch {};
    defer fs.cwd().deleteTree(test_dir) catch {};

    try fs.cwd().makePath(test_dir);
    const logs_dir = try std.fs.path.join(allocator, &.{ test_dir, "logs", "cycles" });
    defer allocator.free(logs_dir);
    try fs.cwd().makePath(logs_dir);

    var log = try Logger.init(test_dir, false, allocator, 2048);
    defer log.deinit();

    log.log("test message");

    try log.rotate();

    try std.testing.expect(fsutil.fileExists(log.main_log_path));
}

test "cleanup removes old cycle logs" {
    const test_dir = "/tmp/opencoder_test_cleanup";
    const allocator = std.testing.allocator;

    fs.cwd().deleteTree(test_dir) catch {};
    defer fs.cwd().deleteTree(test_dir) catch {};

    try fs.cwd().makePath(test_dir);
    const cycle_dir = try std.fs.path.join(allocator, &.{ test_dir, "logs", "cycles" });
    defer allocator.free(cycle_dir);
    try fs.cwd().makePath(cycle_dir);

    var log = try Logger.init(test_dir, false, allocator, 2048);
    defer log.deinit();

    const cycle_path = try std.fs.path.join(allocator, &.{ cycle_dir, "cycle_001.log" });
    defer allocator.free(cycle_path);

    const cycle_file = try fs.cwd().createFile(cycle_path, .{});
    cycle_file.close();

    try std.testing.expect(fsutil.fileExists(cycle_path));

    try log.cleanup(30);

    try std.testing.expect(fsutil.fileExists(cycle_path));
}
