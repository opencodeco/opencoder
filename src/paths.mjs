/**
 * Shared path constants for agent installation/uninstallation scripts.
 *
 * This module provides the common directory paths used by postinstall.mjs
 * and preuninstall.mjs to locate agent files.
 */

import { homedir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

// Re-export semver utilities for backwards compatibility
export {
	checkVersionCompatibility,
	compareVersions,
	parseVersion,
} from "./semver.mjs"

/**
 * List of expected agent names (without .md extension).
 * This is the single source of truth for agent filenames.
 */
export const AGENT_NAMES = ["opencoder", "opencoder-planner", "opencoder-builder"]

/** Minimum character count for valid agent files */
export const MIN_CONTENT_LENGTH = 100

/** Keywords that should appear in valid agent files (case-insensitive) */
export const REQUIRED_KEYWORDS = ["agent", "task"]

/** Required fields in YAML frontmatter */
export const REQUIRED_FRONTMATTER_FIELDS = ["version", "requires"]

/**
 * Get the package root directory from a module's import.meta.url
 * @param {string} importMetaUrl - The import.meta.url of the calling module
 * @returns {string} The package root directory path
 * @throws {TypeError} If importMetaUrl is not a non-empty string
 */
export function getPackageRoot(importMetaUrl) {
	if (typeof importMetaUrl !== "string") {
		throw new TypeError(
			`getPackageRoot: importMetaUrl must be a string, got ${importMetaUrl === null ? "null" : typeof importMetaUrl}`,
		)
	}
	if (importMetaUrl.trim() === "") {
		throw new TypeError("getPackageRoot: importMetaUrl must not be empty")
	}
	const __filename = fileURLToPath(importMetaUrl)
	const __dirname = dirname(__filename)
	// Both postinstall.mjs and preuninstall.mjs are in the package root
	return __dirname
}

/**
 * Get the source directory containing agent markdown files.
 * @param {string} packageRoot - The package root directory
 * @returns {string} Path to the agents source directory
 * @throws {TypeError} If packageRoot is not a non-empty string
 */
export function getAgentsSourceDir(packageRoot) {
	if (typeof packageRoot !== "string") {
		throw new TypeError(
			`getAgentsSourceDir: packageRoot must be a string, got ${packageRoot === null ? "null" : typeof packageRoot}`,
		)
	}
	if (packageRoot.trim() === "") {
		throw new TypeError("getAgentsSourceDir: packageRoot must not be empty")
	}
	return join(packageRoot, "agents")
}

/**
 * The target directory where agents are installed.
 * Located at ~/.config/opencode/agents/
 */
export const AGENTS_TARGET_DIR = join(homedir(), ".config", "opencode", "agents")

/**
 * Returns a user-friendly error message based on the error code.
 *
 * Translates Node.js filesystem error codes into human-readable messages
 * that help users understand and resolve installation issues.
 *
 * @param {Error & {code?: string}} error - The error object from a failed fs operation
 * @param {string} file - The filename being processed
 * @param {string} targetPath - The target path for the file
 * @returns {string} A helpful error message describing the issue and potential solution
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
export function getErrorMessage(error, file, targetPath) {
	const code = error.code
	switch (code) {
		case "EACCES":
			return `Permission denied. Check write permissions for ${dirname(targetPath)}`
		case "EPERM":
			return "Operation not permitted. The file may be in use or locked"
		case "ENOSPC":
			return "Disk full. Free up space and try again"
		case "ENOENT":
			return `Source file not found: ${file}`
		case "EROFS":
			return "Read-only file system. Cannot write to target directory"
		case "EMFILE":
		case "ENFILE":
			return "Too many open files. Close some applications and try again"
		case "EEXIST":
			return `Target already exists: ${targetPath}`
		case "EISDIR":
			return `Expected a file but found a directory: ${targetPath}`
		case "EAGAIN":
			return "Resource temporarily unavailable. Try again"
		case "EBUSY":
			return "File is busy or locked. Try again later"
		default:
			return error.message || "Unknown error"
	}
}

/** Error codes that indicate transient errors that may succeed on retry */
export const TRANSIENT_ERROR_CODES = ["EAGAIN", "EBUSY"]

/**
 * Checks if an error is a transient error that may succeed on retry.
 *
 * @param {Error & {code?: string}} error - The error to check
 * @returns {boolean} True if the error is transient
 */
export function isTransientError(error) {
	return TRANSIENT_ERROR_CODES.includes(error.code)
}

/**
 * Delays execution for the specified number of milliseconds.
 *
 * @param {number} ms - Milliseconds to wait
 * @returns {Promise<void>}
 */
function delay(ms) {
	return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Retries a function on transient filesystem errors with exponential backoff.
 *
 * If the function throws a transient error (EAGAIN, EBUSY), it will be retried
 * up to the specified number of times with exponentially increasing delays
 * between attempts (e.g., 100ms, 200ms, 400ms).
 *
 * @template T
 * @param {() => T | Promise<T>} fn - The function to execute
 * @param {{ retries?: number, initialDelayMs?: number }} [options] - Retry options
 * @returns {Promise<T>} The result of the function
 * @throws {Error} The last error if all retries fail
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
export async function retryOnTransientError(fn, options = {}) {
	const { retries = 3, initialDelayMs = 100 } = options
	// Sanitize initialDelayMs: clamp negative to 0, handle NaN by using default
	const sanitizedDelayMs = Number.isNaN(initialDelayMs)
		? 100
		: Math.max(0, initialDelayMs)
	let lastError

	for (let attempt = 0; attempt <= retries; attempt++) {
		try {
			return await fn()
		} catch (err) {
			lastError = err
			const isTransient = isTransientError(err)

			// If not a transient error or last attempt, throw immediately
			if (!isTransient || attempt === retries) {
				throw err
			}

			// Calculate exponential backoff delay: sanitizedDelayMs * 2^attempt
			const backoffDelay = sanitizedDelayMs * 2 ** attempt
			await delay(backoffDelay)
		}
	}

	// This should never be reached, but TypeScript needs it
	throw lastError
}

/**
 * Parses YAML frontmatter from markdown content.
 *
 * Expects frontmatter to be delimited by --- at the start of the file.
 *
 * @param {string} content - The file content to parse
 * @returns {{ found: boolean, reason?: "missing" | "unclosed", fields: Record<string, string>, endIndex: number }} Parse result
 * @throws {TypeError} If content is not a string
 */
export function parseFrontmatter(content) {
	if (typeof content !== "string") {
		throw new TypeError(
			`parseFrontmatter: content must be a string, got ${content === null ? "null" : typeof content}`,
		)
	}
	// Frontmatter must start at the beginning of the file
	if (!content.startsWith("---")) {
		return { found: false, reason: "missing", fields: {}, endIndex: 0 }
	}

	// Find the closing ---
	const endMatch = content.indexOf("\n---", 3)
	if (endMatch === -1) {
		return { found: false, reason: "unclosed", fields: {}, endIndex: 0 }
	}

	// Extract frontmatter content (between the --- delimiters)
	const frontmatterContent = content.slice(4, endMatch)
	const fields = {}

	// Parse simple key: value pairs
	for (const line of frontmatterContent.split("\n")) {
		const trimmed = line.trim()
		if (!trimmed || trimmed.startsWith("#")) continue

		const colonIndex = trimmed.indexOf(":")
		if (colonIndex === -1) continue

		const key = trimmed.slice(0, colonIndex).trim()
		let value = trimmed.slice(colonIndex + 1).trim()

		// Remove surrounding quotes if present
		if (
			(value.startsWith('"') && value.endsWith('"')) ||
			(value.startsWith("'") && value.endsWith("'"))
		) {
			value = value.slice(1, -1)
		}

		fields[key] = value
	}

	// endIndex points to the character after the closing ---\n
	const endIndex = endMatch + 4

	return { found: true, fields, endIndex }
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
 * @param {string} content - The agent file content to validate
 * @returns {{ valid: boolean, error?: string }} Validation result with optional error message
 * @throws {TypeError} If content is not a string
 */
export function validateAgentContent(content) {
	if (typeof content !== "string") {
		throw new TypeError(
			`validateAgentContent: content must be a string, got ${content === null ? "null" : typeof content}`,
		)
	}
	// Check minimum length
	if (content.length < MIN_CONTENT_LENGTH) {
		return {
			valid: false,
			error: `File too short: ${content.length} characters (minimum ${MIN_CONTENT_LENGTH})`,
		}
	}

	// Check for YAML frontmatter
	const frontmatter = parseFrontmatter(content)
	if (!frontmatter.found) {
		const errorMessage =
			frontmatter.reason === "unclosed"
				? "Unclosed YAML frontmatter (missing closing ---)"
				: "File missing YAML frontmatter (must start with ---)"
		return {
			valid: false,
			error: errorMessage,
		}
	}

	// Check for required frontmatter fields
	const missingFields = REQUIRED_FRONTMATTER_FIELDS.filter((field) => !frontmatter.fields[field])
	if (missingFields.length > 0) {
		return {
			valid: false,
			error: `Frontmatter missing required fields: ${missingFields.join(", ")}`,
		}
	}

	// Get content after frontmatter
	const contentAfterFrontmatter = content.slice(frontmatter.endIndex).trimStart()

	// Check for markdown header after frontmatter
	if (!contentAfterFrontmatter.startsWith("# ")) {
		return {
			valid: false,
			error: "File does not have a markdown header (# ) after frontmatter",
		}
	}

	// Check for required keywords (case-insensitive)
	const lowerContent = content.toLowerCase()
	const hasKeyword = REQUIRED_KEYWORDS.some((keyword) => lowerContent.includes(keyword))
	if (!hasKeyword) {
		return {
			valid: false,
			error: `File missing required keywords: ${REQUIRED_KEYWORDS.join(", ")}`,
		}
	}

	return { valid: true }
}

/**
 * Parses command line flags for install/uninstall scripts.
 *
 * Recognizes the following flags:
 * - `--dry-run`: Simulate the operation without making changes
 * - `--verbose`: Enable verbose logging output
 * - `--help`: Display help information
 *
 * @param {string[]} argv - The command line arguments array (typically process.argv)
 * @returns {{ dryRun: boolean, verbose: boolean, help: boolean }} Parsed flags
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
 * @throws {TypeError} If argv is not an array
 */
export function parseCliFlags(argv) {
	if (!Array.isArray(argv)) {
		throw new TypeError(
			`parseCliFlags: argv must be an array, got ${argv === null ? "null" : typeof argv}`,
		)
	}
	return {
		dryRun: argv.includes("--dry-run"),
		verbose: argv.includes("--verbose"),
		help: argv.includes("--help"),
	}
}

/**
 * Creates a logger object with standard and verbose logging methods.
 *
 * The logger provides two methods:
 * - `log(message)`: Always logs to console.log
 * - `verbose(message)`: Only logs when verbose mode is enabled, prefixed with [VERBOSE]
 *
 * @param {boolean} verbose - Whether verbose logging is enabled
 * @returns {{ log: (message: string) => void, verbose: (message: string) => void }} Logger object
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
export function createLogger(verbose) {
	if (typeof verbose !== "boolean") {
		throw new TypeError(
			`createLogger: verbose must be a boolean, got ${verbose === null ? "null" : typeof verbose}`,
		)
	}
	return {
		log: (message) => console.log(message),
		verbose: (message) => {
			if (verbose) {
				console.log(`[VERBOSE] ${message}`)
			}
		},
	}
}
