/**
 * State persistence
 */

import { getISOTimestamp, readFileOrNull, writeFile } from "./fs.ts"
import type { Phase, RuntimeState, State } from "./types.ts"

/** Default initial state */
const DEFAULT_STATE: State = {
	cycle: 1,
	phase: "init",
	taskIndex: 0,
	lastUpdate: "",
	currentIdeaPath: undefined,
	currentIdeaFilename: undefined,
	retryCount: 0,
	lastErrorTime: undefined,
	cycleStartTime: undefined,
}

/**
 * Load state from file, or return default state if file doesn't exist.
 * @param stateFile - Path to the state JSON file
 * @returns RuntimeState loaded from file or default state
 */
export async function loadState(stateFile: string): Promise<RuntimeState> {
	const content = await readFileOrNull(stateFile)

	if (!content) {
		return toRuntimeState(DEFAULT_STATE)
	}

	try {
		const parsed = JSON.parse(content) as Partial<State>

		// Validate cycle is a positive number
		if (parsed.cycle !== undefined && (typeof parsed.cycle !== "number" || parsed.cycle < 1)) {
			console.warn(
				`Warning: Invalid cycle value in ${stateFile} (expected positive number, got ${parsed.cycle}). Using default.`,
			)
			parsed.cycle = DEFAULT_STATE.cycle
		}

		// Validate taskIndex is a non-negative number
		if (
			parsed.taskIndex !== undefined &&
			(typeof parsed.taskIndex !== "number" || parsed.taskIndex < 0)
		) {
			console.warn(
				`Warning: Invalid taskIndex in ${stateFile} (expected non-negative number, got ${parsed.taskIndex}). Using default.`,
			)
			parsed.taskIndex = DEFAULT_STATE.taskIndex
		}

		// Validate phase
		const validatedPhase = validatePhase(parsed.phase)
		if (parsed.phase !== undefined && validatedPhase === null) {
			console.warn(
				`Warning: Invalid phase in ${stateFile} (got "${parsed.phase}", expected one of: init, plan, build, eval). Using default.`,
			)
		}

		// Validate retryCount is a non-negative number
		if (
			parsed.retryCount !== undefined &&
			(typeof parsed.retryCount !== "number" || parsed.retryCount < 0)
		) {
			parsed.retryCount = DEFAULT_STATE.retryCount
		}

		// Merge with defaults to handle missing fields
		const state: State = {
			cycle: parsed.cycle ?? DEFAULT_STATE.cycle,
			phase: validatedPhase ?? DEFAULT_STATE.phase,
			taskIndex: parsed.taskIndex ?? DEFAULT_STATE.taskIndex,
			sessionId: parsed.sessionId,
			lastUpdate: parsed.lastUpdate ?? DEFAULT_STATE.lastUpdate,
			currentIdeaPath: parsed.currentIdeaPath,
			currentIdeaFilename: parsed.currentIdeaFilename,
			retryCount: parsed.retryCount ?? DEFAULT_STATE.retryCount,
			lastErrorTime: parsed.lastErrorTime,
			cycleStartTime: parsed.cycleStartTime,
		}

		return toRuntimeState(state)
	} catch (err) {
		// Provide specific guidance based on error type
		if (err instanceof SyntaxError) {
			console.warn(
				`Warning: Failed to parse ${stateFile} - invalid JSON syntax. ` +
					`The file may be corrupted. Using default state. Error: ${err.message}`,
			)
		} else {
			console.warn(
				`Warning: Failed to load state from ${stateFile}. Using default state. Error: ${err}`,
			)
		}
		return toRuntimeState(DEFAULT_STATE)
	}
}

/**
 * Save state to file.
 * @param stateFile - Path to the state JSON file
 * @param state - RuntimeState to persist
 */
export async function saveState(stateFile: string, state: RuntimeState): Promise<void> {
	// Only persist the State fields, not RuntimeState extras
	const persistedState: State = {
		cycle: state.cycle,
		phase: state.phase,
		taskIndex: state.taskIndex,
		sessionId: state.sessionId,
		lastUpdate: getISOTimestamp(),
		currentIdeaPath: state.currentIdeaPath,
		currentIdeaFilename: state.currentIdeaFilename,
		retryCount: state.retryCount,
		lastErrorTime: state.lastErrorTime,
		cycleStartTime: state.cycleStartTime,
	}

	const content = JSON.stringify(persistedState, null, 2)
	await writeFile(stateFile, content)
}

/**
 * Convert State to RuntimeState with default runtime fields
 */
function toRuntimeState(state: State): RuntimeState {
	return {
		...state,
		totalTasks: 0,
		currentTaskNum: 0,
		currentTaskDesc: "",
	}
}

/**
 * Validate phase string
 */
function validatePhase(phase: unknown): Phase | null {
	const validPhases: Phase[] = ["init", "plan", "build", "eval"]
	if (typeof phase === "string" && validPhases.includes(phase as Phase)) {
		return phase as Phase
	}
	return null
}

/**
 * Reset state to initial values for a new run.
 * @returns Fresh RuntimeState with cycle 1 and init phase
 */
export function resetState(): RuntimeState {
	return toRuntimeState({
		...DEFAULT_STATE,
		lastUpdate: getISOTimestamp(),
	})
}

/**
 * Create a fresh state for starting a new cycle.
 * @param currentCycle - The current cycle number
 * @returns Partial RuntimeState with incremented cycle and reset task fields
 */
export function newCycleState(currentCycle: number): Partial<RuntimeState> {
	return {
		cycle: currentCycle + 1,
		phase: "plan",
		taskIndex: 0,
		sessionId: undefined,
		totalTasks: 0,
		currentTaskNum: 0,
		currentTaskDesc: "",
		currentIdeaPath: undefined,
		currentIdeaFilename: undefined,
		retryCount: 0,
		lastErrorTime: undefined,
		cycleStartTime: undefined,
	}
}
