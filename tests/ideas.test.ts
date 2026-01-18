/**
 * Tests for ideas module
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { existsSync, mkdirSync, rmSync } from "node:fs"
import { join } from "node:path"
import {
	countIdeas,
	formatIdeasForSelection,
	getIdeaSummary,
	loadAllIdeas,
	parseIdeaSelection,
	removeIdea,
} from "../src/ideas.ts"

const TEST_DIR = "/tmp/opencoder-test-ideas"

describe("ideas", () => {
	beforeEach(() => {
		if (existsSync(TEST_DIR)) {
			rmSync(TEST_DIR, { recursive: true })
		}
		mkdirSync(TEST_DIR, { recursive: true })
	})

	afterEach(() => {
		if (existsSync(TEST_DIR)) {
			rmSync(TEST_DIR, { recursive: true })
		}
	})

	describe("loadAllIdeas", () => {
		test("returns empty array for non-existent directory", async () => {
			const ideas = await loadAllIdeas("/nonexistent/path")
			expect(ideas.length).toBe(0)
		})

		test("loads markdown files from directory", async () => {
			await Bun.write(join(TEST_DIR, "idea1.md"), "# First Idea\nDescription")
			await Bun.write(join(TEST_DIR, "idea2.md"), "# Second Idea\nContent")
			await Bun.write(join(TEST_DIR, "not-an-idea.txt"), "Ignored file")

			const ideas = await loadAllIdeas(TEST_DIR)

			expect(ideas.length).toBe(2)
			expect(ideas.some((i) => i.filename === "idea1.md")).toBe(true)
			expect(ideas.some((i) => i.filename === "idea2.md")).toBe(true)
		})

		test("skips empty files", async () => {
			await Bun.write(join(TEST_DIR, "empty.md"), "")
			await Bun.write(join(TEST_DIR, "whitespace.md"), "   \n\t  ")
			await Bun.write(join(TEST_DIR, "valid.md"), "Valid content")

			const ideas = await loadAllIdeas(TEST_DIR)

			expect(ideas.length).toBe(1)
			expect(ideas[0]?.filename).toBe("valid.md")
		})
	})

	describe("getIdeaSummary", () => {
		test("extracts first line as summary", () => {
			const summary = getIdeaSummary("First line\nSecond line")
			expect(summary).toBe("First line")
		})

		test("removes markdown headers", () => {
			const summary = getIdeaSummary("# Header Title\nContent")
			expect(summary).toBe("Header Title")
		})

		test("truncates long summaries", () => {
			const longContent = "A".repeat(150)
			const summary = getIdeaSummary(longContent)

			expect(summary.length).toBeLessThanOrEqual(103) // 100 + "..."
			expect(summary.endsWith("...")).toBe(true)
		})

		test("skips empty lines to find summary", () => {
			const summary = getIdeaSummary("\n\n# Title\nContent")
			expect(summary).toBe("Title")
		})
	})

	describe("formatIdeasForSelection", () => {
		test("formats ideas with numbers and content", () => {
			const ideas = [
				{ path: "/a.md", filename: "a.md", content: "# Idea A\nContent A" },
				{ path: "/b.md", filename: "b.md", content: "# Idea B\nContent B" },
			]

			const formatted = formatIdeasForSelection(ideas)

			expect(formatted).toContain("## Idea 1: a.md")
			expect(formatted).toContain("## Idea 2: b.md")
			expect(formatted).toContain("Content A")
			expect(formatted).toContain("Content B")
		})
	})

	describe("parseIdeaSelection", () => {
		test("parses valid selection response", () => {
			const response = "SELECTED_IDEA: 2\nREASON: It's simpler"
			const index = parseIdeaSelection(response)

			expect(index).toBe(1) // 0-indexed
		})

		test("handles case insensitive matching", () => {
			const response = "selected_idea: 3\nreason: Quick win"
			const index = parseIdeaSelection(response)

			expect(index).toBe(2)
		})

		test("returns null for invalid response", () => {
			const response = "I think we should do idea 2"
			const index = parseIdeaSelection(response)

			expect(index).toBeNull()
		})

		test("returns null for zero selection", () => {
			const response = "SELECTED_IDEA: 0\nREASON: Invalid"
			const index = parseIdeaSelection(response)

			expect(index).toBeNull()
		})
	})

	describe("countIdeas", () => {
		test("returns 0 for non-existent directory", async () => {
			const count = await countIdeas("/nonexistent")
			expect(count).toBe(0)
		})

		test("counts markdown files", async () => {
			await Bun.write(join(TEST_DIR, "a.md"), "idea")
			await Bun.write(join(TEST_DIR, "b.md"), "idea")
			await Bun.write(join(TEST_DIR, "c.txt"), "not counted")

			const count = await countIdeas(TEST_DIR)
			expect(count).toBe(2)
		})
	})

	describe("removeIdea", () => {
		test("removes existing file", async () => {
			const filePath = join(TEST_DIR, "to-remove.md")
			await Bun.write(filePath, "content")

			const result = removeIdea(filePath)

			expect(result).toBe(true)
			expect(existsSync(filePath)).toBe(false)
		})

		test("returns false for non-existent file", () => {
			const result = removeIdea("/nonexistent/file.md")
			expect(result).toBe(false)
		})
	})
})
