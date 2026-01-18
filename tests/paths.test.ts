import { describe, expect, it } from "bun:test"
import { homedir } from "node:os"
import { join } from "node:path"
import {
	AGENTS_TARGET_DIR,
	getAgentsSourceDir,
	getErrorMessage,
	getPackageRoot,
} from "../src/paths.mjs"

describe("paths.mjs exports", () => {
	describe("getPackageRoot", () => {
		it("should return the directory containing the module", () => {
			// When called with import.meta.url from this test file,
			// it should return the tests/ directory
			const result = getPackageRoot(import.meta.url)
			expect(result).toContain("tests")
			expect(result.endsWith("tests")).toBe(true)
		})

		it("should resolve to an absolute path", () => {
			const result = getPackageRoot(import.meta.url)
			// Absolute paths start with / on Unix or drive letter on Windows
			expect(result.startsWith("/") || /^[A-Z]:/i.test(result)).toBe(true)
		})

		it("should handle file:// URLs correctly", () => {
			// Simulate a file URL similar to what import.meta.url provides
			const testUrl = `file://${join(process.cwd(), "src", "test-module.mjs")}`
			const result = getPackageRoot(testUrl)
			expect(result).toContain("src")
			expect(result.endsWith("src")).toBe(true)
		})

		it("should resolve consistently for the same input", () => {
			const result1 = getPackageRoot(import.meta.url)
			const result2 = getPackageRoot(import.meta.url)
			expect(result1).toBe(result2)
		})
	})

	describe("getAgentsSourceDir", () => {
		it("should join the package root with 'agents' directory", () => {
			const packageRoot = "/some/package/root"
			const result = getAgentsSourceDir(packageRoot)
			expect(result).toBe(join(packageRoot, "agents"))
		})

		it("should return correct path for actual package root", () => {
			const actualRoot = join(import.meta.dirname, "..")
			const result = getAgentsSourceDir(actualRoot)
			expect(result).toBe(join(actualRoot, "agents"))
			expect(result.endsWith("agents")).toBe(true)
		})

		it("should handle paths with trailing slash", () => {
			const packageRoot = "/some/package/root/"
			const result = getAgentsSourceDir(packageRoot)
			// join() normalizes paths, so trailing slash is handled
			expect(result).toContain("agents")
		})

		it("should handle relative paths", () => {
			const packageRoot = "."
			const result = getAgentsSourceDir(packageRoot)
			expect(result).toBe("agents")
		})

		it("should handle paths with special characters", () => {
			const packageRoot = "/path/with spaces/package"
			const result = getAgentsSourceDir(packageRoot)
			expect(result).toBe(join(packageRoot, "agents"))
		})
	})

	describe("AGENTS_TARGET_DIR", () => {
		it("should resolve to ~/.config/opencode/agents/", () => {
			const expected = join(homedir(), ".config", "opencode", "agents")
			expect(AGENTS_TARGET_DIR).toBe(expected)
		})

		it("should start with the user home directory", () => {
			expect(AGENTS_TARGET_DIR.startsWith(homedir())).toBe(true)
		})

		it("should contain the expected directory structure", () => {
			expect(AGENTS_TARGET_DIR).toContain(".config")
			expect(AGENTS_TARGET_DIR).toContain("opencode")
			expect(AGENTS_TARGET_DIR).toContain("agents")
		})

		it("should end with 'agents' directory", () => {
			expect(AGENTS_TARGET_DIR.endsWith("agents")).toBe(true)
		})

		it("should be an absolute path", () => {
			// Absolute paths start with / on Unix or drive letter on Windows
			expect(AGENTS_TARGET_DIR.startsWith("/") || /^[A-Z]:/i.test(AGENTS_TARGET_DIR)).toBe(true)
		})
	})

	describe("getErrorMessage", () => {
		const testFile = "test-agent.md"
		const testTargetPath = "/home/user/.config/opencode/agents/test-agent.md"

		it("should return permission message for EACCES error", () => {
			const error = Object.assign(new Error("EACCES"), { code: "EACCES" })
			const result = getErrorMessage(error, testFile, testTargetPath)
			expect(result).toBe(
				"Permission denied. Check write permissions for /home/user/.config/opencode/agents",
			)
		})

		it("should return disk full message for ENOSPC error", () => {
			const error = Object.assign(new Error("ENOSPC"), { code: "ENOSPC" })
			const result = getErrorMessage(error, testFile, testTargetPath)
			expect(result).toBe("Disk full. Free up space and try again")
		})

		it("should return source file not found message for ENOENT error", () => {
			const error = Object.assign(new Error("ENOENT"), { code: "ENOENT" })
			const result = getErrorMessage(error, testFile, testTargetPath)
			expect(result).toBe(`Source file not found: ${testFile}`)
		})

		it("should return read-only filesystem message for EROFS error", () => {
			const error = Object.assign(new Error("EROFS"), { code: "EROFS" })
			const result = getErrorMessage(error, testFile, testTargetPath)
			expect(result).toBe("Read-only file system. Cannot write to target directory")
		})

		it("should return too many open files message for EMFILE error", () => {
			const error = Object.assign(new Error("EMFILE"), { code: "EMFILE" })
			const result = getErrorMessage(error, testFile, testTargetPath)
			expect(result).toBe("Too many open files. Close some applications and try again")
		})

		it("should return too many open files message for ENFILE error", () => {
			const error = Object.assign(new Error("ENFILE"), { code: "ENFILE" })
			const result = getErrorMessage(error, testFile, testTargetPath)
			expect(result).toBe("Too many open files. Close some applications and try again")
		})

		it("should return error message for unknown error codes", () => {
			const error = Object.assign(new Error("Something went wrong"), { code: "UNKNOWN" })
			const result = getErrorMessage(error, testFile, testTargetPath)
			expect(result).toBe("Something went wrong")
		})

		it("should return 'Unknown error' when error has no message or known code", () => {
			const error = Object.assign(new Error(""), { code: "UNKNOWN" })
			const result = getErrorMessage(error, testFile, testTargetPath)
			expect(result).toBe("Unknown error")
		})

		it("should handle error without code property", () => {
			const error = new Error("Generic error")
			const result = getErrorMessage(error, testFile, testTargetPath)
			expect(result).toBe("Generic error")
		})

		it("should use dirname of targetPath for EACCES message", () => {
			const error = Object.assign(new Error("EACCES"), { code: "EACCES" })
			const deepPath = "/very/deep/nested/path/file.md"
			const result = getErrorMessage(error, "file.md", deepPath)
			expect(result).toBe("Permission denied. Check write permissions for /very/deep/nested/path")
		})
	})
})
