# CI/CD Integration Example

This guide shows how to integrate OpenCoder into your CI/CD pipeline for continuous autonomous development.

## GitHub Actions Integration

### Basic Workflow

Create `.github/workflows/opencoder.yml`:

```yaml
name: OpenCoder Continuous Development

on:
  schedule:
    # Run nightly at 2 AM UTC
    - cron: '0 2 * * *'
  workflow_dispatch:
    # Allow manual triggers

jobs:
  opencoder:
    runs-on: ubuntu-latest
    
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0  # Full history for git operations
      
      - name: Setup Bun
        uses: oven-sh/setup-bun@v2
        with:
          bun-version: latest
      
      - name: Install OpenCoder
        run: bun install -g opencoder
      
      - name: Create OpenCoder config
        run: |
          mkdir -p .opencode/opencoder
          cat > .opencode/opencoder/config.json << 'EOF'
          {
            "planModel": "anthropic/claude-sonnet-4",
            "buildModel": "anthropic/claude-haiku",
            "verbose": true,
            "maxRetries": 3,
            "taskPauseSeconds": 3,
            "autoCommit": true,
            "autoPush": true,
            "commitSignoff": true,
            "cycleTimeoutMinutes": 45
          }
          EOF
      
      - name: Run OpenCoder
        env:
          OPENCODE_TOKEN: ${{ secrets.OPENCODE_TOKEN }}
        run: |
          opencoder \
            --model anthropic/claude-sonnet-4 \
            --no-auto-push \
            --signoff
      
      - name: Push changes
        if: success()
        run: |
          git config --global user.name "OpenCoder Bot"
          git config --global user.email "opencoder@bot.local"
          git push origin main
```

### Advanced Workflow with Status Reporting

```yaml
name: OpenCoder with Status Reporting

on:
  schedule:
    - cron: '0 2 * * *'
  workflow_dispatch:

jobs:
  opencoder:
    runs-on: ubuntu-latest
    
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      
      - name: Setup Bun
        uses: oven-sh/setup-bun@v2
        with:
          bun-version: latest
      
      - name: Install OpenCoder
        run: bun install -g opencoder
      
      - name: Create config
        run: |
          mkdir -p .opencode/opencoder
          cat > .opencode/opencoder/config.json << 'EOF'
          {
            "planModel": "anthropic/claude-opus-4",
            "buildModel": "anthropic/claude-sonnet-4",
            "verbose": true,
            "autoCommit": true,
            "autoPush": false,
            "commitSignoff": true,
            "cycleTimeoutMinutes": 60
          }
          EOF
      
      - name: Run OpenCoder
        env:
          OPENCODE_TOKEN: ${{ secrets.OPENCODE_TOKEN }}
        run: opencoder --signoff
        continue-on-error: true
      
      - name: Check metrics
        run: opencoder --status
      
      - name: Commit changes
        if: success()
        run: |
          git config --global user.name "OpenCoder Bot"
          git config --global user.email "opencoder@bot.local"
          if [ -n "$(git status --porcelain)" ]; then
            git add -A
            git commit -s -m "chore: automated improvements from OpenCoder"
            git push origin main
          else
            echo "No changes to commit"
          fi
      
      - name: Create summary
        if: always()
        run: |
          echo "## OpenCoder Run Summary" >> $GITHUB_STEP_SUMMARY
          opencoder --status >> $GITHUB_STEP_SUMMARY
```

## Configuration for CI/CD

Use this configuration for reliable CI/CD runs:

`.opencode/opencoder/config.json`:

```json
{
  "planModel": "anthropic/claude-sonnet-4",
  "buildModel": "anthropic/claude-haiku",
  "verbose": true,
  "maxRetries": 3,
  "taskPauseSeconds": 3,
  "autoCommit": true,
  "autoPush": false,
  "commitSignoff": true,
  "cycleTimeoutMinutes": 45,
  "logRetention": 7
}
```

**Rationale:**
- **Powerful plan model** - Better task breakdown
- **Fast build model** - Quick execution, lower cost
- **Verbose** - Useful logs in CI/CD output
- **Conservative retries** - Fail safely
- **Task pause** - Avoid rate limiting
- **No auto-push** - Control when changes go live
- **Commit signoff** - DCO compliance
- **Shorter timeout** - Prevent runaway jobs

## Environment Variables

Set these in GitHub Secrets:

```yaml
env:
  OPENCODE_TOKEN: ${{ secrets.OPENCODE_TOKEN }}
  OPENCODE_PLAN_MODEL: anthropic/claude-sonnet-4
  OPENCODE_BUILD_MODEL: anthropic/claude-haiku
  OPENCODER_VERBOSE: true
  OPENCODER_AUTO_COMMIT: true
  OPENCODER_AUTO_PUSH: false
  OPENCODER_COMMIT_SIGNOFF: true
```

## Scheduling Strategies

### Option 1: Nightly (Every Night)

```yaml
on:
  schedule:
    - cron: '0 2 * * *'  # 2 AM UTC daily
```

**Best for:**
- Active projects needing continuous improvement
- Testing new features
- Overnight development

### Option 2: Weekly (Once per Week)

```yaml
on:
  schedule:
    - cron: '0 2 * * 0'  # 2 AM UTC every Sunday
```

**Best for:**
- Stable projects
- Maintenance tasks
- Cost control

### Option 3: Manual Only

```yaml
on:
  workflow_dispatch:
```

**Best for:**
- Testing configurations
- Running on-demand
- Development branches

### Option 4: Event-Triggered

```yaml
on:
  pull_request:
    closed:
      types: [closed]  # When PR is merged
  push:
    branches: [main]
```

**Best for:**
- Post-merge improvements
- Cleanup and optimization
- Continuous deployment

## Ideas Queue in CI/CD

Add tasks for OpenCoder to work on in `.opencode/opencoder/ideas/`:

Example: `.opencode/opencoder/ideas/update-deps.md`

```markdown
# Update Dependencies

Update all npm/bun packages to their latest safe versions.

## Steps
1. Check current versions: `bun outdated`
2. Update minor/patch versions: `bun update`
3. Test with: `bun test`
4. Review changes and commit
5. Update CHANGELOG.md if needed
```

Commit the ideas to git, and OpenCoder will automatically process them.

## Handling Changes

### Option 1: Auto-Push (Faster)

```json
{
  "autoCommit": true,
  "autoPush": true,
  "commitSignoff": true
}
```

**Workflow:**
1. OpenCoder makes changes
2. Auto-commits with signoff
3. Auto-pushes to main
4. Changes are live immediately

**Risk:** Changes go live without review

### Option 2: Create PR (Safer)

```yaml
- name: Create Pull Request
  if: success()
  uses: peter-evans/create-pull-request@v5
  with:
    commit-message: 'chore: automated improvements from OpenCoder'
    title: 'chore: automated improvements'
    branch: opencoder/improvements
    delete-branch: true
```

**Workflow:**
1. OpenCoder makes changes
2. Auto-commits to feature branch
3. Creates Pull Request
4. Waits for human review
5. Merges after approval

**Advantage:** Code review before merge

### Option 3: Staged Deployment

```yaml
- name: Create PR for review
  if: github.event.schedule == '0 2 * * *'
  # ... create PR ...

- name: Auto-merge if tests pass
  if: github.event_name == 'pull_request'
  # ... merge logic ...
```

## Monitoring and Alerts

### Slack Notification

```yaml
- name: Notify Slack
  if: always()
  uses: slackapi/slack-github-action@v1
  with:
    webhook-url: ${{ secrets.SLACK_WEBHOOK }}
    payload: |
      {
        "text": "OpenCoder workflow completed",
        "blocks": [
          {
            "type": "section",
            "text": {
              "type": "mrkdwn",
              "text": "*OpenCoder Status*\nRun: ${{ github.run_number }}\nStatus: ${{ job.status }}"
            }
          }
        ]
      }
```

### Email Notification

```yaml
- name: Send email report
  if: failure()
  uses: dawidd6/action-send-mail@v3
  with:
    server_address: ${{ secrets.MAIL_SERVER }}
    server_port: ${{ secrets.MAIL_PORT }}
    username: ${{ secrets.MAIL_USERNAME }}
    password: ${{ secrets.MAIL_PASSWORD }}
    subject: "OpenCoder workflow failed"
    body: |
      OpenCoder run ${{ github.run_number }} failed.
      Check logs: ${{ github.server_url }}/${{ github.repository }}/actions/runs/${{ github.run_id }}
```

## Cost Management

Control costs in CI/CD:

```json
{
  "planModel": "anthropic/claude-sonnet-4",
  "buildModel": "anthropic/claude-haiku",
  "cycleTimeoutMinutes": 30
}
```

**Cost-saving strategies:**
- Use cheaper models for build phase
- Limit cycle timeout to 30-45 minutes
- Schedule less frequently
- Use ideas queue for focused work

## Multi-Branch Strategy

Run OpenCoder on different branches:

```yaml
strategy:
  matrix:
    branch:
      - main       # Production improvements
      - develop    # Feature development
      - staging    # Pre-release testing

jobs:
  opencoder:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          ref: ${{ matrix.branch }}
      
      # ... rest of workflow ...
```

## GitOps Integration

Use OpenCoder with GitOps tools:

```yaml
- name: Update manifests
  run: |
    # OpenCoder updates manifests
    opencoder
    
    # ArgoCD automatically syncs
    # (if auto-sync is enabled)
    
    # Or trigger manually
    kubectl apply -f manifests/
```

## Troubleshooting CI/CD

### Problem: "Token not found"

**Solution:**
1. Add `OPENCODE_TOKEN` to GitHub Secrets
2. Verify secret name matches environment variable
3. Check secret value is not empty

### Problem: "Too many retries"

**Solution:**
1. Reduce number of tasks (use ideas queue)
2. Increase `taskPauseSeconds` to 5
3. Increase `cycleTimeoutMinutes`
4. Check API quota

### Problem: "Git push fails"

**Solution:**
1. Use `actions/checkout@v4` with `fetch-depth: 0`
2. Configure git user before push:
   ```yaml
   git config --global user.name "OpenCoder Bot"
   git config --global user.email "opencoder@bot.local"
   ```
3. Ensure branch exists
4. Check repository permissions

### Problem: "Workflow never completes"

**Solution:**
1. Reduce `cycleTimeoutMinutes` (default 60)
2. Set `autoPush: false` to skip final push
3. Add explicit timeout to job:
   ```yaml
   timeout-minutes: 90
   ```

## Best Practices

1. **Use commit signoff** - Required for DCO compliance
2. **Create PRs for review** - Don't auto-push to main
3. **Monitor costs** - Check metrics regularly
4. **Test locally first** - Verify config works before CI/CD
5. **Use ideas queue** - Guide OpenCoder toward useful work
6. **Schedule wisely** - Not too frequent, not too rare
7. **Monitor logs** - Check `.opencode/opencoder/logs/` for issues
8. **Review changes** - Even with automation, review code changes

## See Also

- [Basic Configuration](01-basic.md) - Getting started
- [Advanced Configuration](02-advanced.md) - Tuning and optimization
- [Main README](../README.md) - Full documentation
