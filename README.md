# opencode-plugin-opencoder

OpenCode plugin providing autonomous development agents for continuous codebase improvement.

## Overview

This plugin installs three agents that work together to create an infinite autonomous development loop:

| Agent | Purpose |
|-------|---------|
| `opencoder` | Main orchestrator - runs the continuous Plan-Build-Commit loop |
| `opencoder-planner` | Creates development plans with 3-7 prioritized tasks |
| `opencoder-builder` | Executes tasks with precision, runs tests, and verifies changes |

## Installation

```bash
bun add opencode-plugin-opencoder
```

On install, the agents are automatically copied to `~/.config/opencode/agents/`.

## Usage

Start the autonomous development loop:

```bash
opencode @opencoder
```

The agent will:
1. Analyze your codebase and create a plan with 3-7 tasks
2. Execute each task, writing code and running tests
3. Commit changes after each task with conventional commit messages
4. Push all commits after the plan is complete
5. Repeat forever

## How It Works

```
┌─────────────────────────────────────────────────────────────┐
│                    INFINITE LOOP                            │
│                                                             │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐  │
│  │   PLANNER    │───>│   BUILDER    │───>│    COMMIT    │  │
│  │  (3-7 tasks) │    │  (per task)  │    │   & PUSH     │  │
│  └──────────────┘    └──────────────┘    └──────────────┘  │
│         ^                                       │           │
│         └───────────────────────────────────────┘           │
└─────────────────────────────────────────────────────────────┘
```

### Planner Agent

The planner analyzes your codebase and creates a prioritized list of tasks:

1. **Critical bugs** - Errors, crashes, security issues
2. **Missing tests** - Untested code paths
3. **Code quality** - Linting errors, type issues
4. **Documentation gaps** - Missing or outdated docs
5. **Performance issues** - Slow operations
6. **Feature gaps** - TODO comments, incomplete implementations
7. **Refactoring** - Duplicated code, complex functions

### Builder Agent

The builder executes each task:

1. Understands the task requirements
2. Makes code changes following project style
3. Runs tests and linter
4. Reports completion with a summary

### Orchestrator

The main orchestrator:

1. Invokes the planner to create a plan
2. For each task, invokes the builder
3. Commits changes after each task (conventional commits)
4. Pushes all commits after the plan completes
5. Starts the next cycle immediately

## Models

The agents use free models by default:

| Agent | Model |
|-------|-------|
| `opencoder` | `opencode/glm-4.7-free` |
| `opencoder-planner` | `opencode/glm-4.7-free` |
| `opencoder-builder` | `opencode/minimax-m2.1-free` |

You can customize models by editing the agent files in `~/.config/opencode/agents/`.

## Git Integration

The agents automatically:

- **Commit after each task** with conventional commit messages (`fix:`, `feat:`, `test:`, etc.)
- **Sign commits** with `--signoff` for DCO compliance
- **Push after each cycle** to keep your remote up to date

## Manual Installation

If the postinstall script doesn't run automatically:

```bash
node node_modules/opencode-plugin-opencoder/postinstall.mjs
```

Or copy the agents manually:

```bash
cp node_modules/opencode-plugin-opencoder/agents/*.md ~/.config/opencode/agents/
```

## Development

```bash
# Install dependencies
bun install

# Run type checker
bun run typecheck

# Run tests
bun test

# Run linter
bun run lint

# Fix lint issues
bun run lint:fix
```

## License

MIT License - See [LICENSE](LICENSE) file.

## Links

- [OpenCode](https://opencode.ai)
- [OpenCode Plugins Documentation](https://opencode.ai/docs/plugins/)
