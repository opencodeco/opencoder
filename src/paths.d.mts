/**
 * Type declarations for paths.mjs
 */

/** Minimum character count for valid agent files */
export declare const MIN_CONTENT_LENGTH: number

/** Keywords that should appear in valid agent files (case-insensitive) */
export declare const REQUIRED_KEYWORDS: string[]

/** Required fields in YAML frontmatter */
export declare const REQUIRED_FRONTMATTER_FIELDS: string[]

/**
 * Get the package root directory from a module's import.meta.url
 */
export function getPackageRoot(importMetaUrl: string): string

/**
 * Get the source directory containing agent markdown files.
 */
export function getAgentsSourceDir(packageRoot: string): string

/**
 * The target directory where agents are installed.
 */
export declare const AGENTS_TARGET_DIR: string

/**
 * Returns a user-friendly error message based on the error code.
 */
export function getErrorMessage(
	error: Error & { code?: string },
	file: string,
	targetPath: string,
): string

/** Error codes that indicate transient errors that may succeed on retry */
export declare const TRANSIENT_ERROR_CODES: string[]

/**
 * Checks if an error is a transient error that may succeed on retry.
 */
export function isTransientError(error: Error & { code?: string }): boolean

/**
 * Options for retryOnTransientError function.
 */
export interface RetryOptions {
	/** Number of retry attempts (default: 3) */
	retries?: number
	/** Delay between retries in milliseconds (default: 100) */
	delayMs?: number
}

/**
 * Retries a function on transient filesystem errors.
 *
 * If the function throws a transient error (EAGAIN, EBUSY), it will be retried
 * up to the specified number of times with a delay between attempts.
 */
export function retryOnTransientError<T>(
	fn: () => T | Promise<T>,
	options?: RetryOptions,
): Promise<T>

/**
 * Result of parsing YAML frontmatter from markdown content.
 */
export interface ParseFrontmatterResult {
	found: boolean
	fields: Record<string, string>
	endIndex: number
}

/**
 * Parses YAML frontmatter from markdown content.
 *
 * Expects frontmatter to be delimited by --- at the start of the file.
 */
export function parseFrontmatter(content: string): ParseFrontmatterResult

/**
 * Result of validating agent content.
 */
export interface ValidateAgentContentResult {
	valid: boolean
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
 */
export function validateAgentContent(content: string): ValidateAgentContentResult

/**
 * Checks if a version satisfies a semver range requirement.
 *
 * Supports common semver range patterns:
 * - Exact version: "1.0.0" (must match exactly)
 * - Greater than or equal: ">=1.0.0"
 * - Greater than: ">1.0.0"
 * - Less than or equal: "<=1.0.0"
 * - Less than: "<1.0.0"
 * - Caret (compatible with): "^1.0.0" (>=1.0.0 and <2.0.0)
 * - Tilde (approximately): "~1.2.0" (>=1.2.0 and <1.3.0)
 *
 * @param required - The required version range (e.g., ">=0.1.0", "^1.0.0")
 * @param current - The current version to check (e.g., "1.2.3")
 * @returns True if current version satisfies the required range
 */
export function checkVersionCompatibility(required: string, current: string): boolean

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
 * @returns Logger object
 */
export function createLogger(verbose: boolean): Logger
