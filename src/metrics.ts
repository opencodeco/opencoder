/**
 * Metrics tracking and persistence
 *
 * Tracks performance statistics like cycles completed, tasks success/failure rates,
 * retry counts, and timing information.
 */

import { getISOTimestamp, readFileOrNull, writeFile } from "./fs.ts"
import type { Metrics } from "./types.ts"

/** Default initial metrics */
const DEFAULT_METRICS: Metrics = {
	cyclesCompleted: 0,
	cyclesTimedOut: 0,
	tasksCompleted: 0,
	tasksFailed: 0,
	tasksSkipped: 0,
	totalRetries: 0,
	ideasProcessed: 0,
	totalCycleDurationMs: 0,
	lastActivityTime: "",
}

/**
 * Load metrics from file, or return default metrics if file doesn't exist.
 * @param metricsFile - Path to the metrics JSON file
 * @returns Metrics loaded from file or default metrics
 */
export async function loadMetrics(metricsFile: string): Promise<Metrics> {
	const content = await readFileOrNull(metricsFile)

	if (!content) {
		return { ...DEFAULT_METRICS, lastActivityTime: getISOTimestamp() }
	}

	try {
		const parsed = JSON.parse(content) as Partial<Metrics>

		// Merge with defaults to handle missing fields
		return {
			cyclesCompleted: parsed.cyclesCompleted ?? DEFAULT_METRICS.cyclesCompleted,
			cyclesTimedOut: parsed.cyclesTimedOut ?? DEFAULT_METRICS.cyclesTimedOut,
			tasksCompleted: parsed.tasksCompleted ?? DEFAULT_METRICS.tasksCompleted,
			tasksFailed: parsed.tasksFailed ?? DEFAULT_METRICS.tasksFailed,
			tasksSkipped: parsed.tasksSkipped ?? DEFAULT_METRICS.tasksSkipped,
			totalRetries: parsed.totalRetries ?? DEFAULT_METRICS.totalRetries,
			ideasProcessed: parsed.ideasProcessed ?? DEFAULT_METRICS.ideasProcessed,
			totalCycleDurationMs: parsed.totalCycleDurationMs ?? DEFAULT_METRICS.totalCycleDurationMs,
			firstRunTime: parsed.firstRunTime,
			lastActivityTime: parsed.lastActivityTime ?? getISOTimestamp(),
		}
	} catch {
		// Invalid JSON, return defaults
		return { ...DEFAULT_METRICS, lastActivityTime: getISOTimestamp() }
	}
}

/**
 * Save metrics to file.
 * @param metricsFile - Path to the metrics JSON file
 * @param metrics - Metrics to persist
 */
export async function saveMetrics(metricsFile: string, metrics: Metrics): Promise<void> {
	const updated: Metrics = {
		...metrics,
		lastActivityTime: getISOTimestamp(),
	}

	// Set firstRunTime if not already set
	if (!updated.firstRunTime) {
		updated.firstRunTime = getISOTimestamp()
	}

	const content = JSON.stringify(updated, null, 2)
	await writeFile(metricsFile, content)
}

/**
 * Record a completed cycle.
 * @param metrics - Current metrics
 * @param cycleDurationMs - Duration of the cycle in milliseconds
 * @returns Updated metrics
 */
export function recordCycleCompleted(metrics: Metrics, cycleDurationMs: number): Metrics {
	return {
		...metrics,
		cyclesCompleted: metrics.cyclesCompleted + 1,
		totalCycleDurationMs: metrics.totalCycleDurationMs + cycleDurationMs,
	}
}

/**
 * Record a cycle timeout.
 * @param metrics - Current metrics
 * @returns Updated metrics
 */
export function recordCycleTimeout(metrics: Metrics): Metrics {
	return {
		...metrics,
		cyclesTimedOut: metrics.cyclesTimedOut + 1,
	}
}

/**
 * Record a completed task.
 * @param metrics - Current metrics
 * @returns Updated metrics
 */
export function recordTaskCompleted(metrics: Metrics): Metrics {
	return {
		...metrics,
		tasksCompleted: metrics.tasksCompleted + 1,
	}
}

/**
 * Record a failed task (after max retries).
 * @param metrics - Current metrics
 * @returns Updated metrics
 */
export function recordTaskFailed(metrics: Metrics): Metrics {
	return {
		...metrics,
		tasksFailed: metrics.tasksFailed + 1,
	}
}

/**
 * Record a skipped task (due to timeout).
 * @param metrics - Current metrics
 * @returns Updated metrics
 */
export function recordTaskSkipped(metrics: Metrics): Metrics {
	return {
		...metrics,
		tasksSkipped: metrics.tasksSkipped + 1,
	}
}

/**
 * Record a retry attempt.
 * @param metrics - Current metrics
 * @returns Updated metrics
 */
export function recordRetry(metrics: Metrics): Metrics {
	return {
		...metrics,
		totalRetries: metrics.totalRetries + 1,
	}
}

/**
 * Record an idea processed from the queue.
 * @param metrics - Current metrics
 * @returns Updated metrics
 */
export function recordIdeaProcessed(metrics: Metrics): Metrics {
	return {
		...metrics,
		ideasProcessed: metrics.ideasProcessed + 1,
	}
}

/**
 * Get average cycle duration in milliseconds.
 * @param metrics - Current metrics
 * @returns Average duration or 0 if no cycles completed
 */
export function getAverageCycleDuration(metrics: Metrics): number {
	if (metrics.cyclesCompleted === 0) {
		return 0
	}
	return Math.round(metrics.totalCycleDurationMs / metrics.cyclesCompleted)
}

/**
 * Get task success rate as a percentage.
 * @param metrics - Current metrics
 * @returns Success rate (0-100) or 100 if no tasks
 */
export function getTaskSuccessRate(metrics: Metrics): number {
	const total = metrics.tasksCompleted + metrics.tasksFailed + metrics.tasksSkipped
	if (total === 0) {
		return 100
	}
	return Math.round((metrics.tasksCompleted / total) * 100)
}

/**
 * Format metrics as a human-readable summary string.
 * @param metrics - Current metrics
 * @returns Formatted summary
 */
export function formatMetricsSummary(metrics: Metrics): string {
	const avgDuration = getAverageCycleDuration(metrics)
	const successRate = getTaskSuccessRate(metrics)
	const avgDurationStr = avgDuration > 0 ? formatDuration(avgDuration) : "N/A"

	const lines = [
		`Cycles: ${metrics.cyclesCompleted} completed, ${metrics.cyclesTimedOut} timed out`,
		`Tasks: ${metrics.tasksCompleted} completed, ${metrics.tasksFailed} failed, ${metrics.tasksSkipped} skipped (${successRate}% success)`,
		`Retries: ${metrics.totalRetries} total`,
		`Ideas: ${metrics.ideasProcessed} processed`,
		`Avg cycle duration: ${avgDurationStr}`,
	]

	if (metrics.firstRunTime) {
		lines.push(`First run: ${metrics.firstRunTime}`)
	}

	return lines.join("\n")
}

/**
 * Format duration in milliseconds to human-readable string.
 * @param ms - Duration in milliseconds
 * @returns Formatted string (e.g., "5m 30s" or "1h 15m")
 */
export function formatDuration(ms: number): string {
	const seconds = Math.floor(ms / 1000)
	const minutes = Math.floor(seconds / 60)
	const hours = Math.floor(minutes / 60)

	if (hours > 0) {
		const remainingMinutes = minutes % 60
		return `${hours}h ${remainingMinutes}m`
	}

	if (minutes > 0) {
		const remainingSeconds = seconds % 60
		return `${minutes}m ${remainingSeconds}s`
	}

	return `${seconds}s`
}

/**
 * Reset metrics to default values.
 * @returns Fresh metrics with current timestamp
 */
export function resetMetrics(): Metrics {
	return {
		...DEFAULT_METRICS,
		firstRunTime: getISOTimestamp(),
		lastActivityTime: getISOTimestamp(),
	}
}
