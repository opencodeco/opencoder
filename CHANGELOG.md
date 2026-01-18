# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Test suite using bun:test for plugin exports and agent files
- Preuninstall script to clean up agents when plugin is removed
- CI test job with bun test integration
- Preuninstall verification in CI workflow

### Changed
- Refactored index.ts to import metadata from package.json (single source of truth)
- Expanded biome config to include tests and scripts
- Updated CI to use `--ignore-scripts` during install for cleaner testing
- Improved agent instructions for clarity and better results

## [0.1.0] - 2026-01-18

### Added
- Initial release as an OpenCode plugin
- Three autonomous development agents:
  - `opencoder` - Main orchestrator that runs the continuous Plan-Build-Commit loop
  - `opencoder-planner` - Analyzes codebases and creates development plans with 3-7 tasks
  - `opencoder-builder` - Executes tasks with precision, runs tests, and verifies changes
- Postinstall script that copies agents to `~/.config/opencode/agents/`
- Automatic git operations (commit after each task, push after each cycle)
- Conventional commit message generation
- Support for free models (`opencode/glm-4.7-free`, `opencode/minimax-m2.1-free`)
- Contributing guidelines

### Changed
- Complete rewrite from standalone CLI to OpenCode plugin architecture
- Renamed package from `opencoder` to `opencode-plugin-opencoder`
- Removed all TypeScript runtime code in favor of pure agent-based approach
- Simplified project structure to agents + minimal plugin metadata

### Removed
- CLI application and all associated TypeScript modules
- OpenCode SDK dependency (agents use OpenCode directly)
- Configuration file system (agents are self-contained)
- Ideas queue system (agents decide autonomously)
- Metrics tracking system
