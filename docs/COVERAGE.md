# Test Coverage Reporting Guide

This document explains how to run, analyze, and maintain test coverage for OpenCoder.

## Overview

OpenCoder uses Bun's built-in test coverage tools integrated with CI/CD to ensure code quality. Coverage reports are automatically generated on each commit and uploaded to Codecov for tracking over time.

### Current Coverage Status

- **Function Coverage**: ~79%
- **Line Coverage**: ~72%
- **Quality Gate**: 70% minimum (enforced via codecov.yml)

## Running Coverage Reports

### Quick Coverage Check

Display coverage summary in terminal:

```bash
bun test --coverage
```

### Generate LCOV Report

Create LCOV format report (used by Codecov):

```bash
bun test --coverage --coverage-reporter=lcov
```

Or using npm scripts:

```bash
npm run test:coverage:report
# or
make test-coverage-report
```

### Generate HTML Report

Create an interactive HTML coverage report:

```bash
npm run test:coverage:html
```

The HTML report will be in `coverage/index.html` and can be opened in a browser for detailed line-by-line coverage analysis.

### View Text Summary

Display coverage as formatted text table:

```bash
bun test --coverage --coverage-reporter=text
```

Or use the make target:

```bash
make test-coverage-check
```

### Using Codecov for HTML Reports

For detailed line-by-line coverage analysis, use the Codecov dashboard:

1. Visit https://codecov.io
2. View interactive HTML reports with file-by-file coverage
3. See historical trends and pull request analysis

Or generate LCOV format locally and view with your IDE:

```bash
npm run test:coverage:report
# Then open coverage/lcov.info in your IDE or use the Codecov dashboard
```

## CI/CD Integration

### Automatic Coverage Reporting

On every push or pull request to `main`:

1. Tests run with coverage enabled
2. LCOV report is generated
3. Report is uploaded to Codecov
4. Status badge is added to PR

### Quality Gates

Coverage thresholds are configured in `codecov.yml`:

- **Project Coverage**: Minimum 70%
  - Failure threshold: 5% drop
  - Status: Reported but not blocking

- **Patch Coverage**: Minimum 70%
  - Failure threshold: 5% drop
  - Applies to changed code only

To view quality gate status:

```bash
# Check local coverage
bun test --coverage --coverage-reporter=text

# Coverage status is reported in:
# - Codecov dashboard (https://codecov.io)
# - PR comments (automatic)
# - GitHub status checks
```

## Coverage Reports

### Local Reports

Reports are stored in the `coverage/` directory (gitignored):

- `lcov.info` - LCOV format (for Codecov)
- `coverage.txt` - Text summary
- `index.html` - Interactive HTML report
- Raw coverage data files

### Codecov Dashboard

View historical coverage trends:

1. Go to https://codecov.io
2. Search for "opencoder" project
3. View:
   - Coverage trends over time
   - File-by-file coverage
   - Pull request analysis
   - Coverage commitments

## Best Practices

### Writing Testable Code

1. Keep functions small and focused
2. Minimize side effects
3. Use dependency injection for easier mocking
4. Avoid deep nesting of conditions

### Writing Good Tests

1. **Test behavior, not implementation**
   - Focus on inputs and outputs
   - Don't test private methods

2. **Cover multiple scenarios**
   - Success cases
   - Error cases
   - Edge cases

3. **Use descriptive test names**
   - `test("parses --model option", () => { ... })`
   - Not: `test("test 1", () => { ... })`

4. **Keep tests isolated**
   - Each test should be independent
   - Clean up after each test (use afterEach)

### Coverage Targets by File Type

- **Utilities & Helpers**: 90%+ coverage
- **Core Logic**: 80%+ coverage
- **Integration Code**: 70%+ coverage
- **Error Handlers**: 70%+ coverage

## Troubleshooting

### Coverage Report Not Generated

```bash
# Ensure bun is installed
bun --version

# Run tests with explicit options
bun test --coverage --coverage-reporter=text

# Check if coverage directory exists
ls -la coverage/
```

### Coverage Seems Low

1. Check if all test files are being discovered
2. Verify test files match `tests/**/*.test.ts` pattern
3. Ensure code under test is in `src/**/*.ts`
4. Run `bun test --coverage` to see actual numbers

### LCOV Report Upload Fails

1. Verify `codecov.yml` exists
2. Check GitHub Actions logs for errors
3. Ensure repository is public (for free Codecov tier)
4. Check Codecov status in PR

## Scripts Reference

| Script | Command | Purpose |
|--------|---------|---------|
| `npm run test` | `bun test` | Run tests without coverage |
| `npm run test:coverage` | `bun test --coverage` | Show coverage summary |
| `npm run test:coverage:report` | `bun test --coverage --coverage-reporter=lcov` | Generate LCOV report |
| `npm run test:coverage:check` | `bun test --coverage --coverage-reporter=text` | Display text summary |

## Make Targets

| Target | Purpose |
|--------|---------|
| `make test` | Run all tests |
| `make test-coverage` | Run tests with coverage |
| `make test-coverage-report` | Generate LCOV report |
| `make test-coverage-check` | Display coverage text summary |

## Coverage Goals

### Current Target

- **Overall**: 75%+ line coverage
- **Core modules**: 80%+ line coverage
- **Utilities**: 90%+ line coverage

### Future Goals

- Increase overall coverage to 85%
- Achieve 90%+ for utility modules
- Maintain consistency across all source files

## Additional Resources

- [Bun Test Coverage Documentation](https://bun.sh/docs/test/coverage)
- [Codecov Documentation](https://docs.codecov.io)
- [LCOV Format](https://github.com/linux-test-project/lcov)
- [Istanbul Coverage Tool](https://istanbul.js.org/)

## Questions or Issues?

For coverage-related questions:

1. Check this guide first
2. Run `bun test --coverage` to verify local setup
3. Compare with `coverage/index.html` for detailed view
4. Check GitHub Actions logs for CI failures
