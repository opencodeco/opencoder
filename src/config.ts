/**
 * Configuration loading and management
 *
 * Priority (lowest to highest):
 * 1. Defaults
 * 2. .opencode/opencoder/config.json in project directory
 * 3. Environment variables
 * 4. CLI arguments
 */

import { existsSync } from "node:fs"
import { readFile } from "node:fs/promises"
import { join, resolve } from "node:path"
import type { CliOptions, Config, ConfigFile } from "./types.ts"

/** Default configuration values */
const DEFAULTS: Omit<Config, "planModel" | "buildModel" | "projectDir"> = {
	verbose: false,
	maxRetries: 3,
	backoffBase: 10,
	logRetention: 30,
	taskPauseSeconds: 2,
}

/** Environment variable prefix */
const ENV_PREFIX = "OPENCODER_"

/**
 * Load configuration from all sources and merge them
 */
export async function loadConfig(cliOptions: CliOptions, hint?: string): Promise<Config> {
	// Start with defaults
	const projectDir = resolveProjectDir(cliOptions.project)

	// Load config file if it exists
	const fileConfig = await loadConfigFile(projectDir)

	// Load environment variables
	const envConfig = loadEnvConfig()

	// Merge CLI options
	const cliConfig = {
		planModel: cliOptions.planModel || cliOptions.model,
		buildModel: cliOptions.buildModel || cliOptions.model,
		verbose: cliOptions.verbose,
	}

	// Merge all sources (later sources override earlier ones)
	const config: Config = {
		...DEFAULTS,
		projectDir,
		planModel: "",
		buildModel: "",
		...fileConfig,
		...envConfig,
		...filterUndefined(cliConfig),
		userHint: hint,
	}

	// Validate required fields
	validateConfig(config)

	return config
}

/**
 * Resolve the project directory
 */
function resolveProjectDir(cliProject?: string): string {
	if (cliProject) {
		return resolve(cliProject)
	}

	const envProject = process.env[`${ENV_PREFIX}PROJECT_DIR`]
	if (envProject) {
		return resolve(envProject)
	}

	return process.cwd()
}

/**
 * Load configuration from .opencode/opencoder/config.json file
 */
async function loadConfigFile(projectDir: string): Promise<Partial<Config>> {
	const configPath = join(resolve(projectDir), ".opencode", "opencoder", "config.json")

	if (!existsSync(configPath)) {
		return {}
	}

	try {
		const content = await readFile(configPath, "utf-8")
		const parsed = JSON.parse(content) as ConfigFile

		return {
			planModel: parsed.planModel,
			buildModel: parsed.buildModel,
			verbose: parsed.verbose,
			maxRetries: parsed.maxRetries,
			backoffBase: parsed.backoffBase,
			logRetention: parsed.logRetention,
			taskPauseSeconds: parsed.taskPauseSeconds,
		}
	} catch (err) {
		console.warn(`Warning: Failed to parse config.json: ${err}`)
		return {}
	}
}

/**
 * Load configuration from environment variables
 */
function loadEnvConfig(): Partial<Config> {
	const config: Partial<Config> = {}

	const planModel = process.env[`${ENV_PREFIX}PLAN_MODEL`]
	if (planModel) config.planModel = planModel

	const buildModel = process.env[`${ENV_PREFIX}BUILD_MODEL`]
	if (buildModel) config.buildModel = buildModel

	const verbose = process.env[`${ENV_PREFIX}VERBOSE`]
	if (verbose) config.verbose = verbose === "true" || verbose === "1"

	const maxRetries = process.env[`${ENV_PREFIX}MAX_RETRIES`]
	if (maxRetries) {
		const parsed = Number.parseInt(maxRetries, 10)
		if (!Number.isNaN(parsed)) config.maxRetries = parsed
	}

	const backoffBase = process.env[`${ENV_PREFIX}BACKOFF_BASE`]
	if (backoffBase) {
		const parsed = Number.parseInt(backoffBase, 10)
		if (!Number.isNaN(parsed)) config.backoffBase = parsed
	}

	const logRetention = process.env[`${ENV_PREFIX}LOG_RETENTION`]
	if (logRetention) {
		const parsed = Number.parseInt(logRetention, 10)
		if (!Number.isNaN(parsed)) config.logRetention = parsed
	}

	const taskPause = process.env[`${ENV_PREFIX}TASK_PAUSE_SECONDS`]
	if (taskPause) {
		const parsed = Number.parseInt(taskPause, 10)
		if (!Number.isNaN(parsed)) config.taskPauseSeconds = parsed
	}

	return config
}

/**
 * Validate configuration has all required fields
 */
function validateConfig(config: Config): void {
	if (!config.planModel) {
		throw new Error(
			"Missing plan model. Provide via --model, --plan-model, .opencode/opencoder/config.json, or OPENCODER_PLAN_MODEL env var.",
		)
	}

	if (!config.buildModel) {
		throw new Error(
			"Missing build model. Provide via --model, --build-model, .opencode/opencoder/config.json, or OPENCODER_BUILD_MODEL env var.",
		)
	}

	// Validate model format (should be provider/model)
	if (!isValidModelFormat(config.planModel)) {
		throw new Error(
			`Invalid plan model format: ${config.planModel}. Expected format: provider/model`,
		)
	}

	if (!isValidModelFormat(config.buildModel)) {
		throw new Error(
			`Invalid build model format: ${config.buildModel}. Expected format: provider/model`,
		)
	}

	// Validate project directory exists
	if (!existsSync(config.projectDir)) {
		throw new Error(`Project directory does not exist: ${config.projectDir}`)
	}
}

/**
 * Check if model string has valid format (provider/model)
 */
function isValidModelFormat(model: string): boolean {
	const parts = model.split("/")
	return parts.length >= 2 && (parts[0]?.length ?? 0) > 0 && (parts[1]?.length ?? 0) > 0
}

/**
 * Filter out undefined values from an object
 */
function filterUndefined<T extends object>(obj: T): Partial<T> {
	return Object.fromEntries(Object.entries(obj).filter(([_, v]) => v !== undefined)) as Partial<T>
}

/**
 * Parse a model string into provider and model ID
 */
export function parseModel(model: string): { providerID: string; modelID: string } {
	const [providerID, ...rest] = model.split("/")
	return {
		providerID: providerID ?? "",
		modelID: rest.join("/"),
	}
}
