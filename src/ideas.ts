/**
 * Ideas queue management
 *
 * Users can place .md files in .opencode/opencoder/ideas/ to provide specific tasks
 * for the autonomous loop to work on.
 */

import { existsSync, readdirSync, unlinkSync } from "node:fs"
import { join } from "node:path"
import type { Idea } from "./types.ts"

/** Maximum idea content length */
const MAX_IDEA_LENGTH = 8192

/**
 * Load all ideas from the ideas directory
 */
export async function loadAllIdeas(ideasDir: string): Promise<Idea[]> {
	if (!existsSync(ideasDir)) {
		return []
	}

	const files = readdirSync(ideasDir).filter((f) => f.endsWith(".md"))
	const ideas: Idea[] = []

	for (const filename of files) {
		const path = join(ideasDir, filename)

		try {
			const content = await Bun.file(path).text()

			// Skip empty files
			if (!content.trim()) {
				continue
			}

			// Truncate if too long
			const truncatedContent =
				content.length > MAX_IDEA_LENGTH ? content.slice(0, MAX_IDEA_LENGTH) : content

			ideas.push({
				path,
				filename,
				content: truncatedContent,
			})
		} catch (err) {
			// Skip unreadable files (permission issues, file deleted, etc.)
			if (process.env.DEBUG) {
				console.debug(`[ideas] Failed to read ${filename}: ${err}`)
			}
		}
	}

	return ideas
}

/**
 * Format ideas for AI selection prompt
 */
export function formatIdeasForSelection(ideas: Idea[]): string {
	const sections: string[] = []

	for (let i = 0; i < ideas.length; i++) {
		const idea = ideas[i]
		if (!idea) continue
		const summary = getIdeaSummary(idea.content)

		sections.push(`## Idea ${i + 1}: ${idea.filename}

Summary: ${summary}

Full content:
\`\`\`
${idea.content}
\`\`\`
`)
	}

	return sections.join("\n")
}

/**
 * Get a summary of an idea (first line or first 100 chars)
 */
export function getIdeaSummary(content: string): string {
	const trimmed = content.trim()

	// Try to get the first non-empty line
	const lines = trimmed.split("\n")
	for (const line of lines) {
		const cleanLine = line.replace(/^#+\s*/, "").trim() // Remove markdown headers
		if (cleanLine.length > 0) {
			return cleanLine.length > 100 ? `${cleanLine.slice(0, 100)}...` : cleanLine
		}
	}

	// Fallback to first 100 chars
	return trimmed.length > 100 ? `${trimmed.slice(0, 100)}...` : trimmed
}

/**
 * Remove an idea file after it has been processed
 */
export function removeIdea(ideaPath: string): boolean {
	try {
		if (existsSync(ideaPath)) {
			unlinkSync(ideaPath)
			return true
		}
		return false
	} catch (err) {
		// Failed to remove idea file (permission issues, etc.)
		if (process.env.DEBUG) {
			console.debug(`[ideas] Failed to remove ${ideaPath}: ${err}`)
		}
		return false
	}
}

/**
 * Remove an idea by index from a list
 */
export function removeIdeaByIndex(ideas: Idea[], index: number): boolean {
	const idea = ideas[index]
	if (!idea) {
		return false
	}
	return removeIdea(idea.path)
}

/**
 * Parse AI's idea selection response to get the selected index
 *
 * Expected format:
 * SELECTED_IDEA: <number>
 * REASON: <explanation>
 */
export function parseIdeaSelection(response: string): number | null {
	// Look for SELECTED_IDEA: N pattern
	const match = response.match(/SELECTED_IDEA:\s*(\d+)/i)

	if (!match?.[1]) {
		return null
	}

	const selectedNum = Number.parseInt(match[1], 10)

	// Convert from 1-indexed (human-friendly) to 0-indexed
	if (selectedNum > 0) {
		return selectedNum - 1
	}

	return null
}

/**
 * Count ideas in the queue
 */
export async function countIdeas(ideasDir: string): Promise<number> {
	if (!existsSync(ideasDir)) {
		return 0
	}

	const files = readdirSync(ideasDir).filter((f) => f.endsWith(".md"))
	return files.length
}

/**
 * Clean up empty or invalid idea files
 */
export async function cleanupEmptyIdeas(ideasDir: string): Promise<number> {
	if (!existsSync(ideasDir)) {
		return 0
	}

	const files = readdirSync(ideasDir).filter((f) => f.endsWith(".md"))
	let removedCount = 0

	for (const filename of files) {
		const path = join(ideasDir, filename)

		try {
			const content = await Bun.file(path).text()

			if (!content.trim()) {
				unlinkSync(path)
				removedCount++
			}
		} catch (err) {
			// Try to remove unreadable files
			if (process.env.DEBUG) {
				console.debug(`[ideas] Failed to read ${filename} during cleanup: ${err}`)
			}
			try {
				unlinkSync(path)
				removedCount++
			} catch (unlinkErr) {
				// Could not remove file (permission issues, etc.)
				if (process.env.DEBUG) {
					console.debug(`[ideas] Failed to remove ${filename}: ${unlinkErr}`)
				}
			}
		}
	}

	return removedCount
}
