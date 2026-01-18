/**
 * Main autonomous loop
 *
 * Three-phase cycle:
 * 1. Plan - Generate a development plan
 * 2. Build - Build tasks from the plan
 * 3. Evaluation - Evaluate if the cycle is complete
 */

import { join } from "node:path"
import { Builder } from "./builder.ts"
import { extractEvaluationReason, isComplete, parseEvaluation } from "./evaluator.ts"
import {
	ensureDirectories,
	getISOTimestamp,
	getTimestampForFilename,
	initializePaths,
	readFileOrNull,
	writeFile,
} from "./fs.ts"
import { commitChanges, generateCommitMessage, hasChanges, pushChanges } from "./git.ts"
import { formatIdeasForSelection, loadAllIdeas, parseIdeaSelection, removeIdea } from "./ideas.ts"
import { Logger } from "./logger.ts"
import { getTasks, getUncompletedTasks, markTaskComplete, validatePlan } from "./plan.ts"
import { loadState, saveState } from "./state.ts"
import type { Config, Paths, RuntimeState } from "./types.ts"

/** Global shutdown flag */
let shutdownRequested = false

/** Force shutdown flag (second Ctrl+C) */
let forceShutdown = false

/**
 * Run the main autonomous loop
 */
export async function runLoop(config: Config): Promise<void> {
	// Initialize paths and directories
	const paths = initializePaths(config.projectDir)
	ensureDirectories(paths)

	// Initialize logger
	const logger = new Logger(paths, config.verbose)

	// Log startup info
	logStartupInfo(logger, config)

	// Load or create state
	const state = await loadState(paths.stateFile)
	logger.say(`Resuming from cycle ${state.cycle}, phase: ${state.phase}`)

	// Initialize builder
	const builder = new Builder(config, logger)

	try {
		await builder.init()
	} catch (err) {
		logger.logError(`Failed to initialize builder: ${err}`)
		process.exit(1)
	}

	// Setup signal handlers
	setupSignalHandlers(logger, builder)

	// Cleanup old logs
	const cleaned = logger.cleanup(config.logRetention)
	if (cleaned > 0) {
		logger.logVerbose(`Cleaned up ${cleaned} old log files`)
	}

	try {
		// Main loop
		while (!shutdownRequested) {
			logger.setCycleLog(state.cycle)

			try {
				switch (state.phase) {
					case "init":
					case "plan":
						await runPlanPhase(state, builder, paths, logger, config)
						break

					case "build":
						await runBuildPhase(state, builder, paths, logger, config)
						break

					case "evaluation":
						await runEvaluationPhase(state, builder, paths, logger, config)
						break
				}

				// Success - reset retry count
				state.retryCount = 0
				state.lastErrorTime = undefined
			} catch (err) {
				// Track the error
				state.retryCount++
				state.lastErrorTime = getISOTimestamp()

				logger.logError(
					`Error in ${state.phase} phase (attempt ${state.retryCount}/${config.maxRetries}): ${err}`,
				)

				// Check if we've exceeded max retries
				if (state.retryCount >= config.maxRetries) {
					logger.logError(`Max retries (${config.maxRetries}) exceeded for ${state.phase} phase`)
					logger.alert(`CRITICAL: ${state.phase} phase failed after ${config.maxRetries} attempts`)

					// Reset retry count and move to next phase or skip task
					state.retryCount = 0
					state.lastErrorTime = undefined

					if (state.phase === "build") {
						// Skip the failed task and continue
						logger.warn("Skipping failed task and continuing...")
						await skipCurrentTask(state, paths, logger)
					} else if (state.phase === "plan") {
						// Clear any stuck idea and retry planning
						state.currentIdeaPath = undefined
						state.currentIdeaFilename = undefined
						logger.warn("Clearing idea state and retrying plan phase...")
					}
					// For evaluation, just retry - it will eventually succeed or the user will intervene
				} else {
					// Retry with exponential backoff
					const backoffMs = calculateBackoff(state.retryCount, config.backoffBase)
					const backoffSec = Math.round(backoffMs / 1000)
					logger.say(`Retrying in ${backoffSec} seconds...`)

					if (!shutdownRequested) {
						await sleep(backoffMs)
					}
				}
			}

			// Persist state after each phase
			await saveState(paths.stateFile, state)

			// Check for shutdown between phases
			if (shutdownRequested) break
		}
	} finally {
		// Cleanup
		logger.flush()
		await builder.shutdown()
		logger.say("OpenCoder stopped.")
	}
}

/**
 * Log startup information.
 * Exported for testing.
 * @param logger - Logger instance
 * @param config - Application configuration
 */
export function logStartupInfo(logger: Logger, config: Config): void {
	// Get version from build-time define or package.json
	const version = typeof VERSION !== "undefined" ? VERSION : "1.0.0"

	logger.say(`\nOpenCoder v${version}`)
	logger.say(`Project: ${config.projectDir}`)
	logger.say(`Plan model: ${config.planModel}`)
	logger.say(`Build model: ${config.buildModel}`)

	if (config.userHint) {
		logger.say(`Hint: ${config.userHint}`)
	}

	logger.say("")
}

/**
 * Setup signal handlers for graceful shutdown.
 * @param logger - Logger instance for output
 * @param _builder - Builder instance (unused but kept for potential future use)
 */
function setupSignalHandlers(logger: Logger, _builder: Builder): void {
	const handleShutdown = async (signal: string): Promise<void> => {
		if (forceShutdown) {
			logger.say("\nForce quit!")
			process.exit(130)
		}

		if (shutdownRequested) {
			forceShutdown = true
			logger.say("\nPress Ctrl+C again to force quit...")
			return
		}

		shutdownRequested = true
		logger.say(`\n${signal} received. Finishing current operation...`)
		logger.say("Press Ctrl+C again to force quit.")
	}

	process.on("SIGINT", (): void => {
		handleShutdown("SIGINT")
	})
	process.on("SIGTERM", (): void => {
		handleShutdown("SIGTERM")
	})
}

/**
 * Run the plan phase
 */
async function runPlanPhase(
	state: RuntimeState,
	builder: Builder,
	paths: Paths,
	logger: Logger,
	config: Config,
): Promise<void> {
	let planContent: string
	let ideaToRemove: { path: string; filename: string } | null = null

	// Check if we're resuming with a previously selected idea
	if (state.currentIdeaPath && state.currentIdeaFilename) {
		logger.info(`Resuming with idea: ${state.currentIdeaFilename}`)

		// Try to read the idea content (it might still exist if we crashed before deleting)
		try {
			const content = await Bun.file(state.currentIdeaPath).text()
			if (content.trim()) {
				ideaToRemove = { path: state.currentIdeaPath, filename: state.currentIdeaFilename }
				planContent = await builder.runIdeaPlan(content, state.currentIdeaFilename, state.cycle)
			} else {
				// Idea file is empty or gone, clear the state and proceed with normal planning
				logger.warn(
					`Idea file ${state.currentIdeaFilename} is empty, proceeding with autonomous plan`,
				)
				state.currentIdeaPath = undefined
				state.currentIdeaFilename = undefined
				planContent = await builder.runPlan(state.cycle, config.userHint)
			}
		} catch {
			// Idea file doesn't exist anymore, but we have it in state - clear and proceed
			logger.warn(
				`Idea file ${state.currentIdeaFilename} not found, proceeding with autonomous plan`,
			)
			state.currentIdeaPath = undefined
			state.currentIdeaFilename = undefined
			planContent = await builder.runPlan(state.cycle, config.userHint)
		}
	} else {
		// Check for new ideas
		const ideas = await loadAllIdeas(paths.ideasDir)

		if (ideas.length > 0) {
			logger.info(`Found ${ideas.length} idea(s) in queue`)

			let selectedIdea: { path: string; filename: string; content: string } | null = null

			if (ideas.length === 1) {
				// Single idea - use directly
				const idea = ideas[0]
				if (!idea) throw new Error("Unexpected: ideas[0] is undefined")
				selectedIdea = idea
				logger.say(`Using idea: ${idea.filename}`)
			} else {
				// Multiple ideas - let AI select
				const formatted = formatIdeasForSelection(ideas)
				const selection = await builder.runIdeaSelection(formatted, state.cycle)
				const selectedIndex = parseIdeaSelection(selection)

				if (selectedIndex !== null && selectedIndex < ideas.length) {
					const idea = ideas[selectedIndex]
					if (!idea) throw new Error("Unexpected: selected idea is undefined")
					selectedIdea = idea
					logger.success(`AI selected idea: ${idea.filename}`)
				} else {
					// Fallback to autonomous plan
					logger.warn("Could not parse idea selection, falling back to autonomous plan")
				}
			}

			if (selectedIdea) {
				// Save the selected idea to state BEFORE creating the plan
				// This ensures we can resume if the process crashes
				state.currentIdeaPath = selectedIdea.path
				state.currentIdeaFilename = selectedIdea.filename
				await saveState(paths.stateFile, state)

				ideaToRemove = { path: selectedIdea.path, filename: selectedIdea.filename }
				planContent = await builder.runIdeaPlan(
					selectedIdea.content,
					selectedIdea.filename,
					state.cycle,
				)
			} else {
				// No valid idea selected, fall back to autonomous plan
				planContent = await builder.runPlan(state.cycle, config.userHint)
			}
		} else {
			// No ideas - autonomous plan
			planContent = await builder.runPlan(state.cycle, config.userHint)
		}
	}

	// Validate the plan
	const validation = validatePlan(planContent)
	if (!validation.valid) {
		logger.logError(`Invalid plan: ${validation.error}`)
		// Stay in plan phase to retry - don't remove the idea yet
		return
	}

	// Save the plan FIRST
	await writeFile(paths.currentPlan, planContent)

	const tasks = getTasks(planContent)
	logger.success(`Plan created with ${tasks.length} tasks`)

	// Only NOW remove the idea file, after plan is safely saved
	if (ideaToRemove) {
		const removed = removeIdea(ideaToRemove.path)
		if (removed) {
			logger.logVerbose(`Removed processed idea: ${ideaToRemove.filename}`)
		}
	}

	// Clear the idea from state since it's now processed
	state.currentIdeaPath = undefined
	state.currentIdeaFilename = undefined

	// Transition to build
	state.phase = "build"
	state.taskIndex = 0
	state.totalTasks = tasks.length
	state.sessionId = builder.getSessionId()
}

/**
 * Run the build phase
 */
async function runBuildPhase(
	state: RuntimeState,
	builder: Builder,
	paths: Paths,
	logger: Logger,
	config: Config,
): Promise<void> {
	// Read current plan
	const planContent = await readFileOrNull(paths.currentPlan)
	if (!planContent) {
		logger.logError("No plan file found, returning to plan phase")
		state.phase = "plan"
		return
	}

	const tasks = getTasks(planContent)
	const uncompletedTasks = getUncompletedTasks(planContent)

	// Check if all tasks are done
	if (uncompletedTasks.length === 0) {
		logger.success("All tasks completed!")
		state.phase = "evaluation"
		return
	}

	// Find the next uncompleted task
	const nextTask = uncompletedTasks[0]
	if (!nextTask) {
		logger.success("All tasks completed!")
		state.phase = "evaluation"
		return
	}
	const taskIndex = tasks.findIndex(
		(t) => t.lineNumber === nextTask.lineNumber && t.description === nextTask.description,
	)

	state.taskIndex = taskIndex
	state.currentTaskNum = taskIndex + 1
	state.currentTaskDesc = nextTask.description
	state.totalTasks = tasks.length

	// Check for shutdown before starting task
	if (shutdownRequested) return

	// Build the task
	logger.info(`Building task ${state.currentTaskNum}/${tasks.length}`)
	const result = await builder.runTask(
		nextTask.description,
		state.cycle,
		state.currentTaskNum,
		tasks.length,
	)

	if (result.success) {
		// Mark task complete in plan file
		const updatedPlan = markTaskComplete(planContent, nextTask.lineNumber)
		await writeFile(paths.currentPlan, updatedPlan)

		logger.success(`Task ${state.currentTaskNum}/${tasks.length} complete`)

		// Auto-commit changes if enabled
		if (config.autoCommit && hasChanges(config.projectDir)) {
			const commitMessage = generateCommitMessage(nextTask.description)
			commitChanges(config.projectDir, logger, commitMessage, config.commitSignoff)
		}
	} else {
		logger.logError(`Task failed: ${result.error}`)
		// Continue to next task or retry logic could go here
	}

	// Pause between tasks
	if (config.taskPauseSeconds > 0 && !shutdownRequested) {
		await sleep(config.taskPauseSeconds * 1000)
	}
}

/**
 * Run the evaluation phase
 */
async function runEvaluationPhase(
	state: RuntimeState,
	builder: Builder,
	paths: Paths,
	logger: Logger,
	config: Config,
): Promise<void> {
	// Read current plan for evaluation
	const planContent = await readFileOrNull(paths.currentPlan)
	if (!planContent) {
		logger.logError("No plan file found for evaluation")
		state.phase = "plan"
		return
	}

	// Run evaluation
	const response = await builder.runEvaluation(state.cycle, planContent)
	const result = parseEvaluation(response)
	const reason = extractEvaluationReason(response)

	if (isComplete(result)) {
		logger.success(`Cycle ${state.cycle} complete!`)
		if (reason) {
			logger.say(`Reason: ${reason}`)
		}

		// Archive the completed plan
		await archivePlan(paths, state.cycle, logger)

		// Auto-push commits if enabled
		if (config.autoPush && hasChanges(config.projectDir)) {
			pushChanges(config.projectDir, logger)
		}

		// Start new cycle
		state.cycle++
		state.phase = "plan"
		state.taskIndex = 0
		state.totalTasks = 0
		state.currentTaskNum = 0
		state.currentTaskDesc = ""
		state.currentIdeaPath = undefined
		state.currentIdeaFilename = undefined

		// Clear session for new cycle
		builder.clearSession()
	} else {
		logger.warn("Cycle needs more work, continuing build...")
		if (reason) {
			logger.say(`Reason: ${reason}`)
		}
		state.phase = "build"
	}
}

/**
 * Archive the completed plan to history.
 * Exported for testing.
 * @param paths - Workspace paths
 * @param cycle - Current cycle number
 * @param logger - Logger instance
 */
export async function archivePlan(paths: Paths, cycle: number, logger: Logger): Promise<void> {
	const planContent = await readFileOrNull(paths.currentPlan)
	if (!planContent) return

	const timestamp = getTimestampForFilename()
	const archiveFilename = `plan_${timestamp}_cycle${cycle}.md`
	const archivePath = join(paths.historyDir, archiveFilename)

	await writeFile(archivePath, planContent)
	logger.logVerbose(`Plan archived to ${archiveFilename}`)
}

/**
 * Sleep for a given number of milliseconds.
 * Exported for testing and reuse.
 * @param ms - Number of milliseconds to sleep
 * @returns Promise that resolves after the specified time
 */
export function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Calculate exponential backoff with jitter.
 * @param retryCount - Current retry attempt (1-based)
 * @param baseSeconds - Base delay in seconds
 * @returns Delay in milliseconds
 */
export function calculateBackoff(retryCount: number, baseSeconds: number): number {
	// Exponential backoff: base * 2^(retry-1) with max of 5 minutes
	const exponentialDelay = baseSeconds * 2 ** (retryCount - 1)
	const cappedDelay = Math.min(exponentialDelay, 300) // Max 5 minutes

	// Add jitter (up to 20% randomness) to prevent thundering herd
	const jitter = cappedDelay * 0.2 * Math.random()

	return Math.round((cappedDelay + jitter) * 1000)
}

/**
 * Skip the current task in build phase when it has failed too many times.
 * Marks the task as completed (with a note) and moves to the next task.
 */
async function skipCurrentTask(state: RuntimeState, paths: Paths, logger: Logger): Promise<void> {
	const planContent = await readFileOrNull(paths.currentPlan)
	if (!planContent) return

	const uncompletedTasks = getUncompletedTasks(planContent)

	if (uncompletedTasks.length === 0) {
		state.phase = "evaluation"
		return
	}

	const currentTask = uncompletedTasks[0]
	if (!currentTask) {
		state.phase = "evaluation"
		return
	}

	// Mark task as completed (even though it failed - to allow progress)
	const updatedPlan = markTaskComplete(planContent, currentTask.lineNumber)

	// Add a note about the skipped task
	const noteComment = `<!-- SKIPPED: Task failed after max retries -->`
	const planWithNote = updatedPlan.replace(
		new RegExp(`(- \\[x\\] ${escapeRegExp(currentTask.description)})`),
		`$1 ${noteComment}`,
	)

	await writeFile(paths.currentPlan, planWithNote)
	logger.warn(`Skipped failed task: ${currentTask.description}`)

	// Check if this was the last task
	const remainingTasks = getUncompletedTasks(planWithNote)
	if (remainingTasks.length === 0) {
		state.phase = "evaluation"
	}
}

/**
 * Escape special regex characters in a string.
 */
function escapeRegExp(str: string): string {
	return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

/**
 * Check if shutdown has been requested.
 * Exported for testing and external shutdown checks.
 */
export function isShutdownRequested(): boolean {
	return shutdownRequested
}

/**
 * Reset shutdown flags. Only for testing purposes.
 * WARNING: Do not use in production code.
 */
export function resetShutdownFlags(): void {
	shutdownRequested = false
	forceShutdown = false
}

/**
 * Request a shutdown. Used for programmatic shutdown triggering.
 */
export function requestShutdown(): void {
	shutdownRequested = true
}

// Declare VERSION as a global that will be defined at build time
declare const VERSION: string
