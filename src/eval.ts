/**
 * Plan eval response parsing
 */

import type { EvalResult } from "./types.ts"

/**
 * Parse eval response from the AI
 *
 * Expected formats:
 * - COMPLETE\nReason: ...
 * - NEEDS_WORK\nReason: ...
 */
export function parseEval(response: string): EvalResult {
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
 * Extract the reason from an eval response
 */
export function extractEvalReason(response: string): string | null {
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
 * Check if eval indicates cycle is complete
 */
export function isComplete(result: EvalResult): boolean {
	return result === "COMPLETE"
}

/**
 * Check if eval indicates more work is needed
 */
export function needsWork(result: EvalResult): boolean {
	return result === "NEEDS_WORK"
}
