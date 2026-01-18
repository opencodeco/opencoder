#!/usr/bin/env node

/**
 * Preuninstall script for opencode-plugin-opencoder
 *
 * Removes agent markdown files from ~/.config/opencode/agents/
 * This cleans up the agents when the plugin is uninstalled.
 */

import { existsSync, readdirSync, unlinkSync } from "node:fs"
import { homedir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const AGENTS_SOURCE_DIR = join(__dirname, "agents")
const AGENTS_TARGET_DIR = join(homedir(), ".config", "opencode", "agents")

function main() {
	console.log("opencode-plugin-opencoder: Removing agents...")

	// Check if target directory exists
	if (!existsSync(AGENTS_TARGET_DIR)) {
		console.log("  No agents directory found, nothing to remove")
		return
	}

	// Get list of agents we installed (from source directory)
	if (!existsSync(AGENTS_SOURCE_DIR)) {
		console.log("  Source agents directory not found, skipping cleanup")
		return
	}

	const agentFiles = readdirSync(AGENTS_SOURCE_DIR).filter((f) => f.endsWith(".md"))

	if (agentFiles.length === 0) {
		console.log("  No agent files to remove")
		return
	}

	let removedCount = 0

	for (const file of agentFiles) {
		const targetPath = join(AGENTS_TARGET_DIR, file)

		if (existsSync(targetPath)) {
			try {
				unlinkSync(targetPath)
				console.log(`  Removed: ${file}`)
				removedCount++
			} catch (err) {
				const message = err instanceof Error ? err.message : String(err)
				console.error(`  Warning: Could not remove ${file}: ${message}`)
			}
		}
	}

	if (removedCount > 0) {
		console.log(`\nopencode-plugin-opencoder: Removed ${removedCount} agent(s)`)
	} else {
		console.log("\nopencode-plugin-opencoder: No agents were installed, nothing removed")
	}
}

main()
