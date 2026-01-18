#!/usr/bin/env node

/**
 * Postinstall script for opencode-plugin-opencoder
 *
 * Copies agent markdown files to ~/.config/opencode/agents/
 * This allows OpenCode to discover and use the agents.
 */

import { existsSync, mkdirSync, copyFileSync, readdirSync } from "node:fs"
import { join, dirname } from "node:path"
import { homedir } from "node:os"
import { fileURLToPath } from "node:url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const AGENTS_SOURCE_DIR = join(__dirname, "agents")
const AGENTS_TARGET_DIR = join(homedir(), ".config", "opencode", "agents")

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

  for (const file of files) {
    const sourcePath = join(AGENTS_SOURCE_DIR, file)
    const targetPath = join(AGENTS_TARGET_DIR, file)

    copyFileSync(sourcePath, targetPath)
    console.log(`  Installed: ${file}`)
  }

  console.log(`\nopencode-plugin-opencoder: Successfully installed ${files.length} agent(s)`)
  console.log(`  Location: ${AGENTS_TARGET_DIR}`)
  console.log("\nTo use the autonomous development loop, run:")
  console.log("  opencode @opencoder")
}

main()
