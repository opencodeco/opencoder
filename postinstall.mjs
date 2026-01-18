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
	getAgentsSourceDir,
	getErrorMessage,
	getPackageRoot,
} from "./src/paths.mjs"

const packageRoot = getPackageRoot(import.meta.url)
const AGENTS_SOURCE_DIR = getAgentsSourceDir(packageRoot)

/** Minimum character count for valid agent files */
const MIN_CONTENT_LENGTH = 100

/** Keywords that should appear in valid agent files (case-insensitive) */
const REQUIRED_KEYWORDS = ["agent", "task"]

/**
 * Validates that an agent file has valid content structure.
 *
 * Checks that the file:
 * 1. Starts with a markdown header (# )
 * 2. Contains at least MIN_CONTENT_LENGTH characters
 * 3. Contains at least one of the expected keywords
 *
 * @param {string} filePath - Path to the agent file to validate
 * @returns {{ valid: boolean, error?: string }} Validation result with optional error message
 */
function validateAgentContent(filePath) {
	const content = readFileSync(filePath, "utf-8")

	// Check minimum length
	if (content.length < MIN_CONTENT_LENGTH) {
		return {
			valid: false,
			error: `File too short: ${content.length} characters (minimum ${MIN_CONTENT_LENGTH})`,
		}
	}

	// Check for markdown header at start
	if (!content.startsWith("# ")) {
		return {
			valid: false,
			error: "File does not start with a markdown header (# )",
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
 * Main entry point for the postinstall script.
 *
 * Copies all agent markdown files from the package's agents/ directory
 * to the OpenCode configuration directory (~/.config/opencode/agents/).
 * This enables OpenCode to discover and use the installed agents.
 *
 * The function handles partial failures gracefully, installing as many
 * agents as possible and reporting individual failures.
 *
 * @returns {void}
 *
 * @throws {never} Does not throw - uses process.exit() for error conditions
 *
 * Exit codes:
 * - 0: All agents installed successfully, or partial success with some failures
 * - 1: Complete failure - source directory missing, no agent files found,
 *      or all file copies failed
 */
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

			// Verify the copy succeeded by comparing file sizes
			const sourceSize = statSync(sourcePath).size
			const targetSize = statSync(targetPath).size

			if (sourceSize !== targetSize) {
				throw new Error(
					`File size mismatch: source=${sourceSize} bytes, target=${targetSize} bytes`,
				)
			}

			// Validate content structure
			const validation = validateAgentContent(targetPath)
			if (!validation.valid) {
				throw new Error(`Invalid agent file content: ${validation.error}`)
			}

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
