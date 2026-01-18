/**
 * Git operations helper module
 */

import { execSync } from "node:child_process"

import type { Logger } from "./logger.ts"

export function hasChanges(projectDir: string): boolean {
	try {
		const output = execSync("git status --porcelain", {
			cwd: projectDir,
			encoding: "utf-8",
		})
		return output.trim().length > 0
	} catch {
		return false
	}
}

/**
 * Check if there are unpushed commits on the current branch.
 * Returns true if there are commits that haven't been pushed to the remote.
 */
export function hasUnpushedCommits(projectDir: string): boolean {
	try {
		// Get the current branch
		const branch = execSync("git rev-parse --abbrev-ref HEAD", {
			cwd: projectDir,
			encoding: "utf-8",
		}).trim()

		// Check if there's a tracking branch
		try {
			execSync(`git rev-parse --abbrev-ref ${branch}@{upstream}`, {
				cwd: projectDir,
				encoding: "utf-8",
				stdio: ["pipe", "pipe", "pipe"],
			})
		} catch {
			// No upstream branch, can't determine if unpushed
			return false
		}

		// Count commits ahead of upstream
		const output = execSync(`git rev-list --count ${branch}@{upstream}..HEAD`, {
			cwd: projectDir,
			encoding: "utf-8",
		})
		const count = Number.parseInt(output.trim(), 10)
		return count > 0
	} catch {
		return false
	}
}

export function generateCommitMessage(taskDescription: string): string {
	const lowerDesc = taskDescription.toLowerCase()

	// Check more specific patterns first before generic ones like "add"

	if (
		lowerDesc.includes("fix") ||
		lowerDesc.includes("bug") ||
		lowerDesc.includes("resolve") ||
		lowerDesc.includes("issue")
	) {
		return `fix: ${taskDescription}`
	}

	if (lowerDesc.includes("test") || lowerDesc.includes("spec") || lowerDesc.includes("coverage")) {
		return `test: ${taskDescription}`
	}

	if (
		lowerDesc.includes("docs") ||
		lowerDesc.includes("documentation") ||
		lowerDesc.includes("readme") ||
		lowerDesc.includes("comment")
	) {
		return `docs: ${taskDescription}`
	}

	if (
		lowerDesc.includes("refactor") ||
		lowerDesc.includes("rewrite") ||
		lowerDesc.includes("restructure") ||
		lowerDesc.includes("reorganize") ||
		lowerDesc.includes("cleanup") ||
		lowerDesc.includes("clean up")
	) {
		return `refactor: ${taskDescription}`
	}

	if (
		lowerDesc.includes("perf") ||
		lowerDesc.includes("performance") ||
		lowerDesc.includes("optimize") ||
		lowerDesc.includes("speed")
	) {
		return `perf: ${taskDescription}`
	}

	if (
		lowerDesc.includes("chore") ||
		lowerDesc.includes("dependency") ||
		lowerDesc.includes("dependencies") ||
		lowerDesc.includes("upgrade") ||
		lowerDesc.includes("bump")
	) {
		return `chore: ${taskDescription}`
	}

	if (
		lowerDesc.includes("ci") ||
		lowerDesc.includes("workflow") ||
		lowerDesc.includes("pipeline")
	) {
		return `ci: ${taskDescription}`
	}

	if (
		lowerDesc.includes("build") ||
		lowerDesc.includes("compile") ||
		lowerDesc.includes("bundle")
	) {
		return `build: ${taskDescription}`
	}

	if (lowerDesc.includes("style") || lowerDesc.includes("format") || lowerDesc.includes("lint")) {
		return `style: ${taskDescription}`
	}

	// Improvement is a common word that could be refactor or perf, default to refactor
	if (lowerDesc.includes("improve")) {
		return `refactor: ${taskDescription}`
	}

	// Generic feature patterns last
	if (
		lowerDesc.includes("feat") ||
		lowerDesc.includes("add") ||
		lowerDesc.includes("implement") ||
		lowerDesc.includes("new")
	) {
		return `feat: ${taskDescription}`
	}

	return `feat: ${taskDescription}`
}

export function commitChanges(
	projectDir: string,
	logger: Logger,
	message: string,
	signoff: boolean,
): void {
	try {
		const signoffFlag = signoff ? " -s" : ""
		// Use single quotes to prevent shell expansion of special characters ($, `, \)
		// and replace existing single quotes with '"'"' (end quote, escaped quote, start quote)
		const escapedMessage = message.replace(/'/g, "'\"'\"'")
		execSync(`git add . && git commit${signoffFlag} -m '${escapedMessage}'`, {
			cwd: projectDir,
			encoding: "utf-8",
		})
		logger.log(`Committed: ${message}`)
	} catch (err) {
		logger.logError(`Failed to commit changes: ${err}`)
	}
}

export function pushChanges(projectDir: string, logger: Logger): void {
	try {
		execSync("git push", {
			cwd: projectDir,
			encoding: "utf-8",
		})
		logger.log("Pushed changes to remote")
	} catch (err) {
		logger.logError(`Failed to push changes: ${err}`)
	}
}
