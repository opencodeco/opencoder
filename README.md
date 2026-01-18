# opencoder

[![CI](https://github.com/opencodeco/opencoder/actions/workflows/ci.yml/badge.svg)](https://github.com/opencodeco/opencoder/actions/workflows/ci.yml)

**Autonomous OpenCode Runner** - A TypeScript-powered CLI that uses the [OpenCode SDK](https://opencode.ai) to run fully autonomous development loops, creating plans and building them continuously without manual intervention.

## Features

- **Autonomous Development Loop** - Continuously plans, builds, and evaluates without stopping
- **OpenCode SDK Integration** - Direct SDK integration with real-time event streaming
- **Ideas Queue** - Drop markdown files in `.opencode/opencoder/ideas/` to prioritize specific tasks before autonomous plan
- **Two-Model Architecture** - Uses a high-capability model for plan and a faster model for building
- **Live Output Streaming** - Real-time display of AI thinking, tool calls, and results
- **State Persistence** - Resumes from where it left off after interruptions (JSON format)
- **Exponential Backoff** - Graceful retry logic for transient failures
- **Plan History** - Archives completed plans for reference
- **Signal Handling** - Clean shutdown with state preservation
- **Single Executable** - Compiles to a standalone binary with Bun

## Why OpenCoder?

### The Gap

[OpenCode](https://opencode.ai) is an incredible AI coding agent with a powerful interactive TUI. You can have rich conversations, ask follow-up questions, and collaborate on complex problems. It's excellent when you want to **work with** the AI.

But what if you want the AI to **work for you** while you're away?

### The "Aha!" Moment

This concept is inspired by [Dax Raad](https://github.com/daxraad) from OpenCode, who shares in [this video](https://youtu.be/o3gmwzo-Mik?si=Q6u_8vAv4hw7cIQ8) that while AI is incredibly powerful, it doesn't replace the human creativity needed for high-level product decisions. Identifying a product's "aha moment" requires empathy and ruthless simplification that machines cannot replicate. The core elements of entrepreneurship - crafting unique ideas, designing intuitive experiences, and the difficult day-to-day strategic thinking - remain as demanding and human-centric as ever.

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

OpenCoder treats software development as an **infinite game**. There's always another test to write, another edge case to handle, another optimization to make. OpenCoder embraces this by never declaring "done"—it continuously cycles through plan, build, and eval until you tell it to stop.

## Installation

### Pre-built Binaries

Download the latest release for your platform from [GitHub Releases](https://github.com/opencodeco/opencoder/releases):

```bash
# Linux (x64)
curl -fsSL https://github.com/opencodeco/opencoder/releases/latest/download/opencoder-linux-x64 -o opencoder

# Linux (arm64)
curl -fsSL https://github.com/opencodeco/opencoder/releases/latest/download/opencoder-linux-arm64 -o opencoder

# macOS (Intel)
curl -fsSL https://github.com/opencodeco/opencoder/releases/latest/download/opencoder-darwin-x64 -o opencoder

# macOS (Apple Silicon)
curl -fsSL https://github.com/opencodeco/opencoder/releases/latest/download/opencoder-darwin-arm64 -o opencoder

# Make executable and move to PATH
chmod +x opencoder
sudo mv opencoder /usr/local/bin/
```

### Build from Source

Requires [Bun 1.0+](https://bun.sh):

```bash
git clone https://github.com/opencodeco/opencoder.git
cd opencoder
bun install
bun run build
sudo cp opencoder /usr/local/bin/
```

## Requirements

- [OpenCode](https://opencode.ai) - OpenCoder uses the OpenCode SDK which starts the server automatically

## Usage

### Basic Usage

```bash
# Run with a specific model
opencoder --model anthropic/claude-sonnet-4

# With a project directory and hint
opencoder -m anthropic/claude-sonnet-4 -p ./myproject "build a REST API"
```

### With Different Plan and Build Models

```bash
# Use a more capable model for plan, faster model for building
opencoder -P anthropic/claude-opus-4 -B anthropic/claude-sonnet-4
```

### Options

| Flag | Description |
|------|-------------|
| `-m, --model MODEL` | Model for both plan and build (provider/model format) |
| `-P, --plan-model MODEL` | Model for plan/eval phases |
| `-B, --build-model MODEL` | Model for build phase |
| `-p, --project DIR` | Project directory (default: current directory) |
| `-v, --verbose` | Enable verbose logging |
| `--status` | Display metrics summary and exit (no model required) |
| `--metrics-reset` | Reset all metrics to default values (requires confirmation) |
| `--no-auto-commit` | Disable automatic commits after tasks |
| `--no-auto-push` | Disable automatic push after cycles |
| `-s, --signoff` | Add Signed-off-by line to commits (DCO) |
| `-h, --help` | Show help message |
| `-V, --version` | Show version |

### Model Format

Models are specified as `provider/model`:

```bash
opencoder -m anthropic/claude-sonnet-4
opencoder -m openai/gpt-4o
opencoder -m google/gemini-2.0-flash
```

## How It Works

OpenCoder implements an **agentic development loop** with three phases:

```
     +-------------+     +-------------+     +-------------+
     |     Plan    |---->|    Build    |---->|    Eval     |
     |    Phase    |     |    Phase    |     |    Phase    |
     +-------------+     +-------------+     +-------------+
            ^                                       |
            |                                       |
            +---------------------------------------+
                    (start new cycle)
```

1. **Plan Phase** - Analyzes the project and creates a markdown checklist with 3-7 actionable tasks
2. **Build Phase** - Works through each task sequentially, making code changes
3. **Eval Phase** - Reviews completed work and decides whether to start a new cycle (COMPLETE/NEEDS_WORK)

The loop continues indefinitely until manually stopped (Ctrl+C).

## Configuration

### Config File (.opencode/opencoder/config.json)

Create a `.opencode/opencoder/config.json` in your project:

```json
{
  "planModel": "anthropic/claude-sonnet-4",
  "buildModel": "anthropic/claude-sonnet-4",
  "verbose": false,
  "maxRetries": 3,
  "taskPauseSeconds": 2
}
```

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `OPENCODER_PROJECT_DIR` | `$PWD` | Default project directory |
| `OPENCODER_PLAN_MODEL` | - | Model for plan phase |
| `OPENCODER_BUILD_MODEL` | - | Model for build phase |
| `OPENCODER_VERBOSE` | `false` | Enable verbose logging |
| `OPENCODER_MAX_RETRIES` | `3` | Max retries per operation |
| `OPENCODER_BACKOFF_BASE` | `10` | Base seconds for exponential backoff |
| `OPENCODER_LOG_RETENTION` | `30` | Days to keep old logs |
| `OPENCODER_TASK_PAUSE_SECONDS` | `2` | Pause between tasks |

### Config Priority

Configuration is merged in this order (later overrides earlier):

1. Defaults (hardcoded)
2. `.opencode/opencoder/config.json` in project directory
3. Environment variables (`OPENCODER_*`)
4. CLI arguments

## Directory Structure

OpenCoder creates a `.opencode/opencoder/` directory in your project:

```
.opencode/
└── opencoder/
    ├── config.json              # Configuration file
    ├── state.json               # Current state (JSON)
    ├── metrics.json             # Performance metrics and statistics
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

## Plan Format

Plans are saved as markdown checklists:

```markdown
# Plan: Implement User Authentication

Created: 2026-01-17T10:30:00Z
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

Want to direct OpenCoder toward specific tasks? Drop markdown files in `.opencode/opencoder/ideas/` and OpenCoder will prioritize them before generating its own plans.

### Quick Start

```bash
# Create an idea
cat > .opencode/opencoder/ideas/add-dark-mode.md << 'EOF'
# Add Dark Mode

Add dark mode toggle with system preference detection.

Steps:
1. Create theme context
2. Add toggle component
3. Persist preference to localStorage
EOF

# Run opencoder
opencoder -m anthropic/claude-sonnet-4
```

### How It Works

1. **Before Plan** - OpenCoder checks `.opencode/opencoder/ideas/` for `.md` files
2. **Smart Selection**:
   - **1 idea**: Uses it directly (no extra API call)
   - **2+ ideas**: AI evaluates all and picks the simplest/quick-win, considering dependencies
3. **Build** - Selected idea is deleted, plan is created specifically for it
4. **Fallback** - When ideas are exhausted, returns to autonomous plan

### Selection Criteria

The AI prioritizes based on:
- **Simplicity** - Quick wins first
- **Dependencies** - If idea B requires idea A, A is selected first
- **Priority order** - Bug fixes > Small features > Docs > Refactoring > Large features

### Example Output

```
[Cycle 5] Found 3 idea(s) in queue
[Cycle 5] AI selected idea: fix-login-timeout.md
[Cycle 5] Plan for: fix-login-timeout.md
[Cycle 5] Plan created with 3 tasks
```

### Tips for Ideas

- **Be specific** - The more detailed the idea, the better the plan
- **One idea per file** - Keep ideas focused and atomic
- **Mention dependencies** - Explicitly state if an idea depends on another
- **No naming convention** - Any `.md` filename works
- **Auto-cleanup** - Empty/invalid ideas are automatically deleted

## Metrics

OpenCoder automatically tracks detailed metrics about your development sessions, including cycles, tasks, token usage, and estimated costs. Monitor your progress and efficiency with built-in metrics commands.

### Viewing Metrics

Display a summary of all tracked metrics without starting the loop:

```bash
opencoder --status

# With a specific project
opencoder --status -p ./myproject
```

This displays:
- **Cycles**: Total completed and timed out
- **Tasks**: Completed, failed, and skipped
- **Retries**: Total retry attempts across all operations
- **Ideas**: Number of queued ideas processed
- **Token Usage**: Input and output tokens consumed
- **Estimated Cost**: Approximate API costs incurred
- **Duration**: Average cycle duration
- **Activity**: Timestamp of last activity

Example output:
```
OpenCoder Metrics
=================

Cycles: 5 completed, 0 timed out
Tasks: 42 completed, 2 failed, 0 skipped
Success rate: 95.5%
Retries: 3 total
Ideas: 1 processed
Avg cycle duration: 1m 0s
Tokens: 50.0K in, 25.0K out
Estimated cost: $1.50

Last activity: 2026-01-18T17:30:00Z
```

### Resetting Metrics

Reset all metrics to default values with confirmation:

```bash
opencoder --metrics-reset

# With a specific project
opencoder --metrics-reset -p ./myproject
```

This command:
1. Displays your current metrics
2. Asks for confirmation before proceeding
3. Resets all counters to zero (preserves timestamps)
4. Confirms successful reset

The confirmation prompt helps prevent accidental data loss:
```
Current Metrics:
================

Cycles: 5 completed, 0 timed out
Tasks: 42 completed, 2 failed, 0 skipped
...

Are you sure you want to reset all metrics to default values? (yes/no): no
Metrics reset cancelled.
```

### Tracked Metrics

OpenCoder tracks the following metrics:

| Metric | Description |
|--------|-------------|
| **cyclesCompleted** | Number of complete plan-build-eval cycles |
| **cyclesTimedOut** | Number of cycles that exceeded the timeout limit |
| **tasksCompleted** | Number of tasks successfully completed |
| **tasksFailed** | Number of tasks that failed after max retries |
| **tasksSkipped** | Number of tasks skipped due to timeout |
| **totalRetries** | Total retry attempts across all operations |
| **ideasProcessed** | Number of ideas from the queue that were processed |
| **totalInputTokens** | Cumulative input tokens consumed from API |
| **totalOutputTokens** | Cumulative output tokens generated by API |
| **totalCostUsd** | Estimated total cost of all API calls in USD |
| **totalCycleDurationMs** | Total time spent in completed cycles (milliseconds) |
| **firstRunTime** | ISO timestamp of first OpenCoder run with this project |
| **lastActivityTime** | ISO timestamp of most recent activity |

### Cost Estimation

OpenCoder estimates costs based on actual token usage and current model pricing for major providers:

- **Claude models** (Opus, Sonnet, Haiku) - Anthropic pricing
- **GPT models** (GPT-4o, GPT-4 Turbo, GPT-3.5) - OpenAI pricing
- **Gemini models** - Google pricing
- **Default pricing** - Used for unknown models

Costs are estimated during operation and recorded in metrics. Use the `--status` flag to see total estimated costs.

### Tips for Metrics

- **Monitor regularly** - Check metrics with `--status` between sessions to track progress
- **Reset between projects** - Use `--metrics-reset` when starting a new project
- **Track efficiency** - Compare success rates and token usage across different models
- **Cost awareness** - Monitor token consumption and estimated costs to stay within budget
- **Metrics file location** - Metrics are stored in `.opencode/opencoder/metrics.json`

## Tips

- **Start with a clear hint** - The more specific your instruction, the better the initial plan
- **Use ideas for focus** - Drop task files in `.opencode/opencoder/ideas/` to direct development
- **Let it run** - OpenCoder is designed to run continuously; trust the loop
- **Check the logs** - Detailed logs are in `.opencode/opencoder/logs/` if something goes wrong
- **Review history** - Completed plans are archived in `.opencode/opencoder/history/`

## Development

Using Make (recommended):

```bash
make          # Build release version
make test     # Run tests
make lint     # Format and check code with Biome
make clean    # Remove build artifacts
make install  # Install to /usr/local/bin
make install PREFIX=~/.local  # Install to custom location
```

Or using Bun directly:

```bash
bun install                  # Install dependencies
bun run build                # Build release executable
bun run dev                  # Run in development
bun test                     # Run tests
bunx biome check src/        # Check formatting/linting
```

## License

MIT License - See [LICENSE](LICENSE) file.

## Author

[Leo Cavalcante](https://github.com/leocavalcante)

## Links

- [OpenCode](https://opencode.ai)
- [OpenCode SDK](https://www.npmjs.com/package/@opencode-ai/sdk)
- [Changelog](CHANGELOG.md) - Version history and release notes
- [Report Issues](https://github.com/opencodeco/opencoder/issues)
