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
	createLogger,
	getAgentsSourceDir,
	getErrorMessage,
	getPackageRoot,
	parseCliFlags,
	retryOnTransientError,
	validateAgentFile,
} from "./src/paths.mjs"

const packageRoot = getPackageRoot(import.meta.url)
const AGENTS_SOURCE_DIR = getAgentsSourceDir(packageRoot)

/** Parse command line flags */
const flags = parseCliFlags(process.argv)
const DRY_RUN = flags.dryRun
const VERBOSE = flags.verbose
const QUIET = flags.quiet

/** Print usage information and exit */
if (flags.help) {
	console.log(`Usage: node postinstall.mjs [options]

Install OpenCoder agents to ~/.config/opencode/agents/

Options:
  --dry-run   Simulate installation without copying files
  --verbose   Enable verbose output for debugging
  --quiet     Suppress non-error output (for CI environments)
  --force     Overwrite existing files without prompting
  --help      Show this help message and exit

Examples:
  node postinstall.mjs              # Install agents
  node postinstall.mjs --dry-run    # Preview what would be installed
  node postinstall.mjs --verbose    # Install with detailed logging
  node postinstall.mjs --quiet      # Install silently (errors only)
  node postinstall.mjs --force      # Force overwrite existing agents`)
	process.exit(0)
}

/** Create logger with verbose and quiet flags */
const logger = createLogger(VERBOSE, QUIET)
const verbose = logger.verbose
const log = logger.log
const logError = logger.error

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
	log(`${prefix}opencode-plugin-opencoder: Installing agents...`)

	verbose(`Package root: ${packageRoot}`)
	verbose(`Source directory: ${AGENTS_SOURCE_DIR}`)
	verbose(`Target directory: ${AGENTS_TARGET_DIR}`)
	verbose(`Dry run: ${DRY_RUN}`)

	// Create target directory if it doesn't exist
	if (!existsSync(AGENTS_TARGET_DIR)) {
		verbose(`Target directory does not exist, creating...`)
		if (DRY_RUN) {
			log(`${prefix}Would create ${AGENTS_TARGET_DIR}`)
		} else {
			mkdirSync(AGENTS_TARGET_DIR, { recursive: true })
			log(`  Created ${AGENTS_TARGET_DIR}`)
		}
	} else {
		verbose(`Target directory already exists`)
	}

	// Check if source directory exists
	verbose(`Checking source directory exists...`)
	if (!existsSync(AGENTS_SOURCE_DIR)) {
		logError(`${prefix}  Error: Source agents directory not found at ${AGENTS_SOURCE_DIR}`)
		process.exit(1)
	}
	verbose(`Source directory found`)

	// Copy all .md files from agents/ to target
	const allFiles = readdirSync(AGENTS_SOURCE_DIR)
	verbose(`Files in source directory: ${allFiles.join(", ") || "(none)"}`)
	const files = allFiles.filter((f) => f.endsWith(".md"))
	verbose(`Markdown files found: ${files.length}`)

	if (files.length === 0) {
		logError(`${prefix}  Error: No agent files found in agents/ directory`)
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
				log(`${prefix}Would install: ${file} -> ${targetPath}`)
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
				log(`  Installed: ${file}`)
			}
		} catch (err) {
			const error = err instanceof Error ? err : new Error(String(err))
			const message = getErrorMessage(error, file, targetPath)
			failures.push({ file, message })
			logError(`${prefix}  Failed: ${file} - ${message}`)
		}
	}

	// Print summary
	verbose(`Installation summary: ${successes.length} succeeded, ${failures.length} failed`)
	log("")
	if (successes.length > 0 && failures.length === 0) {
		// Final success message - always show even in quiet mode
		console.log(
			`${prefix}opencode-plugin-opencoder: Successfully installed ${successes.length} agent(s)`,
		)
		log(`${prefix}  Location: ${AGENTS_TARGET_DIR}`)
		if (!DRY_RUN) {
			log("\nTo use the autonomous development loop, run:")
			log("  opencode @opencoder")
		}
	} else if (successes.length > 0 && failures.length > 0) {
		// Final partial success message - always show even in quiet mode
		console.log(
			`${prefix}opencode-plugin-opencoder: Installed ${successes.length} of ${files.length} agent(s)`,
		)
		log(`${prefix}  Location: ${AGENTS_TARGET_DIR}`)
		logError(`\n${prefix}  ${failures.length} file(s) failed to install:`)
		for (const { file, message } of failures) {
			logError(`${prefix}    - ${file}: ${message}`)
		}
	} else {
		// Final failure message - always show
		console.error(`${prefix}opencode-plugin-opencoder: Failed to install any agents`)
		for (const { file, message } of failures) {
			logError(`${prefix}    - ${file}: ${message}`)
		}
		process.exit(1)
	}
}

main().catch((err) => {
	console.error("opencode-plugin-opencoder: Unexpected error:", err.message)
	process.exit(1)
})
