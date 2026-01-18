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

/** Check for --dry-run flag in command line arguments */
const DRY_RUN = process.argv.includes("--dry-run")

/** Minimum character count for valid agent files */
const MIN_CONTENT_LENGTH = 100

/** Keywords that should appear in valid agent files (case-insensitive) */
const REQUIRED_KEYWORDS = ["agent", "task"]

/** Required fields in YAML frontmatter */
const REQUIRED_FRONTMATTER_FIELDS = ["version", "requires"]

/**
 * Parses YAML frontmatter from markdown content.
 *
 * Expects frontmatter to be delimited by --- at the start of the file.
 *
 * @param {string} content - The file content to parse
 * @returns {{ found: boolean, fields: Record<string, string>, endIndex: number }} Parse result
 */
function parseFrontmatter(content) {
	// Frontmatter must start at the beginning of the file
	if (!content.startsWith("---")) {
		return { found: false, fields: {}, endIndex: 0 }
	}

	// Find the closing ---
	const endMatch = content.indexOf("\n---", 3)
	if (endMatch === -1) {
		return { found: false, fields: {}, endIndex: 0 }
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
 * Validates that an agent file has valid content structure.
 *
 * Checks that the file:
 * 1. Has YAML frontmatter with required fields (version, requires)
 * 2. Starts with a markdown header (# ) after frontmatter
 * 3. Contains at least MIN_CONTENT_LENGTH characters
 * 4. Contains at least one of the expected keywords
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

	// Check for YAML frontmatter
	const frontmatter = parseFrontmatter(content)
	if (!frontmatter.found) {
		return {
			valid: false,
			error: "File missing YAML frontmatter (must start with ---)",
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
	const prefix = DRY_RUN ? "[DRY-RUN] " : ""
	console.log(`${prefix}opencode-plugin-opencoder: Installing agents...`)

	// Create target directory if it doesn't exist
	if (!existsSync(AGENTS_TARGET_DIR)) {
		if (DRY_RUN) {
			console.log(`${prefix}Would create ${AGENTS_TARGET_DIR}`)
		} else {
			mkdirSync(AGENTS_TARGET_DIR, { recursive: true })
			console.log(`  Created ${AGENTS_TARGET_DIR}`)
		}
	}

	// Check if source directory exists
	if (!existsSync(AGENTS_SOURCE_DIR)) {
		console.error(`${prefix}  Error: Source agents directory not found at ${AGENTS_SOURCE_DIR}`)
		process.exit(1)
	}

	// Copy all .md files from agents/ to target
	const files = readdirSync(AGENTS_SOURCE_DIR).filter((f) => f.endsWith(".md"))

	if (files.length === 0) {
		console.error(`${prefix}  Error: No agent files found in agents/ directory`)
		process.exit(1)
	}

	const successes = []
	const failures = []

	for (const file of files) {
		const sourcePath = join(AGENTS_SOURCE_DIR, file)
		const targetPath = join(AGENTS_TARGET_DIR, file)

		try {
			if (DRY_RUN) {
				// In dry-run mode, validate source file but don't copy
				const validation = validateAgentContent(sourcePath)
				if (!validation.valid) {
					throw new Error(`Invalid agent file content: ${validation.error}`)
				}
				successes.push(file)
				console.log(`${prefix}Would install: ${file} -> ${targetPath}`)
			} else {
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
			}
		} catch (err) {
			const error = err instanceof Error ? err : new Error(String(err))
			const message = getErrorMessage(error, file, targetPath)
			failures.push({ file, message })
			console.error(`${prefix}  Failed: ${file} - ${message}`)
		}
	}

	// Print summary
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

main()
