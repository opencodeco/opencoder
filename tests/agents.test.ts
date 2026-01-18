import { afterEach, beforeEach, describe, expect, it } from "bun:test"
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

describe("postinstall.mjs", () => {
	const testDir = join(tmpdir(), `opencoder-test-${Date.now()}`)
	const agentsSourceDir = join(testDir, "agents")

	beforeEach(() => {
		// Create test directories
		mkdirSync(agentsSourceDir, { recursive: true })
		// Create mock agent files
		writeFileSync(join(agentsSourceDir, "test-agent.md"), "# Test Agent")
		writeFileSync(join(agentsSourceDir, "another-agent.md"), "# Another Agent")
	})

	afterEach(() => {
		// Clean up test directories
		if (existsSync(testDir)) {
			rmSync(testDir, { recursive: true, force: true })
		}
	})

	it("should identify .md files in source directory", () => {
		const files = readdirSync(agentsSourceDir).filter((f) => f.endsWith(".md"))
		expect(files).toContain("test-agent.md")
		expect(files).toContain("another-agent.md")
		expect(files).toHaveLength(2)
	})

	it("should not include non-.md files", () => {
		writeFileSync(join(agentsSourceDir, "readme.txt"), "Not an agent")
		const files = readdirSync(agentsSourceDir).filter((f) => f.endsWith(".md"))
		expect(files).not.toContain("readme.txt")
		expect(files).toHaveLength(2)
	})
})

describe("agent files existence", () => {
	const agentsDir = join(import.meta.dir, "..", "agents")

	it("should have opencoder.md agent file", () => {
		expect(existsSync(join(agentsDir, "opencoder.md"))).toBe(true)
	})

	it("should have opencoder-planner.md agent file", () => {
		expect(existsSync(join(agentsDir, "opencoder-planner.md"))).toBe(true)
	})

	it("should have opencoder-builder.md agent file", () => {
		expect(existsSync(join(agentsDir, "opencoder-builder.md"))).toBe(true)
	})

	it("should have exactly 3 agent files", () => {
		const files = readdirSync(agentsDir).filter((f) => f.endsWith(".md"))
		expect(files).toHaveLength(3)
	})
})
