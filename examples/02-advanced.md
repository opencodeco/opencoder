# Advanced Configuration Example

This guide shows advanced configuration options for optimizing OpenCoder for your specific use case.

## Advanced Configuration File

Create `.opencode/opencoder/config.json` with advanced settings:

```json
{
  "planModel": "anthropic/claude-opus-4",
  "buildModel": "anthropic/claude-sonnet-4",
  "verbose": true,
  "maxRetries": 5,
  "backoffBase": 15,
  "logRetention": 30,
  "taskPauseSeconds": 3,
  "autoCommit": true,
  "autoPush": true,
  "commitSignoff": true,
  "cycleTimeoutMinutes": 45
}
```

## Configuration Strategies

### Strategy 1: Quality-First (Expensive, Slower)

Use powerful models for both planning and building. Best for complex projects where accuracy is critical.

```json
{
  "planModel": "anthropic/claude-opus-4",
  "buildModel": "anthropic/claude-opus-4",
  "verbose": true,
  "maxRetries": 5,
  "taskPauseSeconds": 5,
  "cycleTimeoutMinutes": 120
}
```

**Pros:**
- Higher quality code generation
- Better understanding of complex requirements
- Fewer failed tasks requiring retries

**Cons:**
- Higher API costs
- Slower execution
- Longer token usage

**Best for:**
- Critical production systems
- Complex architectural decisions
- Projects where quality > speed

### Strategy 2: Balanced (Recommended)

Use a powerful model for planning, fast model for building. Good balance of cost and quality.

```json
{
  "planModel": "anthropic/claude-sonnet-4",
  "buildModel": "anthropic/claude-haiku",
  "verbose": false,
  "maxRetries": 3,
  "taskPauseSeconds": 2,
  "cycleTimeoutMinutes": 60
}
```

**Pros:**
- Good balance of cost and quality
- Faster execution
- Reasonable retry rates

**Cons:**
- Build phase may miss nuances
- May require manual fixes

**Best for:**
- Most projects
- Continuous improvement scenarios
- Overnight development runs

### Strategy 3: Cost-Optimized (Cheap, Fast)

Use fast, cheap models. Best for simple projects or when iterating quickly.

```json
{
  "planModel": "anthropic/claude-sonnet-4",
  "buildModel": "openai/gpt-3.5-turbo",
  "verbose": false,
  "maxRetries": 2,
  "taskPauseSeconds": 1,
  "cycleTimeoutMinutes": 30
}
```

**Pros:**
- Lowest API costs
- Fastest execution
- Good for testing workflows

**Cons:**
- Lower quality code
- More retries needed
- May need more manual review

**Best for:**
- Greenfield projects
- Testing and prototyping
- Simple features

### Strategy 4: Aggressive (Maximum Throughput)

Push boundaries for maximum task completion. Use this cautiously.

```json
{
  "planModel": "anthropic/claude-sonnet-4",
  "buildModel": "google/gemini-2.0-flash",
  "verbose": false,
  "maxRetries": 4,
  "backoffBase": 5,
  "taskPauseSeconds": 1,
  "logRetention": 7,
  "cycleTimeoutMinutes": 20
}
```

**Pros:**
- Maximum throughput
- Tests integrations quickly
- Good for CI/CD testing

**Cons:**
- High risk of failures
- May hit rate limits
- Requires monitoring

**Best for:**
- CI/CD pipelines
- Testing environments
- Rapid iteration

## Using Environment Variables

Override config file settings with environment variables:

```bash
# Set models
export OPENCODER_PLAN_MODEL=anthropic/claude-opus-4
export OPENCODER_BUILD_MODEL=anthropic/claude-sonnet-4

# Enable verbose logging
export OPENCODER_VERBOSE=true

# Adjust retry settings
export OPENCODER_MAX_RETRIES=5
export OPENCODER_BACKOFF_BASE=15

# Git settings
export OPENCODER_AUTO_COMMIT=true
export OPENCODER_AUTO_PUSH=true
export OPENCODER_COMMIT_SIGNOFF=true

# Run with these overrides
opencoder -p ./my-project
```

## Ideas Queue: Directing Development

Create `.opencode/opencoder/ideas/` with task files to guide development:

### Example 1: Bug Fix
`.opencode/opencoder/ideas/fix-login-timeout.md`:

```markdown
# Fix Login Timeout Bug

Users are being logged out after 5 minutes instead of 30 minutes.

## Root Cause
Session timeout configuration is hardcoded to 5 minutes.

## Steps
1. Locate session configuration in `src/auth/session.ts`
2. Change timeout from 5 to 30 minutes
3. Add environment variable for configuration
4. Update tests to verify new timeout
5. Document the change in CHANGELOG.md
```

### Example 2: Feature Request
`.opencode/opencoder/ideas/add-dark-mode.md`:

```markdown
# Add Dark Mode Support

Add dark mode toggle with system preference detection.

## Requirements
- Use system `prefers-color-scheme` media query
- Persist preference to localStorage
- Apply to all pages and components
- Smooth transition between modes

## Implementation Plan
1. Create theme context and provider
2. Add theme toggle component
3. Update CSS with theme variables
4. Test with different system preferences
```

### Example 3: Refactoring
`.opencode/opencoder/ideas/simplify-config.md`:

```markdown
# Simplify Configuration Loading

Configuration loading has multiple sources and is hard to follow.

## Current Issues
- Config merging is complex with many conditions
- Priority order is unclear
- Error messages are generic

## Proposed Solution
1. Document config priority order
2. Extract validation logic
3. Improve error messages
4. Add tests for edge cases
```

## Performance Tuning

### Adjusting Task Pause

```json
{
  "taskPauseSeconds": 1   // Fast (risk rate limiting)
  "taskPauseSeconds": 2   // Balanced (default)
  "taskPauseSeconds": 5   // Safe (slower)
}
```

### Adjusting Retry Logic

```json
{
  "maxRetries": 2,        // Low (fail faster)
  "maxRetries": 3,        // Balanced (default)
  "maxRetries": 10,       // Aggressive (wait longer)
  "backoffBase": 5,       // Fast backoff
  "backoffBase": 10,      // Balanced (default)
  "backoffBase": 30       // Slow backoff
}
```

### Cycle Timeout

```json
{
  "cycleTimeoutMinutes": 0,   // No limit
  "cycleTimeoutMinutes": 30,  // Quick cycles
  "cycleTimeoutMinutes": 60,  // Balanced (default)
  "cycleTimeoutMinutes": 180  // Long-running cycles
}
```

## Log Management

Control log retention and verbosity:

```json
{
  "verbose": false,           // Quiet mode
  "verbose": true,            // Detailed output
  "logRetention": 7,          // Keep 7 days of logs
  "logRetention": 30          // Keep 30 days (default)
}
```

View logs:
```bash
# Main log
tail -f .opencode/opencoder/logs/main.log

# Cycle-specific logs
tail -f .opencode/opencoder/logs/cycles/cycle_001.log
```

## CI/CD Integration Configuration

For continuous development in CI/CD:

```json
{
  "planModel": "anthropic/claude-sonnet-4",
  "buildModel": "anthropic/claude-haiku",
  "verbose": true,
  "maxRetries": 3,
  "taskPauseSeconds": 3,
  "autoCommit": true,
  "autoPush": true,
  "commitSignoff": true,
  "cycleTimeoutMinutes": 45,
  "logRetention": 7
}
```

Features:
- Verbose logging for CI/CD logs
- Auto-commit to capture work
- Auto-push to update remote
- Commit signoff for DCO compliance
- Shorter timeout for pipeline safety
- Reduced log retention to save space

See [CI/CD Integration](03-cicd.md) for full pipeline setup.

## Monitoring and Metrics

Check metrics regularly:

```bash
# Display metrics summary
opencoder --status -p ./my-project

# Output shows:
# - Cycles completed/timed out
# - Tasks completed/failed
# - Token usage (input/output)
# - Estimated cost
# - Success rate
```

Reset metrics when starting fresh:

```bash
opencoder --metrics-reset -p ./my-project
```

## Troubleshooting Advanced Configurations

### Problem: High Failure Rate

**Solution:**
1. Increase `maxRetries` to 5
2. Increase `backoffBase` to 15-30
3. Switch to more capable build model
4. Increase `taskPauseSeconds` to 3-5

### Problem: Timeout Errors

**Solution:**
1. Increase `cycleTimeoutMinutes`
2. Reduce complex tasks (use ideas queue)
3. Switch to more capable models
4. Check API rate limits

### Problem: High Token Usage

**Solution:**
1. Use cheaper model for `buildModel`
2. Reduce `verbose` logging
3. Use ideas queue to be more specific
4. Break work into smaller cycles

### Problem: Rate Limiting

**Solution:**
1. Increase `taskPauseSeconds` to 5+
2. Increase `backoffBase` to 30+
3. Check API quota and rate limits
4. Consider staggering runs across time

## Next Steps

1. **Experiment** - Try different strategies in your environment
2. **Monitor** - Use `--status` to watch metrics
3. **Adjust** - Fine-tune based on results
4. **Document** - Keep notes on what works best

See the main [README](../README.md) for more information.
