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
 * Initialize all workspace paths for a project.
 * @param projectDir - The root directory of the project
 * @returns Paths object containing all workspace file and directory paths
 */
export function initializePaths(projectDir: string): Paths {
	const opencoderDir = join(resolve(projectDir), OPENCODE_DIR, OPENCODER_SUBDIR)
	const ideasDir = join(opencoderDir, "ideas")

	return {
		opencoderDir,
		stateFile: join(opencoderDir, "state.json"),
		currentPlan: join(opencoderDir, "current_plan.md"),
		mainLog: join(opencoderDir, "logs", "main.log"),
		cycleLogDir: join(opencoderDir, "logs", "cycles"),
		alertsFile: join(opencoderDir, "alerts.log"),
		historyDir: join(opencoderDir, "history"),
		ideasDir,
		ideasHistoryDir: join(ideasDir, "history"),
		configFile: join(opencoderDir, "config.json"),
		metricsFile: join(opencoderDir, "metrics.json"),
	}
}

/**
 * Ensure all required directories exist.
 * Creates the opencoder workspace directories if they don't exist.
 * @param paths - Paths object from initializePaths
 */
export function ensureDirectories(paths: Paths): void {
	const directories = [
		paths.opencoderDir,
		join(paths.opencoderDir, "logs"),
		paths.cycleLogDir,
		paths.historyDir,
		paths.ideasDir,
		paths.ideasHistoryDir,
	]

	for (const dir of directories) {
		if (!existsSync(dir)) {
			mkdirSync(dir, { recursive: true })
		}
	}
}

/**
 * Read a file, returning null if it doesn't exist.
 * @param path - Absolute path to the file
 * @returns File contents as string, or null if file doesn't exist or read fails
 */
export async function readFileOrNull(path: string): Promise<string | null> {
	try {
		return await Bun.file(path).text()
	} catch {
		return null
	}
}

/**
 * Write content to a file, creating parent directories if needed.
 * @param path - Absolute path to the file
 * @param content - Content to write
 */
export async function writeFile(path: string, content: string): Promise<void> {
	await Bun.write(path, content)
}

/**
 * Append content to a file.
 * Creates the file if it doesn't exist.
 * @param path - Absolute path to the file
 * @param content - Content to append
 */
export function appendToFile(path: string, content: string): void {
	// Bun.write doesn't support append, so use node:fs for sync operation
	const { appendFileSync } = require("node:fs")
	appendFileSync(path, content)
}

/**
 * Check if a path exists.
 * @param path - Path to check (file or directory)
 * @returns True if the path exists, false otherwise
 */
export function pathExists(path: string): boolean {
	return existsSync(path)
}

/**
 * List files in a directory with optional extension filter.
 * @param dirPath - Path to the directory
 * @param extension - Optional file extension to filter by (e.g., ".md")
 * @returns Array of filenames (not full paths), or empty array if directory doesn't exist
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
 * Get file modification time.
 * @param path - Path to the file
 * @returns Modification time in milliseconds since epoch, or 0 if file doesn't exist
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
 * Delete a file if it exists.
 * @param path - Path to the file to delete
 * @returns True if file was deleted, false if it didn't exist or deletion failed
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
 * Rename or move a file.
 * @param oldPath - Current path of the file
 * @param newPath - New path for the file
 * @returns True if rename succeeded, false otherwise
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
 * Clean up old files in a directory based on age.
 * Deletes files with modification time older than the specified number of days.
 * @param dirPath - Path to the directory to clean
 * @param maxAgeDays - Maximum age in days; files older than this will be deleted
 * @returns Number of files deleted
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
 * Generate a timestamp string for filenames.
 * @returns Timestamp in YYYYMMDD_HHMMSS format (e.g., "20240115_143025")
 */
export function getTimestampForFilename(): string {
	const now = new Date()
	return now.toISOString().replace(/[-:]/g, "").replace("T", "_").slice(0, 15)
}

/**
 * Generate an ISO timestamp string.
 * @returns Current time in ISO 8601 format (e.g., "2024-01-15T14:30:25.123Z")
 */
export function getISOTimestamp(): string {
	return new Date().toISOString()
}
