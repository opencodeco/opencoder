/**
 * Tests for plan module
 */

import { describe, expect, test } from "bun:test"
import {
	extractPlanFromResponse,
	getTasks,
	getUncompletedTasks,
	markTaskComplete,
	validatePlan,
} from "../src/plan.ts"

const SAMPLE_PLAN = `# Plan: Test Plan
Created: 2024-01-01
Cycle: 1

## Context
This is a test plan.

## Tasks
- [ ] Task one: Do the first thing
- [ ] Task two: Do the second thing
- [x] Task three: Already done
- [ ] Task four: Final task

## Notes
Some notes here.
`

const NUMBERED_PLAN = `# Plan: Numbered Tasks
Cycle: 1

## Tasks
1. First task to do
2. Second task to do
3. [DONE] Third task already done
4. Fourth task to do
`

const STEP_HEADER_PLAN = `# Plan: Step Headers
Cycle: 1

### Step 1: Setup the environment
### Step 2: Implement the feature
### Step 3: [DONE] Write tests
### Step 4: Run linting
`

const BULLET_PLAN = `# Plan: Bullet Tasks
Cycle: 1

## Tasks
- First bullet task
- Second bullet task
* Third bullet with asterisk
- [DONE] Fourth bullet done
`

describe("plan", () => {
	describe("getTasks", () => {
		test("extracts all tasks from plan", () => {
			const tasks = getTasks(SAMPLE_PLAN)

			expect(tasks.length).toBe(4)
			expect(tasks[0]?.description).toBe("Task one: Do the first thing")
			expect(tasks[0]?.completed).toBe(false)
			expect(tasks[2]?.description).toBe("Task three: Already done")
			expect(tasks[2]?.completed).toBe(true)
		})

		test("returns empty array for plan without tasks", () => {
			const tasks = getTasks("")

			expect(tasks.length).toBe(0)
		})

		test("falls back to single task for unstructured content", () => {
			const tasks = getTasks(
				"# Plan\nThis is some unstructured content that should become a single task",
			)

			expect(tasks.length).toBe(1)
			expect(tasks[0]?.description).toContain("[FULL PLAN]")
			expect(tasks[0]?.completed).toBe(false)
		})

		test("captures line numbers correctly", () => {
			const tasks = getTasks(SAMPLE_PLAN)

			expect(tasks[0]?.lineNumber).toBe(9)
			expect(tasks[3]?.lineNumber).toBe(12)
		})

		test("parses numbered list tasks", () => {
			const tasks = getTasks(NUMBERED_PLAN)

			expect(tasks.length).toBe(4)
			expect(tasks[0]?.description).toBe("First task to do")
			expect(tasks[0]?.completed).toBe(false)
			expect(tasks[2]?.description).toBe("Third task already done")
			expect(tasks[2]?.completed).toBe(true)
		})

		test("parses step header tasks", () => {
			const tasks = getTasks(STEP_HEADER_PLAN)

			expect(tasks.length).toBe(4)
			expect(tasks[0]?.description).toBe("Setup the environment")
			expect(tasks[0]?.completed).toBe(false)
			expect(tasks[2]?.description).toBe("Write tests")
			expect(tasks[2]?.completed).toBe(true)
		})

		test("parses plain bullet tasks", () => {
			const tasks = getTasks(BULLET_PLAN)

			expect(tasks.length).toBe(4)
			expect(tasks[0]?.description).toBe("First bullet task")
			expect(tasks[0]?.completed).toBe(false)
			expect(tasks[2]?.description).toBe("Third bullet with asterisk")
			expect(tasks[2]?.completed).toBe(false)
			expect(tasks[3]?.description).toBe("Fourth bullet done")
			expect(tasks[3]?.completed).toBe(true)
		})
	})

	describe("getUncompletedTasks", () => {
		test("returns only uncompleted tasks", () => {
			const tasks = getUncompletedTasks(SAMPLE_PLAN)

			expect(tasks.length).toBe(3)
			expect(tasks.every((t) => !t.completed)).toBe(true)
		})

		test("returns empty array when all tasks are complete", () => {
			const plan = `# Plan
- [x] Done one
- [X] Done two
`
			const tasks = getUncompletedTasks(plan)

			expect(tasks.length).toBe(0)
		})
	})

	describe("markTaskComplete", () => {
		test("marks uncompleted task as complete", () => {
			const updated = markTaskComplete(SAMPLE_PLAN, 9) // Line number of first task

			expect(updated).toContain("- [x] Task one: Do the first thing")
		})

		test("preserves already completed tasks", () => {
			const updated = markTaskComplete(SAMPLE_PLAN, 11) // Line of already completed task

			// Should still have the original [x]
			expect(updated).toContain("- [x] Task three: Already done")
		})

		test("handles invalid line number gracefully", () => {
			const updated = markTaskComplete(SAMPLE_PLAN, 999)

			expect(updated).toBe(SAMPLE_PLAN)
		})

		test("marks numbered task with [DONE] marker", () => {
			const updated = markTaskComplete(NUMBERED_PLAN, 5) // Line of "1. First task to do"

			expect(updated).toContain("1. [DONE] First task to do")
		})

		test("marks step header task with [DONE] marker", () => {
			const updated = markTaskComplete(STEP_HEADER_PLAN, 4) // Line of "### Step 1: Setup"

			expect(updated).toContain("### Step 1: [DONE] Setup the environment")
		})

		test("marks bullet task with [DONE] marker", () => {
			const updated = markTaskComplete(BULLET_PLAN, 5) // Line of "- First bullet task"

			expect(updated).toContain("- [DONE] First bullet task")
		})

		test("marks fallback task by prepending [COMPLETED]", () => {
			const plan = "# Plan\nThis is unstructured content that becomes a single task"
			const updated = markTaskComplete(plan, 1)

			expect(updated).toStartWith("[COMPLETED]")

			// After marking complete, getTasks should return completed task
			const tasks = getTasks(updated)
			expect(tasks.length).toBe(1)
			expect(tasks[0]?.completed).toBe(true)
		})
	})

	describe("validatePlan", () => {
		test("valid plan with tasks", () => {
			const result = validatePlan(SAMPLE_PLAN)

			expect(result.valid).toBe(true)
			expect(result.error).toBeUndefined()
		})

		test("invalid empty plan", () => {
			const result = validatePlan("")

			expect(result.valid).toBe(false)
			expect(result.error).toBe("Plan is empty")
		})

		test("invalid plan without tasks falls back to single task", () => {
			const result = validatePlan("# Plan\nSome content without structured tasks")

			// Now valid because we fall back to treating it as a single task
			expect(result.valid).toBe(true)
		})

		test("invalid plan with all tasks completed", () => {
			const result = validatePlan("# Plan\n- [x] Done task")

			expect(result.valid).toBe(false)
			expect(result.error).toBe("All tasks are already completed")
		})

		test("valid plan with numbered tasks", () => {
			const result = validatePlan(NUMBERED_PLAN)

			expect(result.valid).toBe(true)
		})

		test("valid plan with step headers", () => {
			const result = validatePlan(STEP_HEADER_PLAN)

			expect(result.valid).toBe(true)
		})

		test("valid plan with bullet tasks", () => {
			const result = validatePlan(BULLET_PLAN)

			expect(result.valid).toBe(true)
		})
	})

	describe("extractPlanFromResponse", () => {
		test("extracts plan from markdown code block", () => {
			const response = `Here's the plan:

\`\`\`markdown
# Plan: Test
- [ ] Task one
\`\`\`

Done!`

			const plan = extractPlanFromResponse(response)

			expect(plan).toBe("# Plan: Test\n- [ ] Task one")
		})

		test("extracts plan from code block without language", () => {
			const response = `\`\`\`
# Plan
- [ ] Task
\`\`\``

			const plan = extractPlanFromResponse(response)

			expect(plan).toBe("# Plan\n- [ ] Task")
		})

		test("returns trimmed response when no code block", () => {
			const response = "  # Plan\n- [ ] Task  "

			const plan = extractPlanFromResponse(response)

			expect(plan).toBe("# Plan\n- [ ] Task")
		})
	})
})
