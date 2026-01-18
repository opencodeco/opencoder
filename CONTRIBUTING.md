# Contributing to OpenCoder

Thank you for considering contributing to OpenCoder! This document outlines the process for contributing to this project.

## Getting Started

1. Fork the repository
2. Clone your fork: `git clone https://github.com/YOUR_USERNAME/opencode-plugin-opencoder.git`
3. Install dependencies: `bun install`
4. Create a branch: `git checkout -b feature/your-feature`

## Development

### Prerequisites

- [Bun](https://bun.sh) runtime
- [OpenCode](https://opencode.ai) (optional, for testing agents)

### Commands

```bash
# Install dependencies
bun install

# Run type checker
bun run typecheck

# Run linter
bun run lint

# Fix lint issues
bun run lint:fix

# Format code
bun run format

# Run tests
bun test

# Test postinstall script
node postinstall.mjs
```

### Project Structure

- `agents/` - Agent markdown files (core functionality)
- `src/` - TypeScript source code (plugin metadata)
- `tests/` - Test files
- `postinstall.mjs` - Installs agents to user config
- `preuninstall.mjs` - Removes agents on uninstall

## Making Changes

### Code Style

- Use tabs for indentation
- Use double quotes for strings
- No semicolons (unless required)
- Run `bun run lint:fix` before committing

### Modifying Agents

When editing agent files in `agents/`:

1. Be specific with instructions
2. Include examples for expected output formats
3. Define clear boundaries for agent behavior
4. Test changes by running: `opencode @opencoder`

### Commit Messages

Use [Conventional Commits](https://conventionalcommits.org/):

- `feat:` - New features
- `fix:` - Bug fixes
- `docs:` - Documentation changes
- `chore:` - Maintenance tasks
- `refactor:` - Code refactoring
- `test:` - Test changes

Example: `feat: add cycle limit option to orchestrator`

## Pull Requests

1. Ensure all tests pass: `bun test`
2. Ensure types are correct: `bun run typecheck`
3. Ensure code is linted: `bun run lint`
4. Write a clear PR description
5. Reference any related issues

## Reporting Issues

When reporting issues, please include:

- OpenCode version
- Node.js/Bun version
- Operating system
- Steps to reproduce
- Expected vs actual behavior

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
