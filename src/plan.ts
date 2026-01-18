/**
 * Plan parsing, validation, and prompt generation
 */

import type { Task } from "./types.ts"

/** Task checkbox patterns */
const UNCOMPLETED_TASK_PATTERN = /^- \[ \] (.+)$/
const COMPLETED_TASK_PATTERN = /^- \[[xX]\] (.+)$/

/**
 * Parse tasks from a plan content
 */
export function getTasks(planContent: string): Task[] {
	const lines = planContent.split("\n")
	const tasks: Task[] = []

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i]?.trim()
		if (!line) continue

		// Check for uncompleted task
		const uncompletedMatch = line.match(UNCOMPLETED_TASK_PATTERN)
		if (uncompletedMatch?.[1]) {
			tasks.push({
				lineNumber: i + 1, // 1-indexed
				description: uncompletedMatch[1].trim(),
				completed: false,
			})
			continue
		}

		// Check for completed task
		const completedMatch = line.match(COMPLETED_TASK_PATTERN)
		if (completedMatch?.[1]) {
			tasks.push({
				lineNumber: i + 1,
				description: completedMatch[1].trim(),
				completed: true,
			})
		}
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
 * Mark a task as complete in the plan content
 */
export function markTaskComplete(planContent: string, lineNumber: number): string {
	const lines = planContent.split("\n")
	const index = lineNumber - 1 // Convert to 0-indexed

	if (index >= 0 && index < lines.length) {
		const line = lines[index]
		if (line) {
			// Replace "- [ ]" with "- [x]"
			lines[index] = line.replace(/^(\s*)- \[ \]/, "$1- [x]")
		}
	}

	return lines.join("\n")
}

/**
 * Validate that a plan has actionable tasks
 */
export function validatePlan(planContent: string): { valid: boolean; error?: string } {
	if (!planContent.trim()) {
		return { valid: false, error: "Plan is empty" }
	}

	const tasks = getTasks(planContent)

	if (tasks.length === 0) {
		return { valid: false, error: "Plan has no actionable tasks" }
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
 * Generate the evaluation prompt
 */
export function generateEvaluationPrompt(cycle: number, planContent: string): string {
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
