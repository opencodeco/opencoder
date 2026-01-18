import { describe, expect, it } from "bun:test"
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
})
