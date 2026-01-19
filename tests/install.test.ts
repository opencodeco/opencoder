import { afterEach, beforeEach, describe, expect, it } from "bun:test"
import {
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	rmSync,
	statSync,
	writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

describe("install scripts integration", () => {
	const testDir = join(tmpdir(), `opencoder-install-test-${Date.now()}`)
	const mockHomeDir = join(testDir, "home")
	const mockProjectDir = join(testDir, "project")
	const agentsSourceDir = join(mockProjectDir, "agents")
	const agentsTargetDir = join(mockHomeDir, ".config", "opencode", "agents")

	// Helper to create a modified postinstall script that uses our mock dirs
	function createMockPostinstall(): string {
		return `#!/usr/bin/env node
import { copyFileSync, existsSync, mkdirSync, readdirSync } from "node:fs"
import { join } from "node:path"

const AGENTS_SOURCE_DIR = "${agentsSourceDir.replace(/\\/g, "/")}"
const AGENTS_TARGET_DIR = "${agentsTargetDir.replace(/\\/g, "/")}"

function main() {
	console.log("opencode-plugin-opencoder: Installing agents...")

	if (!existsSync(AGENTS_TARGET_DIR)) {
		mkdirSync(AGENTS_TARGET_DIR, { recursive: true })
		console.log(\`  Created \${AGENTS_TARGET_DIR}\`)
	}

	if (!existsSync(AGENTS_SOURCE_DIR)) {
		console.error(\`  Error: Source agents directory not found at \${AGENTS_SOURCE_DIR}\`)
		process.exit(1)
	}

	const files = readdirSync(AGENTS_SOURCE_DIR).filter((f) => f.endsWith(".md"))

	if (files.length === 0) {
		console.error("  Error: No agent files found in agents/ directory")
		process.exit(1)
	}

	for (const file of files) {
		const sourcePath = join(AGENTS_SOURCE_DIR, file)
		const targetPath = join(AGENTS_TARGET_DIR, file)
		copyFileSync(sourcePath, targetPath)
		console.log(\`  Installed: \${file}\`)
	}

	console.log(\`\\nopencode-plugin-opencoder: Successfully installed \${files.length} agent(s)\`)
}

main()
`
	}

	// Helper to create a modified preuninstall script that uses our mock dirs
	function createMockPreuninstall(): string {
		return `#!/usr/bin/env node
import { existsSync, readdirSync, unlinkSync } from "node:fs"
import { join } from "node:path"

const AGENTS_SOURCE_DIR = "${agentsSourceDir.replace(/\\/g, "/")}"
const AGENTS_TARGET_DIR = "${agentsTargetDir.replace(/\\/g, "/")}"

function main() {
	console.log("opencode-plugin-opencoder: Removing agents...")

	if (!existsSync(AGENTS_TARGET_DIR)) {
		console.log("  No agents directory found, nothing to remove")
		return
	}

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
				console.log(\`  Removed: \${file}\`)
				removedCount++
			} catch (err) {
				console.error(\`  Warning: Could not remove \${file}: \${err.message}\`)
			}
		}
	}

	if (removedCount > 0) {
		console.log(\`\\nopencode-plugin-opencoder: Removed \${removedCount} agent(s)\`)
	} else {
		console.log("\\nopencode-plugin-opencoder: No agents were installed, nothing removed")
	}
}

main()
`
	}

	beforeEach(() => {
		// Create test directories
		mkdirSync(mockHomeDir, { recursive: true })
		mkdirSync(agentsSourceDir, { recursive: true })

		// Create mock agent files
		writeFileSync(join(agentsSourceDir, "opencoder.md"), "# OpenCoder Agent\nMain orchestrator")
		writeFileSync(
			join(agentsSourceDir, "opencoder-planner.md"),
			"# Planner Agent\nPlanning subagent",
		)
		writeFileSync(
			join(agentsSourceDir, "opencoder-builder.md"),
			"# Builder Agent\nBuilding subagent",
		)
	})

	afterEach(() => {
		// Clean up test directories
		if (existsSync(testDir)) {
			rmSync(testDir, { recursive: true, force: true })
		}
	})

	describe("postinstall script", () => {
		it("should copy agent files to target directory", async () => {
			const scriptPath = join(mockProjectDir, "test-postinstall.mjs")
			writeFileSync(scriptPath, createMockPostinstall())

			const proc = Bun.spawn(["node", scriptPath], {
				cwd: mockProjectDir,
				stdout: "pipe",
				stderr: "pipe",
			})

			const exitCode = await proc.exited
			expect(exitCode).toBe(0)

			// Verify files were copied
			expect(existsSync(agentsTargetDir)).toBe(true)
			expect(existsSync(join(agentsTargetDir, "opencoder.md"))).toBe(true)
			expect(existsSync(join(agentsTargetDir, "opencoder-planner.md"))).toBe(true)
			expect(existsSync(join(agentsTargetDir, "opencoder-builder.md"))).toBe(true)

			// Verify file contents match
			const sourceContent = readFileSync(join(agentsSourceDir, "opencoder.md"), "utf-8")
			const targetContent = readFileSync(join(agentsTargetDir, "opencoder.md"), "utf-8")
			expect(targetContent).toBe(sourceContent)
		})

		it("should create target directory if it does not exist", async () => {
			expect(existsSync(agentsTargetDir)).toBe(false)

			const scriptPath = join(mockProjectDir, "test-postinstall.mjs")
			writeFileSync(scriptPath, createMockPostinstall())

			const proc = Bun.spawn(["node", scriptPath], {
				cwd: mockProjectDir,
				stdout: "pipe",
				stderr: "pipe",
			})

			await proc.exited

			expect(existsSync(agentsTargetDir)).toBe(true)
		})

		it("should exit with error if source directory does not exist", async () => {
			// Remove source directory
			rmSync(agentsSourceDir, { recursive: true, force: true })

			const scriptPath = join(mockProjectDir, "test-postinstall.mjs")
			writeFileSync(scriptPath, createMockPostinstall())

			const proc = Bun.spawn(["node", scriptPath], {
				cwd: mockProjectDir,
				stdout: "pipe",
				stderr: "pipe",
			})

			const exitCode = await proc.exited
			expect(exitCode).toBe(1)

			const stderr = await new Response(proc.stderr).text()
			expect(stderr).toContain("Source agents directory not found")
		})

		it("should exit with error if no .md files in source directory", async () => {
			// Remove all .md files but keep directory
			rmSync(join(agentsSourceDir, "opencoder.md"))
			rmSync(join(agentsSourceDir, "opencoder-planner.md"))
			rmSync(join(agentsSourceDir, "opencoder-builder.md"))
			writeFileSync(join(agentsSourceDir, "readme.txt"), "Not an agent")

			const scriptPath = join(mockProjectDir, "test-postinstall.mjs")
			writeFileSync(scriptPath, createMockPostinstall())

			const proc = Bun.spawn(["node", scriptPath], {
				cwd: mockProjectDir,
				stdout: "pipe",
				stderr: "pipe",
			})

			const exitCode = await proc.exited
			expect(exitCode).toBe(1)

			const stderr = await new Response(proc.stderr).text()
			expect(stderr).toContain("No agent files found")
		})

		it("should overwrite existing files in target directory", async () => {
			// Create target directory with old content
			mkdirSync(agentsTargetDir, { recursive: true })
			writeFileSync(join(agentsTargetDir, "opencoder.md"), "# Old content")

			const scriptPath = join(mockProjectDir, "test-postinstall.mjs")
			writeFileSync(scriptPath, createMockPostinstall())

			const proc = Bun.spawn(["node", scriptPath], {
				cwd: mockProjectDir,
				stdout: "pipe",
				stderr: "pipe",
			})

			await proc.exited

			const content = readFileSync(join(agentsTargetDir, "opencoder.md"), "utf-8")
			expect(content).toBe("# OpenCoder Agent\nMain orchestrator")
		})

		it("should only copy .md files", async () => {
			// Add non-.md files to source
			writeFileSync(join(agentsSourceDir, "readme.txt"), "Not an agent")
			writeFileSync(join(agentsSourceDir, "config.json"), "{}")

			const scriptPath = join(mockProjectDir, "test-postinstall.mjs")
			writeFileSync(scriptPath, createMockPostinstall())

			const proc = Bun.spawn(["node", scriptPath], {
				cwd: mockProjectDir,
				stdout: "pipe",
				stderr: "pipe",
			})

			await proc.exited

			const targetFiles = readdirSync(agentsTargetDir)
			expect(targetFiles).toHaveLength(3)
			expect(targetFiles.every((f) => f.endsWith(".md"))).toBe(true)
			expect(targetFiles).not.toContain("readme.txt")
			expect(targetFiles).not.toContain("config.json")
		})
	})

	describe("file integrity verification", () => {
		// Helper that creates a postinstall script with integrity validation
		function createPostinstallWithIntegrity(): string {
			return `#!/usr/bin/env node
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"

const AGENTS_SOURCE_DIR = "${agentsSourceDir.replace(/\\/g, "/")}"
const AGENTS_TARGET_DIR = "${agentsTargetDir.replace(/\\/g, "/")}"

const MIN_CONTENT_LENGTH = 100
const REQUIRED_KEYWORDS = ["agent", "task"]
const REQUIRED_FRONTMATTER_FIELDS = ["version", "requires"]

function parseFrontmatter(content) {
	if (!content.startsWith("---")) {
		return { found: false, fields: {}, endIndex: 0 }
	}

	const endMatch = content.indexOf("\\n---", 3)
	if (endMatch === -1) {
		return { found: false, fields: {}, endIndex: 0 }
	}

	const frontmatterContent = content.slice(4, endMatch)
	const fields = {}

	for (const line of frontmatterContent.split("\\n")) {
		const trimmed = line.trim()
		if (!trimmed || trimmed.startsWith("#")) continue

		const colonIndex = trimmed.indexOf(":")
		if (colonIndex === -1) continue

		const key = trimmed.slice(0, colonIndex).trim()
		let value = trimmed.slice(colonIndex + 1).trim()

		if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
			value = value.slice(1, -1)
		}

		fields[key] = value
	}

	const endIndex = endMatch + 4
	return { found: true, fields, endIndex }
}

function validateAgentContent(filePath) {
	const content = readFileSync(filePath, "utf-8")

	if (content.length < MIN_CONTENT_LENGTH) {
		return {
			valid: false,
			error: \`File too short: \${content.length} characters (minimum \${MIN_CONTENT_LENGTH})\`,
		}
	}

	const frontmatter = parseFrontmatter(content)
	if (!frontmatter.found) {
		return {
			valid: false,
			error: "File missing YAML frontmatter (must start with ---)",
		}
	}

	const missingFields = REQUIRED_FRONTMATTER_FIELDS.filter((field) => !frontmatter.fields[field])
	if (missingFields.length > 0) {
		return {
			valid: false,
			error: \`Frontmatter missing required fields: \${missingFields.join(", ")}\`,
		}
	}

	const contentAfterFrontmatter = content.slice(frontmatter.endIndex).trimStart()

	if (!contentAfterFrontmatter.startsWith("# ")) {
		return {
			valid: false,
			error: "File does not have a markdown header (# ) after frontmatter",
		}
	}

	const lowerContent = content.toLowerCase()
	const hasKeyword = REQUIRED_KEYWORDS.some((keyword) => lowerContent.includes(keyword))
	if (!hasKeyword) {
		return {
			valid: false,
			error: \`File missing required keywords: \${REQUIRED_KEYWORDS.join(", ")}\`,
		}
	}

	return { valid: true }
}

function main() {
	console.log("opencode-plugin-opencoder: Installing agents...")

	if (!existsSync(AGENTS_TARGET_DIR)) {
		mkdirSync(AGENTS_TARGET_DIR, { recursive: true })
		console.log(\`  Created \${AGENTS_TARGET_DIR}\`)
	}

	if (!existsSync(AGENTS_SOURCE_DIR)) {
		console.error(\`  Error: Source agents directory not found at \${AGENTS_SOURCE_DIR}\`)
		process.exit(1)
	}

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

			const sourceSize = statSync(sourcePath).size
			const targetSize = statSync(targetPath).size

			if (sourceSize !== targetSize) {
				throw new Error(
					\`File size mismatch: source=\${sourceSize} bytes, target=\${targetSize} bytes\`,
				)
			}

			const validation = validateAgentContent(targetPath)
			if (!validation.valid) {
				throw new Error(\`Invalid agent file content: \${validation.error}\`)
			}

			successes.push(file)
			console.log(\`  Installed: \${file}\`)
		} catch (err) {
			failures.push({ file, message: err.message })
			console.error(\`  Failed: \${file} - \${err.message}\`)
		}
	}

	console.log("")
	if (successes.length > 0 && failures.length === 0) {
		console.log(\`opencode-plugin-opencoder: Successfully installed \${successes.length} agent(s)\`)
	} else if (successes.length > 0 && failures.length > 0) {
		console.log(\`opencode-plugin-opencoder: Installed \${successes.length} of \${files.length} agent(s)\`)
		console.error(\`  \${failures.length} file(s) failed to install:\`)
		for (const { file, message } of failures) {
			console.error(\`    - \${file}: \${message}\`)
		}
	} else {
		console.error("opencode-plugin-opencoder: Failed to install any agents")
		for (const { file, message } of failures) {
			console.error(\`    - \${file}: \${message}\`)
		}
		process.exit(1)
	}
}

main()
`
		}

		// Valid agent content for tests (meets all requirements including frontmatter)
		const validAgentContent = `---
version: 0.1.0
requires: ">=0.1.0"
---

# Test Agent

This is a valid agent file that contains enough content to pass the minimum length requirement.

## Task Execution

The agent handles various tasks and operations in the system.
`

		beforeEach(() => {
			// Override the default agent files with valid content
			writeFileSync(join(agentsSourceDir, "opencoder.md"), validAgentContent)
			writeFileSync(join(agentsSourceDir, "opencoder-planner.md"), validAgentContent)
			writeFileSync(join(agentsSourceDir, "opencoder-builder.md"), validAgentContent)
		})

		it("should reject files that are too short", async () => {
			// Create a file that's too short (less than 100 characters)
			writeFileSync(join(agentsSourceDir, "short-agent.md"), "# Short\nToo short content")

			const scriptPath = join(mockProjectDir, "test-postinstall.mjs")
			writeFileSync(scriptPath, createPostinstallWithIntegrity())

			const proc = Bun.spawn(["node", scriptPath], {
				cwd: mockProjectDir,
				stdout: "pipe",
				stderr: "pipe",
			})

			const exitCode = await proc.exited
			// Should succeed partially (other files are valid)
			expect(exitCode).toBe(0)

			const stderr = await new Response(proc.stderr).text()
			expect(stderr).toContain("short-agent.md")
			expect(stderr).toContain("File too short")
		})

		it("should reject files without YAML frontmatter", async () => {
			// Create a file without frontmatter (starts with header directly)
			const contentWithoutFrontmatter = `# Test Agent Without Frontmatter

This file does not have YAML frontmatter at the start.
It has enough content and contains the word agent and task.
This should fail the validation because it doesn't start with ---.`
			writeFileSync(join(agentsSourceDir, "no-frontmatter.md"), contentWithoutFrontmatter)

			const scriptPath = join(mockProjectDir, "test-postinstall.mjs")
			writeFileSync(scriptPath, createPostinstallWithIntegrity())

			const proc = Bun.spawn(["node", scriptPath], {
				cwd: mockProjectDir,
				stdout: "pipe",
				stderr: "pipe",
			})

			await proc.exited

			const stderr = await new Response(proc.stderr).text()
			expect(stderr).toContain("no-frontmatter.md")
			expect(stderr).toContain("missing YAML frontmatter")
		})

		it("should reject files with frontmatter missing required fields", async () => {
			// Create a file with frontmatter but missing 'requires' field
			const contentMissingRequires = `---
version: 0.1.0
---

# Test Agent

This file has frontmatter but is missing the requires field.
It contains the word agent and task to pass keyword validation.
This should fail because requires is a required frontmatter field.`
			writeFileSync(join(agentsSourceDir, "missing-requires.md"), contentMissingRequires)

			const scriptPath = join(mockProjectDir, "test-postinstall.mjs")
			writeFileSync(scriptPath, createPostinstallWithIntegrity())

			const proc = Bun.spawn(["node", scriptPath], {
				cwd: mockProjectDir,
				stdout: "pipe",
				stderr: "pipe",
			})

			await proc.exited

			const stderr = await new Response(proc.stderr).text()
			expect(stderr).toContain("missing-requires.md")
			expect(stderr).toContain("Frontmatter missing required fields")
			expect(stderr).toContain("requires")
		})

		it("should reject files with frontmatter missing version field", async () => {
			// Create a file with frontmatter but missing 'version' field
			const contentMissingVersion = `---
requires: ">=0.1.0"
---

# Test Agent

This file has frontmatter but is missing the version field.
It contains the word agent and task to pass keyword validation.
This should fail because version is a required frontmatter field.`
			writeFileSync(join(agentsSourceDir, "missing-version.md"), contentMissingVersion)

			const scriptPath = join(mockProjectDir, "test-postinstall.mjs")
			writeFileSync(scriptPath, createPostinstallWithIntegrity())

			const proc = Bun.spawn(["node", scriptPath], {
				cwd: mockProjectDir,
				stdout: "pipe",
				stderr: "pipe",
			})

			await proc.exited

			const stderr = await new Response(proc.stderr).text()
			expect(stderr).toContain("missing-version.md")
			expect(stderr).toContain("Frontmatter missing required fields")
			expect(stderr).toContain("version")
		})

		it("should reject files without markdown header after frontmatter", async () => {
			// Create a file with frontmatter but no header after it
			const contentWithoutHeader = `---
version: 0.1.0
requires: ">=0.1.0"
---

This file has valid frontmatter but no markdown header after it.
It has enough content and contains the word agent and task.
This should fail the validation because it needs a # header.`
			writeFileSync(join(agentsSourceDir, "no-header.md"), contentWithoutHeader)

			const scriptPath = join(mockProjectDir, "test-postinstall.mjs")
			writeFileSync(scriptPath, createPostinstallWithIntegrity())

			const proc = Bun.spawn(["node", scriptPath], {
				cwd: mockProjectDir,
				stdout: "pipe",
				stderr: "pipe",
			})

			await proc.exited

			const stderr = await new Response(proc.stderr).text()
			expect(stderr).toContain("no-header.md")
			expect(stderr).toContain("does not have a markdown header")
		})

		it("should reject files missing required keywords", async () => {
			// Create a file with frontmatter, header, and length but missing keywords
			const contentWithoutKeywords = `---
version: 0.1.0
requires: ">=0.1.0"
---

# Valid Header

This file has a valid markdown header and enough content length.
However, it does not contain any of the required keywords.
It talks about processes and workflows but not the specific terms.
This should fail the validation check for missing keywords.`
			writeFileSync(join(agentsSourceDir, "no-keywords.md"), contentWithoutKeywords)

			const scriptPath = join(mockProjectDir, "test-postinstall.mjs")
			writeFileSync(scriptPath, createPostinstallWithIntegrity())

			const proc = Bun.spawn(["node", scriptPath], {
				cwd: mockProjectDir,
				stdout: "pipe",
				stderr: "pipe",
			})

			await proc.exited

			const stderr = await new Response(proc.stderr).text()
			expect(stderr).toContain("no-keywords.md")
			expect(stderr).toContain("missing required keywords")
		})

		it("should accept files with valid content structure", async () => {
			const scriptPath = join(mockProjectDir, "test-postinstall.mjs")
			writeFileSync(scriptPath, createPostinstallWithIntegrity())

			const proc = Bun.spawn(["node", scriptPath], {
				cwd: mockProjectDir,
				stdout: "pipe",
				stderr: "pipe",
			})

			const exitCode = await proc.exited
			expect(exitCode).toBe(0)

			const stdout = await new Response(proc.stdout).text()
			expect(stdout).toContain("Successfully installed 3 agent(s)")

			// Verify all files were copied
			expect(existsSync(join(agentsTargetDir, "opencoder.md"))).toBe(true)
			expect(existsSync(join(agentsTargetDir, "opencoder-planner.md"))).toBe(true)
			expect(existsSync(join(agentsTargetDir, "opencoder-builder.md"))).toBe(true)
		})

		it("should fail completely when all files are invalid", async () => {
			// Replace all agent files with invalid content
			writeFileSync(join(agentsSourceDir, "opencoder.md"), "Too short")
			writeFileSync(join(agentsSourceDir, "opencoder-planner.md"), "Also short")
			writeFileSync(join(agentsSourceDir, "opencoder-builder.md"), "Short too")

			const scriptPath = join(mockProjectDir, "test-postinstall.mjs")
			writeFileSync(scriptPath, createPostinstallWithIntegrity())

			const proc = Bun.spawn(["node", scriptPath], {
				cwd: mockProjectDir,
				stdout: "pipe",
				stderr: "pipe",
			})

			const exitCode = await proc.exited
			expect(exitCode).toBe(1)

			const stderr = await new Response(proc.stderr).text()
			expect(stderr).toContain("Failed to install any agents")
		})

		it("should report partial success when some files are invalid", async () => {
			// Keep one valid, make others invalid
			writeFileSync(join(agentsSourceDir, "opencoder-planner.md"), "Too short")
			writeFileSync(join(agentsSourceDir, "opencoder-builder.md"), "Also short")

			const scriptPath = join(mockProjectDir, "test-postinstall.mjs")
			writeFileSync(scriptPath, createPostinstallWithIntegrity())

			const proc = Bun.spawn(["node", scriptPath], {
				cwd: mockProjectDir,
				stdout: "pipe",
				stderr: "pipe",
			})

			const exitCode = await proc.exited
			expect(exitCode).toBe(0)

			const stdout = await new Response(proc.stdout).text()
			expect(stdout).toContain("Installed 1 of 3 agent(s)")

			const stderr = await new Response(proc.stderr).text()
			expect(stderr).toContain("2 file(s) failed to install")
		})

		it("should verify file size matches after copy", async () => {
			// This test verifies the size check logic is present
			// The actual size mismatch is hard to simulate without mocking fs
			// So we verify that valid files pass the size check
			const scriptPath = join(mockProjectDir, "test-postinstall.mjs")
			writeFileSync(scriptPath, createPostinstallWithIntegrity())

			const proc = Bun.spawn(["node", scriptPath], {
				cwd: mockProjectDir,
				stdout: "pipe",
				stderr: "pipe",
			})

			await proc.exited

			// Verify files have matching sizes
			const sourceSize = statSync(join(agentsSourceDir, "opencoder.md")).size
			const targetSize = statSync(join(agentsTargetDir, "opencoder.md")).size
			expect(targetSize).toBe(sourceSize)
		})

		it("should accept keyword 'agent' case-insensitively", async () => {
			const contentWithUpperAgent = `---
version: 0.1.0
requires: ">=0.1.0"
---

# Test File

This file contains the word AGENT in uppercase and has enough content.
The validation should accept this because keyword matching is case-insensitive.
Adding more text to ensure minimum length requirement is satisfied here.`
			writeFileSync(join(agentsSourceDir, "upper-agent.md"), contentWithUpperAgent)

			const scriptPath = join(mockProjectDir, "test-postinstall.mjs")
			writeFileSync(scriptPath, createPostinstallWithIntegrity())

			const proc = Bun.spawn(["node", scriptPath], {
				cwd: mockProjectDir,
				stdout: "pipe",
				stderr: "pipe",
			})

			const exitCode = await proc.exited
			expect(exitCode).toBe(0)

			// The file should be installed
			expect(existsSync(join(agentsTargetDir, "upper-agent.md"))).toBe(true)
		})

		it("should accept keyword 'task' as alternative to 'agent'", async () => {
			const contentWithTask = `---
version: 0.1.0
requires: ">=0.1.0"
---

# Test File

This file contains the word TASK but not the other keyword.
The validation should accept this because either keyword is sufficient.
Adding more text to ensure minimum length requirement is satisfied here.`
			writeFileSync(join(agentsSourceDir, "task-only.md"), contentWithTask)

			const scriptPath = join(mockProjectDir, "test-postinstall.mjs")
			writeFileSync(scriptPath, createPostinstallWithIntegrity())

			const proc = Bun.spawn(["node", scriptPath], {
				cwd: mockProjectDir,
				stdout: "pipe",
				stderr: "pipe",
			})

			const exitCode = await proc.exited
			expect(exitCode).toBe(0)

			// The file should be installed
			expect(existsSync(join(agentsTargetDir, "task-only.md"))).toBe(true)
		})
	})

	describe("version compatibility validation", () => {
		// Helper that creates a postinstall script with version compatibility checking
		function createPostinstallWithVersionCheck(mockOpenCodeVersion: string): string {
			return `#!/usr/bin/env node
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"

const AGENTS_SOURCE_DIR = "${agentsSourceDir.replace(/\\/g, "/")}"
const AGENTS_TARGET_DIR = "${agentsTargetDir.replace(/\\/g, "/")}"
const OPENCODE_VERSION = "${mockOpenCodeVersion}"

const MIN_CONTENT_LENGTH = 100
const REQUIRED_KEYWORDS = ["agent", "task"]
const REQUIRED_FRONTMATTER_FIELDS = ["version", "requires"]

function parseVersion(version) {
	const match = version.match(/^(\\d+)\\.(\\d+)\\.(\\d+)$/)
	if (!match) return null
	return {
		major: Number.parseInt(match[1], 10),
		minor: Number.parseInt(match[2], 10),
		patch: Number.parseInt(match[3], 10),
	}
}

function compareVersions(a, b) {
	if (a.major !== b.major) return a.major < b.major ? -1 : 1
	if (a.minor !== b.minor) return a.minor < b.minor ? -1 : 1
	if (a.patch !== b.patch) return a.patch < b.patch ? -1 : 1
	return 0
}

function checkVersionCompatibility(required, current) {
	const currentVersion = parseVersion(current)
	if (!currentVersion) return false

	// Handle caret range
	if (required.startsWith("^")) {
		const rangeVersion = parseVersion(required.slice(1))
		if (!rangeVersion) return false
		if (compareVersions(currentVersion, rangeVersion) < 0) return false
		if (rangeVersion.major === 0) {
			return currentVersion.major === 0 && currentVersion.minor === rangeVersion.minor
		}
		return currentVersion.major === rangeVersion.major
	}

	// Handle tilde range
	if (required.startsWith("~")) {
		const rangeVersion = parseVersion(required.slice(1))
		if (!rangeVersion) return false
		if (compareVersions(currentVersion, rangeVersion) < 0) return false
		return currentVersion.major === rangeVersion.major && currentVersion.minor === rangeVersion.minor
	}

	// Handle >= operator
	if (required.startsWith(">=")) {
		const rangeVersion = parseVersion(required.slice(2))
		if (!rangeVersion) return false
		return compareVersions(currentVersion, rangeVersion) >= 0
	}

	// Handle > operator
	if (required.startsWith(">")) {
		const rangeVersion = parseVersion(required.slice(1))
		if (!rangeVersion) return false
		return compareVersions(currentVersion, rangeVersion) > 0
	}

	// Handle <= operator
	if (required.startsWith("<=")) {
		const rangeVersion = parseVersion(required.slice(2))
		if (!rangeVersion) return false
		return compareVersions(currentVersion, rangeVersion) <= 0
	}

	// Handle < operator
	if (required.startsWith("<")) {
		const rangeVersion = parseVersion(required.slice(1))
		if (!rangeVersion) return false
		return compareVersions(currentVersion, rangeVersion) < 0
	}

	// Handle exact version match
	const rangeVersion = parseVersion(required)
	if (!rangeVersion) return false
	return compareVersions(currentVersion, rangeVersion) === 0
}

function parseFrontmatter(content) {
	if (!content.startsWith("---")) {
		return { found: false, fields: {}, endIndex: 0 }
	}

	const endMatch = content.indexOf("\\n---", 3)
	if (endMatch === -1) {
		return { found: false, fields: {}, endIndex: 0 }
	}

	const frontmatterContent = content.slice(4, endMatch)
	const fields = {}

	for (const line of frontmatterContent.split("\\n")) {
		const trimmed = line.trim()
		if (!trimmed || trimmed.startsWith("#")) continue

		const colonIndex = trimmed.indexOf(":")
		if (colonIndex === -1) continue

		const key = trimmed.slice(0, colonIndex).trim()
		let value = trimmed.slice(colonIndex + 1).trim()

		if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
			value = value.slice(1, -1)
		}

		fields[key] = value
	}

	const endIndex = endMatch + 4
	return { found: true, fields, endIndex }
}

function validateAgentContent(content) {
	if (content.length < MIN_CONTENT_LENGTH) {
		return {
			valid: false,
			error: \`File too short: \${content.length} characters (minimum \${MIN_CONTENT_LENGTH})\`,
		}
	}

	const frontmatter = parseFrontmatter(content)
	if (!frontmatter.found) {
		return {
			valid: false,
			error: "File missing YAML frontmatter (must start with ---)",
		}
	}

	const missingFields = REQUIRED_FRONTMATTER_FIELDS.filter((field) => !frontmatter.fields[field])
	if (missingFields.length > 0) {
		return {
			valid: false,
			error: \`Frontmatter missing required fields: \${missingFields.join(", ")}\`,
		}
	}

	const contentAfterFrontmatter = content.slice(frontmatter.endIndex).trimStart()

	if (!contentAfterFrontmatter.startsWith("# ")) {
		return {
			valid: false,
			error: "File does not have a markdown header (# ) after frontmatter",
		}
	}

	const lowerContent = content.toLowerCase()
	const hasKeyword = REQUIRED_KEYWORDS.some((keyword) => lowerContent.includes(keyword))
	if (!hasKeyword) {
		return {
			valid: false,
			error: \`File missing required keywords: \${REQUIRED_KEYWORDS.join(", ")}\`,
		}
	}

	return { valid: true }
}

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
				error: \`Incompatible OpenCode version: requires \${requiresVersion}, but current version is \${OPENCODE_VERSION}\`,
			}
		}
	}

	return { valid: true }
}

function main() {
	console.log("opencode-plugin-opencoder: Installing agents...")

	if (!existsSync(AGENTS_TARGET_DIR)) {
		mkdirSync(AGENTS_TARGET_DIR, { recursive: true })
		console.log(\`  Created \${AGENTS_TARGET_DIR}\`)
	}

	if (!existsSync(AGENTS_SOURCE_DIR)) {
		console.error(\`  Error: Source agents directory not found at \${AGENTS_SOURCE_DIR}\`)
		process.exit(1)
	}

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

			const sourceSize = statSync(sourcePath).size
			const targetSize = statSync(targetPath).size

			if (sourceSize !== targetSize) {
				throw new Error(
					\`File size mismatch: source=\${sourceSize} bytes, target=\${targetSize} bytes\`,
				)
			}

			const validation = validateAgentFile(targetPath)
			if (!validation.valid) {
				throw new Error(\`Invalid agent file: \${validation.error}\`)
			}

			successes.push(file)
			console.log(\`  Installed: \${file}\`)
		} catch (err) {
			failures.push({ file, message: err.message })
			console.error(\`  Failed: \${file} - \${err.message}\`)
		}
	}

	console.log("")
	if (successes.length > 0 && failures.length === 0) {
		console.log(\`opencode-plugin-opencoder: Successfully installed \${successes.length} agent(s)\`)
	} else if (successes.length > 0 && failures.length > 0) {
		console.log(\`opencode-plugin-opencoder: Installed \${successes.length} of \${files.length} agent(s)\`)
		console.error(\`  \${failures.length} file(s) failed to install:\`)
		for (const { file, message } of failures) {
			console.error(\`    - \${file}: \${message}\`)
		}
	} else {
		console.error("opencode-plugin-opencoder: Failed to install any agents")
		for (const { file, message } of failures) {
			console.error(\`    - \${file}: \${message}\`)
		}
		process.exit(1)
	}
}

main()
`
		}

		// Valid agent content that requires OpenCode >= 0.1.0
		const validAgentRequiresGte010 = `---
version: 0.1.0
requires: ">=0.1.0"
---

# Test Agent

This is a valid agent file that contains enough content to pass the minimum length requirement.

## Task Execution

The agent handles various tasks and operations in the system.
`

		// Agent content that requires OpenCode >= 2.0.0 (incompatible with mock 0.1.0)
		const agentRequiresGte200 = `---
version: 0.1.0
requires: ">=2.0.0"
---

# Test Agent

This is a valid agent file that contains enough content to pass the minimum length requirement.

## Task Execution

The agent handles various tasks and operations in the system.
`

		// Agent content that requires exactly version 0.1.0
		const agentRequiresExact010 = `---
version: 0.1.0
requires: "0.1.0"
---

# Test Agent

This is a valid agent file that contains enough content to pass the minimum length requirement.

## Task Execution

The agent handles various tasks and operations in the system.
`

		// Agent content with caret range ^0.1.0
		const agentRequiresCaret010 = `---
version: 0.1.0
requires: "^0.1.0"
---

# Test Agent

This is a valid agent file that contains enough content to pass the minimum length requirement.

## Task Execution

The agent handles various tasks and operations in the system.
`

		// Agent content with caret range ^0.2.0 (incompatible with 0.1.0)
		const agentRequiresCaret020 = `---
version: 0.1.0
requires: "^0.2.0"
---

# Test Agent

This is a valid agent file that contains enough content to pass the minimum length requirement.

## Task Execution

The agent handles various tasks and operations in the system.
`

		beforeEach(() => {
			// Set up valid agent files by default
			writeFileSync(join(agentsSourceDir, "opencoder.md"), validAgentRequiresGte010)
			writeFileSync(join(agentsSourceDir, "opencoder-planner.md"), validAgentRequiresGte010)
			writeFileSync(join(agentsSourceDir, "opencoder-builder.md"), validAgentRequiresGte010)
		})

		it("should accept agents with compatible >=0.1.0 requirement when OpenCode is 0.1.0", async () => {
			const scriptPath = join(mockProjectDir, "test-postinstall.mjs")
			writeFileSync(scriptPath, createPostinstallWithVersionCheck("0.1.0"))

			const proc = Bun.spawn(["node", scriptPath], {
				cwd: mockProjectDir,
				stdout: "pipe",
				stderr: "pipe",
			})

			const exitCode = await proc.exited
			expect(exitCode).toBe(0)

			const stdout = await new Response(proc.stdout).text()
			expect(stdout).toContain("Successfully installed 3 agent(s)")

			// Verify all files were copied
			expect(existsSync(join(agentsTargetDir, "opencoder.md"))).toBe(true)
			expect(existsSync(join(agentsTargetDir, "opencoder-planner.md"))).toBe(true)
			expect(existsSync(join(agentsTargetDir, "opencoder-builder.md"))).toBe(true)
		})

		it("should reject agents requiring >=2.0.0 when OpenCode is 0.1.0", async () => {
			// Create an agent that requires OpenCode >= 2.0.0
			writeFileSync(join(agentsSourceDir, "future-agent.md"), agentRequiresGte200)

			const scriptPath = join(mockProjectDir, "test-postinstall.mjs")
			writeFileSync(scriptPath, createPostinstallWithVersionCheck("0.1.0"))

			const proc = Bun.spawn(["node", scriptPath], {
				cwd: mockProjectDir,
				stdout: "pipe",
				stderr: "pipe",
			})

			const exitCode = await proc.exited
			// Should succeed partially (other files are valid)
			expect(exitCode).toBe(0)

			const stderr = await new Response(proc.stderr).text()
			expect(stderr).toContain("future-agent.md")
			expect(stderr).toContain("Incompatible OpenCode version")
			expect(stderr).toContain("requires >=2.0.0")
			expect(stderr).toContain("current version is 0.1.0")
		})

		it("should accept agents with exact version match 0.1.0 when OpenCode is 0.1.0", async () => {
			writeFileSync(join(agentsSourceDir, "exact-match.md"), agentRequiresExact010)

			const scriptPath = join(mockProjectDir, "test-postinstall.mjs")
			writeFileSync(scriptPath, createPostinstallWithVersionCheck("0.1.0"))

			const proc = Bun.spawn(["node", scriptPath], {
				cwd: mockProjectDir,
				stdout: "pipe",
				stderr: "pipe",
			})

			const exitCode = await proc.exited
			expect(exitCode).toBe(0)

			// Verify the exact match file was installed
			expect(existsSync(join(agentsTargetDir, "exact-match.md"))).toBe(true)
		})

		it("should reject agents with exact version match 0.1.0 when OpenCode is 0.2.0", async () => {
			writeFileSync(join(agentsSourceDir, "exact-match.md"), agentRequiresExact010)

			const scriptPath = join(mockProjectDir, "test-postinstall.mjs")
			writeFileSync(scriptPath, createPostinstallWithVersionCheck("0.2.0"))

			const proc = Bun.spawn(["node", scriptPath], {
				cwd: mockProjectDir,
				stdout: "pipe",
				stderr: "pipe",
			})

			await proc.exited

			const stderr = await new Response(proc.stderr).text()
			expect(stderr).toContain("exact-match.md")
			expect(stderr).toContain("Incompatible OpenCode version")
			expect(stderr).toContain("requires 0.1.0")
		})

		it("should accept agents with caret range ^0.1.0 when OpenCode is 0.1.5", async () => {
			writeFileSync(join(agentsSourceDir, "caret-agent.md"), agentRequiresCaret010)

			const scriptPath = join(mockProjectDir, "test-postinstall.mjs")
			writeFileSync(scriptPath, createPostinstallWithVersionCheck("0.1.5"))

			const proc = Bun.spawn(["node", scriptPath], {
				cwd: mockProjectDir,
				stdout: "pipe",
				stderr: "pipe",
			})

			const exitCode = await proc.exited
			expect(exitCode).toBe(0)

			// Verify the caret range file was installed
			expect(existsSync(join(agentsTargetDir, "caret-agent.md"))).toBe(true)
		})

		it("should reject agents with caret range ^0.1.0 when OpenCode is 0.2.0 (major 0 rule)", async () => {
			writeFileSync(join(agentsSourceDir, "caret-agent.md"), agentRequiresCaret010)

			const scriptPath = join(mockProjectDir, "test-postinstall.mjs")
			writeFileSync(scriptPath, createPostinstallWithVersionCheck("0.2.0"))

			const proc = Bun.spawn(["node", scriptPath], {
				cwd: mockProjectDir,
				stdout: "pipe",
				stderr: "pipe",
			})

			await proc.exited

			const stderr = await new Response(proc.stderr).text()
			expect(stderr).toContain("caret-agent.md")
			expect(stderr).toContain("Incompatible OpenCode version")
			expect(stderr).toContain("requires ^0.1.0")
		})

		it("should reject agents with caret range ^0.2.0 when OpenCode is 0.1.0", async () => {
			writeFileSync(join(agentsSourceDir, "caret-agent.md"), agentRequiresCaret020)

			const scriptPath = join(mockProjectDir, "test-postinstall.mjs")
			writeFileSync(scriptPath, createPostinstallWithVersionCheck("0.1.0"))

			const proc = Bun.spawn(["node", scriptPath], {
				cwd: mockProjectDir,
				stdout: "pipe",
				stderr: "pipe",
			})

			await proc.exited

			const stderr = await new Response(proc.stderr).text()
			expect(stderr).toContain("caret-agent.md")
			expect(stderr).toContain("Incompatible OpenCode version")
			expect(stderr).toContain("requires ^0.2.0")
		})

		it("should fail completely when all agents have incompatible versions", async () => {
			// Replace all agent files with incompatible versions
			writeFileSync(join(agentsSourceDir, "opencoder.md"), agentRequiresGte200)
			writeFileSync(join(agentsSourceDir, "opencoder-planner.md"), agentRequiresGte200)
			writeFileSync(join(agentsSourceDir, "opencoder-builder.md"), agentRequiresGte200)

			const scriptPath = join(mockProjectDir, "test-postinstall.mjs")
			writeFileSync(scriptPath, createPostinstallWithVersionCheck("0.1.0"))

			const proc = Bun.spawn(["node", scriptPath], {
				cwd: mockProjectDir,
				stdout: "pipe",
				stderr: "pipe",
			})

			const exitCode = await proc.exited
			expect(exitCode).toBe(1)

			const stderr = await new Response(proc.stderr).text()
			expect(stderr).toContain("Failed to install any agents")
			expect(stderr).toContain("Incompatible OpenCode version")
		})

		it("should report partial success when some agents have incompatible versions", async () => {
			// Keep two valid, make one incompatible
			writeFileSync(join(agentsSourceDir, "opencoder-builder.md"), agentRequiresGte200)

			const scriptPath = join(mockProjectDir, "test-postinstall.mjs")
			writeFileSync(scriptPath, createPostinstallWithVersionCheck("0.1.0"))

			const proc = Bun.spawn(["node", scriptPath], {
				cwd: mockProjectDir,
				stdout: "pipe",
				stderr: "pipe",
			})

			const exitCode = await proc.exited
			expect(exitCode).toBe(0)

			const stdout = await new Response(proc.stdout).text()
			expect(stdout).toContain("Installed 2 of 3 agent(s)")

			const stderr = await new Response(proc.stderr).text()
			expect(stderr).toContain("1 file(s) failed to install")
			expect(stderr).toContain("opencoder-builder.md")
		})

		it("should accept agents with >=0.1.0 requirement when OpenCode is 1.0.0", async () => {
			const scriptPath = join(mockProjectDir, "test-postinstall.mjs")
			writeFileSync(scriptPath, createPostinstallWithVersionCheck("1.0.0"))

			const proc = Bun.spawn(["node", scriptPath], {
				cwd: mockProjectDir,
				stdout: "pipe",
				stderr: "pipe",
			})

			const exitCode = await proc.exited
			expect(exitCode).toBe(0)

			const stdout = await new Response(proc.stdout).text()
			expect(stdout).toContain("Successfully installed 3 agent(s)")
		})
	})

	describe("preuninstall script", () => {
		it("should remove agent files from target directory", async () => {
			// First install the agents
			mkdirSync(agentsTargetDir, { recursive: true })
			writeFileSync(join(agentsTargetDir, "opencoder.md"), "# OpenCoder Agent")
			writeFileSync(join(agentsTargetDir, "opencoder-planner.md"), "# Planner Agent")
			writeFileSync(join(agentsTargetDir, "opencoder-builder.md"), "# Builder Agent")

			const scriptPath = join(mockProjectDir, "test-preuninstall.mjs")
			writeFileSync(scriptPath, createMockPreuninstall())

			const proc = Bun.spawn(["node", scriptPath], {
				cwd: mockProjectDir,
				stdout: "pipe",
				stderr: "pipe",
			})

			const exitCode = await proc.exited
			expect(exitCode).toBe(0)

			// Verify files were removed
			expect(existsSync(join(agentsTargetDir, "opencoder.md"))).toBe(false)
			expect(existsSync(join(agentsTargetDir, "opencoder-planner.md"))).toBe(false)
			expect(existsSync(join(agentsTargetDir, "opencoder-builder.md"))).toBe(false)
		})

		it("should not remove other files in target directory", async () => {
			// Install agents plus other files
			mkdirSync(agentsTargetDir, { recursive: true })
			writeFileSync(join(agentsTargetDir, "opencoder.md"), "# OpenCoder Agent")
			writeFileSync(join(agentsTargetDir, "other-agent.md"), "# Other Agent")
			writeFileSync(join(agentsTargetDir, "custom-agent.md"), "# Custom Agent")

			const scriptPath = join(mockProjectDir, "test-preuninstall.mjs")
			writeFileSync(scriptPath, createMockPreuninstall())

			const proc = Bun.spawn(["node", scriptPath], {
				cwd: mockProjectDir,
				stdout: "pipe",
				stderr: "pipe",
			})

			await proc.exited

			// Our agents should be removed
			expect(existsSync(join(agentsTargetDir, "opencoder.md"))).toBe(false)

			// Other files should remain
			expect(existsSync(join(agentsTargetDir, "other-agent.md"))).toBe(true)
			expect(existsSync(join(agentsTargetDir, "custom-agent.md"))).toBe(true)
		})

		it("should handle missing target directory gracefully", async () => {
			// Ensure target directory doesn't exist
			expect(existsSync(agentsTargetDir)).toBe(false)

			const scriptPath = join(mockProjectDir, "test-preuninstall.mjs")
			writeFileSync(scriptPath, createMockPreuninstall())

			const proc = Bun.spawn(["node", scriptPath], {
				cwd: mockProjectDir,
				stdout: "pipe",
				stderr: "pipe",
			})

			const exitCode = await proc.exited
			expect(exitCode).toBe(0)

			const stdout = await new Response(proc.stdout).text()
			expect(stdout).toContain("No agents directory found")
		})

		it("should handle missing source directory gracefully", async () => {
			// Create target but remove source
			mkdirSync(agentsTargetDir, { recursive: true })
			writeFileSync(join(agentsTargetDir, "opencoder.md"), "# OpenCoder Agent")
			rmSync(agentsSourceDir, { recursive: true, force: true })

			const scriptPath = join(mockProjectDir, "test-preuninstall.mjs")
			writeFileSync(scriptPath, createMockPreuninstall())

			const proc = Bun.spawn(["node", scriptPath], {
				cwd: mockProjectDir,
				stdout: "pipe",
				stderr: "pipe",
			})

			const exitCode = await proc.exited
			expect(exitCode).toBe(0)

			const stdout = await new Response(proc.stdout).text()
			expect(stdout).toContain("Source agents directory not found")

			// File should still exist (not removed because we couldn't determine what to remove)
			expect(existsSync(join(agentsTargetDir, "opencoder.md"))).toBe(true)
		})

		it("should handle partial installation (some files missing)", async () => {
			// Only install one of three agents
			mkdirSync(agentsTargetDir, { recursive: true })
			writeFileSync(join(agentsTargetDir, "opencoder.md"), "# OpenCoder Agent")
			// opencoder-planner.md and opencoder-builder.md are missing

			const scriptPath = join(mockProjectDir, "test-preuninstall.mjs")
			writeFileSync(scriptPath, createMockPreuninstall())

			const proc = Bun.spawn(["node", scriptPath], {
				cwd: mockProjectDir,
				stdout: "pipe",
				stderr: "pipe",
			})

			const exitCode = await proc.exited
			expect(exitCode).toBe(0)

			// The one that existed should be removed
			expect(existsSync(join(agentsTargetDir, "opencoder.md"))).toBe(false)

			const stdout = await new Response(proc.stdout).text()
			expect(stdout).toContain("Removed: opencoder.md")
		})

		it("should report when no agents were installed", async () => {
			// Target directory exists but none of our agents are there
			mkdirSync(agentsTargetDir, { recursive: true })
			writeFileSync(join(agentsTargetDir, "other-agent.md"), "# Other Agent")

			const scriptPath = join(mockProjectDir, "test-preuninstall.mjs")
			writeFileSync(scriptPath, createMockPreuninstall())

			const proc = Bun.spawn(["node", scriptPath], {
				cwd: mockProjectDir,
				stdout: "pipe",
				stderr: "pipe",
			})

			const exitCode = await proc.exited
			expect(exitCode).toBe(0)

			const stdout = await new Response(proc.stdout).text()
			expect(stdout).toContain("No agents were installed")

			// Other files should remain
			expect(existsSync(join(agentsTargetDir, "other-agent.md"))).toBe(true)
		})
	})

	describe("E2E: actual scripts with --dry-run", () => {
		it("should run actual postinstall.mjs with --dry-run", async () => {
			// Run the actual postinstall script with --dry-run flag
			const proc = Bun.spawn(["node", "postinstall.mjs", "--dry-run"], {
				cwd: process.cwd(), // Use actual project directory
				stdout: "pipe",
				stderr: "pipe",
			})

			const exitCode = await proc.exited
			const stdout = await new Response(proc.stdout).text()
			const stderr = await new Response(proc.stderr).text()

			// Should succeed
			expect(exitCode).toBe(0)

			// Should indicate dry-run mode
			expect(stdout).toContain("[DRY-RUN]")
			expect(stdout).toContain("opencode-plugin-opencoder: Installing agents...")

			// Should show what would be installed
			expect(stdout).toContain("Would install: opencoder.md")
			expect(stdout).toContain("Would install: opencoder-planner.md")
			expect(stdout).toContain("Would install: opencoder-builder.md")

			// Should show success summary
			expect(stdout).toContain("Successfully installed 3 agent(s)")

			// Should not have errors
			expect(stderr).toBe("")
		})

		it("should run actual postinstall.mjs with --dry-run --verbose", async () => {
			const proc = Bun.spawn(["node", "postinstall.mjs", "--dry-run", "--verbose"], {
				cwd: process.cwd(),
				stdout: "pipe",
				stderr: "pipe",
			})

			const exitCode = await proc.exited
			const stdout = await new Response(proc.stdout).text()

			expect(exitCode).toBe(0)

			// Should include verbose output
			expect(stdout).toContain("[VERBOSE]")
			expect(stdout).toContain("Package root:")
			expect(stdout).toContain("Source directory:")
			expect(stdout).toContain("Target directory:")
			expect(stdout).toContain("Dry run: true")
			expect(stdout).toContain("Markdown files found: 3")
			expect(stdout).toContain("Validation passed")
		})

		it("should run actual preuninstall.mjs with --dry-run", async () => {
			// First, ensure the target directory exists with installed agents
			// We'll create the target directory structure for this test
			const { AGENTS_TARGET_DIR } = await import("../src/paths.mjs")

			// Create target directory if it doesn't exist
			mkdirSync(AGENTS_TARGET_DIR, { recursive: true })

			// Copy agent files to target (simulate a real installation)
			const agentFiles = ["opencoder.md", "opencoder-planner.md", "opencoder-builder.md"]
			for (const file of agentFiles) {
				const sourcePath = join(process.cwd(), "agents", file)
				const targetPath = join(AGENTS_TARGET_DIR, file)
				if (existsSync(sourcePath)) {
					const content = readFileSync(sourcePath, "utf-8")
					writeFileSync(targetPath, content)
				}
			}

			const proc = Bun.spawn(["node", "preuninstall.mjs", "--dry-run"], {
				cwd: process.cwd(),
				stdout: "pipe",
				stderr: "pipe",
			})

			const exitCode = await proc.exited
			const stdout = await new Response(proc.stdout).text()
			const stderr = await new Response(proc.stderr).text()

			// Should succeed
			expect(exitCode).toBe(0)

			// Should indicate dry-run mode
			expect(stdout).toContain("[DRY-RUN]")
			expect(stdout).toContain("opencode-plugin-opencoder: Removing agents...")

			// Should show what would be removed
			expect(stdout).toContain("Would remove:")

			// Should show removal summary
			expect(stdout).toContain("Removed 3 agent(s)")

			// Should not have errors
			expect(stderr).toBe("")

			// Clean up - remove the test agents we installed
			for (const file of agentFiles) {
				const targetPath = join(AGENTS_TARGET_DIR, file)
				if (existsSync(targetPath)) {
					rmSync(targetPath)
				}
			}
		})

		it("should run actual preuninstall.mjs with --dry-run --verbose", async () => {
			const { AGENTS_TARGET_DIR } = await import("../src/paths.mjs")

			// Create target directory with agents
			mkdirSync(AGENTS_TARGET_DIR, { recursive: true })

			const agentFiles = ["opencoder.md", "opencoder-planner.md", "opencoder-builder.md"]
			for (const file of agentFiles) {
				const sourcePath = join(process.cwd(), "agents", file)
				const targetPath = join(AGENTS_TARGET_DIR, file)
				if (existsSync(sourcePath)) {
					const content = readFileSync(sourcePath, "utf-8")
					writeFileSync(targetPath, content)
				}
			}

			const proc = Bun.spawn(["node", "preuninstall.mjs", "--dry-run", "--verbose"], {
				cwd: process.cwd(),
				stdout: "pipe",
				stderr: "pipe",
			})

			const exitCode = await proc.exited
			const stdout = await new Response(proc.stdout).text()

			expect(exitCode).toBe(0)

			// Should include verbose output
			expect(stdout).toContain("[VERBOSE]")
			expect(stdout).toContain("Package root:")
			expect(stdout).toContain("Source directory:")
			expect(stdout).toContain("Target directory:")
			expect(stdout).toContain("Dry run: true")
			expect(stdout).toContain("Markdown files to remove: 3")

			// Clean up
			for (const file of agentFiles) {
				const targetPath = join(AGENTS_TARGET_DIR, file)
				if (existsSync(targetPath)) {
					rmSync(targetPath)
				}
			}
		})

		it("should handle preuninstall --dry-run with no installed agents", async () => {
			const { AGENTS_TARGET_DIR } = await import("../src/paths.mjs")

			// Ensure agents are NOT installed (remove them if they exist)
			const agentFiles = ["opencoder.md", "opencoder-planner.md", "opencoder-builder.md"]
			for (const file of agentFiles) {
				const targetPath = join(AGENTS_TARGET_DIR, file)
				if (existsSync(targetPath)) {
					rmSync(targetPath)
				}
			}

			const proc = Bun.spawn(["node", "preuninstall.mjs", "--dry-run"], {
				cwd: process.cwd(),
				stdout: "pipe",
				stderr: "pipe",
			})

			const exitCode = await proc.exited
			const stdout = await new Response(proc.stdout).text()

			expect(exitCode).toBe(0)

			// Should indicate nothing to remove OR no agents directory
			const hasNoAgentsMsg =
				stdout.includes("No agents were installed") || stdout.includes("No agents directory found")
			expect(hasNoAgentsMsg).toBe(true)
		})

		it("should validate actual agent files pass validation in --dry-run", async () => {
			// This test verifies that our actual agent files pass the validation
			const proc = Bun.spawn(["node", "postinstall.mjs", "--dry-run", "--verbose"], {
				cwd: process.cwd(),
				stdout: "pipe",
				stderr: "pipe",
			})

			const exitCode = await proc.exited
			const stdout = await new Response(proc.stdout).text()
			const stderr = await new Response(proc.stderr).text()

			// Should succeed - all our actual agents should be valid
			expect(exitCode).toBe(0)

			// Should NOT contain validation failure messages
			expect(stderr).not.toContain("Invalid agent file content")
			expect(stderr).not.toContain("File too short")
			expect(stderr).not.toContain("missing YAML frontmatter")
			expect(stderr).not.toContain("missing required fields")

			// Should show validation passed for each file
			expect(stdout).toContain("Validation passed")
		})

		it("should run actual postinstall.mjs with --help", async () => {
			const proc = Bun.spawn(["node", "postinstall.mjs", "--help"], {
				cwd: process.cwd(),
				stdout: "pipe",
				stderr: "pipe",
			})

			const exitCode = await proc.exited
			const stdout = await new Response(proc.stdout).text()
			const stderr = await new Response(proc.stderr).text()

			// Should exit with code 0
			expect(exitCode).toBe(0)

			// Should show usage information
			expect(stdout).toContain("Usage:")
			expect(stdout).toContain("postinstall.mjs")
			expect(stdout).toContain("Options:")
			expect(stdout).toContain("--dry-run")
			expect(stdout).toContain("--verbose")
			expect(stdout).toContain("--help")

			// Should not have errors
			expect(stderr).toBe("")
		})

		it("should run actual preuninstall.mjs with --help", async () => {
			const proc = Bun.spawn(["node", "preuninstall.mjs", "--help"], {
				cwd: process.cwd(),
				stdout: "pipe",
				stderr: "pipe",
			})

			const exitCode = await proc.exited
			const stdout = await new Response(proc.stdout).text()
			const stderr = await new Response(proc.stderr).text()

			// Should exit with code 0
			expect(exitCode).toBe(0)

			// Should show usage information
			expect(stdout).toContain("Usage:")
			expect(stdout).toContain("preuninstall.mjs")
			expect(stdout).toContain("Options:")
			expect(stdout).toContain("--dry-run")
			expect(stdout).toContain("--verbose")
			expect(stdout).toContain("--help")

			// Should not have errors
			expect(stderr).toBe("")
		})
	})

	describe("CLI flags: --help", () => {
		it("postinstall --help shows usage and exits 0", async () => {
			const proc = Bun.spawn(["node", "postinstall.mjs", "--help"], {
				cwd: process.cwd(),
				stdout: "pipe",
				stderr: "pipe",
			})

			const exitCode = await proc.exited
			const stdout = await new Response(proc.stdout).text()
			const stderr = await new Response(proc.stderr).text()

			expect(exitCode).toBe(0)
			expect(stdout).toContain("Usage:")
			expect(stdout).toContain("--dry-run")
			expect(stdout).toContain("--verbose")
			expect(stdout).toContain("--help")
			expect(stdout).toContain("Examples:")
			expect(stderr).toBe("")
		})

		it("preuninstall --help shows usage and exits 0", async () => {
			const proc = Bun.spawn(["node", "preuninstall.mjs", "--help"], {
				cwd: process.cwd(),
				stdout: "pipe",
				stderr: "pipe",
			})

			const exitCode = await proc.exited
			const stdout = await new Response(proc.stdout).text()
			const stderr = await new Response(proc.stderr).text()

			expect(exitCode).toBe(0)
			expect(stdout).toContain("Usage:")
			expect(stdout).toContain("--dry-run")
			expect(stdout).toContain("--verbose")
			expect(stdout).toContain("--help")
			expect(stdout).toContain("Examples:")
			expect(stderr).toBe("")
		})

		it("postinstall --help does not perform installation", async () => {
			// Track state before --help
			const { AGENTS_TARGET_DIR } = await import("../src/paths.mjs")
			const agentFiles = ["opencoder.md", "opencoder-planner.md", "opencoder-builder.md"]

			// Ensure agents are NOT installed
			for (const file of agentFiles) {
				const targetPath = join(AGENTS_TARGET_DIR, file)
				if (existsSync(targetPath)) {
					rmSync(targetPath)
				}
			}

			const proc = Bun.spawn(["node", "postinstall.mjs", "--help"], {
				cwd: process.cwd(),
				stdout: "pipe",
				stderr: "pipe",
			})

			await proc.exited

			// Verify no files were created
			for (const file of agentFiles) {
				const targetPath = join(AGENTS_TARGET_DIR, file)
				expect(existsSync(targetPath)).toBe(false)
			}
		})
	})

	describe("CLI flags: --dry-run", () => {
		it("postinstall --dry-run does not create files", async () => {
			const { AGENTS_TARGET_DIR } = await import("../src/paths.mjs")
			const agentFiles = ["opencoder.md", "opencoder-planner.md", "opencoder-builder.md"]

			// Ensure agents are NOT installed
			for (const file of agentFiles) {
				const targetPath = join(AGENTS_TARGET_DIR, file)
				if (existsSync(targetPath)) {
					rmSync(targetPath)
				}
			}

			const proc = Bun.spawn(["node", "postinstall.mjs", "--dry-run"], {
				cwd: process.cwd(),
				stdout: "pipe",
				stderr: "pipe",
			})

			const exitCode = await proc.exited
			const stdout = await new Response(proc.stdout).text()

			expect(exitCode).toBe(0)
			expect(stdout).toContain("[DRY-RUN]")
			expect(stdout).toContain("Would install:")

			// Verify no files were actually created
			for (const file of agentFiles) {
				const targetPath = join(AGENTS_TARGET_DIR, file)
				expect(existsSync(targetPath)).toBe(false)
			}
		})

		it("preuninstall --dry-run does not delete files", async () => {
			const { AGENTS_TARGET_DIR } = await import("../src/paths.mjs")
			const agentFiles = ["opencoder.md", "opencoder-planner.md", "opencoder-builder.md"]

			// Ensure target directory exists
			mkdirSync(AGENTS_TARGET_DIR, { recursive: true })

			// Install agents first
			for (const file of agentFiles) {
				const sourcePath = join(process.cwd(), "agents", file)
				const targetPath = join(AGENTS_TARGET_DIR, file)
				if (existsSync(sourcePath)) {
					const content = readFileSync(sourcePath, "utf-8")
					writeFileSync(targetPath, content)
				}
			}

			const proc = Bun.spawn(["node", "preuninstall.mjs", "--dry-run"], {
				cwd: process.cwd(),
				stdout: "pipe",
				stderr: "pipe",
			})

			const exitCode = await proc.exited
			const stdout = await new Response(proc.stdout).text()

			expect(exitCode).toBe(0)
			expect(stdout).toContain("[DRY-RUN]")
			expect(stdout).toContain("Would remove:")

			// Verify files were NOT deleted
			for (const file of agentFiles) {
				const targetPath = join(AGENTS_TARGET_DIR, file)
				expect(existsSync(targetPath)).toBe(true)
			}

			// Clean up
			for (const file of agentFiles) {
				const targetPath = join(AGENTS_TARGET_DIR, file)
				if (existsSync(targetPath)) {
					rmSync(targetPath)
				}
			}
		})

		it("postinstall --dry-run does not create target directory", async () => {
			const { AGENTS_TARGET_DIR } = await import("../src/paths.mjs")

			// Remove the target directory if it exists
			if (existsSync(AGENTS_TARGET_DIR)) {
				// Only remove if empty or contains only our agents
				const files = readdirSync(AGENTS_TARGET_DIR)
				const agentFiles = ["opencoder.md", "opencoder-planner.md", "opencoder-builder.md"]
				const onlyOurAgents = files.every((f) => agentFiles.includes(f))

				if (onlyOurAgents) {
					rmSync(AGENTS_TARGET_DIR, { recursive: true })
				}
			}

			// Only run test if we successfully removed the directory
			if (!existsSync(AGENTS_TARGET_DIR)) {
				const proc = Bun.spawn(["node", "postinstall.mjs", "--dry-run"], {
					cwd: process.cwd(),
					stdout: "pipe",
					stderr: "pipe",
				})

				const exitCode = await proc.exited
				const stdout = await new Response(proc.stdout).text()

				expect(exitCode).toBe(0)
				expect(stdout).toContain("Would create")

				// Verify directory was NOT created
				expect(existsSync(AGENTS_TARGET_DIR)).toBe(false)
			}
		})
	})

	describe("CLI flags: --verbose", () => {
		it("postinstall --verbose shows detailed output", async () => {
			const proc = Bun.spawn(["node", "postinstall.mjs", "--dry-run", "--verbose"], {
				cwd: process.cwd(),
				stdout: "pipe",
				stderr: "pipe",
			})

			const exitCode = await proc.exited
			const stdout = await new Response(proc.stdout).text()

			expect(exitCode).toBe(0)
			expect(stdout).toContain("[VERBOSE]")
			expect(stdout).toContain("Package root:")
			expect(stdout).toContain("Source directory:")
			expect(stdout).toContain("Target directory:")
			expect(stdout).toContain("Dry run:")
		})

		it("preuninstall --verbose shows detailed output", async () => {
			const { AGENTS_TARGET_DIR } = await import("../src/paths.mjs")
			const agentFiles = ["opencoder.md", "opencoder-planner.md", "opencoder-builder.md"]

			// Ensure target directory exists with agents
			mkdirSync(AGENTS_TARGET_DIR, { recursive: true })
			for (const file of agentFiles) {
				const sourcePath = join(process.cwd(), "agents", file)
				const targetPath = join(AGENTS_TARGET_DIR, file)
				if (existsSync(sourcePath)) {
					const content = readFileSync(sourcePath, "utf-8")
					writeFileSync(targetPath, content)
				}
			}

			const proc = Bun.spawn(["node", "preuninstall.mjs", "--dry-run", "--verbose"], {
				cwd: process.cwd(),
				stdout: "pipe",
				stderr: "pipe",
			})

			const exitCode = await proc.exited
			const stdout = await new Response(proc.stdout).text()

			expect(exitCode).toBe(0)
			expect(stdout).toContain("[VERBOSE]")
			expect(stdout).toContain("Package root:")
			expect(stdout).toContain("Source directory:")
			expect(stdout).toContain("Target directory:")
			expect(stdout).toContain("Dry run:")

			// Clean up
			for (const file of agentFiles) {
				const targetPath = join(AGENTS_TARGET_DIR, file)
				if (existsSync(targetPath)) {
					rmSync(targetPath)
				}
			}
		})

		it("postinstall --verbose shows file processing details", async () => {
			const proc = Bun.spawn(["node", "postinstall.mjs", "--dry-run", "--verbose"], {
				cwd: process.cwd(),
				stdout: "pipe",
				stderr: "pipe",
			})

			const exitCode = await proc.exited
			const stdout = await new Response(proc.stdout).text()

			expect(exitCode).toBe(0)
			expect(stdout).toContain("Processing:")
			expect(stdout).toContain("Source path:")
			expect(stdout).toContain("Target path:")
			expect(stdout).toContain("Validation passed")
		})

		it("postinstall without --verbose does not show verbose markers", async () => {
			const proc = Bun.spawn(["node", "postinstall.mjs", "--dry-run"], {
				cwd: process.cwd(),
				stdout: "pipe",
				stderr: "pipe",
			})

			const exitCode = await proc.exited
			const stdout = await new Response(proc.stdout).text()

			expect(exitCode).toBe(0)
			expect(stdout).not.toContain("[VERBOSE]")
			expect(stdout).not.toContain("Processing:")
			expect(stdout).not.toContain("Validation passed")
		})

		it("preuninstall without --verbose does not show verbose markers", async () => {
			const proc = Bun.spawn(["node", "preuninstall.mjs", "--dry-run"], {
				cwd: process.cwd(),
				stdout: "pipe",
				stderr: "pipe",
			})

			const exitCode = await proc.exited
			const stdout = await new Response(proc.stdout).text()

			expect(exitCode).toBe(0)
			expect(stdout).not.toContain("[VERBOSE]")
			expect(stdout).not.toContain("Processing:")
		})
	})

	describe("stale file detection", () => {
		it("should log verbose message when overwriting existing file with different content", async () => {
			const { AGENTS_TARGET_DIR } = await import("../src/paths.mjs")
			const agentFiles = ["opencoder.md", "opencoder-planner.md", "opencoder-builder.md"]

			// Ensure target directory exists
			mkdirSync(AGENTS_TARGET_DIR, { recursive: true })

			// Create stale (different) content in target
			writeFileSync(
				join(AGENTS_TARGET_DIR, "opencoder.md"),
				"# Old stale content\nThis is different from the source",
			)

			const proc = Bun.spawn(["node", "postinstall.mjs", "--dry-run", "--verbose"], {
				cwd: process.cwd(),
				stdout: "pipe",
				stderr: "pipe",
			})

			const exitCode = await proc.exited
			const stdout = await new Response(proc.stdout).text()

			expect(exitCode).toBe(0)
			// Should contain the stale file detection message
			expect(stdout).toContain(
				"[VERBOSE] Overwriting existing file: opencoder.md (content differs)",
			)

			// Clean up
			for (const file of agentFiles) {
				const targetPath = join(AGENTS_TARGET_DIR, file)
				if (existsSync(targetPath)) {
					rmSync(targetPath)
				}
			}
		})

		it("should log verbose message when target file has unchanged content", async () => {
			const { AGENTS_TARGET_DIR } = await import("../src/paths.mjs")
			const agentFiles = ["opencoder.md", "opencoder-planner.md", "opencoder-builder.md"]

			// Ensure target directory exists
			mkdirSync(AGENTS_TARGET_DIR, { recursive: true })

			// Copy the actual source content to target (identical content)
			const sourceContent = readFileSync(join(process.cwd(), "agents", "opencoder.md"), "utf-8")
			writeFileSync(join(AGENTS_TARGET_DIR, "opencoder.md"), sourceContent)

			const proc = Bun.spawn(["node", "postinstall.mjs", "--dry-run", "--verbose"], {
				cwd: process.cwd(),
				stdout: "pipe",
				stderr: "pipe",
			})

			const exitCode = await proc.exited
			const stdout = await new Response(proc.stdout).text()

			expect(exitCode).toBe(0)
			// Should contain the unchanged message
			expect(stdout).toContain("[VERBOSE] Target file unchanged: opencoder.md")
			// Should NOT contain the overwriting message for this file
			expect(stdout).not.toContain("Overwriting existing file: opencoder.md")

			// Clean up
			for (const file of agentFiles) {
				const targetPath = join(AGENTS_TARGET_DIR, file)
				if (existsSync(targetPath)) {
					rmSync(targetPath)
				}
			}
		})

		it("should not log stale file message without --verbose flag", async () => {
			const { AGENTS_TARGET_DIR } = await import("../src/paths.mjs")
			const agentFiles = ["opencoder.md", "opencoder-planner.md", "opencoder-builder.md"]

			// Ensure target directory exists
			mkdirSync(AGENTS_TARGET_DIR, { recursive: true })

			// Create stale content in target
			writeFileSync(
				join(AGENTS_TARGET_DIR, "opencoder.md"),
				"# Old stale content\nThis is different from the source",
			)

			const proc = Bun.spawn(["node", "postinstall.mjs", "--dry-run"], {
				cwd: process.cwd(),
				stdout: "pipe",
				stderr: "pipe",
			})

			const exitCode = await proc.exited
			const stdout = await new Response(proc.stdout).text()

			expect(exitCode).toBe(0)
			// Should NOT contain verbose markers or stale file message
			expect(stdout).not.toContain("[VERBOSE]")
			expect(stdout).not.toContain("Overwriting existing file")
			expect(stdout).not.toContain("content differs")

			// Clean up
			for (const file of agentFiles) {
				const targetPath = join(AGENTS_TARGET_DIR, file)
				if (existsSync(targetPath)) {
					rmSync(targetPath)
				}
			}
		})

		it("should detect stale files during actual install (not dry-run)", async () => {
			const { AGENTS_TARGET_DIR } = await import("../src/paths.mjs")
			const agentFiles = ["opencoder.md", "opencoder-planner.md", "opencoder-builder.md"]

			// Ensure target directory exists
			mkdirSync(AGENTS_TARGET_DIR, { recursive: true })

			// Create stale content in target for all files
			for (const file of agentFiles) {
				writeFileSync(
					join(AGENTS_TARGET_DIR, file),
					`# Old stale content for ${file}\nThis is different`,
				)
			}

			const proc = Bun.spawn(["node", "postinstall.mjs", "--verbose"], {
				cwd: process.cwd(),
				stdout: "pipe",
				stderr: "pipe",
			})

			const exitCode = await proc.exited
			const stdout = await new Response(proc.stdout).text()

			expect(exitCode).toBe(0)
			// Should detect stale files for all three agents
			expect(stdout).toContain(
				"[VERBOSE] Overwriting existing file: opencoder.md (content differs)",
			)
			expect(stdout).toContain(
				"[VERBOSE] Overwriting existing file: opencoder-planner.md (content differs)",
			)
			expect(stdout).toContain(
				"[VERBOSE] Overwriting existing file: opencoder-builder.md (content differs)",
			)

			// Clean up
			for (const file of agentFiles) {
				const targetPath = join(AGENTS_TARGET_DIR, file)
				if (existsSync(targetPath)) {
					rmSync(targetPath)
				}
			}
		})
	})

	describe("shipped agent files validation", () => {
		it("should validate all shipped agent files pass content validation", async () => {
			const { AGENT_NAMES, validateAgentContent } = await import("../src/paths.mjs")

			const agentsDir = join(process.cwd(), "agents")

			for (const agentName of AGENT_NAMES) {
				const filePath = join(agentsDir, `${agentName}.md`)

				// Verify file exists
				expect(existsSync(filePath)).toBe(true)

				// Read and validate content
				const content = readFileSync(filePath, "utf-8")
				const result = validateAgentContent(content)

				// Should pass validation
				expect(result.valid).toBe(true)
				if (!result.valid) {
					// Provide helpful error message if validation fails
					throw new Error(`Agent ${agentName}.md failed validation: ${result.error}`)
				}
			}
		})

		it("should validate all shipped agent files have valid frontmatter", async () => {
			const { AGENT_NAMES, parseFrontmatter, REQUIRED_FRONTMATTER_FIELDS } = await import(
				"../src/paths.mjs"
			)

			const agentsDir = join(process.cwd(), "agents")

			for (const agentName of AGENT_NAMES) {
				const filePath = join(agentsDir, `${agentName}.md`)
				const content = readFileSync(filePath, "utf-8")

				// Parse frontmatter
				const frontmatter = parseFrontmatter(content)

				// Should have frontmatter
				expect(frontmatter.found).toBe(true)

				// Should have all required fields
				for (const field of REQUIRED_FRONTMATTER_FIELDS) {
					expect(frontmatter.fields[field]).toBeDefined()
					expect(frontmatter.fields[field]).not.toBe("")
				}

				// Verify version field is valid semver format
				const versionField = frontmatter.fields.version
				expect(versionField).toMatch(/^\d+\.\d+\.\d+$/)

				// Verify requires field is a valid version constraint
				const requiresField = frontmatter.fields.requires
				expect(requiresField).toMatch(/^[>=<^~]*\d+\.\d+\.\d+$/)
			}
		})

		it("should validate all shipped agent files have markdown headers after frontmatter", async () => {
			const { AGENT_NAMES, parseFrontmatter } = await import("../src/paths.mjs")

			const agentsDir = join(process.cwd(), "agents")

			for (const agentName of AGENT_NAMES) {
				const filePath = join(agentsDir, `${agentName}.md`)
				const content = readFileSync(filePath, "utf-8")

				// Parse frontmatter to get endIndex
				const frontmatter = parseFrontmatter(content)
				expect(frontmatter.found).toBe(true)

				// Get content after frontmatter
				const contentAfterFrontmatter = content.slice(frontmatter.endIndex).trimStart()

				// Should start with a markdown header
				expect(contentAfterFrontmatter.startsWith("# ")).toBe(true)

				// Extract and verify the header title is meaningful
				const firstLineEnd = contentAfterFrontmatter.indexOf("\n")
				const headerLine =
					firstLineEnd !== -1
						? contentAfterFrontmatter.slice(0, firstLineEnd)
						: contentAfterFrontmatter
				expect(headerLine.length).toBeGreaterThan(2) // More than just "# "
			}
		})

		it("should validate all shipped agent files contain required keywords", async () => {
			const { AGENT_NAMES, REQUIRED_KEYWORDS } = await import("../src/paths.mjs")

			const agentsDir = join(process.cwd(), "agents")

			for (const agentName of AGENT_NAMES) {
				const filePath = join(agentsDir, `${agentName}.md`)
				const content = readFileSync(filePath, "utf-8")
				const lowerContent = content.toLowerCase()

				// Should contain at least one required keyword
				const hasKeyword = REQUIRED_KEYWORDS.some((keyword: string) =>
					lowerContent.includes(keyword),
				)
				expect(hasKeyword).toBe(true)
			}
		})

		it("should validate all shipped agent files meet minimum content length", async () => {
			const { AGENT_NAMES, MIN_CONTENT_LENGTH } = await import("../src/paths.mjs")

			const agentsDir = join(process.cwd(), "agents")

			for (const agentName of AGENT_NAMES) {
				const filePath = join(agentsDir, `${agentName}.md`)
				const content = readFileSync(filePath, "utf-8")

				// Should be above minimum length
				expect(content.length).toBeGreaterThanOrEqual(MIN_CONTENT_LENGTH)
			}
		})

		it("should validate shipped agent count matches AGENT_NAMES", async () => {
			const { AGENT_NAMES } = await import("../src/paths.mjs")

			const agentsDir = join(process.cwd(), "agents")
			const files = readdirSync(agentsDir).filter((f) => f.endsWith(".md"))

			// Number of .md files should match expected agent names
			expect(files.length).toBe(AGENT_NAMES.length)

			// All expected agents should exist as files
			for (const agentName of AGENT_NAMES) {
				expect(files).toContain(`${agentName}.md`)
			}
		})
	})

	describe("full install/uninstall cycle", () => {
		it("should install and then cleanly uninstall", async () => {
			// Create scripts
			const postinstallPath = join(mockProjectDir, "test-postinstall.mjs")
			const preuninstallPath = join(mockProjectDir, "test-preuninstall.mjs")
			writeFileSync(postinstallPath, createMockPostinstall())
			writeFileSync(preuninstallPath, createMockPreuninstall())

			// Run postinstall
			const installProc = Bun.spawn(["node", postinstallPath], {
				cwd: mockProjectDir,
				stdout: "pipe",
				stderr: "pipe",
			})
			await installProc.exited

			// Verify installed
			expect(existsSync(join(agentsTargetDir, "opencoder.md"))).toBe(true)
			expect(existsSync(join(agentsTargetDir, "opencoder-planner.md"))).toBe(true)
			expect(existsSync(join(agentsTargetDir, "opencoder-builder.md"))).toBe(true)

			// Run preuninstall
			const uninstallProc = Bun.spawn(["node", preuninstallPath], {
				cwd: mockProjectDir,
				stdout: "pipe",
				stderr: "pipe",
			})
			await uninstallProc.exited

			// Verify uninstalled
			expect(existsSync(join(agentsTargetDir, "opencoder.md"))).toBe(false)
			expect(existsSync(join(agentsTargetDir, "opencoder-planner.md"))).toBe(false)
			expect(existsSync(join(agentsTargetDir, "opencoder-builder.md"))).toBe(false)

			// Target directory should still exist (we don't remove it)
			expect(existsSync(agentsTargetDir)).toBe(true)
		})

		it("should preserve other users files during uninstall", async () => {
			// Create scripts
			const postinstallPath = join(mockProjectDir, "test-postinstall.mjs")
			const preuninstallPath = join(mockProjectDir, "test-preuninstall.mjs")
			writeFileSync(postinstallPath, createMockPostinstall())
			writeFileSync(preuninstallPath, createMockPreuninstall())

			// Run postinstall
			const installProc = Bun.spawn(["node", postinstallPath], {
				cwd: mockProjectDir,
				stdout: "pipe",
				stderr: "pipe",
			})
			await installProc.exited

			// Add a user's custom agent file
			writeFileSync(join(agentsTargetDir, "my-custom-agent.md"), "# My Custom Agent")

			// Run preuninstall
			const uninstallProc = Bun.spawn(["node", preuninstallPath], {
				cwd: mockProjectDir,
				stdout: "pipe",
				stderr: "pipe",
			})
			await uninstallProc.exited

			// Our agents should be gone
			expect(existsSync(join(agentsTargetDir, "opencoder.md"))).toBe(false)

			// User's custom agent should remain
			expect(existsSync(join(agentsTargetDir, "my-custom-agent.md"))).toBe(true)
		})
	})
})
