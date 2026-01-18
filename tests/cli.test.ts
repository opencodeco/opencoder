/**
 * Tests for cli module
 */

import { describe, expect, test } from "bun:test"
import { parseCli } from "../src/cli.ts"

describe("parseCli", () => {
	// Helper to create argv array (simulates process.argv)
	const argv = (...args: string[]) => ["node", "opencoder", ...args]

	describe("model options", () => {
		test("parses --model option", () => {
			const result = parseCli(argv("--model", "anthropic/claude-sonnet-4"))

			expect(result.options.model).toBe("anthropic/claude-sonnet-4")
		})

		test("parses -m shorthand", () => {
			const result = parseCli(argv("-m", "openai/gpt-4"))

			expect(result.options.model).toBe("openai/gpt-4")
		})

		test("parses --plan-model option", () => {
			const result = parseCli(argv("--plan-model", "anthropic/claude-opus-4"))

			expect(result.options.planModel).toBe("anthropic/claude-opus-4")
		})

		test("parses -P shorthand for plan model", () => {
			const result = parseCli(argv("-P", "anthropic/claude-opus-4"))

			expect(result.options.planModel).toBe("anthropic/claude-opus-4")
		})

		test("parses --build-model option", () => {
			const result = parseCli(argv("--build-model", "anthropic/claude-sonnet-4"))

			expect(result.options.buildModel).toBe("anthropic/claude-sonnet-4")
		})

		test("parses -B shorthand for build model", () => {
			const result = parseCli(argv("-B", "anthropic/claude-sonnet-4"))

			expect(result.options.buildModel).toBe("anthropic/claude-sonnet-4")
		})

		test("parses separate plan and build models", () => {
			const result = parseCli(
				argv("-P", "anthropic/claude-opus-4", "-B", "anthropic/claude-sonnet-4"),
			)

			expect(result.options.planModel).toBe("anthropic/claude-opus-4")
			expect(result.options.buildModel).toBe("anthropic/claude-sonnet-4")
		})
	})

	describe("project option", () => {
		test("parses --project option", () => {
			const result = parseCli(argv("--project", "/path/to/project"))

			expect(result.options.project).toBe("/path/to/project")
		})

		test("parses -p shorthand", () => {
			const result = parseCli(argv("-p", "./myproject"))

			expect(result.options.project).toBe("./myproject")
		})

		test("project is undefined when not provided", () => {
			const result = parseCli(argv("-m", "anthropic/claude-sonnet-4"))

			expect(result.options.project).toBeUndefined()
		})
	})

	describe("verbose option", () => {
		test("parses --verbose flag", () => {
			const result = parseCli(argv("--verbose"))

			expect(result.options.verbose).toBe(true)
		})

		test("parses -v shorthand", () => {
			const result = parseCli(argv("-v"))

			expect(result.options.verbose).toBe(true)
		})

		test("verbose is undefined when not provided", () => {
			const result = parseCli(argv("-m", "anthropic/claude-sonnet-4"))

			expect(result.options.verbose).toBeUndefined()
		})
	})

	describe("hint argument", () => {
		test("parses hint argument", () => {
			const result = parseCli(argv("build a REST API"))

			expect(result.hint).toBe("build a REST API")
		})

		test("parses hint with options", () => {
			const result = parseCli(argv("-m", "anthropic/claude-sonnet-4", "focus on tests"))

			expect(result.hint).toBe("focus on tests")
			expect(result.options.model).toBe("anthropic/claude-sonnet-4")
		})

		test("hint is undefined when not provided", () => {
			const result = parseCli(argv("-m", "anthropic/claude-sonnet-4"))

			expect(result.hint).toBeUndefined()
		})

		test("parses quoted hint with spaces", () => {
			const result = parseCli(argv("implement user authentication flow"))

			expect(result.hint).toBe("implement user authentication flow")
		})
	})

	describe("combined options", () => {
		test("parses all options together", () => {
			const result = parseCli(
				argv(
					"-p",
					"./myproject",
					"-P",
					"anthropic/claude-opus-4",
					"-B",
					"anthropic/claude-sonnet-4",
					"-v",
					"build the feature",
				),
			)

			expect(result.options.project).toBe("./myproject")
			expect(result.options.planModel).toBe("anthropic/claude-opus-4")
			expect(result.options.buildModel).toBe("anthropic/claude-sonnet-4")
			expect(result.options.verbose).toBe(true)
			expect(result.hint).toBe("build the feature")
		})

		test("parses model with project and verbose", () => {
			const result = parseCli(argv("-m", "openai/gpt-4o", "-p", "/project", "-v"))

			expect(result.options.model).toBe("openai/gpt-4o")
			expect(result.options.project).toBe("/project")
			expect(result.options.verbose).toBe(true)
		})

		test("options can appear in any order", () => {
			const result = parseCli(
				argv("-v", "my hint", "-m", "anthropic/claude-sonnet-4", "-p", "./proj"),
			)

			expect(result.options.verbose).toBe(true)
			expect(result.options.model).toBe("anthropic/claude-sonnet-4")
			expect(result.options.project).toBe("./proj")
			expect(result.hint).toBe("my hint")
		})
	})

	describe("default values", () => {
		test("returns undefined for all options when none provided", () => {
			const result = parseCli(argv())

			expect(result.options.project).toBeUndefined()
			expect(result.options.model).toBeUndefined()
			expect(result.options.planModel).toBeUndefined()
			expect(result.options.buildModel).toBeUndefined()
			expect(result.options.verbose).toBeUndefined()
			expect(result.hint).toBeUndefined()
		})
	})
})
