# AGENTS.md - OpenCode Plugin Development Guide

This file provides instructions for AI coding agents working in this repository.

## Project Overview

This is an **OpenCode plugin** that provides autonomous development agents. The plugin installs three agents that work together to create an infinite Plan-Build-Commit loop.

- **Type**: OpenCode Plugin
- **Runtime**: Bun
- **Language**: TypeScript (minimal)

## Project Structure

```
opencode-plugin-opencoder/
├── agents/                    # Agent markdown files
│   ├── opencoder.md          # Main orchestrator agent
│   ├── opencoder-planner.md  # Planning subagent
│   └── opencoder-builder.md  # Building subagent
├── src/
│   └── index.ts              # Plugin entry point (exports metadata)
├── postinstall.mjs           # Copies agents to ~/.config/opencode/agents/
├── package.json              # npm package configuration
├── biome.json                # Linter configuration
└── tsconfig.json             # TypeScript configuration
```

## Commands

```bash
# Install dependencies
bun install

# Run linter
bun run lint

# Fix lint issues
bun run lint:fix

# Format code
bun run format

# Test postinstall script
node postinstall.mjs
```

## Agent Files

The core functionality is in the agent markdown files under `agents/`:

### `opencoder.md` - Main Orchestrator

The primary agent that:
- Invokes `@opencoder-planner` to create development plans
- Invokes `@opencoder-builder` for each task
- Commits changes after each task
- Pushes after all tasks complete
- Repeats indefinitely

### `opencoder-planner.md` - Planning Subagent

Analyzes codebases and produces 3-7 prioritized tasks based on:
1. Critical bugs
2. Missing tests
3. Code quality issues
4. Documentation gaps
5. Performance issues
6. Feature gaps
7. Refactoring opportunities

### `opencoder-builder.md` - Building Subagent

Executes individual tasks:
1. Understands the task
2. Makes code changes
3. Runs tests and linter
4. Reports completion

## Modifying Agents

When editing agent files:

1. **Be specific** - Clear instructions produce better results
2. **Use examples** - Show the expected format/output
3. **Define boundaries** - What should and shouldn't be done
4. **Test changes** - Run `opencode @opencoder` to verify behavior

## Code Style

### Imports

```typescript
import { existsSync } from "node:fs"  // Node.js builtins with node: prefix
```

### Naming

| Element | Convention | Example |
|---------|------------|---------|
| Files | kebab-case | `postinstall.mjs` |
| Constants | camelCase | `agents` |
| Exports | camelCase | `name`, `version` |

## Git Workflow

- Use conventional commits: `feat:`, `fix:`, `docs:`, `chore:`
- Sign commits with `-s` flag
- Keep commits atomic

## Release Process

1. Update version in `package.json`
2. Update `CHANGELOG.md`
3. Create git tag: `git tag v0.1.0`
4. Push tag: `git push --tags`
5. CI will publish to npm automatically
