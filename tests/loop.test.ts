/**
 * Tests for loop module
 */

import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test"
import { existsSync, mkdirSync, readdirSync, rmSync } from "node:fs"
import { join } from "node:path"
import { Logger } from "../src/logger.ts"
import {
	archivePlan,
	calculateBackoff,
	getCycleElapsedTime,
	isCycleTimedOut,
	isShutdownRequested,
	logStartupInfo,
	requestShutdown,
	resetShutdownFlags,
	sleep,
} from "../src/loop.ts"
import type { Config, Paths, RuntimeState } from "../src/types.ts"

const TEST_DIR = "/tmp/opencoder-test-loop"

/** Create a test Paths object pointing to our temp directory */
function createTestPaths(): Paths {
	return {
		opencoderDir: TEST_DIR,
		stateFile: join(TEST_DIR, "state.json"),
		currentPlan: join(TEST_DIR, "current_plan.md"),
		mainLog: join(TEST_DIR, "logs", "main.log"),
		cycleLogDir: join(TEST_DIR, "logs", "cycles"),
		alertsFile: join(TEST_DIR, "alerts.log"),
		historyDir: join(TEST_DIR, "history"),
		ideasDir: join(TEST_DIR, "ideas"),
		ideasHistoryDir: join(TEST_DIR, "ideas", "history"),
		configFile: join(TEST_DIR, "config.json"),
		metricsFile: join(TEST_DIR, "metrics.json"),
	}
}

/** Create a test Config object */
function createTestConfig(overrides?: Partial<Config>): Config {
	return {
		planModel: "anthropic/claude-sonnet-4",
		buildModel: "anthropic/claude-sonnet-4",
		projectDir: TEST_DIR,
		verbose: false,
		maxRetries: 3,
		backoffBase: 10,
		logRetention: 30,
		taskPauseSeconds: 2,
		autoCommit: true,
		autoPush: true,
		commitSignoff: false,
		cycleTimeoutMinutes: 60,
		...overrides,
	}
}

/** Create a test RuntimeState object */
function createTestState(overrides?: Partial<RuntimeState>): RuntimeState {
	return {
		cycle: 1,
		phase: "plan",
		taskIndex: 0,
		lastUpdate: new Date().toISOString(),
		retryCount: 0,
		totalTasks: 0,
		currentTaskNum: 0,
		currentTaskDesc: "",
		...overrides,
	}
}

describe("loop", () => {
	let paths: Paths
	let consoleLogMock: ReturnType<typeof mock>
	let consoleErrorMock: ReturnType<typeof mock>
	let originalConsoleLog: typeof console.log
	let originalConsoleError: typeof console.error

	beforeEach(() => {
		// Clean and create test directory
		if (existsSync(TEST_DIR)) {
			rmSync(TEST_DIR, { recursive: true })
		}
		mkdirSync(TEST_DIR, { recursive: true })
		mkdirSync(join(TEST_DIR, "logs", "cycles"), { recursive: true })
		mkdirSync(join(TEST_DIR, "history"), { recursive: true })

		paths = createTestPaths()

		// Mock console methods
		originalConsoleLog = console.log
		originalConsoleError = console.error
		consoleLogMock = mock(() => {})
		consoleErrorMock = mock(() => {})
		console.log = consoleLogMock
		console.error = consoleErrorMock

		// Reset shutdown flags before each test
		resetShutdownFlags()
	})

	afterEach(() => {
		// Restore console methods
		console.log = originalConsoleLog
		console.error = originalConsoleError

		// Clean up test directory
		if (existsSync(TEST_DIR)) {
			rmSync(TEST_DIR, { recursive: true })
		}

		// Reset shutdown flags after each test
		resetShutdownFlags()
	})

	describe("sleep", () => {
		test("resolves after specified milliseconds", async () => {
			const start = Date.now()
			await sleep(50)
			const elapsed = Date.now() - start

			// Allow some tolerance for timing
			expect(elapsed).toBeGreaterThanOrEqual(45)
			expect(elapsed).toBeLessThan(150)
		})

		test("resolves immediately for 0ms", async () => {
			const start = Date.now()
			await sleep(0)
			const elapsed = Date.now() - start

			expect(elapsed).toBeLessThan(50)
		})

		test("returns a promise", () => {
			const result = sleep(1)
			expect(result).toBeInstanceOf(Promise)
		})
	})

	describe("calculateBackoff", () => {
		test("first retry uses base delay", () => {
			const delay = calculateBackoff(1, 10)
			// Base is 10 seconds = 10000ms, with up to 20% jitter
			expect(delay).toBeGreaterThanOrEqual(10000)
			expect(delay).toBeLessThanOrEqual(12000)
		})

		test("second retry doubles delay", () => {
			const delay = calculateBackoff(2, 10)
			// 10 * 2^1 = 20 seconds, with jitter
			expect(delay).toBeGreaterThanOrEqual(20000)
			expect(delay).toBeLessThanOrEqual(24000)
		})

		test("third retry quadruples delay", () => {
			const delay = calculateBackoff(3, 10)
			// 10 * 2^2 = 40 seconds, with jitter
			expect(delay).toBeGreaterThanOrEqual(40000)
			expect(delay).toBeLessThanOrEqual(48000)
		})

		test("caps at 5 minutes maximum", () => {
			const delay = calculateBackoff(10, 10)
			// Should cap at 300 seconds (5 min), with jitter
			expect(delay).toBeGreaterThanOrEqual(300000)
			expect(delay).toBeLessThanOrEqual(360000)
		})

		test("works with different base values", () => {
			const delay = calculateBackoff(1, 5)
			// Base is 5 seconds = 5000ms, with jitter
			expect(delay).toBeGreaterThanOrEqual(5000)
			expect(delay).toBeLessThanOrEqual(6000)
		})

		test("returns milliseconds", () => {
			const delay = calculateBackoff(1, 1)
			// 1 second base = ~1000-1200ms with jitter
			expect(delay).toBeGreaterThanOrEqual(1000)
			expect(delay).toBeLessThanOrEqual(1200)
		})

		test("is non-negative", () => {
			const delay = calculateBackoff(1, 0)
			expect(delay).toBeGreaterThanOrEqual(0)
		})
	})

	describe("isShutdownRequested", () => {
		test("returns false initially", () => {
			resetShutdownFlags()
			expect(isShutdownRequested()).toBe(false)
		})

		test("returns true after requestShutdown is called", () => {
			resetShutdownFlags()
			requestShutdown()
			expect(isShutdownRequested()).toBe(true)
		})

		test("returns false after resetShutdownFlags is called", () => {
			requestShutdown()
			expect(isShutdownRequested()).toBe(true)
			resetShutdownFlags()
			expect(isShutdownRequested()).toBe(false)
		})

		test("returns boolean type", () => {
			resetShutdownFlags()
			const result = isShutdownRequested()
			expect(typeof result).toBe("boolean")
		})

		test("is consistent across multiple calls", () => {
			resetShutdownFlags()
			expect(isShutdownRequested()).toBe(false)
			expect(isShutdownRequested()).toBe(false)
			expect(isShutdownRequested()).toBe(false)

			requestShutdown()
			expect(isShutdownRequested()).toBe(true)
			expect(isShutdownRequested()).toBe(true)
			expect(isShutdownRequested()).toBe(true)
		})

		test("state persists until explicitly reset", () => {
			resetShutdownFlags()

			// Verify initial state
			expect(isShutdownRequested()).toBe(false)

			// Request shutdown
			requestShutdown()
			expect(isShutdownRequested()).toBe(true)

			// Call multiple times - should still be true
			for (let i = 0; i < 5; i++) {
				expect(isShutdownRequested()).toBe(true)
			}

			// Reset
			resetShutdownFlags()
			expect(isShutdownRequested()).toBe(false)
		})

		test("works correctly in rapid succession", () => {
			resetShutdownFlags()

			// Rapid toggle
			for (let i = 0; i < 10; i++) {
				expect(isShutdownRequested()).toBe(false)
				requestShutdown()
				expect(isShutdownRequested()).toBe(true)
				resetShutdownFlags()
			}

			expect(isShutdownRequested()).toBe(false)
		})
	})

	describe("requestShutdown", () => {
		test("sets shutdown flag to true", () => {
			resetShutdownFlags()
			expect(isShutdownRequested()).toBe(false)
			requestShutdown()
			expect(isShutdownRequested()).toBe(true)
		})

		test("can be called multiple times without error", () => {
			resetShutdownFlags()
			requestShutdown()
			requestShutdown()
			requestShutdown()
			expect(isShutdownRequested()).toBe(true)
		})
	})

	describe("resetShutdownFlags", () => {
		test("resets shutdown flag to false", () => {
			requestShutdown()
			expect(isShutdownRequested()).toBe(true)
			resetShutdownFlags()
			expect(isShutdownRequested()).toBe(false)
		})

		test("can be called multiple times without error", () => {
			resetShutdownFlags()
			resetShutdownFlags()
			resetShutdownFlags()
			expect(isShutdownRequested()).toBe(false)
		})
	})

	describe("logStartupInfo", () => {
		test("logs version information", () => {
			const logger = new Logger(paths, false)
			const config = createTestConfig()

			logStartupInfo(logger, config)

			// Check that version is logged (default is 1.0.0 when VERSION is not defined)
			const calls = consoleLogMock.mock.calls.map((c) => c[0])
			const versionLogged = calls.some(
				(call: string) => typeof call === "string" && call.includes("OpenCoder v"),
			)
			expect(versionLogged).toBe(true)
		})

		test("logs project directory", () => {
			const logger = new Logger(paths, false)
			const config = createTestConfig({ projectDir: "/my/project/dir" })

			logStartupInfo(logger, config)

			const calls = consoleLogMock.mock.calls.map((c) => c[0])
			const projectLogged = calls.some(
				(call: string) => typeof call === "string" && call.includes("/my/project/dir"),
			)
			expect(projectLogged).toBe(true)
		})

		test("logs plan model", () => {
			const logger = new Logger(paths, false)
			const config = createTestConfig({ planModel: "openai/gpt-4o" })

			logStartupInfo(logger, config)

			const calls = consoleLogMock.mock.calls.map((c) => c[0])
			const modelLogged = calls.some(
				(call: string) => typeof call === "string" && call.includes("openai/gpt-4o"),
			)
			expect(modelLogged).toBe(true)
		})

		test("logs build model", () => {
			const logger = new Logger(paths, false)
			const config = createTestConfig({ buildModel: "google/gemini-2.0-flash" })

			logStartupInfo(logger, config)

			const calls = consoleLogMock.mock.calls.map((c) => c[0])
			const modelLogged = calls.some(
				(call: string) => typeof call === "string" && call.includes("google/gemini-2.0-flash"),
			)
			expect(modelLogged).toBe(true)
		})

		test("logs user hint when provided", () => {
			const logger = new Logger(paths, false)
			const config = createTestConfig({ userHint: "focus on tests" })

			logStartupInfo(logger, config)

			const calls = consoleLogMock.mock.calls.map((c) => c[0])
			const hintLogged = calls.some(
				(call: string) => typeof call === "string" && call.includes("focus on tests"),
			)
			expect(hintLogged).toBe(true)
		})

		test("does not log hint when not provided", () => {
			const logger = new Logger(paths, false)
			const config = createTestConfig({ userHint: undefined })

			logStartupInfo(logger, config)

			const calls = consoleLogMock.mock.calls.map((c) => c[0])
			const hintLogged = calls.some(
				(call: string) => typeof call === "string" && call.includes("Hint:"),
			)
			expect(hintLogged).toBe(false)
		})

		test("outputs multiple lines", () => {
			const logger = new Logger(paths, false)
			const config = createTestConfig()

			logStartupInfo(logger, config)

			// Should log at least 5 lines (version, project, plan model, build model, empty line)
			expect(consoleLogMock.mock.calls.length).toBeGreaterThanOrEqual(5)
		})
	})

	describe("archivePlan", () => {
		test("archives plan file to history directory", async () => {
			const logger = new Logger(paths, false)

			// Create a plan file
			const planContent = "# Plan: Test Plan\n\n## Tasks\n- [ ] Task 1"
			await Bun.write(paths.currentPlan, planContent)

			await archivePlan(paths, 1, logger)

			// Check that a file was created in history directory
			const historyFiles = readdirSync(paths.historyDir)
			expect(historyFiles.length).toBe(1)

			// Check filename format
			const filename = historyFiles[0]
			expect(filename).toMatch(/^plan_\d{8}_\d{6}_cycle1\.md$/)

			// Check content
			const archivedContent = await Bun.file(join(paths.historyDir, filename as string)).text()
			expect(archivedContent).toBe(planContent)
		})

		test("includes cycle number in filename", async () => {
			const logger = new Logger(paths, false)

			await Bun.write(paths.currentPlan, "# Plan for cycle 42")

			await archivePlan(paths, 42, logger)

			const historyFiles = readdirSync(paths.historyDir)
			expect(historyFiles.length).toBe(1)

			const filename = historyFiles[0]
			expect(filename).toContain("cycle42")
		})

		test("does nothing if plan file does not exist", async () => {
			const logger = new Logger(paths, false)

			// Don't create a plan file
			await archivePlan(paths, 1, logger)

			// History should be empty
			const historyFiles = readdirSync(paths.historyDir)
			expect(historyFiles.length).toBe(0)
		})

		test("logs archive filename in verbose mode", async () => {
			const logger = new Logger(paths, true) // verbose = true

			await Bun.write(paths.currentPlan, "# Plan content")

			await archivePlan(paths, 5, logger)

			// Check verbose output includes filename
			const calls = consoleLogMock.mock.calls.map((c) => c[0])
			const archiveLogged = calls.some(
				(call: string) => typeof call === "string" && call.includes("Plan archived to"),
			)
			expect(archiveLogged).toBe(true)
		})

		test("preserves plan content exactly", async () => {
			const logger = new Logger(paths, false)

			const planContent = `# Plan: Complex Plan
Created: 2026-01-18T00:00:00Z
Cycle: 3

## Context
Testing plan archival with special characters: <>&"'

## Tasks
- [x] Task 1: Completed
- [ ] Task 2: Pending
- [ ] Task 3: Also pending

## Notes
Some notes with Unicode: 日本語 🎉`

			await Bun.write(paths.currentPlan, planContent)

			await archivePlan(paths, 3, logger)

			const historyFiles = readdirSync(paths.historyDir)
			const filename = historyFiles[0]
			const archivedContent = await Bun.file(join(paths.historyDir, filename as string)).text()

			expect(archivedContent).toBe(planContent)
		})
	})

	describe("isCycleTimedOut", () => {
		test("returns false when timeout is disabled (0)", () => {
			const state = createTestState({
				cycleStartTime: new Date(Date.now() - 120 * 60 * 1000).toISOString(), // 2 hours ago
			})
			const config = createTestConfig({ cycleTimeoutMinutes: 0 })

			expect(isCycleTimedOut(state, config)).toBe(false)
		})

		test("returns false when no start time is set", () => {
			const state = createTestState({ cycleStartTime: undefined })
			const config = createTestConfig({ cycleTimeoutMinutes: 60 })

			expect(isCycleTimedOut(state, config)).toBe(false)
		})

		test("returns false when within timeout", () => {
			const state = createTestState({
				cycleStartTime: new Date(Date.now() - 30 * 60 * 1000).toISOString(), // 30 minutes ago
			})
			const config = createTestConfig({ cycleTimeoutMinutes: 60 })

			expect(isCycleTimedOut(state, config)).toBe(false)
		})

		test("returns true when timeout exceeded", () => {
			const state = createTestState({
				cycleStartTime: new Date(Date.now() - 65 * 60 * 1000).toISOString(), // 65 minutes ago
			})
			const config = createTestConfig({ cycleTimeoutMinutes: 60 })

			expect(isCycleTimedOut(state, config)).toBe(true)
		})

		test("returns true exactly at timeout", () => {
			const state = createTestState({
				cycleStartTime: new Date(Date.now() - 60 * 60 * 1000).toISOString(), // Exactly 60 minutes ago
			})
			const config = createTestConfig({ cycleTimeoutMinutes: 60 })

			expect(isCycleTimedOut(state, config)).toBe(true)
		})

		test("works with short timeout values", () => {
			const state = createTestState({
				cycleStartTime: new Date(Date.now() - 2 * 60 * 1000).toISOString(), // 2 minutes ago
			})
			const config = createTestConfig({ cycleTimeoutMinutes: 1 })

			expect(isCycleTimedOut(state, config)).toBe(true)
		})
	})

	describe("getCycleElapsedTime", () => {
		test("returns empty string when no start time", () => {
			const state = createTestState({ cycleStartTime: undefined })

			expect(getCycleElapsedTime(state)).toBe("")
		})

		test("returns seconds only for short durations", () => {
			const state = createTestState({
				cycleStartTime: new Date(Date.now() - 30 * 1000).toISOString(), // 30 seconds ago
			})

			const elapsed = getCycleElapsedTime(state)
			expect(elapsed).toMatch(/^\d+s$/)
		})

		test("returns minutes and seconds for longer durations", () => {
			const state = createTestState({
				cycleStartTime: new Date(Date.now() - (5 * 60 + 30) * 1000).toISOString(), // 5m 30s ago
			})

			const elapsed = getCycleElapsedTime(state)
			expect(elapsed).toMatch(/^\d+m \d+s$/)
		})

		test("handles hours worth of minutes", () => {
			const state = createTestState({
				cycleStartTime: new Date(Date.now() - 90 * 60 * 1000).toISOString(), // 90 minutes ago
			})

			const elapsed = getCycleElapsedTime(state)
			expect(elapsed).toContain("90m")
		})
	})
})
