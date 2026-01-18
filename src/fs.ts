/**
 * File system utilities and workspace path management
 */

import { existsSync, mkdirSync, readdirSync, renameSync, statSync, unlinkSync } from "node:fs"
import { join, resolve } from "node:path"
import type { Paths } from "./types.ts"

/** Name of the workspace directory (inside .opencode) */
const OPENCODE_DIR = ".opencode"
const OPENCODER_SUBDIR = "opencoder"

/**
 * Initialize all workspace paths for a project
 */
export function initializePaths(projectDir: string): Paths {
	const opencoderDir = join(resolve(projectDir), OPENCODE_DIR, OPENCODER_SUBDIR)

	return {
		opencoderDir,
		stateFile: join(opencoderDir, "state.json"),
		currentPlan: join(opencoderDir, "current_plan.md"),
		mainLog: join(opencoderDir, "logs", "main.log"),
		cycleLogDir: join(opencoderDir, "logs", "cycles"),
		alertsFile: join(opencoderDir, "alerts.log"),
		historyDir: join(opencoderDir, "history"),
		ideasDir: join(opencoderDir, "ideas"),
		configFile: join(opencoderDir, "config.json"),
	}
}

/**
 * Ensure all required directories exist
 */
export function ensureDirectories(paths: Paths): void {
	const directories = [
		paths.opencoderDir,
		join(paths.opencoderDir, "logs"),
		paths.cycleLogDir,
		paths.historyDir,
		paths.ideasDir,
	]

	for (const dir of directories) {
		if (!existsSync(dir)) {
			mkdirSync(dir, { recursive: true })
		}
	}
}

/**
 * Read a file, returning null if it doesn't exist
 */
export async function readFileOrNull(path: string): Promise<string | null> {
	try {
		return await Bun.file(path).text()
	} catch {
		return null
	}
}

/**
 * Write content to a file, creating parent directories if needed
 */
export async function writeFile(path: string, content: string): Promise<void> {
	await Bun.write(path, content)
}

/**
 * Append content to a file
 */
export function appendToFile(path: string, content: string): void {
	// Bun.write doesn't support append, so use node:fs for sync operation
	const { appendFileSync } = require("node:fs")
	appendFileSync(path, content)
}

/**
 * Check if a path exists
 */
export function pathExists(path: string): boolean {
	return existsSync(path)
}

/**
 * List files in a directory with optional extension filter
 */
export function listFiles(dirPath: string, extension?: string): string[] {
	if (!existsSync(dirPath)) {
		return []
	}

	const files = readdirSync(dirPath)

	if (extension) {
		return files.filter((f) => f.endsWith(extension))
	}

	return files
}

/**
 * Get file modification time
 */
export function getFileModTime(path: string): number {
	try {
		const stats = statSync(path)
		return stats.mtimeMs
	} catch {
		return 0
	}
}

/**
 * Delete a file if it exists
 */
export function deleteFile(path: string): boolean {
	try {
		if (existsSync(path)) {
			unlinkSync(path)
			return true
		}
		return false
	} catch {
		return false
	}
}

/**
 * Rename/move a file
 */
export function renameFile(oldPath: string, newPath: string): boolean {
	try {
		renameSync(oldPath, newPath)
		return true
	} catch {
		return false
	}
}

/**
 * Clean up old files in a directory based on age
 */
export function cleanupOldFiles(dirPath: string, maxAgeDays: number): number {
	if (!existsSync(dirPath)) {
		return 0
	}

	const cutoffMs = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000
	let deletedCount = 0

	const files = readdirSync(dirPath)
	for (const file of files) {
		const filePath = join(dirPath, file)
		try {
			const stats = statSync(filePath)
			if (stats.mtimeMs < cutoffMs) {
				unlinkSync(filePath)
				deletedCount++
			}
		} catch {
			// Ignore errors for individual files
		}
	}

	return deletedCount
}

/**
 * Generate a timestamp string for filenames (YYYYMMDD_HHMMSS)
 */
export function getTimestampForFilename(): string {
	const now = new Date()
	return now.toISOString().replace(/[-:]/g, "").replace("T", "_").slice(0, 15)
}

/**
 * Generate an ISO timestamp string
 */
export function getISOTimestamp(): string {
	return new Date().toISOString()
}
