//! Configuration and provider presets for opencoder.
//!
//! This module defines the configuration structure, provider presets,
//! and environment variable loading for the autonomous OpenCode runner.

const std = @import("std");
const Allocator = std.mem.Allocator;

/// Opencoder version
pub const version = "0.1.0";

/// Supported provider presets
pub const Provider = enum {
    github,
    anthropic,
    opencode,

    /// Parse provider from string
    pub fn fromString(str: []const u8) ?Provider {
        const map = std.StaticStringMap(Provider).initComptime(.{
            .{ "github", .github },
            .{ "anthropic", .anthropic },
            .{ "opencode", .opencode },
        });
        return map.get(str);
    }

    /// Get provider name as string
    pub fn toString(self: Provider) []const u8 {
        return switch (self) {
            .github => "github",
            .anthropic => "anthropic",
            .opencode => "opencode",
        };
    }
};

/// Model pair for planning and execution
pub const ModelPair = struct {
    planning: []const u8,
    execution: []const u8,
};

/// Get model pair for a provider preset
pub fn getProviderModels(provider: Provider) ModelPair {
    return switch (provider) {
        .github => .{
            .planning = "github-copilot/claude-opus-4.5",
            .execution = "github-copilot/claude-sonnet-4.5",
        },
        .anthropic => .{
            .planning = "anthropic/claude-opus-4-5",
            .execution = "anthropic/claude-sonnet-4-5",
        },
        .opencode => .{
            .planning = "opencode/glm-4.7-free",
            .execution = "opencode/minimax-m2.1-free",
        },
    };
}

/// Runtime configuration
pub const Config = struct {
    planning_model: []const u8,
    execution_model: []const u8,
    project_dir: []const u8,
    verbose: bool,
    user_hint: ?[]const u8,
    max_retries: u32,
    backoff_base: u32,
    log_retention: u32,
    max_file_size: usize,
    log_buffer_size: usize,
    task_pause_seconds: u64,

    /// Default configuration values
    pub const defaults = Config{
        .planning_model = "",
        .execution_model = "",
        .project_dir = "",
        .verbose = false,
        .user_hint = null,
        .max_retries = 3,
        .backoff_base = 10,
        .log_retention = 30,
        .max_file_size = 1024 * 1024, // 1MB
        .log_buffer_size = 2048, // 2KB
        .task_pause_seconds = 2, // 2 seconds
    };

    /// Load configuration from environment variables
    pub fn loadFromEnv() Config {
        var config = defaults;

        // OPENCODER_MAX_RETRIES
        if (std.posix.getenv("OPENCODER_MAX_RETRIES")) |val| {
            config.max_retries = std.fmt.parseInt(u32, val, 10) catch defaults.max_retries;
        }

        // OPENCODER_BACKOFF_BASE
        if (std.posix.getenv("OPENCODER_BACKOFF_BASE")) |val| {
            config.backoff_base = std.fmt.parseInt(u32, val, 10) catch defaults.backoff_base;
        }

        // OPENCODER_LOG_RETENTION
        if (std.posix.getenv("OPENCODER_LOG_RETENTION")) |val| {
            config.log_retention = std.fmt.parseInt(u32, val, 10) catch defaults.log_retention;
        }

        // OPENCODER_MAX_FILE_SIZE (in bytes)
        if (std.posix.getenv("OPENCODER_MAX_FILE_SIZE")) |val| {
            config.max_file_size = std.fmt.parseInt(usize, val, 10) catch defaults.max_file_size;
        }

        // OPENCODER_LOG_BUFFER_SIZE (in bytes)
        if (std.posix.getenv("OPENCODER_LOG_BUFFER_SIZE")) |val| {
            config.log_buffer_size = std.fmt.parseInt(usize, val, 10) catch defaults.log_buffer_size;
        }

        // OPENCODER_TASK_PAUSE_SECONDS
        if (std.posix.getenv("OPENCODER_TASK_PAUSE_SECONDS")) |val| {
            config.task_pause_seconds = std.fmt.parseInt(u64, val, 10) catch defaults.task_pause_seconds;
        }

        return config;
    }
};

// ============================================================================
// Tests
// ============================================================================

test "Provider.fromString parses valid providers" {
    try std.testing.expectEqual(Provider.github, Provider.fromString("github").?);
    try std.testing.expectEqual(Provider.anthropic, Provider.fromString("anthropic").?);
    try std.testing.expectEqual(Provider.opencode, Provider.fromString("opencode").?);
}

test "Provider.fromString returns null for invalid provider" {
    try std.testing.expectEqual(@as(?Provider, null), Provider.fromString("invalid"));
    try std.testing.expectEqual(@as(?Provider, null), Provider.fromString(""));
}

test "Provider.toString returns correct strings" {
    try std.testing.expectEqualStrings("github", Provider.github.toString());
    try std.testing.expectEqualStrings("anthropic", Provider.anthropic.toString());
    try std.testing.expectEqualStrings("opencode", Provider.opencode.toString());
}

test "getProviderModels returns correct models for github" {
    const models = getProviderModels(.github);
    try std.testing.expectEqualStrings("github-copilot/claude-opus-4.5", models.planning);
    try std.testing.expectEqualStrings("github-copilot/claude-sonnet-4.5", models.execution);
}

test "getProviderModels returns correct models for anthropic" {
    const models = getProviderModels(.anthropic);
    try std.testing.expectEqualStrings("anthropic/claude-opus-4-5", models.planning);
    try std.testing.expectEqualStrings("anthropic/claude-sonnet-4-5", models.execution);
}

test "getProviderModels returns correct models for opencode" {
    const models = getProviderModels(.opencode);
    try std.testing.expectEqualStrings("opencode/glm-4.7-free", models.planning);
    try std.testing.expectEqualStrings("opencode/minimax-m2.1-free", models.execution);
}

test "Config.defaults has expected values" {
    const config = Config.defaults;
    try std.testing.expectEqual(@as(u32, 3), config.max_retries);
    try std.testing.expectEqual(@as(u32, 10), config.backoff_base);
    try std.testing.expectEqual(@as(u32, 30), config.log_retention);
    try std.testing.expectEqual(@as(usize, 1024 * 1024), config.max_file_size);
    try std.testing.expectEqual(@as(usize, 2048), config.log_buffer_size);
    try std.testing.expectEqual(@as(u64, 2), config.task_pause_seconds);
    try std.testing.expectEqual(false, config.verbose);
    try std.testing.expectEqual(@as(?[]const u8, null), config.user_hint);
}
