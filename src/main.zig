//! opencoder - Autonomous OpenCode Runner
//!
//! A native application that runs opencode CLI in a fully autonomous way,
//! creating plans and executing them continuously without stopping.
//!
//! Usage:
//!   opencoder --provider PROVIDER [OPTIONS] [HINT]
//!   opencoder -P MODEL -E MODEL [OPTIONS] [HINT]

const std = @import("std");

const cli = @import("cli.zig");
const config = @import("config.zig");
const state = @import("state.zig");
const fsutil = @import("fs.zig");
const Logger = @import("logger.zig").Logger;
const Executor = @import("executor.zig").Executor;
const loop = @import("loop.zig");

const stdout_file = std.fs.File{ .handle = std.posix.STDOUT_FILENO };
const stderr_file = std.fs.File{ .handle = std.posix.STDERR_FILENO };

pub fn main() !void {
    // Use general purpose allocator
    var gpa = std.heap.GeneralPurposeAllocator(.{}){};
    defer _ = gpa.deinit();
    const allocator = gpa.allocator();

    // Parse command-line arguments
    const parse_result = cli.parse(allocator) catch |err| {
        cli.formatError(err, stderr_file);
        std.process.exit(1);
    };

    // Handle help/version
    switch (parse_result) {
        .help => {
            cli.printUsage(stdout_file);
            return;
        },
        .version => {
            cli.printVersion(stdout_file);
            return;
        },
        .run => |cfg| {
            try runOpencoder(cfg, allocator);
        },
    }
}

fn runOpencoder(cfg: config.Config, allocator: std.mem.Allocator) !void {
    // Print banner
    var banner_buf: [128]u8 = undefined;
    const banner = std.fmt.bufPrint(&banner_buf, "\nopencoder v{s} - Autonomous OpenCode Runner\n\n", .{config.version}) catch "opencoder\n";
    _ = stdout_file.write(banner) catch {};

    // Initialize directories
    _ = stdout_file.write("Initializing workspace...\n") catch {};
    var paths = try fsutil.initDirectories(cfg.project_dir, allocator);
    defer paths.deinit();

    // Initialize logger
    var log = try Logger.init(paths.opencoder_dir, cfg.verbose, allocator);
    defer log.deinit();

    log.say("Workspace initialized");

    // Load or create state
    var st = blk: {
        if (try state.State.load(paths.state_file, allocator)) |loaded| {
            log.sayFmt("Resuming: Cycle {d}, Phase {s}", .{
                loaded.cycle,
                loaded.phase.toString(),
            });
            break :blk loaded;
        } else {
            log.say("Starting fresh (no previous state)");
            break :blk state.State.default();
        }
    };

    // Recalculate task counts if resuming with existing plan
    if (fsutil.fileExists(paths.current_plan)) {
        const plan_content = fsutil.readFile(paths.current_plan, allocator) catch null;
        if (plan_content) |content| {
            defer allocator.free(content);
            const plan_mod = @import("plan.zig");
            st.total_tasks = plan_mod.countTotalTasks(content);
            st.current_task_num = plan_mod.countCompletedTasks(content);
            log.logFmt("Recalculated: {d} completed of {d} total tasks", .{
                st.current_task_num,
                st.total_tasks,
            });
        }
    }

    // Setup signal handlers
    loop.setupSignalHandlers();

    // Initialize executor
    var executor = Executor.init(&cfg, &log, allocator);

    // Run main loop
    var main_loop = loop.Loop.init(&cfg, &st, &paths, &log, &executor, allocator);
    main_loop.run() catch |err| {
        log.logErrorFmt("Loop error: {}", .{err});
    };

    // Save final state
    st.save(paths.state_file, allocator) catch |err| {
        log.logErrorFmt("Failed to save final state: {}", .{err});
    };

    log.say("");
    log.say("Opencoder stopped");
}

// Re-export for tests
test {
    _ = @import("config.zig");
    _ = @import("cli.zig");
    _ = @import("logger.zig");
    _ = @import("fs.zig");
    _ = @import("state.zig");
    _ = @import("plan.zig");
    _ = @import("executor.zig");
    _ = @import("evaluator.zig");
    _ = @import("loop.zig");
}
