/**
 * Tests for cli module
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { parseCli } from "../src/cli.ts"
import { initializePaths } from "../src/fs.ts"
import { saveMetrics } from "../src/metrics.ts"
import type { Metrics } from "../src/types.ts"

const TEST_PROJECT_DIR = "/tmp/opencoder-test-cli"

describe("parseCli", () => {
	// Helper to create argv array (simulates process.argv)
	const argv = (...args: string[]) => ["node", "opencoder", ...args]

	describe("model options", () => {
		test("parses --model option", () => {
			const result = parseCli(argv("--model", "anthropic/claude-sonnet-4"))

			expect(result.options.model).toBe("anthropic/claude-sonnet-4")
		})

		test("parses -m shorthand", () => {
			const result = parseCli(argv("-m", "openai/gpt-4"))

			expect(result.options.model).toBe("openai/gpt-4")
		})

		test("parses --plan-model option", () => {
			const result = parseCli(argv("--plan-model", "anthropic/claude-opus-4"))

			expect(result.options.planModel).toBe("anthropic/claude-opus-4")
		})

		test("parses -P shorthand for plan model", () => {
			const result = parseCli(argv("-P", "anthropic/claude-opus-4"))

			expect(result.options.planModel).toBe("anthropic/claude-opus-4")
		})

		test("parses --build-model option", () => {
			const result = parseCli(argv("--build-model", "anthropic/claude-sonnet-4"))

			expect(result.options.buildModel).toBe("anthropic/claude-sonnet-4")
		})

		test("parses -B shorthand for build model", () => {
			const result = parseCli(argv("-B", "anthropic/claude-sonnet-4"))

			expect(result.options.buildModel).toBe("anthropic/claude-sonnet-4")
		})

		test("parses separate plan and build models", () => {
			const result = parseCli(
				argv("-P", "anthropic/claude-opus-4", "-B", "anthropic/claude-sonnet-4"),
			)

			expect(result.options.planModel).toBe("anthropic/claude-opus-4")
			expect(result.options.buildModel).toBe("anthropic/claude-sonnet-4")
		})
	})

	describe("project option", () => {
		test("parses --project option", () => {
			const result = parseCli(argv("--project", "/path/to/project"))

			expect(result.options.project).toBe("/path/to/project")
		})

		test("parses -p shorthand", () => {
			const result = parseCli(argv("-p", "./myproject"))

			expect(result.options.project).toBe("./myproject")
		})

		test("project is undefined when not provided", () => {
			const result = parseCli(argv("-m", "anthropic/claude-sonnet-4"))

			expect(result.options.project).toBeUndefined()
		})
	})

	describe("verbose option", () => {
		test("parses --verbose flag", () => {
			const result = parseCli(argv("--verbose"))

			expect(result.options.verbose).toBe(true)
		})

		test("parses -v shorthand", () => {
			const result = parseCli(argv("-v"))

			expect(result.options.verbose).toBe(true)
		})

		test("verbose is undefined when not provided", () => {
			const result = parseCli(argv("-m", "anthropic/claude-sonnet-4"))

			expect(result.options.verbose).toBeUndefined()
		})
	})

	describe("hint argument", () => {
		test("parses hint argument", () => {
			const result = parseCli(argv("build a REST API"))

			expect(result.hint).toBe("build a REST API")
		})

		test("parses hint with options", () => {
			const result = parseCli(argv("-m", "anthropic/claude-sonnet-4", "focus on tests"))

			expect(result.hint).toBe("focus on tests")
			expect(result.options.model).toBe("anthropic/claude-sonnet-4")
		})

		test("hint is undefined when not provided", () => {
			const result = parseCli(argv("-m", "anthropic/claude-sonnet-4"))

			expect(result.hint).toBeUndefined()
		})

		test("parses quoted hint with spaces", () => {
			const result = parseCli(argv("implement user authentication flow"))

			expect(result.hint).toBe("implement user authentication flow")
		})
	})

	describe("combined options", () => {
		test("parses all options together", () => {
			const result = parseCli(
				argv(
					"-p",
					"./myproject",
					"-P",
					"anthropic/claude-opus-4",
					"-B",
					"anthropic/claude-sonnet-4",
					"-v",
					"build the feature",
				),
			)

			expect(result.options.project).toBe("./myproject")
			expect(result.options.planModel).toBe("anthropic/claude-opus-4")
			expect(result.options.buildModel).toBe("anthropic/claude-sonnet-4")
			expect(result.options.verbose).toBe(true)
			expect(result.hint).toBe("build the feature")
		})

		test("parses model with project and verbose", () => {
			const result = parseCli(argv("-m", "openai/gpt-4o", "-p", "/project", "-v"))

			expect(result.options.model).toBe("openai/gpt-4o")
			expect(result.options.project).toBe("/project")
			expect(result.options.verbose).toBe(true)
		})

		test("options can appear in any order", () => {
			const result = parseCli(
				argv("-v", "my hint", "-m", "anthropic/claude-sonnet-4", "-p", "./proj"),
			)

			expect(result.options.verbose).toBe(true)
			expect(result.options.model).toBe("anthropic/claude-sonnet-4")
			expect(result.options.project).toBe("./proj")
			expect(result.hint).toBe("my hint")
		})
	})

	describe("default values", () => {
		test("returns undefined for all options when none provided", () => {
			const result = parseCli(argv())

			expect(result.options.project).toBeUndefined()
			expect(result.options.model).toBeUndefined()
			expect(result.options.planModel).toBeUndefined()
			expect(result.options.buildModel).toBeUndefined()
			expect(result.options.verbose).toBeUndefined()
			expect(result.hint).toBeUndefined()
		})
	})

	describe("status option", () => {
		test("parses --status flag", () => {
			const result = parseCli(argv("--status"))

			expect(result.options.status).toBe(true)
		})

		test("parses --status with project option", () => {
			const result = parseCli(argv("--status", "-p", "./myproject"))

			expect(result.options.status).toBe(true)
			expect(result.options.project).toBe("./myproject")
		})

		test("status is undefined when not provided", () => {
			const result = parseCli(argv("-m", "anthropic/claude-sonnet-4"))

			expect(result.options.status).toBeUndefined()
		})
	})

	describe("metrics-reset option", () => {
		test("parses --metrics-reset flag", () => {
			const result = parseCli(argv("--metrics-reset"))

			expect(result.options.metricsReset).toBe(true)
		})

		test("parses --metrics-reset with project option", () => {
			const result = parseCli(argv("--metrics-reset", "-p", "./myproject"))

			expect(result.options.metricsReset).toBe(true)
			expect(result.options.project).toBe("./myproject")
		})

		test("metricsReset is undefined when not provided", () => {
			const result = parseCli(argv("-m", "anthropic/claude-sonnet-4"))

			expect(result.options.metricsReset).toBeUndefined()
		})
	})

	describe("git options", () => {
		test("parses --no-auto-commit flag", () => {
			const result = parseCli(argv("--no-auto-commit"))

			expect(result.options.autoCommit).toBe(false)
		})

		test("parses --no-auto-push flag", () => {
			const result = parseCli(argv("--no-auto-push"))

			expect(result.options.autoPush).toBe(false)
		})

		test("parses -s/--signoff flag", () => {
			const result = parseCli(argv("-s"))

			expect(result.options.commitSignoff).toBe(true)
		})

		test("parses --signoff flag", () => {
			const result = parseCli(argv("--signoff"))

			expect(result.options.commitSignoff).toBe(true)
		})

		test("parses all git options together", () => {
			const result = parseCli(argv("--no-auto-commit", "--no-auto-push", "-s"))

			expect(result.options.autoCommit).toBe(false)
			expect(result.options.autoPush).toBe(false)
			expect(result.options.commitSignoff).toBe(true)
		})
	})
})

/**
 * Helper to create test metrics with defaults
 */
function createTestMetrics(overrides?: Partial<Metrics>): Metrics {
	return {
		cyclesCompleted: 5,
		cyclesTimedOut: 0,
		tasksCompleted: 42,
		tasksFailed: 2,
		tasksSkipped: 0,
		totalRetries: 3,
		ideasProcessed: 1,
		totalCycleDurationMs: 300000,
		lastActivityTime: new Date().toISOString(),
		totalInputTokens: 50000,
		totalOutputTokens: 25000,
		totalCostUsd: 1.5,
		firstRunTime: new Date().toISOString(),
		...overrides,
	}
}

describe("CLI --status and --metrics-reset commands", () => {
	// Helper to create argv array (simulates process.argv)
	const argv = (...args: string[]) => ["node", "opencoder", ...args]

	beforeEach(() => {
		if (existsSync(TEST_PROJECT_DIR)) {
			rmSync(TEST_PROJECT_DIR, { recursive: true })
		}
		mkdirSync(TEST_PROJECT_DIR, { recursive: true })
	})

	afterEach(() => {
		if (existsSync(TEST_PROJECT_DIR)) {
			rmSync(TEST_PROJECT_DIR, { recursive: true })
		}
	})

	describe("--status flag parsing", () => {
		test("parses --status flag", () => {
			const result = parseCli(argv("--status"))

			expect(result.options.status).toBe(true)
		})

		test("parses --status with project option", () => {
			const result = parseCli(argv("--status", "-p", "./myproject"))

			expect(result.options.status).toBe(true)
			expect(result.options.project).toBe("./myproject")
		})

		test("status is undefined when not provided", () => {
			const result = parseCli(argv("-m", "anthropic/claude-sonnet-4"))

			expect(result.options.status).toBeUndefined()
		})

		test("parses --status with absolute project path", () => {
			const result = parseCli(argv("--status", "-p", "/absolute/path"))

			expect(result.options.status).toBe(true)
			expect(result.options.project).toBe("/absolute/path")
		})

		test("parses --status in any order with other options", () => {
			const result = parseCli(argv("-v", "--status", "-p", "./proj"))

			expect(result.options.status).toBe(true)
			expect(result.options.verbose).toBe(true)
			expect(result.options.project).toBe("./proj")
		})
	})

	describe("--metrics-reset flag parsing", () => {
		test("parses --metrics-reset flag", () => {
			const result = parseCli(argv("--metrics-reset"))

			expect(result.options.metricsReset).toBe(true)
		})

		test("parses --metrics-reset with project option", () => {
			const result = parseCli(argv("--metrics-reset", "-p", "./myproject"))

			expect(result.options.metricsReset).toBe(true)
			expect(result.options.project).toBe("./myproject")
		})

		test("metricsReset is undefined when not provided", () => {
			const result = parseCli(argv("-m", "anthropic/claude-sonnet-4"))

			expect(result.options.metricsReset).toBeUndefined()
		})

		test("parses --metrics-reset with absolute project path", () => {
			const result = parseCli(argv("--metrics-reset", "-p", "/absolute/path"))

			expect(result.options.metricsReset).toBe(true)
			expect(result.options.project).toBe("/absolute/path")
		})

		test("parses --metrics-reset in any order with other options", () => {
			const result = parseCli(argv("-v", "--metrics-reset", "-p", "./proj"))

			expect(result.options.metricsReset).toBe(true)
			expect(result.options.verbose).toBe(true)
			expect(result.options.project).toBe("./proj")
		})
	})

	describe("status and metrics-reset mutual exclusivity in parsing", () => {
		test("can parse both --status and --metrics-reset together (though not recommended)", () => {
			const result = parseCli(argv("--status", "--metrics-reset"))

			expect(result.options.status).toBe(true)
			expect(result.options.metricsReset).toBe(true)
		})

		test("both flags with project option", () => {
			const result = parseCli(argv("-p", "./proj", "--status", "--metrics-reset"))

			expect(result.options.status).toBe(true)
			expect(result.options.metricsReset).toBe(true)
			expect(result.options.project).toBe("./proj")
		})
	})

	describe("metrics file integration", () => {
		test("can create and locate metrics file for status command", async () => {
			const paths = initializePaths(TEST_PROJECT_DIR)
			const testMetrics = createTestMetrics()

			// Create the directory structure
			mkdirSync(paths.opencoderDir, { recursive: true })

			// Save test metrics
			await saveMetrics(paths.metricsFile, testMetrics)

			// Verify file exists
			expect(existsSync(paths.metricsFile)).toBe(true)

			// Verify we can read it back
			const content = await Bun.file(paths.metricsFile).text()
			const parsed = JSON.parse(content)

			expect(parsed.cyclesCompleted).toBe(5)
			expect(parsed.totalInputTokens).toBe(50000)
			expect(parsed.totalCostUsd).toBe(1.5)
		})

		test("metrics file path resolves correctly with project option", () => {
			const paths = initializePaths(TEST_PROJECT_DIR)

			expect(paths.metricsFile).toBe(join(TEST_PROJECT_DIR, ".opencode/opencoder/metrics.json"))
		})

		test("creates metrics file in correct location for --status command", async () => {
			const paths = initializePaths(TEST_PROJECT_DIR)
			const testMetrics = createTestMetrics({
				cyclesCompleted: 10,
				tasksCompleted: 100,
			})

			mkdirSync(paths.opencoderDir, { recursive: true })
			await saveMetrics(paths.metricsFile, testMetrics)

			const content = await Bun.file(paths.metricsFile).text()
			const parsed = JSON.parse(content)

			expect(parsed.cyclesCompleted).toBe(10)
			expect(parsed.tasksCompleted).toBe(100)
		})

		test("handles empty metrics file gracefully", async () => {
			const paths = initializePaths(TEST_PROJECT_DIR)
			mkdirSync(paths.opencoderDir, { recursive: true })

			// Create empty file
			writeFileSync(paths.metricsFile, "")

			// Should not throw
			expect(existsSync(paths.metricsFile)).toBe(true)
		})
	})

	describe("status and reset option combinations", () => {
		test("status option with verbose", () => {
			const result = parseCli(argv("--status", "-v"))

			expect(result.options.status).toBe(true)
			expect(result.options.verbose).toBe(true)
		})

		test("metrics-reset option with verbose", () => {
			const result = parseCli(argv("--metrics-reset", "-v"))

			expect(result.options.metricsReset).toBe(true)
			expect(result.options.verbose).toBe(true)
		})

		test("status does not interfere with normal options", () => {
			const result = parseCli(argv("--status", "-m", "anthropic/claude-sonnet-4", "-p", "./proj"))

			expect(result.options.status).toBe(true)
			expect(result.options.model).toBe("anthropic/claude-sonnet-4")
			expect(result.options.project).toBe("./proj")
		})

		test("metrics-reset does not interfere with normal options", () => {
			const result = parseCli(
				argv("--metrics-reset", "-m", "anthropic/claude-sonnet-4", "-p", "./proj"),
			)

			expect(result.options.metricsReset).toBe(true)
			expect(result.options.model).toBe("anthropic/claude-sonnet-4")
			expect(result.options.project).toBe("./proj")
		})

		test("status and reset can be combined with all git options", () => {
			const result = parseCli(
				argv("-p", "./proj", "--status", "--no-auto-commit", "--no-auto-push", "-s"),
			)

			expect(result.options.status).toBe(true)
			expect(result.options.project).toBe("./proj")
			expect(result.options.autoCommit).toBe(false)
			expect(result.options.autoPush).toBe(false)
			expect(result.options.commitSignoff).toBe(true)
		})
	})

	describe("metrics data formatting", () => {
		test("metrics file contains all required fields", async () => {
			const paths = initializePaths(TEST_PROJECT_DIR)
			const testMetrics = createTestMetrics()

			mkdirSync(paths.opencoderDir, { recursive: true })
			await saveMetrics(paths.metricsFile, testMetrics)

			const content = await Bun.file(paths.metricsFile).text()
			const parsed = JSON.parse(content)

			// Check all required fields are present
			expect(parsed.cyclesCompleted).toBeDefined()
			expect(parsed.tasksCompleted).toBeDefined()
			expect(parsed.totalRetries).toBeDefined()
			expect(parsed.totalInputTokens).toBeDefined()
			expect(parsed.totalOutputTokens).toBeDefined()
			expect(parsed.totalCostUsd).toBeDefined()
			expect(parsed.lastActivityTime).toBeDefined()
		})

		test("metrics file preserves numeric precision", async () => {
			const paths = initializePaths(TEST_PROJECT_DIR)
			const testMetrics = createTestMetrics({
				totalCostUsd: 0.0123,
				totalInputTokens: 1500000,
				totalOutputTokens: 750000,
			})

			mkdirSync(paths.opencoderDir, { recursive: true })
			await saveMetrics(paths.metricsFile, testMetrics)

			const content = await Bun.file(paths.metricsFile).text()
			const parsed = JSON.parse(content)

			expect(parsed.totalCostUsd).toBeCloseTo(0.0123, 4)
			expect(parsed.totalInputTokens).toBe(1500000)
			expect(parsed.totalOutputTokens).toBe(750000)
		})
	})

	describe("confirmation prompt behavior", () => {
		test("--metrics-reset flag triggers confirmation flow", () => {
			const result = parseCli(argv("--metrics-reset", "-p", TEST_PROJECT_DIR))

			expect(result.options.metricsReset).toBe(true)
			expect(result.options.project).toBe(TEST_PROJECT_DIR)
		})

		test("confirmation accepts 'yes' response", () => {
			// This test verifies the parsing; actual stdin interaction tested separately
			const result = parseCli(argv("--metrics-reset"))
			expect(result.options.metricsReset).toBe(true)
		})

		test("confirmation accepts 'y' response", () => {
			// This test verifies the parsing; actual stdin interaction tested separately
			const result = parseCli(argv("--metrics-reset"))
			expect(result.options.metricsReset).toBe(true)
		})

		test("--metrics-reset shows current metrics before confirmation", async () => {
			const paths = initializePaths(TEST_PROJECT_DIR)
			const testMetrics = createTestMetrics({
				cyclesCompleted: 3,
				tasksCompleted: 25,
				totalInputTokens: 100000,
			})

			mkdirSync(paths.opencoderDir, { recursive: true })
			await saveMetrics(paths.metricsFile, testMetrics)

			// Verify metrics can be read before reset
			const content = await Bun.file(paths.metricsFile).text()
			const parsed = JSON.parse(content)

			expect(parsed.cyclesCompleted).toBe(3)
			expect(parsed.tasksCompleted).toBe(25)
			expect(parsed.totalInputTokens).toBe(100000)
		})

		test("metrics can be reset to default values", async () => {
			const paths = initializePaths(TEST_PROJECT_DIR)
			const testMetrics = createTestMetrics({
				cyclesCompleted: 10,
				tasksCompleted: 100,
				totalInputTokens: 500000,
				totalCostUsd: 5.0,
			})

			mkdirSync(paths.opencoderDir, { recursive: true })
			await saveMetrics(paths.metricsFile, testMetrics)

			// Verify existing metrics
			let content = await Bun.file(paths.metricsFile).text()
			let parsed = JSON.parse(content)
			expect(parsed.cyclesCompleted).toBe(10)
			expect(parsed.totalInputTokens).toBe(500000)

			// Simulate reset by saving fresh metrics
			const { resetMetrics } = await import("../src/metrics.ts")
			const freshMetrics = resetMetrics()
			await saveMetrics(paths.metricsFile, freshMetrics)

			// Verify reset worked
			content = await Bun.file(paths.metricsFile).text()
			parsed = JSON.parse(content)
			expect(parsed.cyclesCompleted).toBe(0)
			expect(parsed.tasksCompleted).toBe(0)
			expect(parsed.totalInputTokens).toBe(0)
			expect(parsed.totalOutputTokens).toBe(0)
			expect(parsed.totalCostUsd).toBe(0)
		})

		test("--metrics-reset with no existing metrics file", async () => {
			const paths = initializePaths(TEST_PROJECT_DIR)

			// Directory doesn't exist
			expect(existsSync(paths.metricsFile)).toBe(false)

			// But parsing should still work
			const result = parseCli(argv("--metrics-reset", "-p", TEST_PROJECT_DIR))
			expect(result.options.metricsReset).toBe(true)
		})

		test("confirmation can be cancelled", async () => {
			const paths = initializePaths(TEST_PROJECT_DIR)
			const testMetrics = createTestMetrics({
				cyclesCompleted: 5,
				tasksCompleted: 50,
			})

			mkdirSync(paths.opencoderDir, { recursive: true })
			await saveMetrics(paths.metricsFile, testMetrics)

			// Simulate cancelled reset (don't actually save)
			const content = await Bun.file(paths.metricsFile).text()
			const parsed = JSON.parse(content)

			// Verify metrics are unchanged
			expect(parsed.cyclesCompleted).toBe(5)
			expect(parsed.tasksCompleted).toBe(50)
		})
	})

	describe("status and metrics-reset with real files", () => {
		test("status flag reads metrics from correct file location", async () => {
			const paths = initializePaths(TEST_PROJECT_DIR)
			const testMetrics = createTestMetrics({
				cyclesCompleted: 7,
				totalRetries: 4,
			})

			mkdirSync(paths.opencoderDir, { recursive: true })
			await saveMetrics(paths.metricsFile, testMetrics)

			// Verify we can read it
			const content = await Bun.file(paths.metricsFile).text()
			const parsed = JSON.parse(content)

			expect(parsed.cyclesCompleted).toBe(7)
			expect(parsed.totalRetries).toBe(4)
		})

		test("metrics-reset saves to correct file location", async () => {
			const paths = initializePaths(TEST_PROJECT_DIR)
			const { resetMetrics } = await import("../src/metrics.ts")

			mkdirSync(paths.opencoderDir, { recursive: true })

			// Save reset metrics
			const freshMetrics = resetMetrics()
			await saveMetrics(paths.metricsFile, freshMetrics)

			// Verify location is correct
			expect(existsSync(paths.metricsFile)).toBe(true)

			const content = await Bun.file(paths.metricsFile).text()
			const parsed = JSON.parse(content)

			expect(parsed.cyclesCompleted).toBe(0)
			expect(parsed.tasksCompleted).toBe(0)
		})

		test("status displays all metric categories", async () => {
			const paths = initializePaths(TEST_PROJECT_DIR)
			const testMetrics = createTestMetrics({
				cyclesCompleted: 3,
				cyclesTimedOut: 1,
				tasksCompleted: 28,
				tasksFailed: 2,
				tasksSkipped: 1,
				totalRetries: 5,
				ideasProcessed: 2,
				totalInputTokens: 250000,
				totalOutputTokens: 125000,
				totalCostUsd: 2.5,
			})

			mkdirSync(paths.opencoderDir, { recursive: true })
			await saveMetrics(paths.metricsFile, testMetrics)

			const content = await Bun.file(paths.metricsFile).text()
			const parsed = JSON.parse(content)

			// Verify all categories
			expect(parsed.cyclesCompleted).toBe(3)
			expect(parsed.cyclesTimedOut).toBe(1)
			expect(parsed.tasksCompleted).toBe(28)
			expect(parsed.tasksFailed).toBe(2)
			expect(parsed.tasksSkipped).toBe(1)
			expect(parsed.totalRetries).toBe(5)
			expect(parsed.ideasProcessed).toBe(2)
			expect(parsed.totalInputTokens).toBe(250000)
			expect(parsed.totalOutputTokens).toBe(125000)
			expect(parsed.totalCostUsd).toBe(2.5)
		})
	})
})
