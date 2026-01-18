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

/** Create logger with verbose flag */
const logger = createLogger(VERBOSE)
const verbose = logger.verbose

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
 */
async function main() {
	const prefix = DRY_RUN ? "[DRY-RUN] " : ""
	console.log(`${prefix}opencode-plugin-opencoder: Removing agents...`)

	verbose(`Package root: ${packageRoot}`)
	verbose(`Source directory: ${AGENTS_SOURCE_DIR}`)
	verbose(`Target directory: ${AGENTS_TARGET_DIR}`)
	verbose(`Dry run: ${DRY_RUN}`)

	// Check if target directory exists
	verbose(`Checking if target directory exists...`)
	if (!existsSync(AGENTS_TARGET_DIR)) {
		verbose(`Target directory does not exist`)
		console.log(`${prefix}  No agents directory found, nothing to remove`)
		return
	}
	verbose(`Target directory exists`)

	// Get list of agents we installed (from source directory)
	verbose(`Checking if source directory exists...`)
	if (!existsSync(AGENTS_SOURCE_DIR)) {
		verbose(`Source directory does not exist`)
		console.log(`${prefix}  Source agents directory not found, skipping cleanup`)
		return
	}
	verbose(`Source directory exists`)

	const allFiles = readdirSync(AGENTS_SOURCE_DIR)
	verbose(`Files in source directory: ${allFiles.join(", ") || "(none)"}`)
	const agentFiles = allFiles.filter((f) => f.endsWith(".md"))
	verbose(`Markdown files to remove: ${agentFiles.length}`)

	if (agentFiles.length === 0) {
		console.log(`${prefix}  No agent files to remove`)
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
					console.log(`${prefix}Would remove: ${targetPath}`)
					removedCount++
				} else {
					await retryOnTransientError(() => unlinkSync(targetPath))
					console.log(`  Removed: ${file}`)
					removedCount++
				}
				verbose(`  Successfully removed`)
			} catch (err) {
				const error = err instanceof Error ? err : new Error(String(err))
				const message = getErrorMessage(error, file, targetPath)
				console.error(`${prefix}  Warning: Could not remove ${file}: ${message}`)
				verbose(`  Error details: ${error.message}`)
			}
		} else {
			verbose(`  File does not exist, skipping`)
		}
	}

	verbose(`Removal summary: ${removedCount} files removed`)
	if (removedCount > 0) {
		console.log(`\n${prefix}opencode-plugin-opencoder: Removed ${removedCount} agent(s)`)
	} else {
		console.log(`\n${prefix}opencode-plugin-opencoder: No agents were installed, nothing removed`)
	}
}

main().catch((err) => {
	console.error("opencode-plugin-opencoder: Unexpected error:", err.message)
	// Don't exit with error code - we want uninstall to succeed
})
