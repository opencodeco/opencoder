/**
 * Core type definitions for OpenCoder
 */

/** Phases in the autonomous loop */
export type Phase = "init" | "plan" | "build" | "eval"

/** Application configuration */
export interface Config {
	/** Model for plan and eval phases (provider/model format) */
	planModel: string
	/** Model for build phase (provider/model format) */
	buildModel: string
	/** Project directory to operate in */
	projectDir: string
	/** Enable verbose logging */
	verbose: boolean
	/** Optional user hint/instruction for plan */
	userHint?: string
	/** Maximum retries per operation */
	maxRetries: number
	/** Base seconds for exponential backoff */
	backoffBase: number
	/** Days to retain old logs */
	logRetention: number
	/** Seconds to pause between tasks */
	taskPauseSeconds: number
	/** Automatically commit changes after each task */
	autoCommit: boolean
	/** Automatically push commits after each cycle */
	autoPush: boolean
	/** Add signoff flag (-s) to commits */
	commitSignoff: boolean
	/** Maximum minutes per cycle before timeout (0 = no limit) */
	cycleTimeoutMinutes: number
}

/** Persisted state */
export interface State {
	/** Current cycle number */
	cycle: number
	/** Current phase */
	phase: Phase
	/** Current task index within the plan */
	taskIndex: number
	/** OpenCode session ID */
	sessionId?: string
	/** ISO timestamp of last state update */
	lastUpdate: string
	/** Path to the idea file currently being processed (if any) */
	currentIdeaPath?: string
	/** Filename of the idea currently being processed (for display) */
	currentIdeaFilename?: string
	/** Number of consecutive failures in current phase */
	retryCount: number
	/** ISO timestamp of last error (for backoff calculation) */
	lastErrorTime?: string
	/** ISO timestamp when current cycle started */
	cycleStartTime?: string
}

/** Runtime state with additional non-persisted fields */
export interface RuntimeState extends State {
	/** Total number of tasks in current plan */
	totalTasks: number
	/** Current task number (1-indexed for display) */
	currentTaskNum: number
	/** Description of current task */
	currentTaskDesc: string
}

/** Task parsed from a plan */
export interface Task {
	/** Line number in the plan file */
	lineNumber: number
	/** Task description text */
	description: string
	/** Whether the task is completed */
	completed: boolean
}

/** Idea loaded from the ideas queue */
export interface Idea {
	/** Full path to the idea file */
	path: string
	/** Filename for display */
	filename: string
	/** Content of the idea file */
	content: string
}

/** Workspace paths */
export interface Paths {
	/** .opencoder/ directory */
	opencoderDir: string
	/** .opencoder/state.json */
	stateFile: string
	/** .opencoder/current_plan.md */
	currentPlan: string
	/** .opencoder/logs/main.log */
	mainLog: string
	/** .opencoder/logs/cycles/ */
	cycleLogDir: string
	/** .opencoder/alerts.log */
	alertsFile: string
	/** .opencoder/history/ */
	historyDir: string
	/** .opencoder/ideas/ */
	ideasDir: string
	/** .opencoder/ideas/history/ */
	ideasHistoryDir: string
	/** opencoder.json config file */
	configFile: string
	/** .opencoder/metrics.json */
	metricsFile: string
}

/** Metrics data for tracking performance and statistics */
export interface Metrics {
	/** Total cycles completed successfully */
	cyclesCompleted: number
	/** Total cycles that timed out */
	cyclesTimedOut: number
	/** Total tasks completed successfully */
	tasksCompleted: number
	/** Total tasks that failed (skipped after max retries) */
	tasksFailed: number
	/** Total tasks skipped due to timeout */
	tasksSkipped: number
	/** Total retries across all operations */
	totalRetries: number
	/** Total ideas processed from queue */
	ideasProcessed: number
	/** Total duration of all completed cycles in milliseconds */
	totalCycleDurationMs: number
	/** ISO timestamp of first run */
	firstRunTime?: string
	/** ISO timestamp of last activity */
	lastActivityTime: string
}

/** Result of task build */
export interface BuildResult {
	success: boolean
	output?: string
	error?: string
}

/** Result of plan eval */
export type EvalResult = "COMPLETE" | "NEEDS_WORK"

/** Parsed model specification */
export interface ModelSpec {
	providerID: string
	modelID: string
}

/** Configuration file schema (opencoder.json) */
export interface ConfigFile {
	planModel?: string
	buildModel?: string
	verbose?: boolean
	maxRetries?: number
	backoffBase?: number
	logRetention?: number
	taskPauseSeconds?: number
	autoCommit?: boolean
	autoPush?: boolean
	commitSignoff?: boolean
	cycleTimeoutMinutes?: number
}

/** CLI options from argument parsing */
export interface CliOptions {
	project?: string
	model?: string
	planModel?: string
	buildModel?: string
	verbose?: boolean
	autoCommit?: boolean
	autoPush?: boolean
	commitSignoff?: boolean
	status?: boolean
}
