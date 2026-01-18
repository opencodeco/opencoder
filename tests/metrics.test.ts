/**
 * Tests for metrics module
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { existsSync, mkdirSync, rmSync } from "node:fs"
import { join } from "node:path"
import {
	formatDuration,
	formatMetricsSummary,
	getAverageCycleDuration,
	getTaskSuccessRate,
	loadMetrics,
	recordCycleCompleted,
	recordCycleTimeout,
	recordIdeaProcessed,
	recordRetry,
	recordTaskCompleted,
	recordTaskFailed,
	recordTaskSkipped,
	resetMetrics,
	saveMetrics,
} from "../src/metrics.ts"
import type { Metrics } from "../src/types.ts"

const TEST_DIR = "/tmp/opencoder-test-metrics"

/** Create default test metrics */
function createTestMetrics(overrides?: Partial<Metrics>): Metrics {
	return {
		cyclesCompleted: 0,
		cyclesTimedOut: 0,
		tasksCompleted: 0,
		tasksFailed: 0,
		tasksSkipped: 0,
		totalRetries: 0,
		ideasProcessed: 0,
		totalCycleDurationMs: 0,
		lastActivityTime: new Date().toISOString(),
		...overrides,
	}
}

describe("metrics", () => {
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

	describe("loadMetrics", () => {
		test("returns default metrics for non-existent file", async () => {
			const metrics = await loadMetrics(join(TEST_DIR, "nonexistent.json"))

			expect(metrics.cyclesCompleted).toBe(0)
			expect(metrics.tasksCompleted).toBe(0)
			expect(metrics.lastActivityTime).toBeTruthy()
		})

		test("loads metrics from file", async () => {
			const metricsFile = join(TEST_DIR, "metrics.json")
			const data = {
				cyclesCompleted: 5,
				tasksCompleted: 20,
				tasksFailed: 2,
				totalRetries: 8,
				ideasProcessed: 3,
				totalCycleDurationMs: 300000,
				lastActivityTime: "2026-01-18T00:00:00Z",
			}
			await Bun.write(metricsFile, JSON.stringify(data))

			const metrics = await loadMetrics(metricsFile)

			expect(metrics.cyclesCompleted).toBe(5)
			expect(metrics.tasksCompleted).toBe(20)
			expect(metrics.tasksFailed).toBe(2)
			expect(metrics.totalRetries).toBe(8)
		})

		test("handles invalid JSON gracefully", async () => {
			const metricsFile = join(TEST_DIR, "invalid.json")
			await Bun.write(metricsFile, "not valid json")

			const metrics = await loadMetrics(metricsFile)

			expect(metrics.cyclesCompleted).toBe(0)
			expect(metrics.lastActivityTime).toBeTruthy()
		})

		test("fills in missing fields with defaults", async () => {
			const metricsFile = join(TEST_DIR, "partial.json")
			await Bun.write(metricsFile, JSON.stringify({ cyclesCompleted: 10 }))

			const metrics = await loadMetrics(metricsFile)

			expect(metrics.cyclesCompleted).toBe(10)
			expect(metrics.tasksCompleted).toBe(0)
			expect(metrics.totalRetries).toBe(0)
		})
	})

	describe("saveMetrics", () => {
		test("saves metrics to file", async () => {
			const metricsFile = join(TEST_DIR, "save-test.json")
			const metrics = createTestMetrics({
				cyclesCompleted: 3,
				tasksCompleted: 15,
			})

			await saveMetrics(metricsFile, metrics)

			const content = await Bun.file(metricsFile).text()
			const saved = JSON.parse(content)

			expect(saved.cyclesCompleted).toBe(3)
			expect(saved.tasksCompleted).toBe(15)
			expect(saved.lastActivityTime).toBeTruthy()
		})

		test("sets firstRunTime if not already set", async () => {
			const metricsFile = join(TEST_DIR, "first-run.json")
			const metrics = createTestMetrics()

			await saveMetrics(metricsFile, metrics)

			const content = await Bun.file(metricsFile).text()
			const saved = JSON.parse(content)

			expect(saved.firstRunTime).toBeTruthy()
		})

		test("preserves existing firstRunTime", async () => {
			const metricsFile = join(TEST_DIR, "preserve-first.json")
			const metrics = createTestMetrics({
				firstRunTime: "2025-01-01T00:00:00Z",
			})

			await saveMetrics(metricsFile, metrics)

			const content = await Bun.file(metricsFile).text()
			const saved = JSON.parse(content)

			expect(saved.firstRunTime).toBe("2025-01-01T00:00:00Z")
		})
	})

	describe("recordCycleCompleted", () => {
		test("increments cycle count and adds duration", () => {
			const metrics = createTestMetrics()
			const updated = recordCycleCompleted(metrics, 60000)

			expect(updated.cyclesCompleted).toBe(1)
			expect(updated.totalCycleDurationMs).toBe(60000)
		})

		test("accumulates multiple cycles", () => {
			let metrics = createTestMetrics()
			metrics = recordCycleCompleted(metrics, 60000)
			metrics = recordCycleCompleted(metrics, 90000)

			expect(metrics.cyclesCompleted).toBe(2)
			expect(metrics.totalCycleDurationMs).toBe(150000)
		})
	})

	describe("recordCycleTimeout", () => {
		test("increments timeout count", () => {
			const metrics = createTestMetrics()
			const updated = recordCycleTimeout(metrics)

			expect(updated.cyclesTimedOut).toBe(1)
		})
	})

	describe("recordTaskCompleted", () => {
		test("increments task completed count", () => {
			const metrics = createTestMetrics()
			const updated = recordTaskCompleted(metrics)

			expect(updated.tasksCompleted).toBe(1)
		})
	})

	describe("recordTaskFailed", () => {
		test("increments task failed count", () => {
			const metrics = createTestMetrics()
			const updated = recordTaskFailed(metrics)

			expect(updated.tasksFailed).toBe(1)
		})
	})

	describe("recordTaskSkipped", () => {
		test("increments task skipped count", () => {
			const metrics = createTestMetrics()
			const updated = recordTaskSkipped(metrics)

			expect(updated.tasksSkipped).toBe(1)
		})
	})

	describe("recordRetry", () => {
		test("increments retry count", () => {
			const metrics = createTestMetrics()
			const updated = recordRetry(metrics)

			expect(updated.totalRetries).toBe(1)
		})
	})

	describe("recordIdeaProcessed", () => {
		test("increments ideas processed count", () => {
			const metrics = createTestMetrics()
			const updated = recordIdeaProcessed(metrics)

			expect(updated.ideasProcessed).toBe(1)
		})
	})

	describe("getAverageCycleDuration", () => {
		test("returns 0 when no cycles completed", () => {
			const metrics = createTestMetrics()
			expect(getAverageCycleDuration(metrics)).toBe(0)
		})

		test("calculates average correctly", () => {
			const metrics = createTestMetrics({
				cyclesCompleted: 4,
				totalCycleDurationMs: 240000, // 4 minutes total
			})

			expect(getAverageCycleDuration(metrics)).toBe(60000) // 1 minute avg
		})
	})

	describe("getTaskSuccessRate", () => {
		test("returns 100 when no tasks", () => {
			const metrics = createTestMetrics()
			expect(getTaskSuccessRate(metrics)).toBe(100)
		})

		test("calculates success rate correctly", () => {
			const metrics = createTestMetrics({
				tasksCompleted: 8,
				tasksFailed: 1,
				tasksSkipped: 1,
			})

			expect(getTaskSuccessRate(metrics)).toBe(80) // 8/10 = 80%
		})

		test("handles all tasks failed", () => {
			const metrics = createTestMetrics({
				tasksCompleted: 0,
				tasksFailed: 5,
			})

			expect(getTaskSuccessRate(metrics)).toBe(0)
		})
	})

	describe("formatDuration", () => {
		test("formats seconds only", () => {
			expect(formatDuration(45000)).toBe("45s")
		})

		test("formats minutes and seconds", () => {
			expect(formatDuration(150000)).toBe("2m 30s")
		})

		test("formats hours and minutes", () => {
			expect(formatDuration(5400000)).toBe("1h 30m")
		})

		test("handles zero", () => {
			expect(formatDuration(0)).toBe("0s")
		})
	})

	describe("formatMetricsSummary", () => {
		test("includes all key metrics", () => {
			const metrics = createTestMetrics({
				cyclesCompleted: 5,
				cyclesTimedOut: 1,
				tasksCompleted: 20,
				tasksFailed: 2,
				tasksSkipped: 1,
				totalRetries: 8,
				ideasProcessed: 3,
				totalCycleDurationMs: 300000,
				firstRunTime: "2026-01-01T00:00:00Z",
			})

			const summary = formatMetricsSummary(metrics)

			expect(summary).toContain("Cycles: 5 completed")
			expect(summary).toContain("1 timed out")
			expect(summary).toContain("Tasks: 20 completed")
			expect(summary).toContain("2 failed")
			expect(summary).toContain("1 skipped")
			expect(summary).toContain("Retries: 8")
			expect(summary).toContain("Ideas: 3")
			expect(summary).toContain("First run:")
		})

		test("shows N/A for avg duration when no cycles", () => {
			const metrics = createTestMetrics()

			const summary = formatMetricsSummary(metrics)

			expect(summary).toContain("Avg cycle duration: N/A")
		})
	})

	describe("resetMetrics", () => {
		test("returns fresh metrics with timestamps", () => {
			const metrics = resetMetrics()

			expect(metrics.cyclesCompleted).toBe(0)
			expect(metrics.tasksCompleted).toBe(0)
			expect(metrics.firstRunTime).toBeTruthy()
			expect(metrics.lastActivityTime).toBeTruthy()
		})
	})
})
