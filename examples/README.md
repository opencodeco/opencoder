# OpenCoder Examples

This directory contains example configurations and use cases for OpenCoder.

## Quick Navigation

| Example | Use Case | Complexity | Read Time |
|---------|----------|-----------|-----------|
| [01-basic.md](01-basic.md) | Getting started with OpenCoder | ⭐ Easy | 5 min |
| [02-advanced.md](02-advanced.md) | Advanced configuration and tuning | ⭐⭐⭐ Advanced | 15 min |
| [03-cicd.md](03-cicd.md) | CI/CD pipeline integration | ⭐⭐ Intermediate | 10 min |

## Getting Started (5 Minutes)

Start here if you're new to OpenCoder:

```bash
# 1. Create a configuration
mkdir -p my-project/.opencode/opencoder
cat > my-project/.opencode/opencoder/config.json << 'EOF'
{
  "planModel": "anthropic/claude-sonnet-4",
  "buildModel": "anthropic/claude-sonnet-4",
  "verbose": false,
  "autoCommit": true,
  "autoPush": false
}
EOF

# 2. Run OpenCoder
cd my-project
opencoder

# 3. Watch it work (Ctrl+C to stop)
```

→ **Read [01-basic.md](01-basic.md) for detailed setup instructions**

## Common Use Cases

### I want to start a new project from scratch

**Best approach:**
1. Create project with your starter template
2. Use [Basic Configuration](01-basic.md)
3. Run with a clear instruction:
   ```bash
   opencoder --model anthropic/claude-sonnet-4 "Build a REST API with Express and TypeScript"
   ```

**Time to first code:** 2-5 minutes

### I want to improve an existing project

**Best approach:**
1. Create `.opencode/opencoder/ideas/` directory
2. Add task files with specific improvements you want
3. Use [Advanced Configuration](02-advanced.md) with ideas queue
4. Run nightly with [CI/CD Example](03-cicd.md)

**Expected improvements:** 2-3 commits per night

### I want continuous automated development

**Best approach:**
1. Set up GitHub Actions workflow from [CI/CD Example](03-cicd.md)
2. Create ideas queue with development tasks
3. Schedule runs nightly or weekly
4. Review and merge PRs created by OpenCoder

**Setup time:** 30 minutes

### I want to optimize costs

**Best approach:**
1. Use [Advanced Configuration - Cost-Optimized Strategy](02-advanced.md)
2. Use cheaper models: `anthropic/claude-haiku` for building
3. Increase `taskPauseSeconds` to reduce tokens
4. Monitor metrics with `opencoder --status`

**Cost savings:** 50-70% compared to balanced approach

### I want the best quality code

**Best approach:**
1. Use [Advanced Configuration - Quality-First Strategy](02-advanced.md)
2. Use powerful models: `anthropic/claude-opus-4`
3. Enable verbose logging
4. Review all changes before merging

**Quality gains:** 20-30% fewer manual fixes needed

## Configuration Comparison

### Quick Reference Table

| Aspect | Basic | Advanced (Balanced) | Advanced (Cost) | Advanced (Quality) |
|--------|-------|-------------------|-----------------|-------------------|
| Plan Model | Sonnet | Sonnet | Sonnet | Opus |
| Build Model | Sonnet | Haiku | GPT-3.5 | Opus |
| Setup Time | 2 min | 5 min | 5 min | 5 min |
| Cost/Cycle | High | Medium | Low | High |
| Code Quality | Good | Good | Fair | Excellent |
| Speed | Slow | Medium | Fast | Slow |
| Failures | Fewer | Few | Some | Rare |
| Best For | Learning | Production | Testing | Critical |

## Model Recommendations

### By Capability Level

**Beginner projects:**
- Plan: `anthropic/claude-sonnet-4`
- Build: `anthropic/claude-haiku`
- Cost: Low, Speed: Fast

**Intermediate projects:**
- Plan: `anthropic/claude-sonnet-4` (recommended)
- Build: `anthropic/claude-sonnet-4`
- Cost: Medium, Speed: Medium

**Complex projects:**
- Plan: `anthropic/claude-opus-4`
- Build: `anthropic/claude-sonnet-4`
- Cost: High, Speed: Slow

**Enterprise:**
- Plan: `anthropic/claude-opus-4`
- Build: `anthropic/claude-opus-4`
- Cost: Very High, Speed: Slow

### By Provider

**Anthropic (Claude)** - Recommended
- Best reasoning and code generation
- Consistent quality
- Good for production use

**OpenAI (GPT)** - Good alternative
- Competitive quality
- May be cheaper for some tasks
- Good for building phase

**Google (Gemini)** - Emerging
- Fast execution
- Competitive pricing
- Less mature for code generation

## Workflow Patterns

### Pattern 1: Autonomous Improvement (Hands-Off)

Perfect for overnight development and background improvement.

```
Setup Config → Add Ideas → Run OpenCoder → Review Results → Commit
                ↑__________________________|
```

**Steps:**
1. Configure OpenCoder with your preferences
2. Add task ideas in `.opencode/opencoder/ideas/`
3. Run overnight or on schedule
4. Review changes in morning
5. Merge or iterate

**Time investment:** Minimal (setup only)

### Pattern 2: Guided Development (Semi-Automated)

Perfect for focused feature development.

```
Write Detailed Ideas → Run OpenCoder → Review & Fix → Commit
```

**Steps:**
1. Write detailed task descriptions
2. Run OpenCoder to implement
3. Review and fix any issues
4. Commit and push

**Time investment:** 30% of manual coding

### Pattern 3: Exploratory Development (Interactive)

Perfect for prototyping and learning.

```
Run → View Output → Adjust Config → Run Again → Repeat
```

**Steps:**
1. Try different configurations
2. Watch OpenCoder work
3. Learn from generated code
4. Adjust and retry
5. Use best results

**Time investment:** Moderate (interactive)

### Pattern 4: Hybrid (Best of Both)

Perfect for production projects.

```
Development → Ideas Queue → Nightly OpenCoder → Morning Review
                 ↓              ↓
           Add guidance    Continuous improvement
```

**Steps:**
1. Do manual development as usual
2. Maintain ideas queue for improvements
3. Let OpenCoder run nightly
4. Review and merge in morning

**Time investment:** Minimal ongoing effort

## Troubleshooting Guide

### Configuration Issues

**Problem:** "Model not found"
- **Solution:** Check model format is `provider/model`
- **Reference:** [Model List in Basic Config](01-basic.md#supported-models)

**Problem:** "Too expensive"
- **Solution:** Use [Cost-Optimized Strategy](02-advanced.md)
- **Reference:** [Advanced - Cost Optimization](02-advanced.md#strategy-3-cost-optimized)

**Problem:** "Low quality code"
- **Solution:** Use [Quality-First Strategy](02-advanced.md)
- **Reference:** [Advanced - Quality Strategy](02-advanced.md#strategy-1-quality-first)

### Runtime Issues

**Problem:** "Too many retries"
- **Solution:** Increase pause or model capability
- **Reference:** [Advanced - Performance Tuning](02-advanced.md#performance-tuning)

**Problem:** "Timeout errors"
- **Solution:** Increase cycle timeout, reduce tasks
- **Reference:** [Advanced - Troubleshooting](02-advanced.md#troubleshooting-advanced-configurations)

**Problem:** "Git push fails in CI/CD"
- **Solution:** Follow git setup in CI/CD example
- **Reference:** [CI/CD - Troubleshooting](03-cicd.md#troubleshooting-cicd)

## Tips and Tricks

### Tip 1: Test Locally First

```bash
# Create test project
mkdir test-opencoder
cd test-opencoder

# Run with shorter timeout
opencoder -m anthropic/claude-sonnet-4 \
          --model anthropic/claude-haiku \
          -v

# If it works, use in CI/CD
```

### Tip 2: Use Ideas for Consistency

Instead of hoping OpenCoder will do what you want, tell it explicitly:

```bash
# Create ideas directory
mkdir -p .opencode/opencoder/ideas

# Add specific tasks
echo "# Add logging to app.ts" > .opencode/opencoder/ideas/01-add-logging.md

# OpenCoder will prioritize them
opencoder
```

### Tip 3: Monitor Metrics

```bash
# Check progress
opencoder --status

# Track costs
watch -n 5 'opencoder --status'
```

### Tip 4: Use Verbose in Development

```bash
# See what OpenCoder is thinking
opencoder -m anthropic/claude-sonnet-4 -v

# Check logs
tail -f .opencode/opencoder/logs/main.log
```

### Tip 5: Start Small

```bash
# Don't try to build everything at once
# Use ideas queue with small, focused tasks

# ❌ Bad: "Build a complete ecommerce platform"
# ✅ Good: "Add user authentication with JWT"
```

## Next Steps

1. **Start with [Basic Configuration](01-basic.md)** - Understand the basics
2. **Try different models** - See what works for your use case
3. **Explore [Advanced Configuration](02-advanced.md)** - Optimize for your needs
4. **Set up CI/CD** - Use [CI/CD Example](03-cicd.md) for continuous development
5. **Share feedback** - Help improve OpenCoder for everyone

## Additional Resources

- **[OpenCoder README](../README.md)** - Full documentation
- **[CONTRIBUTING.md](../CONTRIBUTING.md)** - How to contribute
- **[CHANGELOG.md](../CHANGELOG.md)** - Version history
- **[AGENTS.md](../AGENTS.md)** - Technical guidelines

## Questions?

- Check the [README FAQ](../README.md)
- Read the [CONTRIBUTING guide](../CONTRIBUTING.md)
- Review examples for your use case
- Ask in GitHub Discussions

Happy automating! 🚀
