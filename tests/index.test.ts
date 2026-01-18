import { describe, expect, it } from "bun:test"
import { readdirSync } from "node:fs"
import { join } from "node:path"
import pkg from "../package.json"
import { agents, description, name, version } from "../src/index.ts"

describe("index.ts exports", () => {
	it("should export the plugin name from package.json", () => {
		expect(name).toBe("opencode-plugin-opencoder")
		expect(name).toBe(pkg.name)
	})

	it("should export the version from package.json", () => {
		expect(version).toMatch(/^\d+\.\d+\.\d+/)
		expect(version).toBe(pkg.version)
	})

	it("should export a description from package.json", () => {
		expect(description).toContain("autonomous")
		expect(description).toBe(pkg.description)
	})

	it("should export the list of agents", () => {
		expect(agents).toEqual(["opencoder", "opencoder-planner", "opencoder-builder"])
	})

	it("should have 3 agents", () => {
		expect(agents).toHaveLength(3)
	})

	it("should have matching agent files in agents/ directory", () => {
		const agentsDir = join(import.meta.dirname, "..", "agents")
		const files = readdirSync(agentsDir)
		const mdFiles = files.filter((f) => f.endsWith(".md"))
		const agentNamesFromFiles = mdFiles.map((f) => f.replace(/\.md$/, "")).sort()
		const agentNamesFromExport = [...agents].sort()

		expect(agentNamesFromExport).toEqual(agentNamesFromFiles)
	})
})
