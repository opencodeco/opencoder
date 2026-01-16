const std = @import("std");

pub fn build(b: *std.Build) void {
    const target = b.standardTargetOptions(.{});
    const optimize = b.standardOptimizeOption(.{});

    // Main executable
    const exe = b.addExecutable(.{
        .name = "opencoder",
        .root_module = b.createModule(.{
            .root_source_file = b.path("src/main.zig"),
            .target = target,
            .optimize = optimize,
        }),
    });

    b.installArtifact(exe);

    // Run command
    const run_cmd = b.addRunArtifact(exe);
    run_cmd.step.dependOn(b.getInstallStep());

    if (b.args) |args| {
        run_cmd.addArgs(args);
    }

    const run_step = b.step("run", "Run the opencoder CLI");
    run_step.dependOn(&run_cmd.step);

    // Unit tests
    const test_targets = [_][]const u8{
        "src/config.zig",
        "src/cli.zig",
        "src/logger.zig",
        "src/fs.zig",
        "src/state.zig",
        "src/plan.zig",
        "src/executor.zig",
        "src/evaluator.zig",
        "src/loop.zig",
    };

    const test_step = b.step("test", "Run unit tests");

    for (test_targets) |test_file| {
        const unit_tests = b.addTest(.{
            .root_module = b.createModule(.{
                .root_source_file = b.path(test_file),
                .target = target,
                .optimize = optimize,
            }),
        });

        const run_unit_tests = b.addRunArtifact(unit_tests);
        test_step.dependOn(&run_unit_tests.step);
    }
}
