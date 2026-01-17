# opencoder

[![CI](https://github.com/opencodeco/opencoder/actions/workflows/ci.yml/badge.svg)](https://github.com/opencodeco/opencoder/actions/workflows/ci.yml)

**Autonomous OpenCode Runner** - A Zig-powered CLI that runs [OpenCode](https://opencode.ai) in a fully autonomous way, creating development plans and executing them continuously without manual intervention.

## Features

- **Autonomous Development Loop** - Continuously plans, executes, and evaluates without stopping
- **Ideas Queue** - Drop markdown files in `.opencoder/ideas/` to prioritize specific tasks before autonomous planning
- **Two-Model Architecture** - Uses a high-capability model for planning and a faster model for execution
- **Provider Presets** - Quick setup with GitHub Copilot, Anthropic, or OpenCode backends
- **State Persistence** - Resumes from where it left off after interruptions (JSON format)
- **Exponential Backoff** - Graceful retry logic for transient failures
- **Plan History** - Archives completed plans for reference
- **Signal Handling** - Clean shutdown with state preservation
- **Cross-Platform** - Builds for Linux and macOS (amd64/arm64)

## Why OpenCoder?

### The Gap

[OpenCode](https://opencode.ai) is an incredible AI coding agent with a powerful interactive TUI. You can have rich conversations, ask follow-up questions, and collaborate on complex problems. It's excellent when you want to **work with** the AI.

But what if you want the AI to **work for you** while you're away?

### The "Aha!" Moment

OpenCoder's insight is simple but powerful:

> **What if the AI never stopped improving your project?**

Instead of interactive sessions where you guide the AI, OpenCoder creates an *autonomous development loop* that runs continuously:

| OpenCode (Interactive) | OpenCoder (Autonomous) |
|------------------------|------------------------|
| You drive the conversation | AI drives the development |
| Responds when you prompt | Runs continuously without prompts |
| Requires your presence | Works while you're away |
| You decide what's next | AI decides what's next |
| Great for collaboration | Great for delegation |

### When to Use OpenCoder

- **Greenfield projects**: "Build me a REST API" and walk away
- **Overnight development**: Start before bed, wake up to progress
- **Continuous improvement**: Let AI find and fix issues you haven't thought of
- **Background tasks**: Run while you focus on other work

### When to Use OpenCode Directly

- Interactive pair programming where you want to guide the AI
- Quick one-off tasks where you'll review immediately
- Complex decisions requiring human judgment at each step
- Learning by watching the AI's reasoning in real-time

### The Philosophy

OpenCoder treats software development as an **infinite game**. There's always another test to write, another edge case to handle, another optimization to make. OpenCoder embraces this by never declaring "done"—it continuously cycles through planning, execution, and evaluation until you tell it to stop.

## Installation

### Pre-built Binaries

Download the latest release for your platform from [GitHub Releases](https://github.com/opencodeco/opencoder/releases):

```bash
# Linux (amd64)
curl -fsSL https://github.com/opencodeco/opencoder/releases/latest/download/opencoder-linux-amd64 -o opencoder

# Linux (arm64)
curl -fsSL https://github.com/opencodeco/opencoder/releases/latest/download/opencoder-linux-arm64 -o opencoder

# macOS (Intel)
curl -fsSL https://github.com/opencodeco/opencoder/releases/latest/download/opencoder-macos-amd64 -o opencoder

# macOS (Apple Silicon)
curl -fsSL https://github.com/opencodeco/opencoder/releases/latest/download/opencoder-macos-arm64 -o opencoder

# Make executable and move to PATH
chmod +x opencoder
sudo mv opencoder /usr/local/bin/
```

### Build from Source

Requires [Zig 0.15+](https://ziglang.org/download/):

```bash
git clone https://github.com/opencodeco/opencoder.git
cd opencoder
zig build -Doptimize=ReleaseSafe
sudo cp zig-out/bin/opencoder /usr/local/bin/
```

## Requirements

- [OpenCode CLI](https://opencode.ai) installed and configured

## Usage

### Using Provider Presets (Recommended)

```bash
# GitHub Copilot backend
opencoder --provider github

# Anthropic Claude
opencoder --provider anthropic

# OpenCode free models
opencoder --provider opencode
```

### With a Hint/Instruction

Tell opencoder what to build:

```bash
opencoder --provider github "build a REST API for user management"
opencoder --provider anthropic "create a todo app with React"
opencoder --provider opencode "implement authentication with JWT"
```

### Using Explicit Models

```bash
opencoder -P anthropic/claude-opus-4-5 -E anthropic/claude-sonnet-4-5
opencoder -P opencode/glm-4.7-free -E opencode/minimax-m2.1-free "build a CLI tool"
```

### Options

| Flag | Description |
|------|-------------|
| `--provider PROVIDER` | Use a provider preset (github, anthropic, opencode) |
| `-P, --planning-model MODEL` | Model for planning/evaluation phases |
| `-E, --execution-model MODEL` | Model for task execution |
| `-p, --project DIR` | Project directory (default: current directory) |
| `-v, --verbose` | Enable verbose logging |
| `-h, --help` | Show help message |
| `--version` | Show version |

## Provider Presets

| Provider | Planning Model | Execution Model |
|----------|----------------|-----------------|
| `github` | claude-opus-4.5 | claude-sonnet-4.5 |
| `anthropic` | claude-opus-4-5 | claude-sonnet-4-5 |
| `opencode` | glm-4.7-free | minimax-m2.1-free |

## How It Works

OpenCoder implements an **agentic development loop** with three phases:

```
     +-------------+     +-------------+     +-------------+
     |  Planning   |---->|  Execution  |---->| Evaluation  |
     |    Phase    |     |    Phase    |     |    Phase    |
     +-------------+     +-------------+     +-------------+
            ^                                       |
            |                                       |
            +---------------------------------------+
                    (start new cycle)
```

1. **Planning Phase** - Analyzes the project and creates a markdown checklist with 5-10 actionable tasks
2. **Execution Phase** - Works through each task sequentially, making code changes and commits
3. **Evaluation Phase** - Reviews completed work and decides whether to start a new cycle

The loop continues indefinitely until manually stopped (Ctrl+C).

## Directory Structure

OpenCoder creates a `.opencoder/` directory in your project:

```
.opencoder/
├── state.json               # Current execution state (JSON)
├── current_plan.md          # Active task plan
├── ideas/                   # Drop .md files here to queue tasks
│   ├── feature-x.md
│   └── bugfix-y.md
├── history/                 # Archived completed plans
│   └── plan_YYYYMMDD_HHMMSS_cycleN.md
└── logs/
    ├── main.log             # Main rotating log
    └── cycles/              # Per-cycle detailed logs
        └── cycle_001.log
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `OPENCODER_PROJECT_DIR` | `$PWD` | Default project directory |
| `OPENCODER_MAX_RETRIES` | `3` | Max retries per operation |
| `OPENCODER_BACKOFF_BASE` | `10` | Base seconds for exponential backoff |
| `OPENCODER_LOG_RETENTION` | `30` | Days to keep old logs |

## Plan Format

Plans are saved as markdown checklists:

```markdown
# Plan: Implement User Authentication

Created: 2026-01-16T10:30:00Z
Cycle: 1

## Context
Building a secure authentication system for the web application.

## Tasks
- [ ] Task 1: Create user model with password hashing
- [ ] Task 2: Implement JWT token generation
- [ ] Task 3: Add login/logout endpoints
- [ ] Task 4: Create authentication middleware
- [ ] Task 5: Write unit tests for auth flow

## Notes
Using bcrypt for password hashing, JWT for tokens.
```

## Ideas Queue

Want to direct OpenCoder toward specific tasks? Drop markdown files in `.opencoder/ideas/` and OpenCoder will prioritize them before generating its own plans.

### Quick Start

```bash
# Create an idea
cat > .opencoder/ideas/add-dark-mode.md << 'EOF'
Add dark mode toggle with system preference detection.
EOF

# Run opencoder
opencoder --provider github
```

### How It Works

1. **Before Planning** - OpenCoder checks `.opencoder/ideas/` for `.md` files
2. **Smart Selection**:
   - **1 idea**: Uses it directly (no extra API call)
   - **2+ ideas**: AI evaluates all and picks the simplest/quick-win, considering dependencies
3. **Execution** - Selected idea is deleted, plan is created specifically for it
4. **Fallback** - When ideas are exhausted, returns to autonomous planning

### Selection Criteria

The AI prioritizes based on:
- **Simplicity** - Quick wins first
- **Dependencies** - If idea B requires idea A, A is selected first
- **Priority order** - Bug fixes > Small features > Docs > Refactoring > Large features

### Example Output

```
[Cycle 5] Found 3 idea(s) in queue
[Cycle 5] Selected idea: fix-login-timeout.md
[Cycle 5] Summary: Fix login timeout issue where users are logged out after 5min
[Cycle 5] Reason: Bug fix with no dependencies, can be completed quickly
[Cycle 5] Planning for idea: fix-login-timeout.md
[Cycle 5] Plan created with 3 tasks
```

### Tips for Ideas

- **Be specific** - The more detailed the idea, the better the plan
- **One idea per file** - Keep ideas focused and atomic
- **Mention dependencies** - Explicitly state if an idea depends on another
- **No naming convention** - Any `.md` filename works
- **Auto-cleanup** - Empty/invalid ideas are automatically deleted

## Tips

- **Start with a clear hint** - The more specific your instruction, the better the initial plan
- **Use ideas for focus** - Drop task files in `.opencoder/ideas/` to direct development
- **Let it run** - OpenCoder is designed to run continuously; trust the loop
- **Check the logs** - Detailed logs are in `.opencoder/logs/` if something goes wrong
- **Review history** - Completed plans are archived in `.opencoder/history/`

## Development

Using Make (recommended):

```bash
make          # Build release version
make test     # Run tests
make lint     # Format and check code
make clean    # Remove build artifacts
make install  # Install to /usr/local/bin
make install PREFIX=~/.local  # Install to custom location
```

Or using Zig directly:

```bash
zig build                        # Build debug version
zig build -Doptimize=ReleaseSafe # Build release
zig build test                   # Run tests
zig fmt --check src/             # Check formatting
```

## License

MIT License - See [LICENSE](LICENSE) file.

## Author

[Leo Cavalcante](https://github.com/leocavalcante)

## Links

- [OpenCode CLI](https://opencode.ai)
- [Report Issues](https://github.com/opencodeco/opencoder/issues)
