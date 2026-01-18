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

function validateAgentContent(filePath) {
	const content = readFileSync(filePath, "utf-8")

	if (content.length < MIN_CONTENT_LENGTH) {
		return {
			valid: false,
			error: \`File too short: \${content.length} characters (minimum \${MIN_CONTENT_LENGTH})\`,
		}
	}

	if (!content.startsWith("# ")) {
		return {
			valid: false,
			error: "File does not start with a markdown header (# )",
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

		// Valid agent content for tests (meets all requirements)
		const validAgentContent = `# Test Agent

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

		it("should reject files without markdown header", async () => {
			// Create a file without markdown header
			const contentWithoutHeader = `This file does not start with a markdown header.
It has enough content and contains the word agent and task.
This should fail the validation because it doesn't start with # symbol.`
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
			expect(stderr).toContain("does not start with a markdown header")
		})

		it("should reject files missing required keywords", async () => {
			// Create a file with header and length but missing keywords
			const contentWithoutKeywords = `# Valid Header

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
			const contentWithUpperAgent = `# Test File

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
			const contentWithTask = `# Test File

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
