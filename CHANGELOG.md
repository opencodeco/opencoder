# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **Ideas Queue Management** - New CLI commands for managing the ideas queue
  - `opencoder idea <description>` command to quickly add ideas to the queue
  - `opencoder idea list` command to list all queued ideas
  - Automatic timestamped filenames for easy organization
  - Pre-filled markdown templates for quick editing
- **Enhanced Conventional Commits** - Expanded commit message generation
  - Support for `perf`, `chore`, `ci`, `build`, and `style` commit types
  - Better pattern matching for refactor types (cleanup, reorganize, etc.)
  - Improved categorization of "improve" keyword to refactor

### Changed
- **Documentation Improvements**
  - Added git-related environment variables to README
  - Updated config.json examples with all available options
  - Added examples for idea command usage
- **Package Metadata** - Enhanced package.json with:
  - Repository, bugs, and homepage URLs
  - Keywords for npm discoverability
  - Author and license fields
- **Gitignore Updates** - Added metrics.json to prevent tracking runtime statistics

## [1.0.0] - 2026-01-18

### Added
- **Metrics System** - Track cycles, tasks, token usage, and estimated costs
  - `--status` CLI flag to display metrics summary without starting the loop
  - `--metrics-reset` CLI flag to reset all metrics to default values with confirmation
  - Comprehensive metrics tracking in `metrics.json` including token counts and cost estimation
- **Token Usage Tracking** - Enhanced token tracking with accurate model cost estimation
  - Support for all major model providers: Claude (Anthropic), GPT (OpenAI), Gemini (Google)
  - Automatic cost calculation based on current market pricing
  - Token tracking integration in plan and build phases
- **Session Statistics** - Detailed session-level statistics including:
  - Input and output token counts per operation
  - Session duration tracking
  - Summary logging at end of each cycle
- **Git Integration Improvements**
  - Proper escaping of special characters in commit messages
  - `hasUnpushedCommits()` function to detect unpushed changes
  - Better handling of git operations with improved error messages
- **Ideas Queue Enhancements** - Improved reliability and crash safety
  - Idea backup before processing
  - Idea tracking in state for crash recovery
  - Auto-cleanup of empty/invalid ideas
- **Comprehensive Test Coverage** - Full test suite for all modules
  - 443 tests covering CLI, build, git, metrics, eval, and more
  - High confidence in code reliability

### Changed
- **Terminology Update** - Renamed "Planning" to "Plan" throughout codebase
  - Updated documentation and variable names for consistency
  - Improved naming clarity in phase descriptions
- **Build Phase Naming** - Renamed "builder" module to "build"
  - More concise and idiomatic naming
  - Updated all related imports and test files
- **Evaluation Phase** - Renamed "evaluation" to "eval"
  - Shorter terminology for consistency with phase naming
  - Updated all functions and types accordingly
- **Directory Structure** - Standardized on `.opencode/opencoder/` directory
  - All OpenCoder artifacts stored under this path
  - Improved organization and clarity

### Fixed
- Improved idea handling reliability with better crash safety mechanisms
- Better null/undefined handling in message part extraction
- Special character escaping in git commit messages
- State validation for invalid phase names

### Technical Improvements
- Exponential backoff retry mechanism for transient failures
- Cycle timeout/watchdog mechanism to prevent infinite loops
- Visual feedback for AI thinking and tool usage during development
- Improved logger output with file change notifications
- Enhanced FS utilities for better file operations

## [0.1.0] - 2026-01-16

### Added
- Initial OpenCoder release
- Autonomous development loop with three phases: Plan, Build, Eval
- Ideas queue system for directing AI toward specific tasks
- OpenCode SDK integration with real-time event streaming
- Two-model architecture (separate models for plan and build)
- Live output streaming of AI thinking and tool calls
- State persistence for resumable development cycles
- Automatic git operations (commit and push)
- Plan history archival
- Comprehensive logging and metrics

