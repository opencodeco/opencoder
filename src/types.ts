/**
 * Core type definitions for Opencoder
 */

/** Phases in the autonomous loop */
export type Phase = "init" | "plan" | "build" | "evaluation"

/** Application configuration */
export interface Config {
	/** Model for plan and evaluation phases (provider/model format) */
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
	/** opencoder.json config file */
	configFile: string
}

/** Result of task build */
export interface BuildResult {
	success: boolean
	output?: string
	error?: string
}

/** Result of plan evaluation */
export type EvaluationResult = "COMPLETE" | "NEEDS_WORK"

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
}

/** CLI options from argument parsing */
export interface CliOptions {
	project?: string
	model?: string
	planModel?: string
	buildModel?: string
	verbose?: boolean
}
