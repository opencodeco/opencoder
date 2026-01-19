#!/usr/bin/env node

/**
 * Postinstall script for opencode-plugin-opencoder
 *
 * Copies agent markdown files to ~/.config/opencode/agents/
 * This allows OpenCode to discover and use the agents.
 */

import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"

import {
	AGENTS_TARGET_DIR,
	checkVersionCompatibility,
	createLogger,
	getAgentsSourceDir,
	getErrorMessage,
	getPackageRoot,
	parseCliFlags,
	parseFrontmatter,
	retryOnTransientError,
	validateAgentContent,
} from "./src/paths.mjs"

/**
 * Mock OpenCode version for compatibility checking.
 * In production, this would be obtained from the OpenCode CLI or environment.
 */
const OPENCODE_VERSION = "0.1.0"

const packageRoot = getPackageRoot(import.meta.url)
const AGENTS_SOURCE_DIR = getAgentsSourceDir(packageRoot)

/** Parse command line flags */
const flags = parseCliFlags(process.argv)
const DRY_RUN = flags.dryRun
const VERBOSE = flags.verbose

/** Print usage information and exit */
if (flags.help) {
	console.log(`Usage: node postinstall.mjs [options]

Install OpenCoder agents to ~/.config/opencode/agents/

Options:
  --dry-run   Simulate installation without copying files
  --verbose   Enable verbose output for debugging
  --help      Show this help message and exit

Examples:
  node postinstall.mjs              # Install agents
  node postinstall.mjs --dry-run    # Preview what would be installed
  node postinstall.mjs --verbose    # Install with detailed logging`)
	process.exit(0)
}

/** Create logger with verbose flag */
const logger = createLogger(VERBOSE)
const verbose = logger.verbose

/**
 * Validates an agent file by reading and validating its content,
 * including version compatibility checking.
 *
 * Performs the following validations:
 * 1. Content structure validation (frontmatter, headers, keywords)
 * 2. Version compatibility checking against current OpenCode version
 *
 * @param {string} filePath - Path to the agent file to validate
 * @returns {{ valid: boolean, error?: string }} Validation result with optional error message
 * @throws {Error} If the file does not exist (ENOENT)
 * @throws {Error} If permission is denied reading the file (EACCES)
 * @throws {Error} If the file is a directory (EISDIR)
 *
 * @example
 * // Validate an agent file
 * const result = validateAgentFile('/path/to/agent.md')
 * if (!result.valid) {
 *   console.error(`Validation failed: ${result.error}`)
 * }
 *
 * @example
 * // Use in a file copy loop
 * for (const file of agentFiles) {
 *   const validation = validateAgentFile(join(sourceDir, file))
 *   if (validation.valid) {
 *     copyFileSync(join(sourceDir, file), join(targetDir, file))
 *   }
 * }
 */
function validateAgentFile(filePath) {
	const content = readFileSync(filePath, "utf-8")
	const contentValidation = validateAgentContent(content)
	if (!contentValidation.valid) {
		return contentValidation
	}

	// Check version compatibility from frontmatter
	const frontmatter = parseFrontmatter(content)
	if (frontmatter.found && frontmatter.fields.requires) {
		const requiresVersion = frontmatter.fields.requires
		const isCompatible = checkVersionCompatibility(requiresVersion, OPENCODE_VERSION)
		if (!isCompatible) {
			return {
				valid: false,
				error: `Incompatible OpenCode version: requires ${requiresVersion}, but current version is ${OPENCODE_VERSION}`,
			}
		}
	}

	return { valid: true }
}

/**
 * Main entry point for the postinstall script.
 *
 * Copies all agent markdown files from the package's agents/ directory
 * to the OpenCode configuration directory (~/.config/opencode/agents/).
 * This enables OpenCode to discover and use the installed agents.
 *
 * The function handles partial failures gracefully, installing as many
 * agents as possible and reporting individual failures.
 *
 * @returns {Promise<void>}
 *
 * @throws {never} Does not throw - uses process.exit() for error conditions
 *
 * Exit codes:
 * - 0: All agents installed successfully, or partial success with some failures
 * - 1: Complete failure - source directory missing, no agent files found,
 *      or all file copies failed
 *
 * @example
 * // Run as postinstall script
 * main().catch((err) => {
 *   console.error("Unexpected error:", err.message)
 *   process.exit(1)
 * })
 */
async function main() {
	const prefix = DRY_RUN ? "[DRY-RUN] " : ""
	console.log(`${prefix}opencode-plugin-opencoder: Installing agents...`)

	verbose(`Package root: ${packageRoot}`)
	verbose(`Source directory: ${AGENTS_SOURCE_DIR}`)
	verbose(`Target directory: ${AGENTS_TARGET_DIR}`)
	verbose(`Dry run: ${DRY_RUN}`)

	// Create target directory if it doesn't exist
	if (!existsSync(AGENTS_TARGET_DIR)) {
		verbose(`Target directory does not exist, creating...`)
		if (DRY_RUN) {
			console.log(`${prefix}Would create ${AGENTS_TARGET_DIR}`)
		} else {
			mkdirSync(AGENTS_TARGET_DIR, { recursive: true })
			console.log(`  Created ${AGENTS_TARGET_DIR}`)
		}
	} else {
		verbose(`Target directory already exists`)
	}

	// Check if source directory exists
	verbose(`Checking source directory exists...`)
	if (!existsSync(AGENTS_SOURCE_DIR)) {
		console.error(`${prefix}  Error: Source agents directory not found at ${AGENTS_SOURCE_DIR}`)
		process.exit(1)
	}
	verbose(`Source directory found`)

	// Copy all .md files from agents/ to target
	const allFiles = readdirSync(AGENTS_SOURCE_DIR)
	verbose(`Files in source directory: ${allFiles.join(", ") || "(none)"}`)
	const files = allFiles.filter((f) => f.endsWith(".md"))
	verbose(`Markdown files found: ${files.length}`)

	if (files.length === 0) {
		console.error(`${prefix}  Error: No agent files found in agents/ directory`)
		process.exit(1)
	}

	const successes = []
	const failures = []

	for (const file of files) {
		const sourcePath = join(AGENTS_SOURCE_DIR, file)
		const targetPath = join(AGENTS_TARGET_DIR, file)
		verbose(`Processing: ${file}`)
		verbose(`  Source path: ${sourcePath}`)
		verbose(`  Target path: ${targetPath}`)

		try {
			// Check if target file exists and has different content (stale)
			if (existsSync(targetPath)) {
				const sourceContent = readFileSync(sourcePath, "utf-8")
				const targetContent = readFileSync(targetPath, "utf-8")
				if (sourceContent !== targetContent) {
					verbose(`Overwriting existing file: ${file} (content differs)`)
				} else {
					verbose(`Target file unchanged: ${file}`)
				}
			}

			if (DRY_RUN) {
				// In dry-run mode, validate source file but don't copy
				verbose(`  Validating source file (dry-run mode)...`)
				const validation = validateAgentFile(sourcePath)
				if (!validation.valid) {
					throw new Error(`Invalid agent file content: ${validation.error}`)
				}
				verbose(`  Validation passed`)
				successes.push(file)
				console.log(`${prefix}Would install: ${file} -> ${targetPath}`)
			} else {
				verbose(`  Copying file...`)
				await retryOnTransientError(() => copyFileSync(sourcePath, targetPath))

				// Verify the copy succeeded by comparing file sizes
				const sourceSize = statSync(sourcePath).size
				const targetSize = statSync(targetPath).size
				verbose(`  Source size: ${sourceSize} bytes`)
				verbose(`  Target size: ${targetSize} bytes`)

				if (sourceSize !== targetSize) {
					throw new Error(
						`File size mismatch: source=${sourceSize} bytes, target=${targetSize} bytes`,
					)
				}
				verbose(`  Size verification passed`)

				// Validate content structure
				verbose(`  Validating content structure...`)
				const validation = validateAgentFile(targetPath)
				if (!validation.valid) {
					throw new Error(`Invalid agent file content: ${validation.error}`)
				}
				verbose(`  Validation passed`)

				successes.push(file)
				console.log(`  Installed: ${file}`)
			}
		} catch (err) {
			const error = err instanceof Error ? err : new Error(String(err))
			const message = getErrorMessage(error, file, targetPath)
			failures.push({ file, message })
			console.error(`${prefix}  Failed: ${file} - ${message}`)
		}
	}

	// Print summary
	verbose(`Installation summary: ${successes.length} succeeded, ${failures.length} failed`)
	console.log("")
	if (successes.length > 0 && failures.length === 0) {
		console.log(
			`${prefix}opencode-plugin-opencoder: Successfully installed ${successes.length} agent(s)`,
		)
		console.log(`${prefix}  Location: ${AGENTS_TARGET_DIR}`)
		if (!DRY_RUN) {
			console.log("\nTo use the autonomous development loop, run:")
			console.log("  opencode @opencoder")
		}
	} else if (successes.length > 0 && failures.length > 0) {
		console.log(
			`${prefix}opencode-plugin-opencoder: Installed ${successes.length} of ${files.length} agent(s)`,
		)
		console.log(`${prefix}  Location: ${AGENTS_TARGET_DIR}`)
		console.error(`\n${prefix}  ${failures.length} file(s) failed to install:`)
		for (const { file, message } of failures) {
			console.error(`${prefix}    - ${file}: ${message}`)
		}
	} else {
		console.error(`${prefix}opencode-plugin-opencoder: Failed to install any agents`)
		for (const { file, message } of failures) {
			console.error(`${prefix}    - ${file}: ${message}`)
		}
		process.exit(1)
	}
}

main().catch((err) => {
	console.error("opencode-plugin-opencoder: Unexpected error:", err.message)
	process.exit(1)
})
