# AGENTS.md - OpenCoder Development Guide

This file provides instructions for AI coding agents working in this repository.

## Project Overview

OpenCoder is a CLI application written in **TypeScript** that uses the OpenCode SDK to run a fully autonomous development loop. It creates plans and executes them continuously without stopping.

- **Language**: TypeScript
- **Runtime**: Bun (1.0+ required)
- **Dependencies**: `@opencode-ai/sdk`, `commander`
- **Build System**: Bun build (`bun build --compile`)

## Build Commands

### Using Make (Recommended)

```bash
make          # Build release version (single executable)
make test     # Run all tests
make lint     # Format and check code with Biome
make clean    # Remove build artifacts
make install  # Install to /usr/local/bin (PREFIX configurable)
```

### Using Bun Directly

```bash
# Install dependencies
bun install

# Build release executable
bun run build

# Run in development
bun run dev

# Run with arguments
bun run dev -- --model anthropic/claude-sonnet-4 -p ./myproject
```

## Testing

```bash
# Run all tests
bun test

# Run tests for a specific file
bun test tests/config.test.ts
bun test tests/state.test.ts
bun test tests/plan.test.ts
bun test tests/ideas.test.ts
bun test tests/evaluator.test.ts

# Run tests with watch mode
bun test --watch
```

## Linting and Formatting

```bash
# Check and auto-fix (used in CI)
bunx biome check --write src/

# Check only (no auto-fix)
bunx biome check src/

# Format only
bunx biome format --write src/

# Lint only
bunx biome lint src/
```

## Source Code Structure

```
src/
  index.ts        # Entry point
  cli.ts          # CLI argument parsing with commander
  config.ts       # Configuration loading (file + env + CLI merge)
  types.ts        # TypeScript interfaces and types
  state.ts        # State persistence (JSON)
  fs.ts           # File system utilities
  logger.ts       # Logging with live output streaming
  plan.ts         # Plan parsing, validation, prompt generation
  ideas.ts        # Ideas queue management, selection logic
  builder.ts      # OpenCode SDK wrapper with event streaming
  evaluator.ts    # Evaluation response parsing
  loop.ts         # Main autonomous loop
  git.ts          # Git operations (commit, push, change detection)

tests/
  config.test.ts    # Config module tests
  state.test.ts     # State persistence tests
  plan.test.ts      # Plan parsing tests
  ideas.test.ts     # Ideas queue tests
  evaluator.test.ts # Evaluation parsing tests
  git.test.ts       # Git operations tests
```

## Code Style Guidelines

### Imports

1. Node.js built-in imports first (with `node:` prefix)
2. External package imports second
3. Internal module imports last (with `.ts` extension)

```typescript
import { existsSync } from "node:fs"
import { join } from "node:path"

import { createOpencode } from "@opencode-ai/sdk"

import { parseModel } from "./config.ts"
import type { Config, BuildResult } from "./types.ts"
```

### Naming Conventions

| Element | Convention | Example |
|---------|------------|---------|
| Files | kebab-case or camelCase | `config.ts`, `fs.ts` |
| Types/Interfaces | PascalCase | `Logger`, `State`, `BuildResult` |
| Functions | camelCase | `runPlanning`, `markTaskComplete` |
| Constants | SCREAMING_SNAKE_CASE or camelCase | `DEFAULT_STATE`, `ENV_PREFIX` |
| Variables | camelCase | `shutdownRequested` |

### Class Patterns

```typescript
export class MyClass {
  private field: Type
  private logger: Logger

  constructor(config: Config, logger: Logger) {
    this.field = value
    this.logger = logger
  }

  /** Initialize async resources */
  async init(): Promise<void> {
    // async initialization
  }

  /** Cleanup resources */
  async shutdown(): Promise<void> {
    // cleanup
  }

  /** Public method */
  async doSomething(): Promise<Result> {
    return result
  }

  /** Private helper */
  private helperMethod(): void {
    // internal logic
  }
}
```

### Error Handling

- Use try/catch for async error handling
- Throw descriptive Error objects
- Use optional chaining and nullish coalescing for safe access

```typescript
try {
  const result = await someAsyncOperation()
  return result
} catch (err) {
  logger.logError(`Operation failed: ${err}`)
  throw err
}

// Safe access patterns
const value = obj?.nested?.property ?? defaultValue
const item = array[index]
if (!item) return null
```

### Type Safety

- Prefer `interface` for object shapes
- Use `type` for unions and mapped types
- Avoid `any`, use `unknown` when type is truly unknown
- Use proper null checks instead of non-null assertions (`!`)

```typescript
// Good: Proper null check
const task = tasks[0]
if (!task) return null

// Avoid: Non-null assertion
const task = tasks[0]!  // biome will warn
```

### Documentation

- Use JSDoc comments for public APIs
- File-level comments describe the module purpose

```typescript
/**
 * Module description goes here.
 */

/**
 * Describe what this function does.
 * @param config - Configuration options
 * @returns The result of the operation
 */
export function myFunction(config: Config): Result {
  // implementation
}
```

### Testing

Tests are in separate files in the `tests/` directory:

```typescript
import { describe, expect, test, beforeEach, afterEach } from "bun:test"
import { myFunction } from "../src/module.ts"

describe("module", () => {
  beforeEach(() => {
    // Setup
  })

  afterEach(() => {
    // Cleanup
  })

  describe("myFunction", () => {
    test("does something correctly", () => {
      const result = myFunction(input)
      expect(result).toBe(expected)
    })

    test("handles edge case", () => {
      expect(() => myFunction(badInput)).toThrow()
    })
  })
})
```

## Configuration

### Config Priority (lowest to highest)

1. Defaults (hardcoded)
2. `.opencode/opencoder/config.json` in project directory
3. Environment variables (`OPENCODER_*`)
4. CLI arguments

### Environment Variables

```bash
OPENCODER_PLAN_MODEL=anthropic/claude-sonnet-4
OPENCODER_BUILD_MODEL=anthropic/claude-sonnet-4
OPENCODER_VERBOSE=true
OPENCODER_MAX_RETRIES=3
OPENCODER_BACKOFF_BASE=10
OPENCODER_LOG_RETENTION=30
OPENCODER_TASK_PAUSE_SECONDS=2
OPENCODER_AUTO_COMMIT=true
OPENCODER_AUTO_PUSH=true
OPENCODER_COMMIT_SIGNOFF=false
```

### Config File (.opencode/opencoder/config.json)

```json
{
  "planModel": "anthropic/claude-sonnet-4",
  "buildModel": "anthropic/claude-sonnet-4",
  "verbose": false,
  "maxRetries": 3,
  "taskPauseSeconds": 2,
  "autoCommit": true,
  "autoPush": true,
  "commitSignoff": false
}
```

## CLI Usage

```bash
# Basic usage with model
opencoder --model anthropic/claude-sonnet-4

# With project directory and hint
opencoder -m anthropic/claude-sonnet-4 -p ./myproject "focus on tests"

# Different models for plan and build
opencoder -P anthropic/claude-opus-4 -B anthropic/claude-sonnet-4

# Verbose output
opencoder -m anthropic/claude-sonnet-4 -v

# Disable automatic git operations
opencoder -m anthropic/claude-sonnet-4 --no-auto-commit --no-auto-push

# Enable commit signoff (DCO)
opencoder -m anthropic/claude-sonnet-4 -s
```

## Git Integration

OpenCoder includes automatic git operations after tasks and cycles:

### Features

- **Auto-commit**: Automatically commits changes after each successful task
- **Auto-push**: Automatically pushes commits after each completed cycle
- **Commit signoff**: Adds `Signed-off-by` line for DCO compliance

### Configuration

| Option | CLI Flag | Env Var | Default |
|--------|----------|---------|---------|
| Auto-commit | `--no-auto-commit` | `OPENCODER_AUTO_COMMIT` | `true` |
| Auto-push | `--no-auto-push` | `OPENCODER_AUTO_PUSH` | `true` |
| Signoff | `-s, --signoff` | `OPENCODER_COMMIT_SIGNOFF` | `false` |

### Commit Message Generation

Commit messages are automatically generated based on task descriptions using conventional commit prefixes:

- `fix:` - Bug fixes, resolving issues
- `feat:` - New features, additions, implementations
- `test:` - Test-related changes
- `docs:` - Documentation updates
- `refactor:` - Code refactoring, improvements

## Ideas Queue Feature

OpenCoder includes an **ideas queue system** that allows users to provide specific tasks for the autonomous loop to work on.

### How It Works

1. **Ideas Directory**: `.opencode/opencoder/ideas/` - Users place `.md` files here
2. **Plan Integration**: Before each plan cycle, the loop checks for ideas
3. **Selection Logic**:
   - **1 idea**: Used directly (no AI selection call)
   - **2+ ideas**: AI evaluates all and picks the simplest/quick-win considering dependencies
4. **Build**: Selected idea is deleted, plan is created from idea content
5. **Fallback**: When ideas are exhausted, returns to autonomous plan

### Key Modules

- **`ideas.ts`**: Core module with `Idea` interface, `loadAllIdeas()`, `formatIdeasForSelection()`
- **`plan.ts`**: Contains `generateIdeaSelectionPrompt()` and `generateIdeaPlanPrompt()`
- **`builder.ts`**: Has `runIdeaSelection()` and `runIdeaPlan()` methods
- **`loop.ts`**: Integrates ideas check before plan phase

### Selection Criteria

The AI evaluates ideas based on:
- **Simplicity**: Quick wins are prioritized
- **Dependencies**: Prerequisites selected before dependents
- **Priority order**: Bug fixes > Small features > Docs > Refactoring > Large features

### Example Idea File

```markdown
# Fix Login Timeout Bug

Users are being logged out after 5 minutes instead of the configured 30 minutes.

Steps:
1. Check session configuration
2. Update timeout value in config
3. Test with various session durations
```

### Testing Ideas Feature

```bash
# Run ideas module tests
bun test tests/ideas.test.ts

# Test full integration
mkdir -p test-project/.opencode/opencoder/ideas
echo "# Test idea" > test-project/.opencode/opencoder/ideas/test.md
bun run dev -- -m anthropic/claude-sonnet-4 -p test-project
```

### Implementation Notes

- Ideas take **full precedence** over user hints
- Idea files are **deleted after plan is successfully saved** (crash-safe)
- Selected idea is **tracked in state** for crash recovery
- Empty/invalid ideas are **automatically cleaned up**
- No naming conventions required - any `.md` file works

## Three-Phase Autonomous Loop

1. **Planning Phase**: Generate a development plan (checks ideas queue first)
2. **Build Phase**: Build tasks from the plan one by one
3. **Evaluation Phase**: AI evaluates if cycle is complete (COMPLETE/NEEDS_WORK)

State is persisted to `.opencode/opencoder/state.json` after each phase for resumability.

## CI Pipeline

The GitHub Actions CI (`.github/workflows/ci.yml`) should run:
1. Build on Ubuntu and macOS
2. Run all unit tests with `bun test`
3. Check code formatting with `bunx biome check src/`

Always ensure `bunx biome check src/` passes before committing.
