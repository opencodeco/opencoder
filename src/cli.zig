//! Command-line argument parsing for opencoder.
//!
//! Handles parsing of CLI arguments, provider presets, and displays
//! usage/help information.

const std = @import("std");
const config = @import("config.zig");
const Allocator = std.mem.Allocator;

/// CLI parsing errors
pub const ParseError = error{
    MissingRequiredArgs,
    UnknownOption,
    UnknownProvider,
    InvalidProjectDir,
    MissingOptionValue,
};

/// Result of CLI parsing
pub const ParseResult = union(enum) {
    /// Show help and exit
    help,
    /// Show version and exit
    version,
    /// Run with configuration
    run: config.Config,
};

/// Parse command-line arguments from process
pub fn parse(allocator: Allocator) ParseError!ParseResult {
    var args = std.process.args();
    _ = args.skip(); // Skip program name
    return parseArgs(allocator, &args);
}

/// Parse command-line arguments from an iterator (testable version)
fn parseArgs(allocator: Allocator, args: anytype) ParseError!ParseResult {
    var cfg = config.Config.loadFromEnv();
    var planning_model: ?[]const u8 = null;
    var execution_model: ?[]const u8 = null;
    var project_dir: ?[]const u8 = null;
    var user_hint: ?[]const u8 = null;

    while (args.next()) |arg| {
        if (std.mem.eql(u8, arg, "-h") or std.mem.eql(u8, arg, "--help")) {
            return .help;
        } else if (std.mem.eql(u8, arg, "--version")) {
            return .version;
        } else if (std.mem.eql(u8, arg, "-v") or std.mem.eql(u8, arg, "--verbose")) {
            cfg.verbose = true;
        } else if (std.mem.eql(u8, arg, "--provider")) {
            const provider_str = args.next() orelse return ParseError.MissingOptionValue;
            const provider = config.Provider.fromString(provider_str) orelse return ParseError.UnknownProvider;
            const models = config.getProviderModels(provider);
            planning_model = models.planning;
            execution_model = models.execution;
        } else if (std.mem.eql(u8, arg, "-P") or std.mem.eql(u8, arg, "--planning-model")) {
            planning_model = args.next() orelse return ParseError.MissingOptionValue;
        } else if (std.mem.eql(u8, arg, "-E") or std.mem.eql(u8, arg, "--execution-model")) {
            execution_model = args.next() orelse return ParseError.MissingOptionValue;
        } else if (std.mem.eql(u8, arg, "-p") or std.mem.eql(u8, arg, "--project")) {
            project_dir = args.next() orelse return ParseError.MissingOptionValue;
        } else if (std.mem.startsWith(u8, arg, "-")) {
            return ParseError.UnknownOption;
        } else {
            // Positional argument is the user hint
            user_hint = arg;
        }
    }

    // Validate required arguments
    if (planning_model == null or execution_model == null) {
        return ParseError.MissingRequiredArgs;
    }

    // Set project directory (default to current directory)
    const final_project_dir = project_dir orelse
        std.posix.getenv("OPENCODER_PROJECT_DIR") orelse
        ".";

    // Validate project directory exists
    std.fs.cwd().access(final_project_dir, .{}) catch {
        return ParseError.InvalidProjectDir;
    };

    // Resolve to absolute path
    const abs_path = std.fs.cwd().realpathAlloc(allocator, final_project_dir) catch {
        return ParseError.InvalidProjectDir;
    };

    cfg.planning_model = planning_model.?;
    cfg.execution_model = execution_model.?;
    cfg.project_dir = abs_path;
    cfg.user_hint = user_hint;

    return .{ .run = cfg };
}

/// Test helper: parse arguments from a slice
fn parseFromSlice(allocator: Allocator, args: []const []const u8) ParseError!ParseResult {
    var iter = ArgIterator.init(args);
    return parseArgs(allocator, &iter);
}

/// Simple argument iterator for testing
const ArgIterator = struct {
    args: []const []const u8,
    index: usize,

    fn init(args: []const []const u8) ArgIterator {
        return .{ .args = args, .index = 0 };
    }

    fn next(self: *ArgIterator) ?[]const u8 {
        if (self.index >= self.args.len) return null;
        const arg = self.args[self.index];
        self.index += 1;
        return arg;
    }
};

const usage_text =
    \\opencoder v
++ config.version ++
    \\ - Autonomous OpenCode Runner
    \\
    \\Usage:
    \\  opencoder --provider PROVIDER [OPTIONS] [HINT]
    \\  opencoder -P MODEL -E MODEL [OPTIONS] [HINT]
    \\
    \\Required Arguments (choose one):
    \\  --provider PROVIDER            Use a provider preset (github, anthropic, openai, opencode)
    \\  -P, --planning-model MODEL     Model for planning/evaluation (e.g., anthropic/claude-sonnet-4)
    \\  -E, --execution-model MODEL    Model for task execution (e.g., anthropic/claude-haiku)
    \\
    \\Optional Arguments:
    \\  -p, --project DIR              Project directory (default: $OPENCODER_PROJECT_DIR or $PWD)
    \\  -v, --verbose                  Enable verbose logging
    \\  -h, --help                     Show this help message
    \\  --version                      Show version
    \\  HINT                           Optional instruction/hint for what to build (e.g., "build a REST API")
    \\
    \\Provider Presets:
    \\  github                         Planning: claude-opus-4.5, Execution: claude-sonnet-4.5
    \\  anthropic                      Planning: claude-sonnet-4, Execution: claude-haiku
    \\  openai                         Planning: gpt-4, Execution: gpt-4o-mini
    \\  opencode                       Planning: glm-4.7-free, Execution: minimax-m2.1-free
    \\
    \\Environment Variables:
    \\  OPENCODER_PROJECT_DIR          Default project directory
    \\  OPENCODER_MAX_RETRIES          Max retries per operation (default: 3)
    \\  OPENCODER_BACKOFF_BASE         Base seconds for exponential backoff (default: 10)
    \\  OPENCODER_LOG_RETENTION        Days to keep old logs (default: 30)
    \\
    \\Examples:
    \\  # Using provider preset (recommended)
    \\  opencoder --provider github
    \\  opencoder --provider github "build a todo app"
    \\  opencoder --provider anthropic "create a REST API"
    \\
    \\  # Using explicit models
    \\  opencoder -P anthropic/claude-sonnet-4 -E anthropic/claude-haiku
    \\  opencoder -P anthropic/claude-sonnet-4 -E anthropic/claude-haiku "build a todo app"
    \\
    \\Directory Structure:
    \\  $PROJECT_DIR/.opencoder/
    \\    ├── state.json               # Current execution state
    \\    ├── current_plan.md          # Active task plan
    \\    ├── alerts.log               # Critical error alerts
    \\    ├── history/                 # Archived completed plans
    \\    └── logs/
    \\        ├── main.log             # Main rotating log
    \\        └── cycles/              # Per-cycle detailed logs
    \\
;

/// Print usage/help information
pub fn printUsage(file: std.fs.File) void {
    _ = file.write(usage_text) catch {};
}

/// Print version information
pub fn printVersion(file: std.fs.File) void {
    _ = file.write("opencoder " ++ config.version ++ "\n") catch {};
}

/// Format error message for CLI errors
pub fn formatError(err: ParseError, file: std.fs.File) void {
    const msg = switch (err) {
        ParseError.MissingRequiredArgs => "Error: Either --provider or both --planning-model and --execution-model are required\nUse -h or --help for usage information\n",
        ParseError.UnknownOption => "Error: Unknown option\nUse -h or --help for usage information\n",
        ParseError.UnknownProvider => "Error: Unknown provider\nAvailable providers: github, anthropic, openai, opencode\n",
        ParseError.InvalidProjectDir => "Error: Project directory does not exist or is not accessible\n",
        ParseError.MissingOptionValue => "Error: Option requires a value\nUse -h or --help for usage information\n",
    };
    _ = file.write(msg) catch {};
}

// ============================================================================
// Tests
// ============================================================================

test "usage_text contains expected strings" {
    try std.testing.expect(std.mem.indexOf(u8, usage_text, "opencoder") != null);
    try std.testing.expect(std.mem.indexOf(u8, usage_text, "--provider") != null);
    try std.testing.expect(std.mem.indexOf(u8, usage_text, "--planning-model") != null);
    try std.testing.expect(std.mem.indexOf(u8, usage_text, "--execution-model") != null);
}

test "usage_text contains version" {
    try std.testing.expect(std.mem.indexOf(u8, usage_text, config.version) != null);
}

// ============================================================================
// Parse Function Tests
// ============================================================================

test "parse help flag short form" {
    const args = &[_][]const u8{"-h"};
    const result = try parseFromSlice(std.testing.allocator, args);
    try std.testing.expectEqual(ParseResult.help, result);
}

test "parse help flag long form" {
    const args = &[_][]const u8{"--help"};
    const result = try parseFromSlice(std.testing.allocator, args);
    try std.testing.expectEqual(ParseResult.help, result);
}

test "parse version flag" {
    const args = &[_][]const u8{"--version"};
    const result = try parseFromSlice(std.testing.allocator, args);
    try std.testing.expectEqual(ParseResult.version, result);
}

test "parse with github provider preset" {
    const args = &[_][]const u8{ "--provider", "github" };
    const result = try parseFromSlice(std.testing.allocator, args);
    defer if (result == .run) std.testing.allocator.free(result.run.project_dir);

    try std.testing.expect(result == .run);
    try std.testing.expectEqualStrings("github-copilot/claude-opus-4.5", result.run.planning_model);
    try std.testing.expectEqualStrings("github-copilot/claude-sonnet-4.5", result.run.execution_model);
}

test "parse with anthropic provider preset" {
    const args = &[_][]const u8{ "--provider", "anthropic" };
    const result = try parseFromSlice(std.testing.allocator, args);
    defer if (result == .run) std.testing.allocator.free(result.run.project_dir);

    try std.testing.expect(result == .run);
    try std.testing.expectEqualStrings("anthropic/claude-sonnet-4", result.run.planning_model);
    try std.testing.expectEqualStrings("anthropic/claude-haiku", result.run.execution_model);
}

test "parse with openai provider preset" {
    const args = &[_][]const u8{ "--provider", "openai" };
    const result = try parseFromSlice(std.testing.allocator, args);
    defer if (result == .run) std.testing.allocator.free(result.run.project_dir);

    try std.testing.expect(result == .run);
    try std.testing.expectEqualStrings("openai/gpt-4", result.run.planning_model);
    try std.testing.expectEqualStrings("openai/gpt-4o-mini", result.run.execution_model);
}

test "parse with opencode provider preset" {
    const args = &[_][]const u8{ "--provider", "opencode" };
    const result = try parseFromSlice(std.testing.allocator, args);
    defer if (result == .run) std.testing.allocator.free(result.run.project_dir);

    try std.testing.expect(result == .run);
    try std.testing.expectEqualStrings("opencode/glm-4.7-free", result.run.planning_model);
    try std.testing.expectEqualStrings("opencode/minimax-m2.1-free", result.run.execution_model);
}

test "parse with explicit models short form" {
    const args = &[_][]const u8{ "-P", "my/planning-model", "-E", "my/execution-model" };
    const result = try parseFromSlice(std.testing.allocator, args);
    defer if (result == .run) std.testing.allocator.free(result.run.project_dir);

    try std.testing.expect(result == .run);
    try std.testing.expectEqualStrings("my/planning-model", result.run.planning_model);
    try std.testing.expectEqualStrings("my/execution-model", result.run.execution_model);
}

test "parse with explicit models long form" {
    const args = &[_][]const u8{ "--planning-model", "my/planning-model", "--execution-model", "my/execution-model" };
    const result = try parseFromSlice(std.testing.allocator, args);
    defer if (result == .run) std.testing.allocator.free(result.run.project_dir);

    try std.testing.expect(result == .run);
    try std.testing.expectEqualStrings("my/planning-model", result.run.planning_model);
    try std.testing.expectEqualStrings("my/execution-model", result.run.execution_model);
}

test "parse with verbose flag short form" {
    const args = &[_][]const u8{ "--provider", "github", "-v" };
    const result = try parseFromSlice(std.testing.allocator, args);
    defer if (result == .run) std.testing.allocator.free(result.run.project_dir);

    try std.testing.expect(result == .run);
    try std.testing.expectEqual(true, result.run.verbose);
}

test "parse with verbose flag long form" {
    const args = &[_][]const u8{ "--provider", "github", "--verbose" };
    const result = try parseFromSlice(std.testing.allocator, args);
    defer if (result == .run) std.testing.allocator.free(result.run.project_dir);

    try std.testing.expect(result == .run);
    try std.testing.expectEqual(true, result.run.verbose);
}

test "parse with project directory short form" {
    const args = &[_][]const u8{ "--provider", "github", "-p", "." };
    const result = try parseFromSlice(std.testing.allocator, args);
    defer if (result == .run) std.testing.allocator.free(result.run.project_dir);

    try std.testing.expect(result == .run);
    // project_dir should be resolved to absolute path
    try std.testing.expect(result.run.project_dir.len > 0);
}

test "parse with project directory long form" {
    const args = &[_][]const u8{ "--provider", "github", "--project", "." };
    const result = try parseFromSlice(std.testing.allocator, args);
    defer if (result == .run) std.testing.allocator.free(result.run.project_dir);

    try std.testing.expect(result == .run);
    try std.testing.expect(result.run.project_dir.len > 0);
}

test "parse with user hint" {
    const args = &[_][]const u8{ "--provider", "github", "build a todo app" };
    const result = try parseFromSlice(std.testing.allocator, args);
    defer if (result == .run) std.testing.allocator.free(result.run.project_dir);

    try std.testing.expect(result == .run);
    try std.testing.expect(result.run.user_hint != null);
    try std.testing.expectEqualStrings("build a todo app", result.run.user_hint.?);
}

test "parse with all options combined" {
    const args = &[_][]const u8{ "--provider", "anthropic", "-v", "-p", ".", "create a REST API" };
    const result = try parseFromSlice(std.testing.allocator, args);
    defer if (result == .run) std.testing.allocator.free(result.run.project_dir);

    try std.testing.expect(result == .run);
    try std.testing.expectEqual(true, result.run.verbose);
    try std.testing.expect(result.run.project_dir.len > 0);
    try std.testing.expect(result.run.user_hint != null);
    try std.testing.expectEqualStrings("create a REST API", result.run.user_hint.?);
}

test "parse with mixed explicit models and provider (explicit wins)" {
    const args = &[_][]const u8{ "--provider", "github", "-P", "custom/planning", "-E", "custom/execution" };
    const result = try parseFromSlice(std.testing.allocator, args);
    defer if (result == .run) std.testing.allocator.free(result.run.project_dir);

    try std.testing.expect(result == .run);
    // Explicit models should override provider preset
    try std.testing.expectEqualStrings("custom/planning", result.run.planning_model);
    try std.testing.expectEqualStrings("custom/execution", result.run.execution_model);
}

test "parse with options in different order" {
    const args = &[_][]const u8{ "-v", "build something", "--provider", "openai", "-p", "." };
    const result = try parseFromSlice(std.testing.allocator, args);
    defer if (result == .run) std.testing.allocator.free(result.run.project_dir);

    try std.testing.expect(result == .run);
    try std.testing.expectEqual(true, result.run.verbose);
    try std.testing.expectEqualStrings("build something", result.run.user_hint.?);
}

// ============================================================================
// Error Case Tests
// ============================================================================

test "parse error: no arguments" {
    const args = &[_][]const u8{};
    const result = parseFromSlice(std.testing.allocator, args);
    try std.testing.expectError(ParseError.MissingRequiredArgs, result);
}

test "parse error: only verbose flag" {
    const args = &[_][]const u8{"-v"};
    const result = parseFromSlice(std.testing.allocator, args);
    try std.testing.expectError(ParseError.MissingRequiredArgs, result);
}

test "parse error: missing planning model" {
    const args = &[_][]const u8{ "-E", "my/execution-model" };
    const result = parseFromSlice(std.testing.allocator, args);
    try std.testing.expectError(ParseError.MissingRequiredArgs, result);
}

test "parse error: missing execution model" {
    const args = &[_][]const u8{ "-P", "my/planning-model" };
    const result = parseFromSlice(std.testing.allocator, args);
    try std.testing.expectError(ParseError.MissingRequiredArgs, result);
}

test "parse error: unknown option" {
    const args = &[_][]const u8{ "--provider", "github", "--unknown" };
    const result = parseFromSlice(std.testing.allocator, args);
    try std.testing.expectError(ParseError.UnknownOption, result);
}

test "parse error: unknown option short form" {
    const args = &[_][]const u8{ "--provider", "github", "-x" };
    const result = parseFromSlice(std.testing.allocator, args);
    try std.testing.expectError(ParseError.UnknownOption, result);
}

test "parse error: unknown provider" {
    const args = &[_][]const u8{ "--provider", "unknown" };
    const result = parseFromSlice(std.testing.allocator, args);
    try std.testing.expectError(ParseError.UnknownProvider, result);
}

test "parse error: provider with empty string" {
    const args = &[_][]const u8{ "--provider", "" };
    const result = parseFromSlice(std.testing.allocator, args);
    try std.testing.expectError(ParseError.UnknownProvider, result);
}

test "parse error: missing provider value" {
    const args = &[_][]const u8{"--provider"};
    const result = parseFromSlice(std.testing.allocator, args);
    try std.testing.expectError(ParseError.MissingOptionValue, result);
}

test "parse error: missing planning model value" {
    const args = &[_][]const u8{ "-E", "my/execution-model", "-P" };
    const result = parseFromSlice(std.testing.allocator, args);
    try std.testing.expectError(ParseError.MissingOptionValue, result);
}

test "parse error: missing execution model value" {
    const args = &[_][]const u8{ "-P", "my/planning-model", "-E" };
    const result = parseFromSlice(std.testing.allocator, args);
    try std.testing.expectError(ParseError.MissingOptionValue, result);
}

test "parse error: missing project directory value" {
    const args = &[_][]const u8{ "--provider", "github", "-p" };
    const result = parseFromSlice(std.testing.allocator, args);
    try std.testing.expectError(ParseError.MissingOptionValue, result);
}

test "parse error: invalid project directory" {
    const args = &[_][]const u8{ "--provider", "github", "-p", "/nonexistent/directory/path" };
    const result = parseFromSlice(std.testing.allocator, args);
    try std.testing.expectError(ParseError.InvalidProjectDir, result);
}

// ============================================================================
// Edge Case Tests
// ============================================================================

test "parse edge case: help flag takes precedence" {
    const args = &[_][]const u8{ "--provider", "github", "--help" };
    const result = try parseFromSlice(std.testing.allocator, args);
    try std.testing.expectEqual(ParseResult.help, result);
}

test "parse edge case: version flag takes precedence" {
    const args = &[_][]const u8{ "--provider", "github", "--version" };
    const result = try parseFromSlice(std.testing.allocator, args);
    try std.testing.expectEqual(ParseResult.version, result);
}

test "parse edge case: multiple verbose flags" {
    const args = &[_][]const u8{ "--provider", "github", "-v", "--verbose" };
    const result = try parseFromSlice(std.testing.allocator, args);
    defer if (result == .run) std.testing.allocator.free(result.run.project_dir);

    try std.testing.expect(result == .run);
    try std.testing.expectEqual(true, result.run.verbose);
}

test "parse edge case: last user hint wins" {
    const args = &[_][]const u8{ "--provider", "github", "first hint", "second hint" };
    const result = try parseFromSlice(std.testing.allocator, args);
    defer if (result == .run) std.testing.allocator.free(result.run.project_dir);

    try std.testing.expect(result == .run);
    // Only the last positional argument is used as hint
    try std.testing.expectEqualStrings("second hint", result.run.user_hint.?);
}

test "parse edge case: model names with special characters" {
    const args = &[_][]const u8{ "-P", "provider/model-v1.2.3", "-E", "provider/model_beta" };
    const result = try parseFromSlice(std.testing.allocator, args);
    defer if (result == .run) std.testing.allocator.free(result.run.project_dir);

    try std.testing.expect(result == .run);
    try std.testing.expectEqualStrings("provider/model-v1.2.3", result.run.planning_model);
    try std.testing.expectEqualStrings("provider/model_beta", result.run.execution_model);
}

test "parse edge case: user hint with spaces preserved" {
    const args = &[_][]const u8{ "--provider", "github", "build a complex web application" };
    const result = try parseFromSlice(std.testing.allocator, args);
    defer if (result == .run) std.testing.allocator.free(result.run.project_dir);

    try std.testing.expect(result == .run);
    try std.testing.expectEqualStrings("build a complex web application", result.run.user_hint.?);
}

test "parse edge case: no user hint results in null" {
    const args = &[_][]const u8{ "--provider", "github" };
    const result = try parseFromSlice(std.testing.allocator, args);
    defer if (result == .run) std.testing.allocator.free(result.run.project_dir);

    try std.testing.expect(result == .run);
    try std.testing.expectEqual(@as(?[]const u8, null), result.run.user_hint);
}
