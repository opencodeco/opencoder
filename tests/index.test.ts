import { describe, expect, it } from "bun:test"
import { readdirSync } from "node:fs"
import { join } from "node:path"
import pkg from "../package.json"
import DefaultExport, { agents, description, name, OpenCoderPlugin, version } from "../src/index.ts"

describe("index.ts exports", () => {
	it("should export the plugin function as named export", () => {
		expect(OpenCoderPlugin).toBeInstanceOf(Function)
	})

	it("should export the plugin function as default export", () => {
		expect(DefaultExport).toBeInstanceOf(Function)
		expect(DefaultExport).toBe(OpenCoderPlugin)
	})

	it("should export name matching package.json", () => {
		expect(name).toBe(pkg.name)
	})

	it("should export version matching package.json", () => {
		expect(version).toBe(pkg.version)
	})

	it("should export description matching package.json", () => {
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
		const agentNamesFromExport = ([...agents] as string[]).sort()

		expect(agentNamesFromExport).toEqual(agentNamesFromFiles)
	})
})
