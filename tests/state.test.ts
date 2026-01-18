/**
 * Tests for state module
 */

import { describe, expect, test, beforeEach, afterEach } from "bun:test"
import { mkdirSync, rmSync, existsSync } from "node:fs"
import { join } from "node:path"
import { loadState, saveState, resetState, newCycleState } from "../src/state.ts"

const TEST_DIR = "/tmp/opencoder-test-state"

describe("state", () => {
	beforeEach(() => {
		if (existsSync(TEST_DIR)) {
			rmSync(TEST_DIR, { recursive: true })
		}
		mkdirSync(TEST_DIR, { recursive: true })
	})

	afterEach(() => {
		if (existsSync(TEST_DIR)) {
			rmSync(TEST_DIR, { recursive: true })
		}
	})

	describe("loadState", () => {
		test("returns default state when file does not exist", async () => {
			const stateFile = join(TEST_DIR, "nonexistent.json")
			const state = await loadState(stateFile)

			expect(state.cycle).toBe(1)
			expect(state.phase).toBe("init")
			expect(state.taskIndex).toBe(0)
			expect(state.totalTasks).toBe(0)
		})

		test("loads state from existing file", async () => {
			const stateFile = join(TEST_DIR, "state.json")
			const savedState = {
				cycle: 5,
				phase: "build",
				taskIndex: 2,
				lastUpdate: "2024-01-01T00:00:00Z",
			}
			await Bun.write(stateFile, JSON.stringify(savedState))

			const state = await loadState(stateFile)

			expect(state.cycle).toBe(5)
			expect(state.phase).toBe("build")
			expect(state.taskIndex).toBe(2)
		})

		test("returns default state for invalid JSON", async () => {
			const stateFile = join(TEST_DIR, "invalid.json")
			await Bun.write(stateFile, "not valid json")

			const state = await loadState(stateFile)

			expect(state.cycle).toBe(1)
			expect(state.phase).toBe("init")
		})

		test("handles missing fields with defaults", async () => {
			const stateFile = join(TEST_DIR, "partial.json")
			await Bun.write(stateFile, JSON.stringify({ cycle: 10 }))

			const state = await loadState(stateFile)

			expect(state.cycle).toBe(10)
			expect(state.phase).toBe("init") // default
			expect(state.taskIndex).toBe(0) // default
		})
	})

	describe("saveState", () => {
		test("saves state to file", async () => {
			const stateFile = join(TEST_DIR, "save-test.json")
			const state = {
				cycle: 3,
				phase: "plan" as const,
				taskIndex: 1,
				totalTasks: 5,
				currentTaskNum: 1,
				currentTaskDesc: "Test task",
				lastUpdate: "",
			}

			await saveState(stateFile, state)

			const content = await Bun.file(stateFile).text()
			const saved = JSON.parse(content)

			expect(saved.cycle).toBe(3)
			expect(saved.phase).toBe("plan")
			expect(saved.taskIndex).toBe(1)
			expect(saved.lastUpdate).toBeTruthy()
		})
	})

	describe("resetState", () => {
		test("returns initial state values", () => {
			const state = resetState()

			expect(state.cycle).toBe(1)
			expect(state.phase).toBe("init")
			expect(state.taskIndex).toBe(0)
			expect(state.totalTasks).toBe(0)
			expect(state.lastUpdate).toBeTruthy()
		})
	})

	describe("newCycleState", () => {
		test("increments cycle and resets to plan", () => {
			const newState = newCycleState(5)

			expect(newState.cycle).toBe(6)
			expect(newState.phase).toBe("plan")
			expect(newState.taskIndex).toBe(0)
			expect(newState.totalTasks).toBe(0)
		})
	})
})
