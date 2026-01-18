#!/usr/bin/env node

/**
 * Postinstall script for opencode-plugin-opencoder
 *
 * Copies agent markdown files to ~/.config/opencode/agents/
 * This allows OpenCode to discover and use the agents.
 */

import { copyFileSync, existsSync, mkdirSync, readdirSync } from "node:fs"
import { homedir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const AGENTS_SOURCE_DIR = join(__dirname, "agents")
const AGENTS_TARGET_DIR = join(homedir(), ".config", "opencode", "agents")

/**
 * Returns a user-friendly error message based on the error code
 * @param {Error & {code?: string}} error - The error object
 * @param {string} file - The filename being copied
 * @param {string} targetPath - The target path for the file
 * @returns {string} A helpful error message
 */
function getErrorMessage(error, file, targetPath) {
	const code = error.code
	switch (code) {
		case "EACCES":
			return `Permission denied. Check write permissions for ${dirname(targetPath)}`
		case "ENOSPC":
			return "Disk full. Free up space and try again"
		case "ENOENT":
			return `Source file not found: ${file}`
		case "EROFS":
			return "Read-only file system. Cannot write to target directory"
		case "EMFILE":
		case "ENFILE":
			return "Too many open files. Close some applications and try again"
		default:
			return error.message || "Unknown error"
	}
}

function main() {
	console.log("opencode-plugin-opencoder: Installing agents...")

	// Create target directory if it doesn't exist
	if (!existsSync(AGENTS_TARGET_DIR)) {
		mkdirSync(AGENTS_TARGET_DIR, { recursive: true })
		console.log(`  Created ${AGENTS_TARGET_DIR}`)
	}

	// Check if source directory exists
	if (!existsSync(AGENTS_SOURCE_DIR)) {
		console.error(`  Error: Source agents directory not found at ${AGENTS_SOURCE_DIR}`)
		process.exit(1)
	}

	// Copy all .md files from agents/ to target
	const files = readdirSync(AGENTS_SOURCE_DIR).filter((f) => f.endsWith(".md"))

	if (files.length === 0) {
		console.error("  Error: No agent files found in agents/ directory")
		process.exit(1)
	}

	const successes = []
	const failures = []

	for (const file of files) {
		const sourcePath = join(AGENTS_SOURCE_DIR, file)
		const targetPath = join(AGENTS_TARGET_DIR, file)

		try {
			copyFileSync(sourcePath, targetPath)
			successes.push(file)
			console.log(`  Installed: ${file}`)
		} catch (err) {
			const error = err instanceof Error ? err : new Error(String(err))
			const message = getErrorMessage(error, file, targetPath)
			failures.push({ file, message })
			console.error(`  Failed: ${file} - ${message}`)
		}
	}

	// Print summary
	console.log("")
	if (successes.length > 0 && failures.length === 0) {
		console.log(`opencode-plugin-opencoder: Successfully installed ${successes.length} agent(s)`)
		console.log(`  Location: ${AGENTS_TARGET_DIR}`)
		console.log("\nTo use the autonomous development loop, run:")
		console.log("  opencode @opencoder")
	} else if (successes.length > 0 && failures.length > 0) {
		console.log(
			`opencode-plugin-opencoder: Installed ${successes.length} of ${files.length} agent(s)`,
		)
		console.log(`  Location: ${AGENTS_TARGET_DIR}`)
		console.error(`\n  ${failures.length} file(s) failed to install:`)
		for (const { file, message } of failures) {
			console.error(`    - ${file}: ${message}`)
		}
	} else {
		console.error("opencode-plugin-opencoder: Failed to install any agents")
		for (const { file, message } of failures) {
			console.error(`    - ${file}: ${message}`)
		}
		process.exit(1)
	}
}

main()
