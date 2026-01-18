/**
 * Plan parsing, validation, and prompt generation
 */

import type { Task } from "./types.ts"

/** Task patterns - supports multiple formats */
const TASK_PATTERNS = {
	/** Checkbox uncompleted: - [ ] task */
	checkboxUncompleted: /^- \[ \] (.+)$/,
	/** Checkbox completed: - [x] task or - [X] task */
	checkboxCompleted: /^- \[[xX]\] (.+)$/,
	/** Numbered list: 1. task, 2. task, etc. */
	numbered: /^\d+\.\s+(.+)$/,
	/** Step/Task header: ### Step 1: task, ## Task 2: task, etc. */
	stepHeader: /^#{1,4}\s*(?:Step|Task)\s*\d*[:.]\s*(.+)$/i,
	/** Plain bullet: - task or * task */
	bullet: /^[-*]\s+(.+)$/,
	/** Done marker for non-checkbox formats */
	doneMarker: /^\[DONE\]\s*/,
}

/**
 * Parse tasks from a plan content.
 * Supports multiple formats: checkboxes, numbered lists, bullets, step headers.
 * Falls back to treating the entire plan as a single task if no structured tasks found.
 */
export function getTasks(planContent: string): Task[] {
	const lines = planContent.split("\n")
	const tasks: Task[] = []

	// Check if entire plan is marked as completed (fallback task was completed)
	const isPlanCompleted = planContent.trimStart().startsWith("[COMPLETED]")

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i]?.trim()
		if (!line) continue

		// Skip the [COMPLETED] marker line
		if (line === "[COMPLETED]") continue

		// Check for completed checkbox first: - [x] task
		const checkboxDoneMatch = line.match(TASK_PATTERNS.checkboxCompleted)
		if (checkboxDoneMatch?.[1]) {
			tasks.push({
				lineNumber: i + 1,
				description: checkboxDoneMatch[1].trim(),
				completed: true,
			})
			continue
		}

		// Check for uncompleted checkbox: - [ ] task
		const checkboxMatch = line.match(TASK_PATTERNS.checkboxUncompleted)
		if (checkboxMatch?.[1]) {
			tasks.push({
				lineNumber: i + 1,
				description: checkboxMatch[1].trim(),
				completed: false,
			})
			continue
		}

		// Check for numbered list: 1. task
		const numberedMatch = line.match(TASK_PATTERNS.numbered)
		if (numberedMatch?.[1]) {
			const desc = numberedMatch[1].trim()
			const isDone = TASK_PATTERNS.doneMarker.test(desc)
			tasks.push({
				lineNumber: i + 1,
				description: isDone ? desc.replace(TASK_PATTERNS.doneMarker, "") : desc,
				completed: isDone,
			})
			continue
		}

		// Check for step header: ### Step 1: task
		const stepMatch = line.match(TASK_PATTERNS.stepHeader)
		if (stepMatch?.[1]) {
			const desc = stepMatch[1].trim()
			const isDone = TASK_PATTERNS.doneMarker.test(desc)
			tasks.push({
				lineNumber: i + 1,
				description: isDone ? desc.replace(TASK_PATTERNS.doneMarker, "") : desc,
				completed: isDone,
			})
			continue
		}

		// Check for plain bullet: - task or * task (but not checkboxes or markdown headers)
		// Skip lines starting with # (markdown headers like "## Tasks")
		// Skip checkbox patterns (- [ ] or - [x])
		const isCheckbox = /^- \[[ xX]\]/.test(line)
		if (!isCheckbox && !line.startsWith("#")) {
			const bulletMatch = line.match(TASK_PATTERNS.bullet)
			if (bulletMatch?.[1]) {
				const desc = bulletMatch[1].trim()
				const isDone = TASK_PATTERNS.doneMarker.test(desc)
				tasks.push({
					lineNumber: i + 1,
					description: isDone ? desc.replace(TASK_PATTERNS.doneMarker, "") : desc,
					completed: isDone,
				})
			}
		}
	}

	// Fallback: if no structured tasks found, treat entire plan as a single task
	if (tasks.length === 0 && planContent.trim() && !isPlanCompleted) {
		// Extract a summary from the first meaningful line (skip empty lines and markdown headers)
		const firstMeaningfulLine = lines.find((l) => {
			const trimmed = l.trim()
			return trimmed && !trimmed.startsWith("#") && trimmed.length > 10
		})
		const summary = firstMeaningfulLine?.trim().slice(0, 100) || "Execute plan"

		tasks.push({
			lineNumber: 1,
			description: `[FULL PLAN] ${summary}${summary.length >= 100 ? "..." : ""}`,
			completed: false,
		})
	}

	// If plan was marked [COMPLETED] but no structured tasks, return completed fallback task
	if (tasks.length === 0 && isPlanCompleted) {
		tasks.push({
			lineNumber: 1,
			description: "[FULL PLAN] Completed",
			completed: true,
		})
	}

	return tasks
}

/**
 * Get uncompleted tasks from a plan
 */
export function getUncompletedTasks(planContent: string): Task[] {
	return getTasks(planContent).filter((t) => !t.completed)
}

/**
 * Mark a task as complete in the plan content.
 * Handles checkboxes (converts to [x]) and other formats (prepends [DONE]).
 * For fallback tasks (line 1 with no structure), prepends [COMPLETED] to the plan.
 */
export function markTaskComplete(planContent: string, lineNumber: number): string {
	const lines = planContent.split("\n")
	const index = lineNumber - 1 // Convert to 0-indexed

	// Special handling for fallback task (entire plan as single task at line 1)
	// Check if this is the fallback case by seeing if getTasks would return a [FULL PLAN] task
	const tasks = getTasks(planContent)
	const isFallbackTask =
		tasks.length === 1 && tasks[0]?.description.startsWith("[FULL PLAN]") && lineNumber === 1

	if (isFallbackTask) {
		// Mark the entire plan as completed by prepending a marker
		return `[COMPLETED]\n${planContent}`
	}

	if (index >= 0 && index < lines.length) {
		const line = lines[index]
		if (line) {
			// If it's a checkbox, check it
			if (/^(\s*)- \[ \]/.test(line)) {
				lines[index] = line.replace(/^(\s*)- \[ \]/, "$1- [x]")
			}
			// For numbered lists: 1. task -> 1. [DONE] task
			else if (/^\d+\.\s+/.test(line.trim()) && !line.includes("[DONE]")) {
				lines[index] = line.replace(/^(\s*)(\d+\.\s+)/, "$1$2[DONE] ")
			}
			// For step headers: ### Step 1: task -> ### Step 1: [DONE] task
			else if (
				/^#{1,4}\s*(?:Step|Task)\s*\d*[:.]\s*/i.test(line.trim()) &&
				!line.includes("[DONE]")
			) {
				lines[index] = line.replace(/^(\s*#{1,4}\s*(?:Step|Task)\s*\d*[:.]\s*)/i, "$1[DONE] ")
			}
			// For plain bullets: - task -> - [DONE] task
			else if (/^(\s*)[-*]\s+/.test(line) && !line.includes("[DONE]") && !line.includes("- [")) {
				lines[index] = line.replace(/^(\s*[-*]\s+)/, "$1[DONE] ")
			}
		}
	}

	return lines.join("\n")
}

/**
 * Validate that a plan has actionable content.
 * Always accepts non-empty plans (fallback to single task if no structured tasks).
 */
export function validatePlan(planContent: string): { valid: boolean; error?: string } {
	if (!planContent.trim()) {
		return { valid: false, error: "Plan is empty" }
	}

	const tasks = getTasks(planContent)

	// getTasks now always returns at least one task for non-empty content (fallback)
	// So this check is just a safety net
	if (tasks.length === 0) {
		return { valid: false, error: "Plan is empty" }
	}

	const uncompletedTasks = tasks.filter((t) => !t.completed)

	if (uncompletedTasks.length === 0) {
		return { valid: false, error: "All tasks are already completed" }
	}

	return { valid: true }
}

/**
 * Generate the plan prompt for autonomous operation
 */
export function generatePlanPrompt(cycle: number, hint?: string): string {
	const hintSection = hint ? `\n\nUser hint for this cycle: ${hint}` : ""

	return `You are an autonomous development agent working on a software project. This is cycle ${cycle} of continuous development.

Your task is to analyze the current state of the project and create a development plan.${hintSection}

## Instructions

1. First, explore the project structure to understand what exists
2. Review any existing code, documentation, and configuration
3. Identify the most impactful improvements or features to work on
4. Create a focused plan with specific, actionable tasks

## Plan Format

Create a markdown plan with the following structure:

\`\`\`markdown
# Plan: [Descriptive Title]
Created: [ISO timestamp]
Cycle: ${cycle}

## Context
[Brief description of project state and current focus - 2-3 sentences]

## Tasks
- [ ] Task 1: Specific, actionable description
- [ ] Task 2: Specific, actionable description
- [ ] Task 3: Specific, actionable description
...
- [ ] Run project linting and tests to ensure everything passes

## Notes
[Any additional context, dependencies, or considerations]
\`\`\`

## Guidelines

- Keep tasks specific and actionable (can be completed in one focused session)
- Include 3-7 tasks per plan
- Always include a final task to run linting/tests
- Focus on high-impact changes
- Consider dependencies between tasks
- Tasks should be completable without user interaction

Now analyze the project and create your plan.`
}

/**
 * Generate the task build prompt
 */
export function generateTaskPrompt(
	task: string,
	cycle: number,
	taskNum: number,
	totalTasks: number,
): string {
	return `You are an autonomous development agent. This is cycle ${cycle}, task ${taskNum} of ${totalTasks}.

## Current Task
${task}

## Instructions

1. Complete this task fully and autonomously
2. Make all necessary code changes
3. If the task involves running commands (like tests or linting), run them and fix any issues
4. Do not stop until the task is complete or you encounter an unresolvable blocker

## Guidelines

- Make focused, minimal changes to complete the task
- Follow existing code style and conventions
- Write clean, readable code with appropriate comments
- If you create new files, ensure they integrate with existing structure
- Fix any linting errors or test failures before finishing

Begin working on the task now.`
}

/**
 * Generate the eval prompt
 */
export function generateEvalPrompt(cycle: number, planContent: string): string {
	return `You are evaluating cycle ${cycle} of an autonomous development session.

## Current Plan
\`\`\`markdown
${planContent}
\`\`\`

## Instructions

Review the completed work in this cycle and determine if the plan has been successfully completed.

Check:
1. Are all tasks marked as complete?
2. Were the changes implemented correctly?
3. Do tests pass?
4. Is the codebase in a good state?

## Response Format

Respond with exactly one of these formats:

If the cycle is complete and successful:
\`\`\`
COMPLETE
Reason: [Brief explanation of what was accomplished]
\`\`\`

If more work is needed:
\`\`\`
NEEDS_WORK
Reason: [What still needs to be done]
\`\`\`

Evaluate the cycle now.`
}

/**
 * Generate the idea selection prompt
 */
export function generateIdeaSelectionPrompt(ideasFormatted: string): string {
	return `You are an autonomous development agent selecting the next task to work on.

## Available Ideas

${ideasFormatted}

## Selection Criteria

Choose the idea that best matches these criteria (in priority order):
1. **Quick wins first**: Prefer simpler tasks that can be completed quickly
2. **Dependencies**: If one idea is a prerequisite for others, select it first
3. **Priority order**: Bug fixes > Small features > Documentation > Refactoring > Large features

## Response Format

Respond with exactly this format:

\`\`\`
SELECTED_IDEA: <number>
REASON: <one sentence explaining why this is the best quick-win>
\`\`\`

Select the best idea now.`
}

/**
 * Generate the idea plan prompt (when planning from a specific idea)
 */
export function generateIdeaPlanPrompt(
	ideaContent: string,
	ideaFilename: string,
	cycle: number,
): string {
	return `You are an autonomous development agent working on a software project. This is cycle ${cycle} of continuous development.

## Idea to Implement

**Source**: ${ideaFilename}

${ideaContent}

## Instructions

1. Analyze the idea and understand what needs to be done
2. Explore the relevant parts of the codebase
3. Create a focused plan to implement this idea

## Plan Format

Create a markdown plan with the following structure:

\`\`\`markdown
# Plan: [Descriptive Title Based on Idea]
Created: [ISO timestamp]
Cycle: ${cycle}
Source: ${ideaFilename}

## Context
[Brief description of what this idea entails - 2-3 sentences]

## Tasks
- [ ] Task 1: Specific, actionable description
- [ ] Task 2: Specific, actionable description
- [ ] Task 3: Specific, actionable description
...
- [ ] Run project linting and tests to ensure everything passes

## Notes
[Any additional context, dependencies, or considerations]
\`\`\`

## Guidelines

- Break down the idea into specific, actionable tasks
- Include 3-7 tasks per plan
- Always include a final task to run linting/tests
- Consider what exploration/research might be needed first
- Tasks should be completable without user interaction

Now analyze the project and create your plan to implement this idea.`
}

/**
 * Extract the plan content from AI response (may be wrapped in code blocks)
 */
export function extractPlanFromResponse(response: string): string {
	// Try to extract from markdown code block
	const codeBlockMatch = response.match(/```(?:markdown)?\n?([\s\S]*?)```/)
	if (codeBlockMatch?.[1]) {
		return codeBlockMatch[1].trim()
	}

	// If no code block, return the whole response
	return response.trim()
}
