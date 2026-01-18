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
	getTimestampForFilename,
	initializePaths,
	readFileOrNull,
	writeFile,
} from "./fs.ts"
import {
	formatIdeasForSelection,
	loadAllIdeas,
	parseIdeaSelection,
	removeIdeaByIndex,
} from "./ideas.ts"
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
						await runEvaluationPhase(state, builder, paths, logger)
						break
				}
			} catch (err) {
				logger.logError(`Error in ${state.phase} phase: ${err}`)

				// Retry with backoff
				if (!shutdownRequested) {
					const backoffMs = config.backoffBase * 1000
					logger.say(`Retrying in ${config.backoffBase} seconds...`)
					await sleep(backoffMs)
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
		logger.say("Opencoder stopped.")
	}
}

/**
 * Log startup information
 */
function logStartupInfo(logger: Logger, config: Config): void {
	// Get version from build-time define or package.json
	const version = typeof VERSION !== "undefined" ? VERSION : "1.0.0"

	logger.say(`\nOpencoder v${version}`)
	logger.say(`Project: ${config.projectDir}`)
	logger.say(`Plan model: ${config.planModel}`)
	logger.say(`Build model: ${config.buildModel}`)

	if (config.userHint) {
		logger.say(`Hint: ${config.userHint}`)
	}

	logger.say("")
}

/**
 * Setup signal handlers for graceful shutdown
 */
function setupSignalHandlers(logger: Logger, _builder: Builder): void {
	const handleShutdown = async (signal: string) => {
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

	process.on("SIGINT", () => handleShutdown("SIGINT"))
	process.on("SIGTERM", () => handleShutdown("SIGTERM"))
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
	// Check for ideas first
	const ideas = await loadAllIdeas(paths.ideasDir)

	let planContent: string

	if (ideas.length > 0) {
		logger.info(`Found ${ideas.length} idea(s) in queue`)

		if (ideas.length === 1) {
			// Single idea - use directly
			const idea = ideas[0]
			if (!idea) throw new Error("Unexpected: ideas[0] is undefined")
			logger.say(`Using idea: ${idea.filename}`)
			removeIdeaByIndex(ideas, 0)
			planContent = await builder.runIdeaPlan(idea.content, idea.filename, state.cycle)
		} else {
			// Multiple ideas - let AI select
			const formatted = formatIdeasForSelection(ideas)
			const selection = await builder.runIdeaSelection(formatted, state.cycle)
			const selectedIndex = parseIdeaSelection(selection)

			if (selectedIndex !== null && selectedIndex < ideas.length) {
				const idea = ideas[selectedIndex]
				if (!idea) throw new Error("Unexpected: selected idea is undefined")
				logger.success(`AI selected idea: ${idea.filename}`)
				removeIdeaByIndex(ideas, selectedIndex)
				planContent = await builder.runIdeaPlan(idea.content, idea.filename, state.cycle)
			} else {
				// Fallback to autonomous plan
				logger.warn("Could not parse idea selection, falling back to autonomous plan")
				planContent = await builder.runPlan(state.cycle, config.userHint)
			}
		}
	} else {
		// No ideas - autonomous plan
		planContent = await builder.runPlan(state.cycle, config.userHint)
	}

	// Validate the plan
	const validation = validatePlan(planContent)
	if (!validation.valid) {
		logger.logError(`Invalid plan: ${validation.error}`)
		// Stay in plan phase to retry
		return
	}

	// Save the plan
	await writeFile(paths.currentPlan, planContent)

	const tasks = getTasks(planContent)
	logger.success(`Plan created with ${tasks.length} tasks`)

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

		// Start new cycle
		state.cycle++
		state.phase = "plan"
		state.taskIndex = 0
		state.totalTasks = 0
		state.currentTaskNum = 0
		state.currentTaskDesc = ""

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
 * Archive the completed plan to history
 */
async function archivePlan(paths: Paths, cycle: number, logger: Logger): Promise<void> {
	const planContent = await readFileOrNull(paths.currentPlan)
	if (!planContent) return

	const timestamp = getTimestampForFilename()
	const archiveFilename = `plan_${timestamp}_cycle${cycle}.md`
	const archivePath = join(paths.historyDir, archiveFilename)

	await writeFile(archivePath, planContent)
	logger.logVerbose(`Plan archived to ${archiveFilename}`)
}

/**
 * Sleep for a given number of milliseconds
 */
function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Check if shutdown has been requested
 */
export function isShutdownRequested(): boolean {
	return shutdownRequested
}

// Declare VERSION as a global that will be defined at build time
declare const VERSION: string
