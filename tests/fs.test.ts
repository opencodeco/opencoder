/**
 * Tests for fs module
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { existsSync, mkdirSync, rmSync, utimesSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import {
	appendToFile,
	cleanupOldFiles,
	deleteFile,
	ensureDirectories,
	getFileModTime,
	getISOTimestamp,
	getTimestampForFilename,
	initializePaths,
	listFiles,
	pathExists,
	readFileOrNull,
	renameFile,
	writeFile,
} from "../src/fs.ts"

const TEST_DIR = "/tmp/opencoder-test-fs"

describe("fs", () => {
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

	describe("initializePaths", () => {
		test("returns correct paths structure", () => {
			const paths = initializePaths("/project")

			expect(paths.opencoderDir).toBe("/project/.opencode/opencoder")
			expect(paths.stateFile).toBe("/project/.opencode/opencoder/state.json")
			expect(paths.currentPlan).toBe("/project/.opencode/opencoder/current_plan.md")
			expect(paths.mainLog).toBe("/project/.opencode/opencoder/logs/main.log")
			expect(paths.cycleLogDir).toBe("/project/.opencode/opencoder/logs/cycles")
			expect(paths.alertsFile).toBe("/project/.opencode/opencoder/alerts.log")
			expect(paths.historyDir).toBe("/project/.opencode/opencoder/history")
			expect(paths.ideasDir).toBe("/project/.opencode/opencoder/ideas")
			expect(paths.ideasHistoryDir).toBe("/project/.opencode/opencoder/ideas/history")
			expect(paths.configFile).toBe("/project/.opencode/opencoder/config.json")
			expect(paths.metricsFile).toBe("/project/.opencode/opencoder/metrics.json")
		})

		test("resolves relative paths", () => {
			const paths = initializePaths("./myproject")

			expect(paths.opencoderDir).toContain(".opencode/opencoder")
			expect(paths.opencoderDir).not.toStartWith("./")
		})
	})

	describe("ensureDirectories", () => {
		test("creates all required directories", () => {
			const paths = initializePaths(TEST_DIR)

			ensureDirectories(paths)

			expect(existsSync(paths.opencoderDir)).toBe(true)
			expect(existsSync(paths.cycleLogDir)).toBe(true)
			expect(existsSync(paths.historyDir)).toBe(true)
			expect(existsSync(paths.ideasDir)).toBe(true)
			expect(existsSync(paths.ideasHistoryDir)).toBe(true)
		})

		test("handles existing directories", () => {
			const paths = initializePaths(TEST_DIR)

			// Call twice - should not throw
			ensureDirectories(paths)
			ensureDirectories(paths)

			expect(existsSync(paths.opencoderDir)).toBe(true)
		})
	})

	describe("readFileOrNull", () => {
		test("returns file contents for existing file", async () => {
			const filePath = join(TEST_DIR, "test.txt")
			await Bun.write(filePath, "test content")

			const content = await readFileOrNull(filePath)

			expect(content).toBe("test content")
		})

		test("returns null for non-existent file", async () => {
			const content = await readFileOrNull("/nonexistent/file.txt")

			expect(content).toBeNull()
		})
	})

	describe("writeFile", () => {
		test("writes content to file", async () => {
			const filePath = join(TEST_DIR, "write-test.txt")

			await writeFile(filePath, "written content")

			const content = await Bun.file(filePath).text()
			expect(content).toBe("written content")
		})

		test("overwrites existing file", async () => {
			const filePath = join(TEST_DIR, "overwrite.txt")
			await Bun.write(filePath, "original")

			await writeFile(filePath, "updated")

			const content = await Bun.file(filePath).text()
			expect(content).toBe("updated")
		})
	})

	describe("appendToFile", () => {
		test("appends to existing file", async () => {
			const filePath = join(TEST_DIR, "append.txt")
			writeFileSync(filePath, "first")

			appendToFile(filePath, " second")

			const content = await Bun.file(filePath).text()
			expect(content).toBe("first second")
		})

		test("creates file if it does not exist", () => {
			const filePath = join(TEST_DIR, "new-append.txt")

			appendToFile(filePath, "new content")

			expect(existsSync(filePath)).toBe(true)
		})
	})

	describe("pathExists", () => {
		test("returns true for existing file", async () => {
			const filePath = join(TEST_DIR, "exists.txt")
			await Bun.write(filePath, "content")

			expect(pathExists(filePath)).toBe(true)
		})

		test("returns true for existing directory", () => {
			expect(pathExists(TEST_DIR)).toBe(true)
		})

		test("returns false for non-existent path", () => {
			expect(pathExists("/nonexistent/path")).toBe(false)
		})
	})

	describe("listFiles", () => {
		test("lists all files in directory", async () => {
			await Bun.write(join(TEST_DIR, "a.txt"), "a")
			await Bun.write(join(TEST_DIR, "b.txt"), "b")
			await Bun.write(join(TEST_DIR, "c.md"), "c")

			const files = listFiles(TEST_DIR)

			expect(files.length).toBe(3)
			expect(files).toContain("a.txt")
			expect(files).toContain("b.txt")
			expect(files).toContain("c.md")
		})

		test("filters by extension", async () => {
			await Bun.write(join(TEST_DIR, "a.txt"), "a")
			await Bun.write(join(TEST_DIR, "b.txt"), "b")
			await Bun.write(join(TEST_DIR, "c.md"), "c")

			const files = listFiles(TEST_DIR, ".txt")

			expect(files.length).toBe(2)
			expect(files).toContain("a.txt")
			expect(files).toContain("b.txt")
			expect(files).not.toContain("c.md")
		})

		test("returns empty array for non-existent directory", () => {
			const files = listFiles("/nonexistent/dir")

			expect(files).toEqual([])
		})
	})

	describe("getFileModTime", () => {
		test("returns modification time for existing file", async () => {
			const filePath = join(TEST_DIR, "modtime.txt")
			await Bun.write(filePath, "content")

			const modTime = getFileModTime(filePath)

			expect(modTime).toBeGreaterThan(0)
			expect(modTime).toBeLessThanOrEqual(Date.now())
		})

		test("returns 0 for non-existent file", () => {
			const modTime = getFileModTime("/nonexistent/file.txt")

			expect(modTime).toBe(0)
		})
	})

	describe("deleteFile", () => {
		test("deletes existing file and returns true", async () => {
			const filePath = join(TEST_DIR, "to-delete.txt")
			await Bun.write(filePath, "content")

			const result = deleteFile(filePath)

			expect(result).toBe(true)
			expect(existsSync(filePath)).toBe(false)
		})

		test("returns false for non-existent file", () => {
			const result = deleteFile("/nonexistent/file.txt")

			expect(result).toBe(false)
		})
	})

	describe("renameFile", () => {
		test("renames file and returns true", async () => {
			const oldPath = join(TEST_DIR, "old-name.txt")
			const newPath = join(TEST_DIR, "new-name.txt")
			await Bun.write(oldPath, "content")

			const result = renameFile(oldPath, newPath)

			expect(result).toBe(true)
			expect(existsSync(oldPath)).toBe(false)
			expect(existsSync(newPath)).toBe(true)
		})

		test("returns false when source does not exist", () => {
			const result = renameFile("/nonexistent/old.txt", join(TEST_DIR, "new.txt"))

			expect(result).toBe(false)
		})
	})

	describe("cleanupOldFiles", () => {
		test("deletes files older than specified days", async () => {
			const oldFile = join(TEST_DIR, "old.txt")
			const newFile = join(TEST_DIR, "new.txt")

			// Create files
			writeFileSync(oldFile, "old content")
			writeFileSync(newFile, "new content")

			// Set old file to 10 days ago
			const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000)
			utimesSync(oldFile, tenDaysAgo, tenDaysAgo)

			const deleted = cleanupOldFiles(TEST_DIR, 5)

			expect(deleted).toBe(1)
			expect(existsSync(oldFile)).toBe(false)
			expect(existsSync(newFile)).toBe(true)
		})

		test("returns 0 for non-existent directory", () => {
			const deleted = cleanupOldFiles("/nonexistent/dir", 5)

			expect(deleted).toBe(0)
		})

		test("returns 0 when no files are old enough", async () => {
			await Bun.write(join(TEST_DIR, "recent.txt"), "content")

			const deleted = cleanupOldFiles(TEST_DIR, 30)

			expect(deleted).toBe(0)
		})
	})

	describe("getTimestampForFilename", () => {
		test("returns timestamp in correct format", () => {
			const timestamp = getTimestampForFilename()

			// Format: YYYYMMDD_HHMMSS (15 chars)
			expect(timestamp.length).toBe(15)
			expect(timestamp).toMatch(/^\d{8}_\d{6}$/)
		})
	})

	describe("getISOTimestamp", () => {
		test("returns valid ISO timestamp", () => {
			const timestamp = getISOTimestamp()

			// Should be parseable as a date
			const date = new Date(timestamp)
			expect(date.toString()).not.toBe("Invalid Date")

			// Should be in ISO format
			expect(timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)
		})
	})
})
