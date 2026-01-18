# Basic Configuration Example

This is the simplest way to get started with OpenCoder. Use this as a starting point for new projects.

## Directory Structure

```
my-project/
├── .opencode/
│   └── opencoder/
│       └── config.json          # OpenCoder configuration
└── [your project files...]
```

## Configuration File

Create `.opencode/opencoder/config.json` in your project directory:

```json
{
  "planModel": "anthropic/claude-sonnet-4",
  "buildModel": "anthropic/claude-sonnet-4",
  "verbose": false,
  "maxRetries": 3,
  "taskPauseSeconds": 2,
  "autoCommit": true,
  "autoPush": false
}
```

## Field Descriptions

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `planModel` | string | - | Model for plan/eval phases (format: `provider/model`) |
| `buildModel` | string | - | Model for build phase (format: `provider/model`) |
| `verbose` | boolean | false | Enable verbose logging output |
| `maxRetries` | number | 3 | Maximum retries per operation |
| `taskPauseSeconds` | number | 2 | Pause between tasks (prevents rate limiting) |
| `autoCommit` | boolean | true | Automatically commit changes after tasks |
| `autoPush` | boolean | true | Automatically push after cycles |
| `commitSignoff` | boolean | false | Add DCO signoff to commits |
| `cycleTimeoutMinutes` | number | 60 | Maximum minutes per cycle (0 = no limit) |

## Usage

### Option 1: Using Command Line

```bash
# Run with Claude Sonnet for both plan and build
opencoder --model anthropic/claude-sonnet-4 -p ./my-project

# Run with a hint/instruction
opencoder -m anthropic/claude-sonnet-4 -p ./my-project "Build a REST API with Express"

# With verbose logging
opencoder -m anthropic/claude-sonnet-4 -p ./my-project -v
```

### Option 2: Using Configuration File

```bash
# Create the config file first
mkdir -p my-project/.opencode/opencoder
cat > my-project/.opencode/opencoder/config.json << 'EOF'
{
  "planModel": "anthropic/claude-sonnet-4",
  "buildModel": "anthropic/claude-sonnet-4",
  "verbose": false,
  "maxRetries": 3,
  "taskPauseSeconds": 2,
  "autoCommit": true,
  "autoPush": false
}
EOF

# Run from project directory
cd my-project
opencoder
```

### Option 3: Using Environment Variables

```bash
export OPENCODER_PLAN_MODEL=anthropic/claude-sonnet-4
export OPENCODER_BUILD_MODEL=anthropic/claude-sonnet-4
export OPENCODER_VERBOSE=false

opencoder -p ./my-project
```

## Supported Models

### Anthropic (Claude)
- `anthropic/claude-opus-4` - Powerful, expensive, slower
- `anthropic/claude-sonnet-4` - Balanced, recommended default
- `anthropic/claude-haiku` - Fast, cheap, less capable

### OpenAI (GPT)
- `openai/gpt-4o` - Latest GPT-4 optimized model
- `openai/gpt-4-turbo` - GPT-4 with extended context
- `openai/gpt-3.5-turbo` - Fast, cheap, good for building

### Google (Gemini)
- `google/gemini-2.0-flash` - Latest fast model
- `google/gemini-pro` - Standard model

## Initial Run

When you first run OpenCoder:

1. It creates `.opencode/opencoder/` directory structure
2. Generates `state.json` to track progress
3. Creates `metrics.json` to track statistics
4. Saves plans in `current_plan.md`
5. Archives completed plans in `history/`

## What Happens

```
Cycle 1 → Plan Phase (generates tasks) → Build Phase (executes tasks)
        ↓
       Eval Phase (checks if work is complete)
        ↓
Cycle 2 → Repeat until manually stopped (Ctrl+C)
```

## Stopping OpenCoder

- **Graceful stop**: Press `Ctrl+C` once to finish the current cycle
- **Force stop**: Press `Ctrl+C` twice to stop immediately
- State is saved, so it can resume from where it left off

## Troubleshooting

### "Model not found"
- Verify your model format is `provider/model`
- Check that you have access to the model through your API key

### "Too many retries"
- Increase `maxRetries` in config if transient errors occur
- Check your API rate limits and quota
- Increase `taskPauseSeconds` to slow down task execution

### High token usage
- Use a faster model for `buildModel` (e.g., `claude-haiku`)
- Use a more capable model for `planModel` (e.g., `claude-opus`)
- Reduce `verbose` output if enabled

## Next Steps

Once you're comfortable with basic usage:

1. **Review the output** - Check `.opencode/opencoder/logs/` for detailed logs
2. **Adjust configuration** - Fine-tune based on your project's needs
3. **Use ideas queue** - Drop `.md` files in `.opencode/opencoder/ideas/` to guide development
4. **Check metrics** - Run `opencoder --status` to see usage statistics

See [Advanced Configuration](advanced.md) for more customization options.
