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
}

/**
 * Load state from file, or return default state if file doesn't exist
 */
export async function loadState(stateFile: string): Promise<RuntimeState> {
	const content = await readFileOrNull(stateFile)

	if (!content) {
		return toRuntimeState(DEFAULT_STATE)
	}

	try {
		const parsed = JSON.parse(content) as Partial<State>

		// Merge with defaults to handle missing fields
		const state: State = {
			cycle: parsed.cycle ?? DEFAULT_STATE.cycle,
			phase: validatePhase(parsed.phase) ?? DEFAULT_STATE.phase,
			taskIndex: parsed.taskIndex ?? DEFAULT_STATE.taskIndex,
			sessionId: parsed.sessionId,
			lastUpdate: parsed.lastUpdate ?? DEFAULT_STATE.lastUpdate,
		}

		return toRuntimeState(state)
	} catch (err) {
		console.warn(`Warning: Failed to parse state file, using defaults: ${err}`)
		return toRuntimeState(DEFAULT_STATE)
	}
}

/**
 * Save state to file
 */
export async function saveState(stateFile: string, state: RuntimeState): Promise<void> {
	// Only persist the State fields, not RuntimeState extras
	const persistedState: State = {
		cycle: state.cycle,
		phase: state.phase,
		taskIndex: state.taskIndex,
		sessionId: state.sessionId,
		lastUpdate: getISOTimestamp(),
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
	const validPhases: Phase[] = ["init", "plan", "build", "evaluation"]
	if (typeof phase === "string" && validPhases.includes(phase as Phase)) {
		return phase as Phase
	}
	return null
}

/**
 * Reset state to initial values for a new run
 */
export function resetState(): RuntimeState {
	return toRuntimeState({
		...DEFAULT_STATE,
		lastUpdate: getISOTimestamp(),
	})
}

/**
 * Create a fresh state for starting a new cycle
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
	}
}
