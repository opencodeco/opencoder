/**
 * Plan evaluation response parsing
 */

import type { EvaluationResult } from "./types.ts"

/**
 * Parse evaluation response from the AI
 *
 * Expected formats:
 * - COMPLETE\nReason: ...
 * - NEEDS_WORK\nReason: ...
 */
export function parseEvaluation(response: string): EvaluationResult {
	const trimmed = response.trim().toUpperCase()

	// Check for COMPLETE
	if (trimmed.startsWith("COMPLETE") || trimmed.includes("\nCOMPLETE")) {
		return "COMPLETE"
	}

	// Check for NEEDS_WORK
	if (trimmed.startsWith("NEEDS_WORK") || trimmed.includes("\nNEEDS_WORK")) {
		return "NEEDS_WORK"
	}

	// Check within code blocks
	const codeBlockMatch = response.match(/```[\s\S]*?(COMPLETE|NEEDS_WORK)[\s\S]*?```/i)
	if (codeBlockMatch?.[1]) {
		return codeBlockMatch[1].toUpperCase() === "COMPLETE" ? "COMPLETE" : "NEEDS_WORK"
	}

	// Default to NEEDS_WORK if unclear
	return "NEEDS_WORK"
}

/**
 * Extract the reason from an evaluation response
 */
export function extractEvaluationReason(response: string): string | null {
	// Look for Reason: pattern
	const reasonMatch = response.match(/Reason:\s*(.+?)(?:\n|$)/i)
	if (reasonMatch?.[1]) {
		return reasonMatch[1].trim()
	}

	// Look for reason in a code block
	const codeBlockMatch = response.match(
		/```[\s\S]*?(?:COMPLETE|NEEDS_WORK)\s*\n\s*Reason:\s*(.+?)(?:\n|```)[\s\S]*?```/i,
	)
	if (codeBlockMatch?.[1]) {
		return codeBlockMatch[1].trim()
	}

	return null
}

/**
 * Check if evaluation indicates cycle is complete
 */
export function isComplete(result: EvaluationResult): boolean {
	return result === "COMPLETE"
}

/**
 * Check if evaluation indicates more work is needed
 */
export function needsWork(result: EvaluationResult): boolean {
	return result === "NEEDS_WORK"
}
