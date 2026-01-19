#!/usr/bin/env node

/**
 * Preuninstall script for opencode-plugin-opencoder
 *
 * Removes agent markdown files from ~/.config/opencode/agents/
 * This cleans up the agents when the plugin is uninstalled.
 */

import { existsSync, readdirSync, unlinkSync } from "node:fs"
import { join } from "node:path"

import {
	AGENTS_TARGET_DIR,
	createLogger,
	getAgentsSourceDir,
	getErrorMessage,
	getPackageRoot,
	parseCliFlags,
	retryOnTransientError,
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
	console.log(`Usage: node preuninstall.mjs [options]

Remove OpenCoder agents from ~/.config/opencode/agents/

Options:
  --dry-run   Simulate removal without deleting files
  --verbose   Enable verbose output for debugging
  --quiet     Suppress non-error output (for CI environments)
  --force     Force removal without prompting
  --help      Show this help message and exit

Examples:
  node preuninstall.mjs              # Remove agents
  node preuninstall.mjs --dry-run    # Preview what would be removed
  node preuninstall.mjs --verbose    # Remove with detailed logging
  node preuninstall.mjs --quiet      # Remove silently (errors only)
  node preuninstall.mjs --force      # Force remove agents`)
	process.exit(0)
}

/** Create logger with verbose and quiet flags */
const logger = createLogger(VERBOSE, QUIET)
const verbose = logger.verbose
const log = logger.log
const logError = logger.error

/**
 * Main entry point for the preuninstall script.
 *
 * Removes agent markdown files that were installed by this package
 * from the OpenCode configuration directory (~/.config/opencode/agents/).
 * Only removes files that match agents in the package's agents/ directory.
 *
 * The function handles missing directories and files gracefully,
 * continuing to remove remaining agents even if some fail.
 *
 * @returns {Promise<void>}
 *
 * @throws {never} Does not throw - handles all errors internally
 *
 * Exit codes:
 * - 0: Always exits successfully, even if no agents were removed or
 *      some removals failed. This ensures npm uninstall completes.
 *
 * @example
 * // Run as preuninstall script
 * main().catch((err) => {
 *   console.error("Unexpected error:", err.message)
 *   // Don't exit with error code - we want uninstall to succeed
 * })
 */
async function main() {
	const prefix = DRY_RUN ? "[DRY-RUN] " : ""
	log(`${prefix}opencode-plugin-opencoder: Removing agents...`)

	verbose(`Package root: ${packageRoot}`)
	verbose(`Source directory: ${AGENTS_SOURCE_DIR}`)
	verbose(`Target directory: ${AGENTS_TARGET_DIR}`)
	verbose(`Dry run: ${DRY_RUN}`)

	// Check if target directory exists
	verbose(`Checking if target directory exists...`)
	if (!existsSync(AGENTS_TARGET_DIR)) {
		verbose(`Target directory does not exist`)
		log(`${prefix}  No agents directory found, nothing to remove`)
		return
	}
	verbose(`Target directory exists`)

	// Get list of agents we installed (from source directory)
	verbose(`Checking if source directory exists...`)
	if (!existsSync(AGENTS_SOURCE_DIR)) {
		verbose(`Source directory does not exist`)
		log(`${prefix}  Source agents directory not found, skipping cleanup`)
		return
	}
	verbose(`Source directory exists`)

	const allFiles = readdirSync(AGENTS_SOURCE_DIR)
	verbose(`Files in source directory: ${allFiles.join(", ") || "(none)"}`)
	const agentFiles = allFiles.filter((f) => f.endsWith(".md"))
	verbose(`Markdown files to remove: ${agentFiles.length}`)

	if (agentFiles.length === 0) {
		log(`${prefix}  No agent files to remove`)
		return
	}

	let removedCount = 0

	for (const file of agentFiles) {
		const targetPath = join(AGENTS_TARGET_DIR, file)
		verbose(`Processing: ${file}`)
		verbose(`  Target path: ${targetPath}`)

		if (existsSync(targetPath)) {
			verbose(`  File exists, removing...`)
			try {
				if (DRY_RUN) {
					log(`${prefix}Would remove: ${targetPath}`)
					removedCount++
				} else {
					await retryOnTransientError(() => unlinkSync(targetPath))
					log(`  Removed: ${file}`)
					removedCount++
				}
				verbose(`  Successfully removed`)
			} catch (err) {
				const error = err instanceof Error ? err : new Error(String(err))
				const message = getErrorMessage(error, file, targetPath)
				logError(`${prefix}  Warning: Could not remove ${file}: ${message}`)
				verbose(`  Error details: ${error.message}`)
			}
		} else {
			verbose(`  File does not exist, skipping`)
		}
	}

	verbose(`Removal summary: ${removedCount} files removed`)
	if (removedCount > 0) {
		// Final success message - always show even in quiet mode
		console.log(`\n${prefix}opencode-plugin-opencoder: Removed ${removedCount} agent(s)`)
	} else {
		// Final status message - always show even in quiet mode
		console.log(`\n${prefix}opencode-plugin-opencoder: No agents were installed, nothing removed`)
	}
}

main().catch((err) => {
	console.error("opencode-plugin-opencoder: Unexpected error:", err.message)
	// Don't exit with error code - we want uninstall to succeed
})
