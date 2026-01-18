/**
 * Tests for Logger class
 */

import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test"
import { existsSync, mkdirSync, rmSync } from "node:fs"
import { join } from "node:path"
import { Logger } from "../src/logger.ts"
import type { Paths } from "../src/types.ts"

const TEST_DIR = "/tmp/opencoder-test-logger"

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

/** Helper to get the first mock call argument safely */
function getFirstCallArg(mockFn: ReturnType<typeof mock>): string {
	const call = mockFn.mock.calls[0]
	if (!call) throw new Error("Expected mock to be called")
	return call[0] as string
}

/** Helper to get a specific mock call argument safely */
function getCallArg(mockFn: ReturnType<typeof mock>, callIndex: number): string {
	const call = mockFn.mock.calls[callIndex]
	if (!call) throw new Error(`Expected mock to be called at index ${callIndex}`)
	return call[0] as string
}

describe("Logger", () => {
	let paths: Paths
	let consoleLogMock: ReturnType<typeof mock>
	let consoleErrorMock: ReturnType<typeof mock>
	let stdoutWriteMock: ReturnType<typeof mock>
	let originalConsoleLog: typeof console.log
	let originalConsoleError: typeof console.error
	let originalStdoutWrite: typeof process.stdout.write

	beforeEach(() => {
		// Clean and create test directory
		if (existsSync(TEST_DIR)) {
			rmSync(TEST_DIR, { recursive: true })
		}
		mkdirSync(TEST_DIR, { recursive: true })
		mkdirSync(join(TEST_DIR, "logs", "cycles"), { recursive: true })

		paths = createTestPaths()

		// Mock console methods
		originalConsoleLog = console.log
		originalConsoleError = console.error
		originalStdoutWrite = process.stdout.write.bind(process.stdout)
		consoleLogMock = mock(() => {})
		consoleErrorMock = mock(() => {})
		stdoutWriteMock = mock(() => true)
		console.log = consoleLogMock
		console.error = consoleErrorMock
		process.stdout.write = stdoutWriteMock as typeof process.stdout.write
	})

	afterEach(() => {
		// Restore console methods
		console.log = originalConsoleLog
		console.error = originalConsoleError
		process.stdout.write = originalStdoutWrite

		// Clean up test directory
		if (existsSync(TEST_DIR)) {
			rmSync(TEST_DIR, { recursive: true })
		}
	})

	describe("constructor", () => {
		test("creates logger with paths and verbose=false", () => {
			const logger = new Logger(paths, false)
			expect(logger).toBeDefined()
		})

		test("creates logger with paths and verbose=true", () => {
			const logger = new Logger(paths, true)
			expect(logger).toBeDefined()
		})
	})

	describe("log", () => {
		test("writes to buffer without console output", () => {
			const logger = new Logger(paths, false)

			logger.log("test message")

			// Should not output to console
			expect(consoleLogMock).not.toHaveBeenCalled()
		})

		test("adds message to buffer for later flush", async () => {
			const logger = new Logger(paths, false)

			logger.log("buffered message")
			logger.flush()

			// Check file was written
			const content = await Bun.file(paths.mainLog).text()
			expect(content).toContain("buffered message")
		})
	})

	describe("say", () => {
		test("outputs message to console", () => {
			const logger = new Logger(paths, false)

			logger.say("hello world")

			expect(consoleLogMock).toHaveBeenCalledWith("hello world")
		})

		test("writes message to log buffer", async () => {
			const logger = new Logger(paths, false)

			logger.say("logged message")
			logger.flush()

			const content = await Bun.file(paths.mainLog).text()
			expect(content).toContain("logged message")
		})
	})

	describe("info", () => {
		test("outputs blue-colored message to console", () => {
			const logger = new Logger(paths, false)

			logger.info("info message")

			expect(consoleLogMock).toHaveBeenCalled()
			const output = getFirstCallArg(consoleLogMock)
			expect(output).toContain("info message")
			// Check for ANSI blue color code
			expect(output).toContain("\x1b[34m")
		})

		test("writes message to log buffer", async () => {
			const logger = new Logger(paths, false)

			logger.info("info for log")
			logger.flush()

			const content = await Bun.file(paths.mainLog).text()
			expect(content).toContain("info for log")
		})
	})

	describe("success", () => {
		test("outputs green-colored message to console", () => {
			const logger = new Logger(paths, false)

			logger.success("success message")

			expect(consoleLogMock).toHaveBeenCalled()
			const output = getFirstCallArg(consoleLogMock)
			expect(output).toContain("success message")
			// Check for ANSI green color code
			expect(output).toContain("\x1b[32m")
		})

		test("writes message to log buffer", async () => {
			const logger = new Logger(paths, false)

			logger.success("success for log")
			logger.flush()

			const content = await Bun.file(paths.mainLog).text()
			expect(content).toContain("success for log")
		})
	})

	describe("warn", () => {
		test("outputs yellow-colored message with [WARN] prefix", () => {
			const logger = new Logger(paths, false)

			logger.warn("warning message")

			expect(consoleLogMock).toHaveBeenCalled()
			const output = getFirstCallArg(consoleLogMock)
			expect(output).toContain("[WARN]")
			expect(output).toContain("warning message")
			// Check for ANSI yellow color code
			expect(output).toContain("\x1b[33m")
		})

		test("writes [WARN] prefixed message to log buffer", async () => {
			const logger = new Logger(paths, false)

			logger.warn("warning for log")
			logger.flush()

			const content = await Bun.file(paths.mainLog).text()
			expect(content).toContain("[WARN] warning for log")
		})
	})

	describe("logError", () => {
		test("outputs red-colored message with [ERROR] prefix to stderr", () => {
			const logger = new Logger(paths, false)

			logger.logError("error message")

			expect(consoleErrorMock).toHaveBeenCalled()
			const output = getFirstCallArg(consoleErrorMock)
			expect(output).toContain("[ERROR]")
			expect(output).toContain("error message")
			// Check for ANSI red color code
			expect(output).toContain("\x1b[31m")
		})

		test("writes [ERROR] prefixed message to log buffer", async () => {
			const logger = new Logger(paths, false)

			logger.logError("error for log")
			logger.flush()

			const content = await Bun.file(paths.mainLog).text()
			expect(content).toContain("[ERROR] error for log")
		})

		test("writes error to alerts file", async () => {
			const logger = new Logger(paths, false)

			logger.logError("critical error")

			// Alerts are written immediately, not buffered
			const content = await Bun.file(paths.alertsFile).text()
			expect(content).toContain("critical error")
		})
	})

	describe("logVerbose", () => {
		test("outputs message when verbose is true", () => {
			const logger = new Logger(paths, true)

			logger.logVerbose("verbose message")

			expect(consoleLogMock).toHaveBeenCalled()
			const output = getFirstCallArg(consoleLogMock)
			expect(output).toContain("[VERBOSE]")
			expect(output).toContain("verbose message")
		})

		test("does not output to console when verbose is false", () => {
			const logger = new Logger(paths, false)

			logger.logVerbose("verbose message")

			expect(consoleLogMock).not.toHaveBeenCalled()
		})

		test("always writes to log buffer regardless of verbose setting", async () => {
			const logger = new Logger(paths, false)

			logger.logVerbose("verbose for log")
			logger.flush()

			const content = await Bun.file(paths.mainLog).text()
			expect(content).toContain("[VERBOSE] verbose for log")
		})

		test("includes dim ANSI formatting when verbose is true", () => {
			const logger = new Logger(paths, true)

			logger.logVerbose("dim message")

			const output = getFirstCallArg(consoleLogMock)
			// Check for ANSI dim code
			expect(output).toContain("\x1b[2m")
		})
	})

	describe("log buffer flushing", () => {
		test("auto-flushes when buffer exceeds threshold", async () => {
			const logger = new Logger(paths, false)

			// Write enough data to trigger auto-flush (BUFFER_SIZE = 2048)
			for (let i = 0; i < 50; i++) {
				logger.log("a".repeat(100))
			}

			// Should have auto-flushed to file
			const content = await Bun.file(paths.mainLog).text()
			expect(content.length).toBeGreaterThan(0)
		})

		test("flush does nothing when buffer is empty", () => {
			const logger = new Logger(paths, false)

			// Should not throw
			logger.flush()
			logger.flush()
		})
	})

	describe("log file format", () => {
		test("includes timestamp in log entries", async () => {
			const logger = new Logger(paths, false)

			logger.say("timestamped message")
			logger.flush()

			const content = await Bun.file(paths.mainLog).text()
			// Timestamp format: [YYYY-MM-DD HH:MM:SS]
			expect(content).toMatch(/\[\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\]/)
		})
	})

	describe("header", () => {
		test("outputs title with separator lines", () => {
			const logger = new Logger(paths, false)

			logger.header("TEST HEADER")

			// Should output 3 lines: separator, title, separator
			expect(consoleLogMock.mock.calls.length).toBe(3)
			const line1 = getCallArg(consoleLogMock, 0)
			const line2 = getCallArg(consoleLogMock, 1)
			const line3 = getCallArg(consoleLogMock, 2)

			// First and last should be separator lines with '='
			expect(line1).toContain("=".repeat(60))
			expect(line2).toBe("TEST HEADER")
			expect(line3).toContain("=".repeat(60))
		})

		test("uses custom separator character", () => {
			const logger = new Logger(paths, false)

			logger.header("CUSTOM", "#")

			const line1 = getCallArg(consoleLogMock, 0)
			expect(line1).toContain("#".repeat(60))
		})

		test("writes header to log buffer", async () => {
			const logger = new Logger(paths, false)

			logger.header("LOGGED HEADER")
			logger.flush()

			const content = await Bun.file(paths.mainLog).text()
			expect(content).toContain("LOGGED HEADER")
			expect(content).toContain("=".repeat(60))
		})
	})

	describe("subheader", () => {
		test("outputs title with dash separator lines", () => {
			const logger = new Logger(paths, false)

			logger.subheader("SUB HEADER")

			// Should output 3 lines: separator, title, separator
			expect(consoleLogMock.mock.calls.length).toBe(3)
			const line1 = getCallArg(consoleLogMock, 0)
			const line2 = getCallArg(consoleLogMock, 1)
			const line3 = getCallArg(consoleLogMock, 2)

			// First and last should be separator lines with '-'
			expect(line1).toContain("-".repeat(60))
			expect(line2).toBe("SUB HEADER")
			expect(line3).toContain("-".repeat(60))
		})

		test("writes subheader to log buffer", async () => {
			const logger = new Logger(paths, false)

			logger.subheader("LOGGED SUBHEADER")
			logger.flush()

			const content = await Bun.file(paths.mainLog).text()
			expect(content).toContain("LOGGED SUBHEADER")
			expect(content).toContain("-".repeat(60))
		})
	})

	describe("stream", () => {
		test("writes text to stdout without newline", () => {
			const logger = new Logger(paths, false)

			logger.stream("streaming text")

			expect(stdoutWriteMock).toHaveBeenCalled()
			const output = getFirstCallArg(stdoutWriteMock)
			expect(output).toBe("streaming text")
		})

		test("writes streamed text to log buffer", async () => {
			const logger = new Logger(paths, false)

			logger.stream("streamed content")
			logger.flush()

			const content = await Bun.file(paths.mainLog).text()
			expect(content).toContain("streamed content")
		})
	})

	describe("streamEnd", () => {
		test("outputs a newline via console.log", () => {
			const logger = new Logger(paths, false)

			logger.streamEnd()

			// console.log() with no args outputs a newline
			expect(consoleLogMock).toHaveBeenCalledWith()
		})
	})

	describe("toolCall", () => {
		test("outputs tool name with cyan color and tool symbol", () => {
			const logger = new Logger(paths, false)

			logger.toolCall("Read")

			expect(consoleLogMock).toHaveBeenCalled()
			const output = getFirstCallArg(consoleLogMock)
			expect(output).toContain("Read")
			// Check for ANSI cyan color code
			expect(output).toContain("\x1b[36m")
			// Check for tool symbol
			expect(output).toContain("🔧")
		})

		test("includes string input parameter", () => {
			const logger = new Logger(paths, false)

			logger.toolCall("Read", "/path/to/file.ts")

			const output = getFirstCallArg(consoleLogMock)
			expect(output).toContain("/path/to/file.ts")
		})

		test("truncates long string input", () => {
			const logger = new Logger(paths, false)
			const longInput = "a".repeat(100)

			logger.toolCall("Write", longInput)

			const output = getFirstCallArg(consoleLogMock)
			expect(output).toContain("...")
			expect(output.length).toBeLessThan(longInput.length + 50)
		})

		test("extracts filePath from object input", () => {
			const logger = new Logger(paths, false)

			logger.toolCall("Read", { filePath: "/src/index.ts" })

			const output = getFirstCallArg(consoleLogMock)
			expect(output).toContain("/src/index.ts")
		})

		test("extracts pattern from object input", () => {
			const logger = new Logger(paths, false)

			logger.toolCall("Glob", { pattern: "**/*.ts" })

			const output = getFirstCallArg(consoleLogMock)
			expect(output).toContain("**/*.ts")
		})

		test("extracts command from object input", () => {
			const logger = new Logger(paths, false)

			logger.toolCall("Bash", { command: "npm test" })

			const output = getFirstCallArg(consoleLogMock)
			expect(output).toContain("npm test")
		})

		test("extracts query from object input", () => {
			const logger = new Logger(paths, false)

			logger.toolCall("Search", { query: "function definition" })

			const output = getFirstCallArg(consoleLogMock)
			expect(output).toContain('"function definition"')
		})

		test("writes tool call to log buffer", async () => {
			const logger = new Logger(paths, false)

			logger.toolCall("Edit", { filePath: "/test.ts" })
			logger.flush()

			const content = await Bun.file(paths.mainLog).text()
			expect(content).toContain("[TOOL] Edit")
		})
	})

	describe("toolResult", () => {
		test("outputs brief result to console when verbose is false", () => {
			const logger = new Logger(paths, false)

			logger.toolResult("result output")

			expect(consoleLogMock).toHaveBeenCalled()
			const output = getFirstCallArg(consoleLogMock)
			expect(output).toContain("result output")
			// Check for result arrow symbol
			expect(output).toContain("→")
		})

		test("outputs result when verbose is true", () => {
			const logger = new Logger(paths, true)

			logger.toolResult("result output")

			expect(consoleLogMock).toHaveBeenCalled()
			const output = getFirstCallArg(consoleLogMock)
			expect(output).toContain("result output")
			// Check for result arrow symbol
			expect(output).toContain("→")
		})

		test("truncates long output at 100 chars in non-verbose mode", () => {
			const logger = new Logger(paths, false)
			const longOutput = "x".repeat(150)

			logger.toolResult(longOutput)

			const output = getFirstCallArg(consoleLogMock)
			expect(output).toContain("...")
			// Should be truncated to 100 chars + "..."
			expect(output.length).toBeLessThan(150)
		})

		test("truncates long output at 200 chars in verbose mode", () => {
			const logger = new Logger(paths, true)
			const longOutput = "x".repeat(300)

			logger.toolResult(longOutput)

			const output = getFirstCallArg(consoleLogMock)
			expect(output).toContain("...")
		})

		test("shows only first line of multiline output", () => {
			const logger = new Logger(paths, true)

			logger.toolResult("first line\nsecond line\nthird line")

			const output = getFirstCallArg(consoleLogMock)
			expect(output).toContain("first line")
			expect(output).not.toContain("second line")
		})

		test("always writes full result to log buffer", async () => {
			const logger = new Logger(paths, false)

			logger.toolResult("full result for log")
			logger.flush()

			const content = await Bun.file(paths.mainLog).text()
			expect(content).toContain("[RESULT] full result for log")
		})
	})

	describe("thinking", () => {
		test("outputs thinking text with magenta color and thinking symbol", () => {
			const logger = new Logger(paths, false)

			logger.thinking("reasoning about the problem")

			expect(consoleLogMock).toHaveBeenCalled()
			const output = getFirstCallArg(consoleLogMock)
			expect(output).toContain("reasoning about the problem")
			// Check for ANSI magenta color code
			expect(output).toContain("\x1b[35m")
			// Check for thinking symbol
			expect(output).toContain("💭")
		})

		test("truncates long thinking text at 150 chars", () => {
			const logger = new Logger(paths, false)
			const longThinking = "t".repeat(200)

			logger.thinking(longThinking)

			const output = getFirstCallArg(consoleLogMock)
			expect(output).toContain("...")
			// Should be truncated to 150 chars + "..."
			// biome-ignore lint/suspicious/noControlCharactersInRegex: ANSI escape codes use control characters
			const thinkingText = output.replace(/\x1b\[\d+m/g, "").replace("💭 ", "")
			expect(thinkingText.length).toBeLessThan(160) // 150 + "..." + some margin
		})

		test("shows only first line of multiline thinking", () => {
			const logger = new Logger(paths, false)

			logger.thinking("first thought\nsecond thought\nthird thought")

			const output = getFirstCallArg(consoleLogMock)
			expect(output).toContain("first thought")
			expect(output).not.toContain("second thought")
		})

		test("writes full thinking to log buffer", async () => {
			const logger = new Logger(paths, false)

			logger.thinking("thinking line 1\nthinking line 2")
			logger.flush()

			const content = await Bun.file(paths.mainLog).text()
			expect(content).toContain("[THINKING] thinking line 1\nthinking line 2")
		})
	})

	describe("tokens", () => {
		test("does not output to console when verbose is false", () => {
			const logger = new Logger(paths, false)

			logger.tokens(1000, 500)

			expect(consoleLogMock).not.toHaveBeenCalled()
		})

		test("outputs token counts when verbose is true", () => {
			const logger = new Logger(paths, true)

			logger.tokens(1500, 750)

			expect(consoleLogMock).toHaveBeenCalled()
			const output = getFirstCallArg(consoleLogMock)
			expect(output).toContain("in: 1500")
			expect(output).toContain("out: 750")
		})

		test("always writes token counts to log buffer", async () => {
			const logger = new Logger(paths, false)

			logger.tokens(2000, 1000)
			logger.flush()

			const content = await Bun.file(paths.mainLog).text()
			expect(content).toContain("[TOKENS] in: 2000, out: 1000")
		})
	})

	describe("setCycleLog", () => {
		test("sets cycle log file path with padded cycle number", async () => {
			const logger = new Logger(paths, false)

			logger.setCycleLog(5)
			logger.say("cycle specific message")
			logger.flush()

			// Check that cycle log was created with correct name
			const cycleLogPath = join(paths.cycleLogDir, "cycle_005.log")
			expect(existsSync(cycleLogPath)).toBe(true)

			const content = await Bun.file(cycleLogPath).text()
			expect(content).toContain("cycle specific message")
		})

		test("pads single digit cycle numbers with zeros", async () => {
			const logger = new Logger(paths, false)

			logger.setCycleLog(1)
			logger.say("first cycle")
			logger.flush()

			const cycleLogPath = join(paths.cycleLogDir, "cycle_001.log")
			expect(existsSync(cycleLogPath)).toBe(true)
		})

		test("pads double digit cycle numbers with one zero", async () => {
			const logger = new Logger(paths, false)

			logger.setCycleLog(42)
			logger.say("cycle 42")
			logger.flush()

			const cycleLogPath = join(paths.cycleLogDir, "cycle_042.log")
			expect(existsSync(cycleLogPath)).toBe(true)
		})

		test("handles triple digit cycle numbers", async () => {
			const logger = new Logger(paths, false)

			logger.setCycleLog(123)
			logger.say("cycle 123")
			logger.flush()

			const cycleLogPath = join(paths.cycleLogDir, "cycle_123.log")
			expect(existsSync(cycleLogPath)).toBe(true)
		})

		test("writes to both main log and cycle log", async () => {
			const logger = new Logger(paths, false)

			logger.setCycleLog(7)
			logger.say("dual log message")
			logger.flush()

			// Check main log
			const mainContent = await Bun.file(paths.mainLog).text()
			expect(mainContent).toContain("dual log message")

			// Check cycle log
			const cycleLogPath = join(paths.cycleLogDir, "cycle_007.log")
			const cycleContent = await Bun.file(cycleLogPath).text()
			expect(cycleContent).toContain("dual log message")
		})
	})

	describe("flush", () => {
		test("writes buffered content to main log file", async () => {
			const logger = new Logger(paths, false)

			logger.log("message 1")
			logger.log("message 2")
			logger.log("message 3")
			logger.flush()

			const content = await Bun.file(paths.mainLog).text()
			expect(content).toContain("message 1")
			expect(content).toContain("message 2")
			expect(content).toContain("message 3")
		})

		test("clears buffer after flush", async () => {
			const logger = new Logger(paths, false)

			logger.log("first batch")
			logger.flush()

			logger.log("second batch")
			logger.flush()

			const content = await Bun.file(paths.mainLog).text()
			// Count occurrences - each message should appear only once
			const firstCount = (content.match(/first batch/g) || []).length
			const secondCount = (content.match(/second batch/g) || []).length
			expect(firstCount).toBe(1)
			expect(secondCount).toBe(1)
		})

		test("does nothing when buffer is empty", () => {
			const logger = new Logger(paths, false)

			// Should not throw or create empty entries
			logger.flush()
			logger.flush()
			logger.flush()

			// Main log file should not exist if nothing was written
			// (or be empty if it does exist)
		})

		test("appends to existing log file", async () => {
			const logger = new Logger(paths, false)

			logger.log("first write")
			logger.flush()

			logger.log("second write")
			logger.flush()

			const content = await Bun.file(paths.mainLog).text()
			expect(content).toContain("first write")
			expect(content).toContain("second write")
			// First should come before second
			expect(content.indexOf("first write")).toBeLessThan(content.indexOf("second write"))
		})

		test("writes to cycle log when set", async () => {
			const logger = new Logger(paths, false)

			logger.setCycleLog(10)
			logger.log("cycle log content")
			logger.flush()

			const cycleLogPath = join(paths.cycleLogDir, "cycle_010.log")
			const content = await Bun.file(cycleLogPath).text()
			expect(content).toContain("cycle log content")
		})
	})

	describe("writeToAlerts (via logError)", () => {
		test("writes error to alerts file immediately", async () => {
			const logger = new Logger(paths, false)

			logger.logError("alert error 1")
			logger.logError("alert error 2")

			// Alerts are written immediately, not buffered
			const content = await Bun.file(paths.alertsFile).text()
			expect(content).toContain("alert error 1")
			expect(content).toContain("alert error 2")
		})

		test("includes ISO timestamp in alerts", async () => {
			const logger = new Logger(paths, false)

			logger.logError("timestamped alert")

			const content = await Bun.file(paths.alertsFile).text()
			// ISO timestamp format: YYYY-MM-DDTHH:MM:SS
			expect(content).toMatch(/\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)
		})

		test("appends to existing alerts file", async () => {
			const logger = new Logger(paths, false)

			logger.logError("first alert")
			logger.logError("second alert")

			const content = await Bun.file(paths.alertsFile).text()
			expect(content.indexOf("first alert")).toBeLessThan(content.indexOf("second alert"))
		})
	})

	describe("formatForFile (via log output)", () => {
		test("adds timestamp prefix to each log entry", async () => {
			const logger = new Logger(paths, false)

			logger.log("test entry")
			logger.flush()

			const content = await Bun.file(paths.mainLog).text()
			// Format: [YYYY-MM-DD HH:MM:SS] message
			expect(content).toMatch(/^\[\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\] test entry\n$/)
		})

		test("uses space instead of T in timestamp", async () => {
			const logger = new Logger(paths, false)

			logger.log("space check")
			logger.flush()

			const content = await Bun.file(paths.mainLog).text()
			// Should have space between date and time, not T
			expect(content).toMatch(/\[\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\]/)
			expect(content).not.toMatch(/\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\]/)
		})

		test("truncates timestamp to seconds precision", async () => {
			const logger = new Logger(paths, false)

			logger.log("precision check")
			logger.flush()

			const content = await Bun.file(paths.mainLog).text()
			// Should not have milliseconds
			expect(content).not.toMatch(/\d{2}:\d{2}:\d{2}\.\d+/)
		})

		test("adds newline at end of each entry", async () => {
			const logger = new Logger(paths, false)

			logger.log("line 1")
			logger.log("line 2")
			logger.flush()

			const content = await Bun.file(paths.mainLog).text()
			const lines = content.split("\n").filter((l) => l.length > 0)
			expect(lines.length).toBe(2)
		})
	})

	describe("rotate", () => {
		test("renames main log with timestamp suffix", async () => {
			const logger = new Logger(paths, false)
			const { readdirSync } = await import("node:fs")

			// Create some log content first
			logger.say("content to rotate")
			logger.flush()

			// Rotate the log
			logger.rotate()

			// Original main log should no longer exist
			expect(existsSync(paths.mainLog)).toBe(false)

			// A rotated file should exist in the logs directory
			const logsDir = join(TEST_DIR, "logs")
			const files = readdirSync(logsDir)
			const rotatedFiles = files.filter((f) => f.startsWith("main.log."))
			expect(rotatedFiles.length).toBe(1)
		})

		test("does nothing if main log does not exist", () => {
			const logger = new Logger(paths, false)

			// Should not throw
			logger.rotate()
		})
	})

	describe("cleanup", () => {
		test("deletes cycle logs older than specified days", async () => {
			const logger = new Logger(paths, false)
			const { utimesSync, writeFileSync } = await import("node:fs")

			// Create old cycle log
			const oldLogPath = join(paths.cycleLogDir, "cycle_001.log")
			writeFileSync(oldLogPath, "old content")
			const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000)
			utimesSync(oldLogPath, tenDaysAgo, tenDaysAgo)

			// Create recent cycle log
			const recentLogPath = join(paths.cycleLogDir, "cycle_002.log")
			writeFileSync(recentLogPath, "recent content")

			const deleted = logger.cleanup(5)

			expect(deleted).toBe(1)
			expect(existsSync(oldLogPath)).toBe(false)
			expect(existsSync(recentLogPath)).toBe(true)
		})

		test("returns count of deleted files", async () => {
			const logger = new Logger(paths, false)
			const { utimesSync, writeFileSync } = await import("node:fs")

			// Create multiple old cycle logs
			const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
			for (let i = 1; i <= 3; i++) {
				const logPath = join(paths.cycleLogDir, `cycle_00${i}.log`)
				writeFileSync(logPath, `old content ${i}`)
				utimesSync(logPath, thirtyDaysAgo, thirtyDaysAgo)
			}

			const deleted = logger.cleanup(7)

			expect(deleted).toBe(3)
		})

		test("returns 0 when no files are old enough", async () => {
			const logger = new Logger(paths, false)
			const { writeFileSync } = await import("node:fs")

			// Create recent cycle log
			const recentLogPath = join(paths.cycleLogDir, "cycle_001.log")
			writeFileSync(recentLogPath, "recent content")

			const deleted = logger.cleanup(30)

			expect(deleted).toBe(0)
		})

		test("returns 0 when cycle log directory is empty", () => {
			const logger = new Logger(paths, false)

			const deleted = logger.cleanup(7)

			expect(deleted).toBe(0)
		})
	})

	describe("startSpinner", () => {
		test("writes spinner frame to stdout", async () => {
			const logger = new Logger(paths, false)

			logger.startSpinner("Loading...")

			// Wait for at least one spinner frame to be written
			await new Promise((resolve) => setTimeout(resolve, 100))

			logger.stopSpinner()

			expect(stdoutWriteMock).toHaveBeenCalled()
			// Check that at least one call contains the spinner message
			const calls = stdoutWriteMock.mock.calls
			const hasSpinnerOutput = calls.some((call) => {
				const output = call[0] as string
				return output.includes("Loading...")
			})
			expect(hasSpinnerOutput).toBe(true)
		})

		test("includes cyan color in spinner output", async () => {
			const logger = new Logger(paths, false)

			logger.startSpinner("Processing...")

			await new Promise((resolve) => setTimeout(resolve, 100))

			logger.stopSpinner()

			const calls = stdoutWriteMock.mock.calls
			const hasCyanColor = calls.some((call) => {
				const output = call[0] as string
				return output.includes("\x1b[36m") // cyan
			})
			expect(hasCyanColor).toBe(true)
		})

		test("stops existing spinner before starting new one", async () => {
			const logger = new Logger(paths, false)

			logger.startSpinner("First spinner")
			await new Promise((resolve) => setTimeout(resolve, 100))

			// Reset mock to track only new calls
			stdoutWriteMock.mockClear()

			logger.startSpinner("Second spinner")
			await new Promise((resolve) => setTimeout(resolve, 100))

			logger.stopSpinner()

			// Should have cleared line when stopping first spinner
			const calls = stdoutWriteMock.mock.calls
			const hasSecondMessage = calls.some((call) => {
				const output = call[0] as string
				return output.includes("Second spinner")
			})
			expect(hasSecondMessage).toBe(true)
		})

		test("clears line before each spinner frame", async () => {
			const logger = new Logger(paths, false)

			logger.startSpinner("Clearing test")

			await new Promise((resolve) => setTimeout(resolve, 100))

			logger.stopSpinner()

			const calls = stdoutWriteMock.mock.calls
			// Each spinner frame should include the clear line escape code
			const hasClearLine = calls.some((call) => {
				const output = call[0] as string
				return output.includes("\r\x1b[K") // clearLine escape sequence
			})
			expect(hasClearLine).toBe(true)
		})
	})

	describe("updateSpinner", () => {
		test("updates message while spinner is running", async () => {
			const logger = new Logger(paths, false)

			logger.startSpinner("Initial message")
			await new Promise((resolve) => setTimeout(resolve, 100))

			// Clear mock to track only calls after update
			stdoutWriteMock.mockClear()

			logger.updateSpinner("Updated message")
			await new Promise((resolve) => setTimeout(resolve, 100))

			logger.stopSpinner()

			const calls = stdoutWriteMock.mock.calls
			const hasUpdatedMessage = calls.some((call) => {
				const output = call[0] as string
				return output.includes("Updated message")
			})
			expect(hasUpdatedMessage).toBe(true)
		})

		test("does nothing if spinner is not running", () => {
			const logger = new Logger(paths, false)

			// Should not throw
			logger.updateSpinner("No spinner active")

			// No spinner output should have been written
			const spinnerCalls = stdoutWriteMock.mock.calls.filter((call) => {
				const output = call[0] as string
				return output.includes("No spinner active")
			})
			expect(spinnerCalls.length).toBe(0)
		})
	})

	describe("stopSpinner", () => {
		test("clears the spinner line", async () => {
			const logger = new Logger(paths, false)

			logger.startSpinner("To be stopped")
			await new Promise((resolve) => setTimeout(resolve, 100))

			// Clear mock before stop
			stdoutWriteMock.mockClear()

			logger.stopSpinner()

			// Should have written clear line escape code
			expect(stdoutWriteMock).toHaveBeenCalled()
			const lastCall = stdoutWriteMock.mock.calls[stdoutWriteMock.mock.calls.length - 1]
			expect(lastCall).toBeDefined()
			if (lastCall) {
				expect(lastCall[0]).toContain("\r\x1b[K")
			}
		})

		test("stops the interval timer", async () => {
			const logger = new Logger(paths, false)

			logger.startSpinner("Timer test")
			await new Promise((resolve) => setTimeout(resolve, 100))

			logger.stopSpinner()

			// Clear mock and wait - no more spinner output should be written
			stdoutWriteMock.mockClear()
			await new Promise((resolve) => setTimeout(resolve, 150))

			// No new spinner frames should have been written
			const spinnerFrameCalls = stdoutWriteMock.mock.calls.filter((call) => {
				const output = call[0] as string
				return output.includes("Timer test")
			})
			expect(spinnerFrameCalls.length).toBe(0)
		})

		test("does nothing if spinner is not running", () => {
			const logger = new Logger(paths, false)

			// Should not throw
			logger.stopSpinner()
			logger.stopSpinner()
			logger.stopSpinner()

			// No clear line should be written if no spinner was active
			expect(stdoutWriteMock).not.toHaveBeenCalled()
		})

		test("can be called multiple times safely", async () => {
			const logger = new Logger(paths, false)

			logger.startSpinner("Multi-stop test")
			await new Promise((resolve) => setTimeout(resolve, 100))

			// Should not throw
			logger.stopSpinner()
			logger.stopSpinner()
			logger.stopSpinner()
		})
	})

	describe("spinner integration", () => {
		test("spinner animates through frames", async () => {
			const logger = new Logger(paths, false)

			logger.startSpinner("Animation test")

			// Wait enough time for multiple frames (80ms per frame)
			await new Promise((resolve) => setTimeout(resolve, 250))

			logger.stopSpinner()

			// Should have multiple calls from spinner animation
			expect(stdoutWriteMock.mock.calls.length).toBeGreaterThan(2)
		})

		test("thinking method stops spinner before output", async () => {
			const logger = new Logger(paths, false)

			logger.startSpinner("Background task")
			await new Promise((resolve) => setTimeout(resolve, 100))

			// Clear mock before thinking
			stdoutWriteMock.mockClear()
			consoleLogMock.mockClear()

			logger.thinking("Interrupting thought")

			// Spinner should be stopped (clear line written)
			const clearLineCalls = stdoutWriteMock.mock.calls.filter((call) => {
				const output = call[0] as string
				return output === "\r\x1b[K"
			})
			expect(clearLineCalls.length).toBeGreaterThanOrEqual(1)

			// Thinking output should be written
			expect(consoleLogMock).toHaveBeenCalled()
		})

		test("toolCall method stops spinner before output", async () => {
			const logger = new Logger(paths, false)

			logger.startSpinner("Background task")
			await new Promise((resolve) => setTimeout(resolve, 100))

			stdoutWriteMock.mockClear()
			consoleLogMock.mockClear()

			logger.toolCall("Read", "/test.ts")

			// Spinner should be stopped
			const clearLineCalls = stdoutWriteMock.mock.calls.filter((call) => {
				const output = call[0] as string
				return output === "\r\x1b[K"
			})
			expect(clearLineCalls.length).toBeGreaterThanOrEqual(1)

			// Tool call output should be written
			expect(consoleLogMock).toHaveBeenCalled()
		})
	})
})
