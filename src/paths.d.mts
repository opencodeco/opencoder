/**
 * Type declarations for paths.mjs
 */

// Re-export semver types for backwards compatibility
export {
	type ParsedVersion,
	checkVersionCompatibility,
	compareVersions,
	parseVersion,
} from "./semver.mjs"

/**
 * Mock OpenCode version for compatibility checking.
 *
 * This version string is used to check agent compatibility requirements
 * during installation. In production, this would ideally be obtained
 * from the OpenCode CLI or environment, but for now it serves as a
 * fallback/default version.
 *
 * Format: Semantic versioning (MAJOR.MINOR.PATCH)
 *
 * @example
 * import { OPENCODE_VERSION, checkVersionCompatibility } from "./paths.mjs"
 *
 * // Check if an agent requiring ">=0.1.0" is compatible
 * const isCompatible = checkVersionCompatibility(">=0.1.0", OPENCODE_VERSION)
 */
export declare const OPENCODE_VERSION: string

/**
 * List of expected agent names (without .md extension).
 * This is the single source of truth for agent filenames.
 * Frozen to prevent accidental mutation.
 */
export declare const AGENT_NAMES: readonly ["opencoder", "opencoder-planner", "opencoder-builder"]

/** Minimum character count for valid agent files */
export declare const MIN_CONTENT_LENGTH: number

/**
 * Keywords that should appear in valid agent files (case-insensitive).
 *
 * These specific keywords were chosen because they indicate the file contains
 * agent-related content:
 * - "agent": Identifies the file as defining or describing an agent
 * - "task": Indicates the file contains task execution logic or instructions
 *
 * At least one of these keywords must be present for content validation to pass.
 */
export declare const REQUIRED_KEYWORDS: readonly ["agent", "task"]

/** Required fields in YAML frontmatter */
export declare const REQUIRED_FRONTMATTER_FIELDS: string[]

/**
 * Get the package root directory from a module's import.meta.url
 *
 * @param importMetaUrl - The import.meta.url of the calling module
 * @returns The package root directory path
 */
export function getPackageRoot(importMetaUrl: string): string

/**
 * Get the source directory containing agent markdown files.
 *
 * @param packageRoot - The package root directory
 * @returns Path to the agents source directory
 */
export function getAgentsSourceDir(packageRoot: string): string

/**
 * The target directory where agents are installed.
 * Located at ~/.config/opencode/agents/
 */
export declare const AGENTS_TARGET_DIR: string

/**
 * Node.js filesystem error codes handled by `getErrorMessage`.
 *
 * These are the specific error codes that have custom user-friendly messages:
 * - `EACCES` - Permission denied
 * - `EPERM` - Operation not permitted (file may be in use or locked)
 * - `ENOSPC` - No space left on device
 * - `ENOENT` - No such file or directory
 * - `EROFS` - Read-only file system
 * - `EMFILE` - Too many open files (per-process limit)
 * - `ENFILE` - Too many open files (system-wide limit)
 * - `EEXIST` - File already exists
 * - `EISDIR` - Is a directory (expected a file)
 * - `EAGAIN` - Resource temporarily unavailable (transient)
 * - `EBUSY` - Resource busy or locked (transient)
 *
 * Any other error code falls back to the error's message property.
 */
export type HandledErrorCode =
	| "EACCES"
	| "EPERM"
	| "ENOSPC"
	| "ENOENT"
	| "EROFS"
	| "EMFILE"
	| "ENFILE"
	| "EEXIST"
	| "EISDIR"
	| "EAGAIN"
	| "EBUSY"

/**
 * Returns a user-friendly error message based on the error code.
 *
 * Translates Node.js filesystem error codes into human-readable messages
 * that help users understand and resolve installation issues.
 *
 * Handled error codes (see {@link HandledErrorCode}):
 * - `EACCES` - "Permission denied. Check write permissions for {directory}"
 * - `EPERM` - "Operation not permitted. The file may be in use or locked"
 * - `ENOSPC` - "Disk full. Free up space and try again"
 * - `ENOENT` - "Source file not found: {file}"
 * - `EROFS` - "Read-only file system. Cannot write to target directory"
 * - `EMFILE`/`ENFILE` - "Too many open files. Close some applications and try again"
 * - `EEXIST` - "Target already exists: {targetPath}"
 * - `EISDIR` - "Expected a file but found a directory: {targetPath}"
 * - `EAGAIN` - "Resource temporarily unavailable. Try again"
 * - `EBUSY` - "File is busy or locked. Try again later"
 * - (other) - Falls back to error.message or "Unknown error"
 *
 * @param error - The error object from a failed fs operation
 * @param file - The filename being processed
 * @param targetPath - The target path for the file
 * @returns A helpful error message describing the issue and potential solution
 *
 * @example
 * // Permission denied error
 * const err = Object.assign(new Error(), { code: 'EACCES' })
 * getErrorMessage(err, 'agent.md', '/home/user/.config/opencode/agents/agent.md')
 * // Returns: "Permission denied. Check write permissions for /home/user/.config/opencode/agents"
 *
 * @example
 * // File not found error
 * const err = Object.assign(new Error(), { code: 'ENOENT' })
 * getErrorMessage(err, 'missing.md', '/target/missing.md')
 * // Returns: "Source file not found: missing.md"
 */
export function getErrorMessage(
	error: Error & { code?: HandledErrorCode | string },
	file: string,
	targetPath: string,
): string

/** Error codes that indicate transient errors that may succeed on retry */
export declare const TRANSIENT_ERROR_CODES: string[]

/**
 * Checks if an error is a transient error that may succeed on retry.
 *
 * @param error - The error to check
 * @returns True if the error is transient (EAGAIN, EBUSY)
 */
export function isTransientError(error: Error & { code?: string }): boolean

/**
 * Options for retryOnTransientError function.
 */
export interface RetryOptions {
	/** Number of retry attempts (default: 3) */
	retries?: number
	/** Initial delay in milliseconds, doubles on each retry (default: 100) */
	initialDelayMs?: number
}

/**
 * Retries a function on transient filesystem errors with exponential backoff.
 *
 * If the function throws a transient error (EAGAIN, EBUSY), it will be retried
 * up to the specified number of times with exponentially increasing delays
 * between attempts (e.g., 100ms, 200ms, 400ms).
 *
 * @template T - The return type of the function
 * @param fn - The function to execute
 * @param options - Retry options (retries, initialDelayMs)
 * @returns The result of the function
 * @throws The last error if all retries fail
 *
 * @example
 * // Retry a file copy operation (delays: 100ms, 200ms, 400ms)
 * await retryOnTransientError(() => copyFileSync(src, dest))
 *
 * @example
 * // Custom retry options (delays: 50ms, 100ms, 200ms, 400ms, 800ms)
 * await retryOnTransientError(
 *   () => unlinkSync(path),
 *   { retries: 5, initialDelayMs: 50 }
 * )
 */
export function retryOnTransientError<T>(
	fn: () => T | Promise<T>,
	options?: RetryOptions,
): Promise<T>

/**
 * Result of parsing YAML frontmatter from markdown content.
 */
export interface ParseFrontmatterResult {
	/** Whether frontmatter was found in the content */
	found: boolean
	/** Reason for failure when found is false: "missing" if content doesn't start with ---, "unclosed" if closing --- not found */
	reason?: "missing" | "unclosed"
	/** Parsed key-value pairs from the frontmatter */
	fields: Record<string, string>
	/** Character index where the frontmatter ends (after closing ---\n) */
	endIndex: number
}

/**
 * Parses YAML frontmatter from markdown content.
 *
 * Expects frontmatter to be delimited by --- at the start of the file.
 *
 * @param content - The file content to parse
 * @returns Parse result with found status, fields, and end index
 * @throws {TypeError} If content is not a string
 */
export function parseFrontmatter(content: string): ParseFrontmatterResult

/**
 * Result of validating agent content.
 */
export interface ValidateAgentContentResult {
	/** Whether the content is valid */
	valid: boolean
	/** Error message if validation failed */
	error?: string
}

/**
 * Validates that agent content has a valid structure.
 *
 * Checks that the content:
 * 1. Has YAML frontmatter with required fields (version, requires)
 * 2. Starts with a markdown header (# ) after frontmatter
 * 3. Contains at least MIN_CONTENT_LENGTH characters
 * 4. Contains at least one of the expected keywords
 *
 * @param content - The agent file content to validate
 * @returns Validation result with valid status and optional error message
 */
export function validateAgentContent(content: string): ValidateAgentContentResult

/**
 * Parsed command line flags for install/uninstall scripts.
 */
export interface CliFlags {
	/** Simulate the operation without making changes */
	dryRun: boolean
	/** Enable verbose logging output */
	verbose: boolean
	/** Display help information */
	help: boolean
}

/**
 * Parses command line flags for install/uninstall scripts.
 *
 * Recognizes the following flags:
 * - `--dry-run`: Simulate the operation without making changes
 * - `--verbose`: Enable verbose logging output
 * - `--help`: Display help information
 *
 * @param argv - The command line arguments array (typically process.argv)
 * @returns Parsed flags object
 *
 * @example
 * // Parse process.argv
 * const flags = parseCliFlags(process.argv)
 * if (flags.help) {
 *   console.log("Usage: ...")
 *   process.exit(0)
 * }
 *
 * @example
 * // Parse custom arguments
 * const flags = parseCliFlags(["node", "script.js", "--verbose", "--dry-run"])
 * // flags = { dryRun: true, verbose: true, help: false }
 */
export function parseCliFlags(argv: string[]): CliFlags

/**
 * Logger object with standard and verbose logging methods.
 */
export interface Logger {
	/** Log a message to console */
	log: (message: string) => void
	/** Log a verbose message (only when verbose mode is enabled) */
	verbose: (message: string) => void
}

/**
 * Creates a logger object with standard and verbose logging methods.
 *
 * The logger provides two methods:
 * - `log(message)`: Always logs to console.log
 * - `verbose(message)`: Only logs when verbose mode is enabled, prefixed with [VERBOSE]
 *
 * @param verbose - Whether verbose logging is enabled
 * @returns Logger object with log and verbose methods
 *
 * @example
 * const logger = createLogger(true)
 * logger.log("Installing agents...")     // Always prints
 * logger.verbose("Source: /path/to/src") // Prints: [VERBOSE] Source: /path/to/src
 *
 * @example
 * const logger = createLogger(false)
 * logger.log("Installing agents...")     // Prints
 * logger.verbose("Source: /path/to/src") // Does nothing (verbose disabled)
 */
export function createLogger(verbose: boolean): Logger
