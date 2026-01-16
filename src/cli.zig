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

/// Parse command-line arguments
pub fn parse(allocator: Allocator) ParseError!ParseResult {
    var args = std.process.args();
    _ = args.skip(); // Skip program name

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
