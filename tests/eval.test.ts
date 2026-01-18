/**
 * Tests for evaluator module
 */

import { describe, expect, test } from "bun:test"
import { extractEvaluationReason, isComplete, parseEvaluation } from "../src/evaluator.ts"

describe("evaluator", () => {
	describe("parseEvaluation", () => {
		test("parses COMPLETE response", () => {
			const response = "COMPLETE\nReason: All tasks done"
			const result = parseEvaluation(response)

			expect(result).toBe("COMPLETE")
		})

		test("parses NEEDS_WORK response", () => {
			const response = "NEEDS_WORK\nReason: Tests failing"
			const result = parseEvaluation(response)

			expect(result).toBe("NEEDS_WORK")
		})

		test("handles extra whitespace", () => {
			const response = "  COMPLETE  \n\nReason: Done"
			const result = parseEvaluation(response)

			expect(result).toBe("COMPLETE")
		})

		test("defaults to NEEDS_WORK for ambiguous response", () => {
			const response = "Maybe we should continue"
			const result = parseEvaluation(response)

			expect(result).toBe("NEEDS_WORK")
		})

		test("handles case insensitive matching", () => {
			const response = "complete\nreason: all good"
			const result = parseEvaluation(response)

			expect(result).toBe("COMPLETE")
		})

		test("handles response with code block", () => {
			const response = `Here's my evaluation:
\`\`\`
COMPLETE
Reason: Everything passed
\`\`\``
			const result = parseEvaluation(response)

			expect(result).toBe("COMPLETE")
		})
	})

	describe("isComplete", () => {
		test("returns true for COMPLETE", () => {
			expect(isComplete("COMPLETE")).toBe(true)
		})

		test("returns false for NEEDS_WORK", () => {
			expect(isComplete("NEEDS_WORK")).toBe(false)
		})
	})

	describe("extractEvaluationReason", () => {
		test("extracts reason from response", () => {
			const response = "COMPLETE\nReason: All tests passing and code looks good"
			const reason = extractEvaluationReason(response)

			expect(reason).toBe("All tests passing and code looks good")
		})

		test("handles multi-word reason", () => {
			const response = "NEEDS_WORK\nReason: Three tests still failing in the auth module"
			const reason = extractEvaluationReason(response)

			expect(reason).toBe("Three tests still failing in the auth module")
		})

		test("returns null when no reason found", () => {
			const response = "COMPLETE"
			const reason = extractEvaluationReason(response)

			expect(reason).toBeNull()
		})

		test("handles lowercase reason prefix", () => {
			const response = "COMPLETE\nreason: it works"
			const reason = extractEvaluationReason(response)

			expect(reason).toBe("it works")
		})
	})
})
