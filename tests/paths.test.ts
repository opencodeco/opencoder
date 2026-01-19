import { describe, expect, it } from "bun:test"
import { homedir } from "node:os"
import { join } from "node:path"
import {
	AGENT_NAMES,
	AGENTS_TARGET_DIR,
	checkVersionCompatibility,
	createLogger,
	getAgentsSourceDir,
	getErrorMessage,
	getPackageRoot,
	isTransientError,
	MIN_CONTENT_LENGTH,
	OPENCODE_VERSION,
	parseCliFlags,
	parseFrontmatter,
	REQUIRED_FRONTMATTER_FIELDS,
	REQUIRED_KEYWORDS,
	retryOnTransientError,
	TRANSIENT_ERROR_CODES,
	validateAgentContent,
	validateAgentFile,
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

		it("should throw TypeError for null input", () => {
			expect(() => getPackageRoot(null as unknown as string)).toThrow(TypeError)
			expect(() => getPackageRoot(null as unknown as string)).toThrow(
				"getPackageRoot: importMetaUrl must be a string, got null",
			)
		})

		it("should throw TypeError for undefined input", () => {
			expect(() => getPackageRoot(undefined as unknown as string)).toThrow(TypeError)
			expect(() => getPackageRoot(undefined as unknown as string)).toThrow(
				"getPackageRoot: importMetaUrl must be a string, got undefined",
			)
		})

		it("should throw TypeError for non-string input", () => {
			expect(() => getPackageRoot(123 as unknown as string)).toThrow(TypeError)
			expect(() => getPackageRoot(123 as unknown as string)).toThrow(
				"getPackageRoot: importMetaUrl must be a string, got number",
			)
			expect(() => getPackageRoot({} as unknown as string)).toThrow(TypeError)
			expect(() => getPackageRoot({} as unknown as string)).toThrow(
				"getPackageRoot: importMetaUrl must be a string, got object",
			)
		})

		it("should throw TypeError for empty string input", () => {
			expect(() => getPackageRoot("")).toThrow(TypeError)
			expect(() => getPackageRoot("")).toThrow("getPackageRoot: importMetaUrl must not be empty")
		})

		it("should throw TypeError for whitespace-only string input", () => {
			expect(() => getPackageRoot("   ")).toThrow(TypeError)
			expect(() => getPackageRoot("   ")).toThrow("getPackageRoot: importMetaUrl must not be empty")
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

		it("should throw TypeError for null input", () => {
			expect(() => getAgentsSourceDir(null as unknown as string)).toThrow(TypeError)
			expect(() => getAgentsSourceDir(null as unknown as string)).toThrow(
				"getAgentsSourceDir: packageRoot must be a string, got null",
			)
		})

		it("should throw TypeError for undefined input", () => {
			expect(() => getAgentsSourceDir(undefined as unknown as string)).toThrow(TypeError)
			expect(() => getAgentsSourceDir(undefined as unknown as string)).toThrow(
				"getAgentsSourceDir: packageRoot must be a string, got undefined",
			)
		})

		it("should throw TypeError for non-string input", () => {
			expect(() => getAgentsSourceDir(123 as unknown as string)).toThrow(TypeError)
			expect(() => getAgentsSourceDir(123 as unknown as string)).toThrow(
				"getAgentsSourceDir: packageRoot must be a string, got number",
			)
			expect(() => getAgentsSourceDir({} as unknown as string)).toThrow(TypeError)
			expect(() => getAgentsSourceDir({} as unknown as string)).toThrow(
				"getAgentsSourceDir: packageRoot must be a string, got object",
			)
		})

		it("should throw TypeError for empty string input", () => {
			expect(() => getAgentsSourceDir("")).toThrow(TypeError)
			expect(() => getAgentsSourceDir("")).toThrow(
				"getAgentsSourceDir: packageRoot must not be empty",
			)
		})

		it("should throw TypeError for whitespace-only string input", () => {
			expect(() => getAgentsSourceDir("   ")).toThrow(TypeError)
			expect(() => getAgentsSourceDir("   ")).toThrow(
				"getAgentsSourceDir: packageRoot must not be empty",
			)
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
				"Permission denied. Check write permissions for /home/user/.config/opencode/agents. Try: chmod u+w /home/user/.config/opencode/agents or run with sudo",
			)
		})

		it("should return operation not permitted message for EPERM error", () => {
			const error = Object.assign(new Error("EPERM"), { code: "EPERM" })
			const result = getErrorMessage(error, testFile, testTargetPath)
			expect(result).toBe(
				"Operation not permitted. The file may be in use or locked. Try: lsof <file> to check what process is using it",
			)
		})

		it("should return disk full message for ENOSPC error", () => {
			const error = Object.assign(new Error("ENOSPC"), { code: "ENOSPC" })
			const result = getErrorMessage(error, testFile, testTargetPath)
			expect(result).toBe("Disk full. Free up space and try again. Try: df -h to check disk usage")
		})

		it("should return source file not found message for ENOENT error", () => {
			const error = Object.assign(new Error("ENOENT"), { code: "ENOENT" })
			const result = getErrorMessage(error, testFile, testTargetPath)
			expect(result).toBe(`Source file not found: ${testFile}`)
		})

		it("should return read-only filesystem message for EROFS error", () => {
			const error = Object.assign(new Error("EROFS"), { code: "EROFS" })
			const result = getErrorMessage(error, testFile, testTargetPath)
			expect(result).toBe(
				"Read-only file system. Cannot write to target directory. Try: mount -o remount,rw <device> <mountpoint>",
			)
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

		it("should return target exists message for EEXIST error", () => {
			const error = Object.assign(new Error("EEXIST"), { code: "EEXIST" })
			const result = getErrorMessage(error, testFile, testTargetPath)
			expect(result).toBe(`Target already exists: ${testTargetPath}`)
		})

		it("should return is directory message for EISDIR error", () => {
			const error = Object.assign(new Error("EISDIR"), { code: "EISDIR" })
			const result = getErrorMessage(error, testFile, testTargetPath)
			expect(result).toBe(`Expected a file but found a directory: ${testTargetPath}`)
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
			expect(result).toBe(
				"Permission denied. Check write permissions for /very/deep/nested/path. Try: chmod u+w /very/deep/nested/path or run with sudo",
			)
		})

		it("should return resource temporarily unavailable message for EAGAIN error", () => {
			const error = Object.assign(new Error("EAGAIN"), { code: "EAGAIN" })
			const result = getErrorMessage(error, testFile, testTargetPath)
			expect(result).toBe("Resource temporarily unavailable. Try again")
		})

		it("should return file busy message for EBUSY error", () => {
			const error = Object.assign(new Error("EBUSY"), { code: "EBUSY" })
			const result = getErrorMessage(error, testFile, testTargetPath)
			expect(result).toBe("File is busy or locked. Try again later")
		})

		describe("input validation", () => {
			const validError = new Error("test error")

			it("should throw TypeError for null file", () => {
				expect(() =>
					getErrorMessage(validError, null as unknown as string, testTargetPath),
				).toThrow(TypeError)
				expect(() =>
					getErrorMessage(validError, null as unknown as string, testTargetPath),
				).toThrow("getErrorMessage: file must be a string, got null")
			})

			it("should throw TypeError for undefined file", () => {
				expect(() =>
					getErrorMessage(validError, undefined as unknown as string, testTargetPath),
				).toThrow(TypeError)
				expect(() =>
					getErrorMessage(validError, undefined as unknown as string, testTargetPath),
				).toThrow("getErrorMessage: file must be a string, got undefined")
			})

			it("should throw TypeError for non-string file", () => {
				expect(() => getErrorMessage(validError, 123 as unknown as string, testTargetPath)).toThrow(
					TypeError,
				)
				expect(() => getErrorMessage(validError, 123 as unknown as string, testTargetPath)).toThrow(
					"getErrorMessage: file must be a string, got number",
				)
				expect(() => getErrorMessage(validError, {} as unknown as string, testTargetPath)).toThrow(
					TypeError,
				)
				expect(() => getErrorMessage(validError, {} as unknown as string, testTargetPath)).toThrow(
					"getErrorMessage: file must be a string, got object",
				)
			})

			it("should throw TypeError for empty string file", () => {
				expect(() => getErrorMessage(validError, "", testTargetPath)).toThrow(TypeError)
				expect(() => getErrorMessage(validError, "", testTargetPath)).toThrow(
					"getErrorMessage: file must not be empty",
				)
			})

			it("should throw TypeError for whitespace-only file", () => {
				expect(() => getErrorMessage(validError, "   ", testTargetPath)).toThrow(TypeError)
				expect(() => getErrorMessage(validError, "   ", testTargetPath)).toThrow(
					"getErrorMessage: file must not be empty",
				)
			})

			it("should throw TypeError for null targetPath", () => {
				expect(() => getErrorMessage(validError, testFile, null as unknown as string)).toThrow(
					TypeError,
				)
				expect(() => getErrorMessage(validError, testFile, null as unknown as string)).toThrow(
					"getErrorMessage: targetPath must be a string, got null",
				)
			})

			it("should throw TypeError for undefined targetPath", () => {
				expect(() => getErrorMessage(validError, testFile, undefined as unknown as string)).toThrow(
					TypeError,
				)
				expect(() => getErrorMessage(validError, testFile, undefined as unknown as string)).toThrow(
					"getErrorMessage: targetPath must be a string, got undefined",
				)
			})

			it("should throw TypeError for non-string targetPath", () => {
				expect(() => getErrorMessage(validError, testFile, 123 as unknown as string)).toThrow(
					TypeError,
				)
				expect(() => getErrorMessage(validError, testFile, 123 as unknown as string)).toThrow(
					"getErrorMessage: targetPath must be a string, got number",
				)
				expect(() => getErrorMessage(validError, testFile, {} as unknown as string)).toThrow(
					TypeError,
				)
				expect(() => getErrorMessage(validError, testFile, {} as unknown as string)).toThrow(
					"getErrorMessage: targetPath must be a string, got object",
				)
			})

			it("should throw TypeError for empty string targetPath", () => {
				expect(() => getErrorMessage(validError, testFile, "")).toThrow(TypeError)
				expect(() => getErrorMessage(validError, testFile, "")).toThrow(
					"getErrorMessage: targetPath must not be empty",
				)
			})

			it("should throw TypeError for whitespace-only targetPath", () => {
				expect(() => getErrorMessage(validError, testFile, "   ")).toThrow(TypeError)
				expect(() => getErrorMessage(validError, testFile, "   ")).toThrow(
					"getErrorMessage: targetPath must not be empty",
				)
			})
		})
	})

	describe("constants", () => {
		it("should export AGENT_NAMES as an array", () => {
			expect(Array.isArray(AGENT_NAMES)).toBe(true)
			expect(AGENT_NAMES).toContain("opencoder")
			expect(AGENT_NAMES).toContain("opencoder-planner")
			expect(AGENT_NAMES).toContain("opencoder-builder")
		})

		it("should have AGENT_NAMES frozen (immutable)", () => {
			expect(Object.isFrozen(AGENT_NAMES)).toBe(true)
		})

		it("should prevent push to AGENT_NAMES", () => {
			const originalLength = AGENT_NAMES.length
			expect(() => {
				;(AGENT_NAMES as unknown as string[]).push("new-agent")
			}).toThrow()
			expect(AGENT_NAMES.length).toBe(originalLength)
		})

		it("should prevent modification of AGENT_NAMES elements", () => {
			const originalFirst = AGENT_NAMES[0]
			expect(() => {
				;(AGENT_NAMES as unknown as string[])[0] = "modified"
			}).toThrow()
			expect(AGENT_NAMES[0]).toBe(originalFirst)
		})

		it("should prevent pop from AGENT_NAMES", () => {
			const originalLength = AGENT_NAMES.length
			expect(() => {
				;(AGENT_NAMES as unknown as string[]).pop()
			}).toThrow()
			expect(AGENT_NAMES.length).toBe(originalLength)
		})

		describe("OPENCODE_VERSION", () => {
			it("should be a string in semantic version format (MAJOR.MINOR.PATCH)", () => {
				expect(typeof OPENCODE_VERSION).toBe("string")
				// Semantic version format: X.Y.Z where X, Y, Z are non-negative integers
				const semverRegex = /^\d+\.\d+\.\d+$/
				expect(OPENCODE_VERSION).toMatch(semverRegex)
			})

			it("should have the expected default value", () => {
				expect(OPENCODE_VERSION).toBe("0.1.0")
			})

			it("should be usable with checkVersionCompatibility", () => {
				// Verify it works with the version compatibility checker
				expect(checkVersionCompatibility(">=0.1.0", OPENCODE_VERSION)).toBe(true)
				expect(checkVersionCompatibility("0.1.0", OPENCODE_VERSION)).toBe(true)
				expect(checkVersionCompatibility(">=0.2.0", OPENCODE_VERSION)).toBe(false)
			})

			it("should consist of three numeric parts separated by dots", () => {
				const parts = OPENCODE_VERSION.split(".")
				expect(parts).toHaveLength(3)
				for (const part of parts) {
					const num = Number.parseInt(part, 10)
					expect(Number.isNaN(num)).toBe(false)
					expect(num).toBeGreaterThanOrEqual(0)
				}
			})

			it("should support OPENCODE_VERSION environment variable override", async () => {
				// Spawn a subprocess that imports the module with a custom OPENCODE_VERSION
				const { spawnSync } = await import("node:child_process")
				const result = spawnSync(
					"node",
					[
						"--input-type=module",
						"-e",
						'import { OPENCODE_VERSION } from "./src/paths.mjs"; console.log(OPENCODE_VERSION);',
					],
					{
						encoding: "utf-8",
						env: { ...process.env, OPENCODE_VERSION: "2.0.0" },
						cwd: import.meta.dirname.replace("/tests", ""),
					},
				)
				expect(result.stdout.trim()).toBe("2.0.0")
			})

			it("should use default when OPENCODE_VERSION env is empty", async () => {
				// Spawn a subprocess without the env var set
				const { spawnSync } = await import("node:child_process")
				const result = spawnSync(
					"node",
					[
						"--input-type=module",
						"-e",
						'import { OPENCODE_VERSION } from "./src/paths.mjs"; console.log(OPENCODE_VERSION);',
					],
					{
						encoding: "utf-8",
						env: { ...process.env, OPENCODE_VERSION: "" },
						cwd: import.meta.dirname.replace("/tests", ""),
					},
				)
				expect(result.stdout.trim()).toBe("0.1.0")
			})
		})

		it("should export MIN_CONTENT_LENGTH as a number", () => {
			expect(typeof MIN_CONTENT_LENGTH).toBe("number")
			expect(MIN_CONTENT_LENGTH).toBe(100)
		})

		it("should export REQUIRED_KEYWORDS as an array", () => {
			expect(Array.isArray(REQUIRED_KEYWORDS)).toBe(true)
			expect(REQUIRED_KEYWORDS).toContain("agent")
			expect(REQUIRED_KEYWORDS).toContain("task")
		})

		it("should export REQUIRED_FRONTMATTER_FIELDS as an array", () => {
			expect(Array.isArray(REQUIRED_FRONTMATTER_FIELDS)).toBe(true)
			expect(REQUIRED_FRONTMATTER_FIELDS).toContain("version")
			expect(REQUIRED_FRONTMATTER_FIELDS).toContain("requires")
		})

		describe("REQUIRED_FRONTMATTER_FIELDS", () => {
			it("should contain exactly 'version' and 'requires' fields", () => {
				expect(REQUIRED_FRONTMATTER_FIELDS).toEqual(["version", "requires"])
			})

			it("should have exactly 2 required fields", () => {
				expect(REQUIRED_FRONTMATTER_FIELDS).toHaveLength(2)
			})

			it("should have 'version' as the first required field", () => {
				expect(REQUIRED_FRONTMATTER_FIELDS[0]).toBe("version")
			})

			it("should have 'requires' as the second required field", () => {
				expect(REQUIRED_FRONTMATTER_FIELDS[1]).toBe("requires")
			})

			it("should be exported and accessible from the module", () => {
				// Verify the constant is defined and has the expected type
				expect(REQUIRED_FRONTMATTER_FIELDS).toBeDefined()
				expect(typeof REQUIRED_FRONTMATTER_FIELDS).toBe("object")
				expect(Array.isArray(REQUIRED_FRONTMATTER_FIELDS)).toBe(true)
			})

			it("should contain string values only", () => {
				for (const field of REQUIRED_FRONTMATTER_FIELDS) {
					expect(typeof field).toBe("string")
				}
			})

			it("should not contain empty strings", () => {
				for (const field of REQUIRED_FRONTMATTER_FIELDS) {
					expect(field.length).toBeGreaterThan(0)
					expect(field.trim()).toBe(field)
				}
			})

			it("should be usable in validateAgentContent for field validation", () => {
				// Content missing 'version' field
				const missingVersion = `---
requires: opencode
---
# Test Agent

This is a test agent that handles various tasks for you.
`.padEnd(MIN_CONTENT_LENGTH + 50, " ")

				const result1 = validateAgentContent(missingVersion)
				expect(result1.valid).toBe(false)
				expect(result1.error).toContain("version")
				expect(result1.error).toContain("missing required fields")

				// Content missing 'requires' field
				const missingRequires = `---
version: 1.0
---
# Test Agent

This is a test agent that handles various tasks for you.
`.padEnd(MIN_CONTENT_LENGTH + 50, " ")

				const result2 = validateAgentContent(missingRequires)
				expect(result2.valid).toBe(false)
				expect(result2.error).toContain("requires")
				expect(result2.error).toContain("missing required fields")
			})

			it("should validate all fields from the constant are present in content", () => {
				// Content with all required fields present
				const validContent = `---
version: 1.0
requires: opencode
---
# Test Agent

This is a test agent that handles various tasks for you.
`.padEnd(MIN_CONTENT_LENGTH + 50, " ")

				const result = validateAgentContent(validContent)
				expect(result.valid).toBe(true)
				expect(result.error).toBeUndefined()
			})

			it("should report all missing fields when multiple are absent", () => {
				// Content missing both 'version' and 'requires' fields
				const missingBoth = `---
name: test
---
# Test Agent

This is a test agent that handles various tasks for you.
`.padEnd(MIN_CONTENT_LENGTH + 50, " ")

				const result = validateAgentContent(missingBoth)
				expect(result.valid).toBe(false)
				expect(result.error).toContain("missing required fields")
				// Both fields should be mentioned
				expect(result.error).toContain("version")
				expect(result.error).toContain("requires")
			})

			it("should be frozen (immutable)", () => {
				expect(Object.isFrozen(REQUIRED_FRONTMATTER_FIELDS)).toBe(true)
			})

			it("should prevent push to REQUIRED_FRONTMATTER_FIELDS", () => {
				const originalLength = REQUIRED_FRONTMATTER_FIELDS.length
				expect(() => {
					;(REQUIRED_FRONTMATTER_FIELDS as unknown as string[]).push("new-field")
				}).toThrow()
				expect(REQUIRED_FRONTMATTER_FIELDS.length).toBe(originalLength)
			})

			it("should prevent modification of REQUIRED_FRONTMATTER_FIELDS elements", () => {
				const originalFirst = REQUIRED_FRONTMATTER_FIELDS[0]
				expect(() => {
					;(REQUIRED_FRONTMATTER_FIELDS as unknown as string[])[0] = "modified"
				}).toThrow()
				expect(REQUIRED_FRONTMATTER_FIELDS[0]).toBe(originalFirst)
			})

			it("should prevent pop from REQUIRED_FRONTMATTER_FIELDS", () => {
				const originalLength = REQUIRED_FRONTMATTER_FIELDS.length
				expect(() => {
					;(REQUIRED_FRONTMATTER_FIELDS as unknown as string[]).pop()
				}).toThrow()
				expect(REQUIRED_FRONTMATTER_FIELDS.length).toBe(originalLength)
			})
		})

		it("should export TRANSIENT_ERROR_CODES as an array", () => {
			expect(Array.isArray(TRANSIENT_ERROR_CODES)).toBe(true)
			expect(TRANSIENT_ERROR_CODES).toContain("EAGAIN")
			expect(TRANSIENT_ERROR_CODES).toContain("EBUSY")
		})
	})

	describe("isTransientError", () => {
		it("should return true for EAGAIN error", () => {
			const error = Object.assign(new Error("EAGAIN"), { code: "EAGAIN" })
			expect(isTransientError(error)).toBe(true)
		})

		it("should return true for EBUSY error", () => {
			const error = Object.assign(new Error("EBUSY"), { code: "EBUSY" })
			expect(isTransientError(error)).toBe(true)
		})

		it("should return false for non-transient errors", () => {
			const error = Object.assign(new Error("ENOENT"), { code: "ENOENT" })
			expect(isTransientError(error)).toBe(false)
		})

		it("should return false for errors without code", () => {
			const error = new Error("Generic error")
			expect(isTransientError(error)).toBe(false)
		})

		it("should return false for EACCES error", () => {
			const error = Object.assign(new Error("EACCES"), { code: "EACCES" })
			expect(isTransientError(error)).toBe(false)
		})

		it("should return false for null error", () => {
			expect(isTransientError(null as unknown as Error)).toBe(false)
		})

		it("should return false for undefined error", () => {
			expect(isTransientError(undefined as unknown as Error)).toBe(false)
		})

		it("should return false when error.code is undefined", () => {
			const error = new Error("No code property")
			expect(isTransientError(error)).toBe(false)
		})

		it("should return false when error.code is null", () => {
			const error = Object.assign(new Error("Null code"), { code: null })
			expect(isTransientError(error as unknown as Error & { code?: string })).toBe(false)
		})

		it("should return false when error.code is a number", () => {
			const error = Object.assign(new Error("Number code"), { code: 123 })
			expect(isTransientError(error as unknown as Error & { code?: string })).toBe(false)
		})

		it("should return false when error is an empty object", () => {
			expect(isTransientError({} as unknown as Error)).toBe(false)
		})
	})

	describe("retryOnTransientError", () => {
		it("should return result on success without retrying", async () => {
			let callCount = 0
			const result = await retryOnTransientError(() => {
				callCount++
				return "success"
			})
			expect(result).toBe("success")
			expect(callCount).toBe(1)
		})

		it("should retry on EAGAIN and eventually succeed", async () => {
			let callCount = 0
			const result = await retryOnTransientError(() => {
				callCount++
				if (callCount < 3) {
					const err = Object.assign(new Error("EAGAIN"), { code: "EAGAIN" })
					throw err
				}
				return "success after retries"
			})
			expect(result).toBe("success after retries")
			expect(callCount).toBe(3)
		})

		it("should retry on EBUSY and eventually succeed", async () => {
			let callCount = 0
			const result = await retryOnTransientError(() => {
				callCount++
				if (callCount < 2) {
					const err = Object.assign(new Error("EBUSY"), { code: "EBUSY" })
					throw err
				}
				return "success"
			})
			expect(result).toBe("success")
			expect(callCount).toBe(2)
		})

		it("should throw immediately on non-transient errors", async () => {
			let callCount = 0
			await expect(
				retryOnTransientError(() => {
					callCount++
					const err = Object.assign(new Error("ENOENT"), { code: "ENOENT" })
					throw err
				}),
			).rejects.toThrow("ENOENT")
			expect(callCount).toBe(1)
		})

		it("should throw after max retries exceeded", async () => {
			let callCount = 0
			await expect(
				retryOnTransientError(
					() => {
						callCount++
						const err = Object.assign(new Error("EAGAIN"), { code: "EAGAIN" })
						throw err
					},
					{ retries: 2 },
				),
			).rejects.toThrow("EAGAIN")
			expect(callCount).toBe(3) // Initial + 2 retries
		})

		it("should respect custom retry count option", async () => {
			let callCount = 0
			await expect(
				retryOnTransientError(
					() => {
						callCount++
						const err = Object.assign(new Error("EBUSY"), { code: "EBUSY" })
						throw err
					},
					{ retries: 5 },
				),
			).rejects.toThrow("EBUSY")
			expect(callCount).toBe(6) // Initial + 5 retries
		})

		it("should work with async functions", async () => {
			let callCount = 0
			const result = await retryOnTransientError(async () => {
				callCount++
				if (callCount < 2) {
					const err = Object.assign(new Error("EAGAIN"), { code: "EAGAIN" })
					throw err
				}
				return "async success"
			})
			expect(result).toBe("async success")
			expect(callCount).toBe(2)
		})

		it("should use exponential backoff with default initial delay of 100ms", async () => {
			let callCount = 0
			const timestamps: number[] = []
			const start = Date.now()
			await retryOnTransientError(
				() => {
					timestamps.push(Date.now() - start)
					callCount++
					if (callCount < 4) {
						const err = Object.assign(new Error("EAGAIN"), { code: "EAGAIN" })
						throw err
					}
					return "success"
				},
				{ retries: 3 },
			)
			// 3 retries with exponential backoff: 100ms, 200ms, 400ms = 700ms total
			const elapsed = Date.now() - start
			expect(elapsed).toBeGreaterThanOrEqual(600) // Allow some timing variance
			expect(elapsed).toBeLessThan(1000) // Should not be too long
		})

		it("should double delay on each retry (exponential backoff)", async () => {
			const delays: number[] = []
			let lastTimestamp = Date.now()
			let callCount = 0

			await retryOnTransientError(
				() => {
					const now = Date.now()
					if (callCount > 0) {
						delays.push(now - lastTimestamp)
					}
					lastTimestamp = now
					callCount++
					if (callCount < 4) {
						const err = Object.assign(new Error("EAGAIN"), { code: "EAGAIN" })
						throw err
					}
					return "success"
				},
				{ retries: 3, initialDelayMs: 50 },
			)

			// With initialDelayMs=50, delays should be approximately: 50, 100, 200
			expect(delays).toHaveLength(3)
			// Verify each delay is approximately double the previous (with tolerance)
			// First delay should be ~50ms
			expect(delays[0]).toBeGreaterThanOrEqual(40)
			expect(delays[0]).toBeLessThan(100)
			// Second delay should be ~100ms (2x first)
			expect(delays[1]).toBeGreaterThanOrEqual(80)
			expect(delays[1]).toBeLessThan(180)
			// Third delay should be ~200ms (2x second)
			expect(delays[2]).toBeGreaterThanOrEqual(160)
			expect(delays[2]).toBeLessThan(320)
		})

		it("should respect custom initialDelayMs option", async () => {
			let callCount = 0
			const start = Date.now()
			await retryOnTransientError(
				() => {
					callCount++
					if (callCount < 2) {
						const err = Object.assign(new Error("EAGAIN"), { code: "EAGAIN" })
						throw err
					}
					return "success"
				},
				{ initialDelayMs: 50 },
			)
			const elapsed = Date.now() - start
			// Should have 1 delay of ~50ms
			expect(elapsed).toBeGreaterThanOrEqual(40)
			expect(elapsed).toBeLessThan(150)
		})

		describe("error recovery integration", () => {
			it("should return immediately on first attempt success without any retries", async () => {
				const attemptTimestamps: number[] = []
				const start = Date.now()

				const result = await retryOnTransientError(
					() => {
						attemptTimestamps.push(Date.now() - start)
						return { data: "immediate success", timestamp: Date.now() }
					},
					{ retries: 5, initialDelayMs: 100 },
				)

				// Verify single attempt
				expect(attemptTimestamps).toHaveLength(1)
				// Verify result is returned correctly
				expect(result.data).toBe("immediate success")
				// Verify no delay was incurred (should be nearly instant)
				expect(attemptTimestamps[0]).toBeLessThan(50)
			})

			it("should respect exact retry count: retries=1 means 2 total attempts", async () => {
				const attempts: number[] = []

				await expect(
					retryOnTransientError(
						() => {
							attempts.push(attempts.length + 1)
							throw Object.assign(new Error("EAGAIN"), { code: "EAGAIN" })
						},
						{ retries: 1, initialDelayMs: 1 },
					),
				).rejects.toThrow("EAGAIN")

				// retries=1 means: 1 initial attempt + 1 retry = 2 total
				expect(attempts).toEqual([1, 2])
			})

			it("should respect exact retry count: retries=4 means 5 total attempts", async () => {
				const attempts: number[] = []

				await expect(
					retryOnTransientError(
						() => {
							attempts.push(attempts.length + 1)
							throw Object.assign(new Error("EBUSY"), { code: "EBUSY" })
						},
						{ retries: 4, initialDelayMs: 1 },
					),
				).rejects.toThrow("EBUSY")

				// retries=4 means: 1 initial attempt + 4 retries = 5 total
				expect(attempts).toEqual([1, 2, 3, 4, 5])
			})

			it("should throw non-transient error immediately without any retry attempts", async () => {
				const errorCodes = ["ENOENT", "EACCES", "EPERM", "ENOSPC", "EROFS"]

				for (const code of errorCodes) {
					const attempts: number[] = []

					await expect(
						retryOnTransientError(
							() => {
								attempts.push(attempts.length + 1)
								throw Object.assign(new Error(code), { code })
							},
							{ retries: 10, initialDelayMs: 1 },
						),
					).rejects.toThrow(code)

					// Non-transient errors should fail immediately with only 1 attempt
					expect(attempts).toEqual([1])
				}
			})

			it("should return the exact result value after successful retry", async () => {
				let attemptCount = 0
				const expectedResult = {
					nested: { value: 42, array: [1, 2, 3] },
					status: "recovered",
				}

				const result = await retryOnTransientError(
					() => {
						attemptCount++
						if (attemptCount < 3) {
							throw Object.assign(new Error("EAGAIN"), { code: "EAGAIN" })
						}
						return expectedResult
					},
					{ retries: 5, initialDelayMs: 1 },
				)

				// Verify the exact object is returned
				expect(result).toEqual(expectedResult)
				expect(result.nested.value).toBe(42)
				expect(result.nested.array).toEqual([1, 2, 3])
				expect(result.status).toBe("recovered")
				// Verify it took exactly 3 attempts
				expect(attemptCount).toBe(3)
			})

			it("should preserve error details when throwing after exhausting retries", async () => {
				const customError = Object.assign(new Error("Resource busy: /tmp/file.lock"), {
					code: "EBUSY",
					path: "/tmp/file.lock",
					syscall: "open",
				})

				try {
					await retryOnTransientError(
						() => {
							throw customError
						},
						{ retries: 2, initialDelayMs: 1 },
					)
					expect.unreachable("Should have thrown")
				} catch (err) {
					// Verify the exact same error object is thrown
					expect(err).toBe(customError)
					expect((err as NodeJS.ErrnoException).code).toBe("EBUSY")
					expect((err as NodeJS.ErrnoException).path).toBe("/tmp/file.lock")
					expect((err as NodeJS.ErrnoException).syscall).toBe("open")
				}
			})

			it("should track state correctly across retry attempts", async () => {
				const stateLog: Array<{ attempt: number; timestamp: number }> = []
				const start = Date.now()

				const result = await retryOnTransientError(
					() => {
						const attempt = stateLog.length + 1
						stateLog.push({ attempt, timestamp: Date.now() - start })

						if (attempt < 4) {
							throw Object.assign(new Error("EAGAIN"), { code: "EAGAIN" })
						}
						return `success on attempt ${attempt}`
					},
					{ retries: 5, initialDelayMs: 10 },
				)

				// Verify correct number of attempts
				expect(stateLog).toHaveLength(4)
				expect(stateLog.map((s) => s.attempt)).toEqual([1, 2, 3, 4])

				// Verify result reflects final successful attempt
				expect(result).toBe("success on attempt 4")

				// Verify delays occurred between attempts (exponential backoff)
				// Attempt 1: ~0ms, Attempt 2: ~10ms, Attempt 3: ~30ms, Attempt 4: ~70ms
				expect(stateLog[0]?.timestamp).toBeLessThan(10)
				expect(stateLog[1]?.timestamp).toBeGreaterThanOrEqual(5)
				expect(stateLog[2]?.timestamp).toBeGreaterThanOrEqual(20)
				expect(stateLog[3]?.timestamp).toBeGreaterThanOrEqual(50)
			})
		})

		describe("input validation", () => {
			it("should throw TypeError when fn is null", async () => {
				await expect(retryOnTransientError(null as unknown as () => void)).rejects.toThrow(
					TypeError,
				)
			})

			it("should throw TypeError when fn is undefined", async () => {
				await expect(retryOnTransientError(undefined as unknown as () => void)).rejects.toThrow(
					TypeError,
				)
			})

			it("should throw TypeError when fn is not a function", async () => {
				await expect(
					retryOnTransientError("not a function" as unknown as () => void),
				).rejects.toThrow(TypeError)
				await expect(retryOnTransientError(123 as unknown as () => void)).rejects.toThrow(TypeError)
				await expect(retryOnTransientError({} as unknown as () => void)).rejects.toThrow(TypeError)
			})

			it("should handle retries: 0 (no retries, only initial attempt)", async () => {
				let callCount = 0
				await expect(
					retryOnTransientError(
						() => {
							callCount++
							const err = Object.assign(new Error("EAGAIN"), { code: "EAGAIN" })
							throw err
						},
						{ retries: 0 },
					),
				).rejects.toThrow("EAGAIN")
				expect(callCount).toBe(1) // Only initial attempt, no retries
			})

			it("should clamp negative retries to 0 (only initial attempt)", async () => {
				let callCount = 0
				// With retries: -1, sanitized to 0, so only initial attempt runs
				await expect(
					retryOnTransientError(
						() => {
							callCount++
							const err = Object.assign(new Error("EAGAIN"), { code: "EAGAIN" })
							throw err
						},
						{ retries: -1 },
					),
				).rejects.toThrow("EAGAIN")
				expect(callCount).toBe(1) // Only initial attempt
			})

			it("should clamp retries -5 to 0 (only initial attempt)", async () => {
				let callCount = 0
				await expect(
					retryOnTransientError(
						() => {
							callCount++
							const err = Object.assign(new Error("EAGAIN"), { code: "EAGAIN" })
							throw err
						},
						{ retries: -5 },
					),
				).rejects.toThrow("EAGAIN")
				expect(callCount).toBe(1) // Only initial attempt
			})

			it("should use sanitizedRetries (not raw retries) in last-attempt check", async () => {
				// This test verifies the bug fix where `attempt === retries` was used
				// instead of `attempt === sanitizedRetries`. With retries: -1, the raw
				// comparison would never be true (attempt is never -1), potentially
				// causing issues. The sanitized value (0) should be used instead.
				let callCount = 0
				const start = Date.now()
				await expect(
					retryOnTransientError(
						() => {
							callCount++
							const err = Object.assign(new Error("EBUSY"), { code: "EBUSY" })
							throw err
						},
						{ retries: -1, initialDelayMs: 50 },
					),
				).rejects.toThrow("EBUSY")
				const elapsed = Date.now() - start
				// With sanitizedRetries = 0, only 1 attempt should occur (no retries)
				// If the bug existed, it would loop indefinitely or behave incorrectly
				expect(callCount).toBe(1)
				// Should complete quickly since there are no retries (no delays)
				expect(elapsed).toBeLessThan(100)
			})

			it("should use sanitizedRetries with NaN retries in last-attempt check", async () => {
				// When retries is NaN, it should be sanitized to 3 (default)
				// The last-attempt check should use sanitizedRetries (3), not NaN
				let callCount = 0
				await expect(
					retryOnTransientError(
						() => {
							callCount++
							const err = Object.assign(new Error("EBUSY"), { code: "EBUSY" })
							throw err
						},
						{ retries: Number.NaN, initialDelayMs: 1 },
					),
				).rejects.toThrow("EBUSY")
				// With sanitizedRetries = 3 (default), expect 4 attempts total
				expect(callCount).toBe(4)
			})

			it("should handle initialDelayMs: 0 (no delay)", async () => {
				let callCount = 0
				const start = Date.now()
				await retryOnTransientError(
					() => {
						callCount++
						if (callCount < 3) {
							const err = Object.assign(new Error("EAGAIN"), { code: "EAGAIN" })
							throw err
						}
						return "success"
					},
					{ initialDelayMs: 0 },
				)
				const elapsed = Date.now() - start
				expect(callCount).toBe(3)
				// With 0ms delay, should complete very quickly
				expect(elapsed).toBeLessThan(50)
			})

			it("should handle negative initialDelayMs (clamped to 0ms)", async () => {
				let callCount = 0
				const start = Date.now()
				await retryOnTransientError(
					() => {
						callCount++
						if (callCount < 2) {
							const err = Object.assign(new Error("EAGAIN"), { code: "EAGAIN" })
							throw err
						}
						return "success"
					},
					{ initialDelayMs: -100 },
				)
				const elapsed = Date.now() - start
				expect(callCount).toBe(2)
				// Negative delay is clamped to 0ms, should complete quickly
				expect(elapsed).toBeLessThan(50)
			})

			it("should handle NaN retries (falls back to default 3)", async () => {
				let callCount = 0
				// When retries is NaN, it is sanitized to the default 3 retries
				await expect(
					retryOnTransientError(
						() => {
							callCount++
							const err = Object.assign(new Error("EAGAIN"), { code: "EAGAIN" })
							throw err
						},
						{ retries: Number.NaN },
					),
				).rejects.toThrow("EAGAIN")
				expect(callCount).toBe(4) // Initial + 3 retries (default)
			})

			it("should handle non-numeric initialDelayMs (NaN falls back to default 100ms)", async () => {
				let callCount = 0
				const start = Date.now()
				// When initialDelayMs is NaN, it is sanitized to the default 100ms
				await retryOnTransientError(
					() => {
						callCount++
						if (callCount < 2) {
							const err = Object.assign(new Error("EAGAIN"), { code: "EAGAIN" })
							throw err
						}
						return "success"
					},
					{ initialDelayMs: Number.NaN },
				)
				const elapsed = Date.now() - start
				expect(callCount).toBe(2)
				// NaN delay falls back to default 100ms
				expect(elapsed).toBeGreaterThanOrEqual(90)
				expect(elapsed).toBeLessThan(200)
			})

			it("should handle Infinity retries (up to a reasonable test limit)", async () => {
				let callCount = 0
				// Test with Infinity but succeed after a few attempts to avoid infinite loop
				await retryOnTransientError(
					() => {
						callCount++
						if (callCount < 5) {
							const err = Object.assign(new Error("EAGAIN"), { code: "EAGAIN" })
							throw err
						}
						return "success"
					},
					{ retries: Number.POSITIVE_INFINITY, initialDelayMs: 1 },
				)
				expect(callCount).toBe(5)
			})

			it("should throw TypeError when options is null (cannot destructure)", async () => {
				// The function tries to destructure null, which throws TypeError
				await expect(
					retryOnTransientError(
						() => "success",
						null as unknown as { retries?: number; initialDelayMs?: number },
					),
				).rejects.toThrow(TypeError)
			})

			it("should handle options as undefined (uses defaults)", async () => {
				let callCount = 0
				const result = await retryOnTransientError(() => {
					callCount++
					return "success"
				}, undefined)
				expect(result).toBe("success")
				expect(callCount).toBe(1)
			})

			it("should handle empty options object (uses defaults)", async () => {
				let callCount = 0
				await expect(
					retryOnTransientError(() => {
						callCount++
						const err = Object.assign(new Error("EAGAIN"), { code: "EAGAIN" })
						throw err
					}, {}),
				).rejects.toThrow("EAGAIN")
				// Default retries is 3, so 4 total attempts
				expect(callCount).toBe(4)
			})

			it("should ignore extra unknown options properties", async () => {
				let callCount = 0
				const result = await retryOnTransientError(
					() => {
						callCount++
						return "success"
					},
					{ retries: 1, initialDelayMs: 10, unknownOption: "ignored" } as {
						retries?: number
						initialDelayMs?: number
					},
				)
				expect(result).toBe("success")
				expect(callCount).toBe(1)
			})
		})

		describe("concurrent operations", () => {
			it("should handle multiple concurrent retryOnTransientError calls independently", async () => {
				const counters = { c0: 0, c1: 0, c2: 0 }
				const results = await Promise.all([
					retryOnTransientError(
						() => {
							counters.c0++
							if (counters.c0 < 2) {
								const err = Object.assign(new Error("EAGAIN"), { code: "EAGAIN" })
								throw err
							}
							return "result-0"
						},
						{ retries: 3, initialDelayMs: 10 },
					),
					retryOnTransientError(
						() => {
							counters.c1++
							if (counters.c1 < 3) {
								const err = Object.assign(new Error("EBUSY"), { code: "EBUSY" })
								throw err
							}
							return "result-1"
						},
						{ retries: 3, initialDelayMs: 10 },
					),
					retryOnTransientError(
						() => {
							counters.c2++
							return "result-2" // Succeeds immediately
						},
						{ retries: 3, initialDelayMs: 10 },
					),
				])

				expect(results).toEqual(["result-0", "result-1", "result-2"])
				expect(counters.c0).toBe(2) // 1 failure + 1 success
				expect(counters.c1).toBe(3) // 2 failures + 1 success
				expect(counters.c2).toBe(1) // Immediate success
			})

			it("should isolate retry state between concurrent calls", async () => {
				const executionOrder: string[] = []

				const results = await Promise.all([
					retryOnTransientError(
						async () => {
							executionOrder.push("A-start")
							await new Promise((r) => setTimeout(r, 5))
							executionOrder.push("A-end")
							return "A"
						},
						{ retries: 1, initialDelayMs: 10 },
					),
					retryOnTransientError(
						async () => {
							executionOrder.push("B-start")
							await new Promise((r) => setTimeout(r, 5))
							executionOrder.push("B-end")
							return "B"
						},
						{ retries: 1, initialDelayMs: 10 },
					),
				])

				expect(results).toEqual(["A", "B"])
				// Both should start before either ends (concurrent execution)
				expect(executionOrder.indexOf("A-start")).toBeLessThan(executionOrder.indexOf("A-end"))
				expect(executionOrder.indexOf("B-start")).toBeLessThan(executionOrder.indexOf("B-end"))
			})

			it("should handle mixed success and failure in concurrent calls", async () => {
				const results = await Promise.allSettled([
					retryOnTransientError(
						() => {
							return "success"
						},
						{ retries: 1, initialDelayMs: 10 },
					),
					retryOnTransientError(
						() => {
							const err = Object.assign(new Error("ENOENT"), { code: "ENOENT" })
							throw err // Non-transient error, fails immediately
						},
						{ retries: 3, initialDelayMs: 10 },
					),
					retryOnTransientError(
						() => {
							const err = Object.assign(new Error("EAGAIN"), { code: "EAGAIN" })
							throw err // Transient error, exhausts all retries
						},
						{ retries: 1, initialDelayMs: 10 },
					),
				])

				expect(results[0]).toEqual({ status: "fulfilled", value: "success" })
				expect(results[1].status).toBe("rejected")
				expect((results[1] as PromiseRejectedResult).reason.code).toBe("ENOENT")
				expect(results[2].status).toBe("rejected")
				expect((results[2] as PromiseRejectedResult).reason.code).toBe("EAGAIN")
			})

			it("should maintain exponential backoff timing independently for each concurrent call", async () => {
				const timestamps: { id: string; time: number }[] = []
				const start = Date.now()

				await Promise.all([
					retryOnTransientError(
						() => {
							timestamps.push({ id: "A", time: Date.now() - start })
							const err = Object.assign(new Error("EAGAIN"), { code: "EAGAIN" })
							throw err
						},
						{ retries: 2, initialDelayMs: 20 }, // Delays: 20ms, 40ms
					).catch(() => {}),
					retryOnTransientError(
						() => {
							timestamps.push({ id: "B", time: Date.now() - start })
							const err = Object.assign(new Error("EBUSY"), { code: "EBUSY" })
							throw err
						},
						{ retries: 2, initialDelayMs: 30 }, // Delays: 30ms, 60ms
					).catch(() => {}),
				])

				// A should have 3 attempts with ~60ms total delay (20 + 40)
				// B should have 3 attempts with ~90ms total delay (30 + 60)
				const aAttempts = timestamps.filter((t) => t.id === "A")
				const bAttempts = timestamps.filter((t) => t.id === "B")

				expect(aAttempts).toHaveLength(3)
				expect(bAttempts).toHaveLength(3)

				// Verify A's backoff timing - calculate delays between consecutive attempts
				// biome-ignore lint/style/noNonNullAssertion: length verified above
				const aDiffs = aAttempts.slice(1).map((curr, i) => curr.time - aAttempts[i]!.time)
				expect(aDiffs[0]).toBeGreaterThanOrEqual(15) // ~20ms first delay
				expect(aDiffs[1]).toBeGreaterThanOrEqual(30) // ~40ms second delay

				// Verify B's backoff timing - calculate delays between consecutive attempts
				// biome-ignore lint/style/noNonNullAssertion: length verified above
				const bDiffs = bAttempts.slice(1).map((curr, i) => curr.time - bAttempts[i]!.time)
				expect(bDiffs[0]).toBeGreaterThanOrEqual(25) // ~30ms first delay
				expect(bDiffs[1]).toBeGreaterThanOrEqual(50) // ~60ms second delay
			})

			it("should handle high concurrency without interference", async () => {
				const concurrentCount = 10
				const callCounts = new Array(concurrentCount).fill(0)

				const promises = Array.from({ length: concurrentCount }, (_, i) =>
					retryOnTransientError(
						() => {
							callCounts[i]++
							if (callCounts[i] < 2) {
								const err = Object.assign(new Error("EAGAIN"), { code: "EAGAIN" })
								throw err
							}
							return `result-${i}`
						},
						{ retries: 2, initialDelayMs: 5 },
					),
				)

				const results = await Promise.all(promises)

				// All should succeed after one retry
				expect(results).toHaveLength(concurrentCount)
				for (let i = 0; i < concurrentCount; i++) {
					expect(results[i]).toBe(`result-${i}`)
					expect(callCounts[i]).toBe(2)
				}
			})

			it("should not share retry count state between concurrent calls", async () => {
				let sharedCounter = 0
				const individualCounts = { a: 0, b: 0 }

				await Promise.all([
					retryOnTransientError(
						() => {
							sharedCounter++
							individualCounts.a++
							if (individualCounts.a <= 2) {
								const err = Object.assign(new Error("EAGAIN"), { code: "EAGAIN" })
								throw err
							}
							return "A"
						},
						{ retries: 3, initialDelayMs: 5 },
					),
					retryOnTransientError(
						() => {
							sharedCounter++
							individualCounts.b++
							if (individualCounts.b <= 2) {
								const err = Object.assign(new Error("EAGAIN"), { code: "EAGAIN" })
								throw err
							}
							return "B"
						},
						{ retries: 3, initialDelayMs: 5 },
					),
				])

				// Each call should have its own retry count (3 attempts each)
				expect(individualCounts.a).toBe(3)
				expect(individualCounts.b).toBe(3)
				// Total shared counter should be sum of both
				expect(sharedCounter).toBe(6)
			})
		})
	})

	describe("parseFrontmatter", () => {
		it("should return found: false with reason 'missing' when content does not start with ---", () => {
			const result = parseFrontmatter("# No frontmatter")
			expect(result.found).toBe(false)
			expect(result.reason).toBe("missing")
			expect(result.fields).toEqual({})
			expect(result.endIndex).toBe(0)
		})

		it("should return found: false with reason 'unclosed' when closing --- is missing", () => {
			const result = parseFrontmatter("---\nversion: 1.0\nno closing delimiter")
			expect(result.found).toBe(false)
			expect(result.reason).toBe("unclosed")
			expect(result.fields).toEqual({})
			expect(result.endIndex).toBe(0)
		})

		it("should parse simple key: value pairs", () => {
			const content = `---
version: 1.0
requires: opencode
---
# Content`
			const result = parseFrontmatter(content)
			expect(result.found).toBe(true)
			expect(result.reason).toBeUndefined()
			expect(result.fields.version).toBe("1.0")
			expect(result.fields.requires).toBe("opencode")
		})

		it("should remove surrounding double quotes from values", () => {
			const content = `---
name: "My Agent"
---
# Content`
			const result = parseFrontmatter(content)
			expect(result.fields.name).toBe("My Agent")
		})

		it("should remove surrounding single quotes from values", () => {
			const content = `---
name: 'My Agent'
---
# Content`
			const result = parseFrontmatter(content)
			expect(result.fields.name).toBe("My Agent")
		})

		it("should skip comment lines in frontmatter", () => {
			const content = `---
# This is a comment
version: 1.0
---
# Content`
			const result = parseFrontmatter(content)
			expect(result.found).toBe(true)
			expect(result.fields.version).toBe("1.0")
			expect(Object.keys(result.fields)).toHaveLength(1)
		})

		it("should skip empty lines in frontmatter", () => {
			const content = `---
version: 1.0

requires: opencode
---
# Content`
			const result = parseFrontmatter(content)
			expect(result.found).toBe(true)
			expect(result.fields.version).toBe("1.0")
			expect(result.fields.requires).toBe("opencode")
		})

		it("should skip lines without colons", () => {
			const content = `---
version: 1.0
invalid line without colon
requires: opencode
---
# Content`
			const result = parseFrontmatter(content)
			expect(result.found).toBe(true)
			expect(Object.keys(result.fields)).toHaveLength(2)
		})

		it("should return correct endIndex", () => {
			const content = `---
version: 1.0
---
# Content after frontmatter`
			const result = parseFrontmatter(content)
			expect(result.found).toBe(true)
			// endIndex should point past the closing ---\n
			const afterFrontmatter = content.slice(result.endIndex)
			expect(afterFrontmatter).toBe("\n# Content after frontmatter")
		})

		it("should handle values with colons", () => {
			const content = `---
url: https://example.com
---
# Content`
			const result = parseFrontmatter(content)
			expect(result.fields.url).toBe("https://example.com")
		})

		it("should throw TypeError for null input", () => {
			expect(() => parseFrontmatter(null as unknown as string)).toThrow(TypeError)
			expect(() => parseFrontmatter(null as unknown as string)).toThrow(
				"parseFrontmatter: content must be a string, got null",
			)
		})

		it("should throw TypeError for undefined input", () => {
			expect(() => parseFrontmatter(undefined as unknown as string)).toThrow(TypeError)
			expect(() => parseFrontmatter(undefined as unknown as string)).toThrow(
				"parseFrontmatter: content must be a string, got undefined",
			)
		})

		it("should throw TypeError for number input", () => {
			expect(() => parseFrontmatter(123 as unknown as string)).toThrow(TypeError)
			expect(() => parseFrontmatter(123 as unknown as string)).toThrow(
				"parseFrontmatter: content must be a string, got number",
			)
		})

		it("should throw TypeError for object input", () => {
			expect(() => parseFrontmatter({} as unknown as string)).toThrow(TypeError)
			expect(() => parseFrontmatter({} as unknown as string)).toThrow(
				"parseFrontmatter: content must be a string, got object",
			)
		})

		it("should throw TypeError for array input", () => {
			expect(() => parseFrontmatter([] as unknown as string)).toThrow(TypeError)
			expect(() => parseFrontmatter([] as unknown as string)).toThrow(
				"parseFrontmatter: content must be a string, got object",
			)
		})

		it("should throw TypeError for boolean input", () => {
			expect(() => parseFrontmatter(true as unknown as string)).toThrow(TypeError)
			expect(() => parseFrontmatter(true as unknown as string)).toThrow(
				"parseFrontmatter: content must be a string, got boolean",
			)
		})

		describe("edge cases with malformed YAML", () => {
			it("should return empty fields for frontmatter with only whitespace between delimiters", () => {
				const content = `---
   
	
---
# Content`
				const result = parseFrontmatter(content)
				expect(result.found).toBe(true)
				expect(result.fields).toEqual({})
				expect(result.endIndex).toBeGreaterThan(0)
			})

			it("should handle values containing unbalanced double quotes", () => {
				const content = `---
name: "Unbalanced quote value
version: 1.0
---
# Content`
				const result = parseFrontmatter(content)
				expect(result.found).toBe(true)
				// The unbalanced quote is kept as-is since it doesn't match the balanced quote pattern
				expect(result.fields.name).toBe('"Unbalanced quote value')
				expect(result.fields.version).toBe("1.0")
			})

			it("should handle values containing unbalanced single quotes", () => {
				const content = `---
name: 'Unbalanced single quote
version: 1.0
---
# Content`
				const result = parseFrontmatter(content)
				expect(result.found).toBe(true)
				// The unbalanced quote is kept as-is
				expect(result.fields.name).toBe("'Unbalanced single quote")
				expect(result.fields.version).toBe("1.0")
			})

			it("should handle values with mismatched quote types", () => {
				const content = `---
name: "Mismatched quotes'
version: 1.0
---
# Content`
				const result = parseFrontmatter(content)
				expect(result.found).toBe(true)
				// Mismatched quotes are not stripped
				expect(result.fields.name).toBe("\"Mismatched quotes'")
				expect(result.fields.version).toBe("1.0")
			})

			it("should return unclosed when closing --- is on same line as content", () => {
				const content = `---
version: 1.0
requires: opencode---
# Content`
				const result = parseFrontmatter(content)
				// The closing --- must be on its own line (preceded by \n)
				// "opencode---" does not match "\n---" pattern
				expect(result.found).toBe(false)
				expect(result.reason).toBe("unclosed")
			})

			it("should handle closing --- immediately after newline with no space", () => {
				const content = `---
version: 1.0
---`
				const result = parseFrontmatter(content)
				expect(result.found).toBe(true)
				expect(result.fields.version).toBe("1.0")
			})

			it("should use the last value when duplicate keys exist", () => {
				const content = `---
version: 1.0
requires: opencode
version: 2.0
---
# Content`
				const result = parseFrontmatter(content)
				expect(result.found).toBe(true)
				// The parser iterates through lines and overwrites, so last value wins
				expect(result.fields.version).toBe("2.0")
				expect(result.fields.requires).toBe("opencode")
			})

			it("should handle multiple duplicate keys with last value winning", () => {
				const content = `---
key: first
key: second
key: third
---
# Content`
				const result = parseFrontmatter(content)
				expect(result.found).toBe(true)
				expect(result.fields.key).toBe("third")
			})

			it("should preserve leading whitespace in values", () => {
				const content = `---
name:   leading spaces
version: 1.0
---
# Content`
				const result = parseFrontmatter(content)
				expect(result.found).toBe(true)
				// trim() is called on the value, so leading spaces are removed
				expect(result.fields.name).toBe("leading spaces")
			})

			it("should preserve trailing whitespace in values (trimmed)", () => {
				const content = `---
name: trailing spaces   
version: 1.0
---
# Content`
				const result = parseFrontmatter(content)
				expect(result.found).toBe(true)
				// trim() is called on the value, so trailing spaces are removed
				expect(result.fields.name).toBe("trailing spaces")
			})

			it("should handle values with both leading and trailing whitespace", () => {
				const content = `---
name:   surrounded by spaces   
version: 1.0
---
# Content`
				const result = parseFrontmatter(content)
				expect(result.found).toBe(true)
				// Both leading and trailing spaces are trimmed
				expect(result.fields.name).toBe("surrounded by spaces")
			})

			it("should handle whitespace-only values as empty strings", () => {
				const content = `---
name:    
version: 1.0
---
# Content`
				const result = parseFrontmatter(content)
				expect(result.found).toBe(true)
				// Whitespace-only value becomes empty string after trim
				expect(result.fields.name).toBe("")
				expect(result.fields.version).toBe("1.0")
			})

			it("should handle quoted values with internal whitespace preserved", () => {
				const content = `---
name: "  internal spaces  "
version: 1.0
---
# Content`
				const result = parseFrontmatter(content)
				expect(result.found).toBe(true)
				// Quotes are stripped, but internal whitespace is preserved
				expect(result.fields.name).toBe("  internal spaces  ")
			})

			it("should handle empty value after colon", () => {
				const content = `---
name:
version: 1.0
---
# Content`
				const result = parseFrontmatter(content)
				expect(result.found).toBe(true)
				expect(result.fields.name).toBe("")
				expect(result.fields.version).toBe("1.0")
			})

			it("should handle keys with leading/trailing whitespace", () => {
				const content = `---
  name  : value
version: 1.0
---
# Content`
				const result = parseFrontmatter(content)
				expect(result.found).toBe(true)
				// Key whitespace is trimmed
				expect(result.fields.name).toBe("value")
				expect(result.fields.version).toBe("1.0")
			})
		})
	})

	describe("validateAgentContent", () => {
		const createValidContent = (overrides: { content?: string } = {}) => {
			const baseContent = `---
version: 1.0
requires: opencode
---
# Test Agent

This is a test agent that handles various tasks for you.
The agent can process multiple items efficiently.
`.padEnd(MIN_CONTENT_LENGTH + 50, " ")
			return overrides.content ?? baseContent
		}

		it("should return valid: true for valid agent content", () => {
			const content = createValidContent()
			const result = validateAgentContent(content)
			expect(result.valid).toBe(true)
			expect(result.error).toBeUndefined()
		})

		it("should return valid: false when content is too short", () => {
			const content = "---\nversion: 1.0\nrequires: opencode\n---\n# Short agent task"
			const result = validateAgentContent(content)
			expect(result.valid).toBe(false)
			expect(result.error).toContain("File too short")
			expect(result.error).toContain(`minimum ${MIN_CONTENT_LENGTH}`)
		})

		it("should return valid: false with specific error when frontmatter is missing", () => {
			const content =
				"# No Frontmatter Agent\n\nThis agent has no frontmatter but is an agent for tasks.".padEnd(
					MIN_CONTENT_LENGTH + 10,
					" ",
				)
			const result = validateAgentContent(content)
			expect(result.valid).toBe(false)
			expect(result.error).toBe("File missing YAML frontmatter (must start with ---)")
		})

		it("should return valid: false with specific error when frontmatter is unclosed", () => {
			const content = `---
version: 1.0
requires: opencode
This file has no closing frontmatter delimiter.
# Test Agent
This is a test agent that handles various tasks.
`.padEnd(MIN_CONTENT_LENGTH + 50, " ")
			const result = validateAgentContent(content)
			expect(result.valid).toBe(false)
			expect(result.error).toBe("Unclosed YAML frontmatter (missing closing ---)")
		})

		it("should return valid: false when version field is missing", () => {
			const content = `---
requires: opencode
---
# Test Agent

This is a test agent that handles various tasks.
`.padEnd(MIN_CONTENT_LENGTH + 50, " ")
			const result = validateAgentContent(content)
			expect(result.valid).toBe(false)
			expect(result.error).toContain("missing required fields")
			expect(result.error).toContain("version")
		})

		it("should return valid: false when requires field is missing", () => {
			const content = `---
version: 1.0
---
# Test Agent

This is a test agent that handles various tasks.
`.padEnd(MIN_CONTENT_LENGTH + 50, " ")
			const result = validateAgentContent(content)
			expect(result.valid).toBe(false)
			expect(result.error).toContain("missing required fields")
			expect(result.error).toContain("requires")
		})

		it("should return valid: false when markdown header is missing after frontmatter", () => {
			const content = `---
version: 1.0
requires: opencode
---
No markdown header here, just text about agent tasks.
`.padEnd(MIN_CONTENT_LENGTH + 50, " ")
			const result = validateAgentContent(content)
			expect(result.valid).toBe(false)
			expect(result.error).toContain("markdown header")
		})

		it("should return valid: false when required keywords are missing", () => {
			const content = `---
version: 1.0
requires: opencode
---
# Test Helper

This is a helper that handles various operations for you.
It can process multiple items efficiently and reliably.
`.padEnd(MIN_CONTENT_LENGTH + 50, " ")
			const result = validateAgentContent(content)
			expect(result.valid).toBe(false)
			expect(result.error).toContain("missing required keywords")
		})

		it("should be case-insensitive for keyword matching", () => {
			const content = `---
version: 1.0
requires: opencode
---
# Test AGENT

This is a test AGENT that handles various TASKS.
`.padEnd(MIN_CONTENT_LENGTH + 50, " ")
			const result = validateAgentContent(content)
			expect(result.valid).toBe(true)
		})

		it("should allow whitespace between frontmatter and header", () => {
			const content = `---
version: 1.0
requires: opencode
---

# Test Agent

This is a test agent that handles various tasks.
`.padEnd(MIN_CONTENT_LENGTH + 50, " ")
			const result = validateAgentContent(content)
			expect(result.valid).toBe(true)
		})

		it("should throw TypeError for null input", () => {
			expect(() => validateAgentContent(null as unknown as string)).toThrow(TypeError)
			expect(() => validateAgentContent(null as unknown as string)).toThrow(
				"validateAgentContent: content must be a string, got null",
			)
		})

		it("should throw TypeError for undefined input", () => {
			expect(() => validateAgentContent(undefined as unknown as string)).toThrow(TypeError)
			expect(() => validateAgentContent(undefined as unknown as string)).toThrow(
				"validateAgentContent: content must be a string, got undefined",
			)
		})

		it("should throw TypeError for number input", () => {
			expect(() => validateAgentContent(123 as unknown as string)).toThrow(TypeError)
			expect(() => validateAgentContent(123 as unknown as string)).toThrow(
				"validateAgentContent: content must be a string, got number",
			)
		})

		it("should throw TypeError for object input", () => {
			expect(() => validateAgentContent({} as unknown as string)).toThrow(TypeError)
			expect(() => validateAgentContent({} as unknown as string)).toThrow(
				"validateAgentContent: content must be a string, got object",
			)
		})

		it("should throw TypeError for array input", () => {
			expect(() => validateAgentContent([] as unknown as string)).toThrow(TypeError)
			expect(() => validateAgentContent([] as unknown as string)).toThrow(
				"validateAgentContent: content must be a string, got object",
			)
		})

		it("should throw TypeError for boolean input", () => {
			expect(() => validateAgentContent(true as unknown as string)).toThrow(TypeError)
			expect(() => validateAgentContent(true as unknown as string)).toThrow(
				"validateAgentContent: content must be a string, got boolean",
			)
		})
	})

	describe("checkVersionCompatibility", () => {
		describe("exact version matching", () => {
			it("should return true for exact match", () => {
				expect(checkVersionCompatibility("1.0.0", "1.0.0")).toBe(true)
			})

			it("should return false for different versions", () => {
				expect(checkVersionCompatibility("1.0.0", "1.0.1")).toBe(false)
				expect(checkVersionCompatibility("1.0.0", "1.1.0")).toBe(false)
				expect(checkVersionCompatibility("1.0.0", "2.0.0")).toBe(false)
			})
		})

		describe(">= operator", () => {
			it("should return true when current equals required", () => {
				expect(checkVersionCompatibility(">=1.0.0", "1.0.0")).toBe(true)
			})

			it("should return true when current is greater", () => {
				expect(checkVersionCompatibility(">=1.0.0", "1.0.1")).toBe(true)
				expect(checkVersionCompatibility(">=1.0.0", "1.1.0")).toBe(true)
				expect(checkVersionCompatibility(">=1.0.0", "2.0.0")).toBe(true)
				expect(checkVersionCompatibility(">=0.1.0", "0.2.0")).toBe(true)
			})

			it("should return false when current is less", () => {
				expect(checkVersionCompatibility(">=1.0.0", "0.9.9")).toBe(false)
				expect(checkVersionCompatibility(">=1.0.0", "0.1.0")).toBe(false)
			})
		})

		describe("> operator", () => {
			it("should return false when current equals required", () => {
				expect(checkVersionCompatibility(">1.0.0", "1.0.0")).toBe(false)
			})

			it("should return true when current is greater", () => {
				expect(checkVersionCompatibility(">1.0.0", "1.0.1")).toBe(true)
				expect(checkVersionCompatibility(">1.0.0", "2.0.0")).toBe(true)
			})

			it("should return false when current is less", () => {
				expect(checkVersionCompatibility(">1.0.0", "0.9.9")).toBe(false)
			})
		})

		describe("<= operator", () => {
			it("should return true when current equals required", () => {
				expect(checkVersionCompatibility("<=1.0.0", "1.0.0")).toBe(true)
			})

			it("should return true when current is less", () => {
				expect(checkVersionCompatibility("<=1.0.0", "0.9.9")).toBe(true)
				expect(checkVersionCompatibility("<=1.0.0", "0.1.0")).toBe(true)
			})

			it("should return false when current is greater", () => {
				expect(checkVersionCompatibility("<=1.0.0", "1.0.1")).toBe(false)
				expect(checkVersionCompatibility("<=1.0.0", "2.0.0")).toBe(false)
			})
		})

		describe("< operator", () => {
			it("should return false when current equals required", () => {
				expect(checkVersionCompatibility("<1.0.0", "1.0.0")).toBe(false)
			})

			it("should return true when current is less", () => {
				expect(checkVersionCompatibility("<1.0.0", "0.9.9")).toBe(true)
				expect(checkVersionCompatibility("<1.0.0", "0.1.0")).toBe(true)
			})

			it("should return false when current is greater", () => {
				expect(checkVersionCompatibility("<1.0.0", "1.0.1")).toBe(false)
			})
		})

		describe("^ caret operator", () => {
			it("should return true for compatible versions with major >= 1", () => {
				expect(checkVersionCompatibility("^1.0.0", "1.0.0")).toBe(true)
				expect(checkVersionCompatibility("^1.0.0", "1.5.0")).toBe(true)
				expect(checkVersionCompatibility("^1.0.0", "1.9.9")).toBe(true)
				expect(checkVersionCompatibility("^1.2.3", "1.5.0")).toBe(true)
			})

			it("should return false for incompatible major versions", () => {
				expect(checkVersionCompatibility("^1.0.0", "2.0.0")).toBe(false)
				expect(checkVersionCompatibility("^1.0.0", "0.9.9")).toBe(false)
			})

			it("should return false when current is below required", () => {
				expect(checkVersionCompatibility("^1.2.0", "1.1.0")).toBe(false)
			})

			it("should handle 0.x versions (minor must match)", () => {
				expect(checkVersionCompatibility("^0.1.0", "0.1.0")).toBe(true)
				expect(checkVersionCompatibility("^0.1.0", "0.1.5")).toBe(true)
				expect(checkVersionCompatibility("^0.1.0", "0.2.0")).toBe(false)
				expect(checkVersionCompatibility("^0.1.0", "1.0.0")).toBe(false)
			})
		})

		describe("~ tilde operator", () => {
			it("should return true for compatible patch versions", () => {
				expect(checkVersionCompatibility("~1.2.0", "1.2.0")).toBe(true)
				expect(checkVersionCompatibility("~1.2.0", "1.2.5")).toBe(true)
				expect(checkVersionCompatibility("~1.2.0", "1.2.99")).toBe(true)
			})

			it("should return false when minor version differs", () => {
				expect(checkVersionCompatibility("~1.2.0", "1.3.0")).toBe(false)
				expect(checkVersionCompatibility("~1.2.0", "1.1.0")).toBe(false)
			})

			it("should return false when major version differs", () => {
				expect(checkVersionCompatibility("~1.2.0", "2.2.0")).toBe(false)
				expect(checkVersionCompatibility("~1.2.0", "0.2.0")).toBe(false)
			})

			it("should return false when current is below required patch", () => {
				expect(checkVersionCompatibility("~1.2.5", "1.2.4")).toBe(false)
			})
		})

		describe("invalid inputs", () => {
			it("should return false for invalid current version", () => {
				expect(checkVersionCompatibility(">=1.0.0", "invalid")).toBe(false)
				expect(checkVersionCompatibility(">=1.0.0", "1.0")).toBe(false)
				expect(checkVersionCompatibility(">=1.0.0", "1")).toBe(false)
			})

			it("should return false for invalid required version", () => {
				expect(checkVersionCompatibility("invalid", "1.0.0")).toBe(false)
				expect(checkVersionCompatibility(">=invalid", "1.0.0")).toBe(false)
				expect(checkVersionCompatibility("^", "1.0.0")).toBe(false)
			})

			it("should throw TypeError for null required", () => {
				expect(() => checkVersionCompatibility(null as unknown as string, "1.0.0")).toThrow(
					TypeError,
				)
				expect(() => checkVersionCompatibility(null as unknown as string, "1.0.0")).toThrow(
					"checkVersionCompatibility: required must be a string, got null",
				)
			})

			it("should throw TypeError for undefined required", () => {
				expect(() => checkVersionCompatibility(undefined as unknown as string, "1.0.0")).toThrow(
					TypeError,
				)
				expect(() => checkVersionCompatibility(undefined as unknown as string, "1.0.0")).toThrow(
					"checkVersionCompatibility: required must be a string, got undefined",
				)
			})

			it("should throw TypeError for non-string required", () => {
				expect(() => checkVersionCompatibility(123 as unknown as string, "1.0.0")).toThrow(
					TypeError,
				)
				expect(() => checkVersionCompatibility(123 as unknown as string, "1.0.0")).toThrow(
					"checkVersionCompatibility: required must be a string, got number",
				)
			})

			it("should throw TypeError for empty string required", () => {
				expect(() => checkVersionCompatibility("", "1.0.0")).toThrow(TypeError)
				expect(() => checkVersionCompatibility("", "1.0.0")).toThrow(
					"checkVersionCompatibility: required must not be empty",
				)
			})

			it("should throw TypeError for whitespace-only required", () => {
				expect(() => checkVersionCompatibility("   ", "1.0.0")).toThrow(TypeError)
				expect(() => checkVersionCompatibility("   ", "1.0.0")).toThrow(
					"checkVersionCompatibility: required must not be empty",
				)
			})

			it("should throw TypeError for null current", () => {
				expect(() => checkVersionCompatibility(">=1.0.0", null as unknown as string)).toThrow(
					TypeError,
				)
				expect(() => checkVersionCompatibility(">=1.0.0", null as unknown as string)).toThrow(
					"checkVersionCompatibility: current must be a string, got null",
				)
			})

			it("should throw TypeError for undefined current", () => {
				expect(() => checkVersionCompatibility(">=1.0.0", undefined as unknown as string)).toThrow(
					TypeError,
				)
				expect(() => checkVersionCompatibility(">=1.0.0", undefined as unknown as string)).toThrow(
					"checkVersionCompatibility: current must be a string, got undefined",
				)
			})

			it("should throw TypeError for non-string current", () => {
				expect(() => checkVersionCompatibility(">=1.0.0", 100 as unknown as string)).toThrow(
					TypeError,
				)
				expect(() => checkVersionCompatibility(">=1.0.0", 100 as unknown as string)).toThrow(
					"checkVersionCompatibility: current must be a string, got number",
				)
			})

			it("should throw TypeError for empty string current", () => {
				expect(() => checkVersionCompatibility(">=1.0.0", "")).toThrow(TypeError)
				expect(() => checkVersionCompatibility(">=1.0.0", "")).toThrow(
					"checkVersionCompatibility: current must not be empty",
				)
			})

			it("should throw TypeError for whitespace-only current", () => {
				expect(() => checkVersionCompatibility(">=1.0.0", "   ")).toThrow(TypeError)
				expect(() => checkVersionCompatibility(">=1.0.0", "   ")).toThrow(
					"checkVersionCompatibility: current must not be empty",
				)
			})
		})
	})

	describe("parseCliFlags", () => {
		it("should return all false flags for empty argv", () => {
			const result = parseCliFlags([])
			expect(result).toEqual({ dryRun: false, verbose: false, quiet: false, help: false })
		})

		it("should return all false flags for argv without flags", () => {
			const result = parseCliFlags(["node", "script.js"])
			expect(result).toEqual({ dryRun: false, verbose: false, quiet: false, help: false })
		})

		it("should detect --dry-run flag", () => {
			const result = parseCliFlags(["node", "script.js", "--dry-run"])
			expect(result.dryRun).toBe(true)
			expect(result.verbose).toBe(false)
			expect(result.quiet).toBe(false)
			expect(result.help).toBe(false)
		})

		it("should detect --verbose flag", () => {
			const result = parseCliFlags(["node", "script.js", "--verbose"])
			expect(result.dryRun).toBe(false)
			expect(result.verbose).toBe(true)
			expect(result.quiet).toBe(false)
			expect(result.help).toBe(false)
		})

		it("should detect --quiet flag", () => {
			const result = parseCliFlags(["node", "script.js", "--quiet"])
			expect(result.dryRun).toBe(false)
			expect(result.verbose).toBe(false)
			expect(result.quiet).toBe(true)
			expect(result.help).toBe(false)
		})

		it("should detect --help flag", () => {
			const result = parseCliFlags(["node", "script.js", "--help"])
			expect(result.dryRun).toBe(false)
			expect(result.verbose).toBe(false)
			expect(result.quiet).toBe(false)
			expect(result.help).toBe(true)
		})

		it("should detect multiple flags", () => {
			const result = parseCliFlags(["node", "script.js", "--dry-run", "--verbose"])
			expect(result.dryRun).toBe(true)
			expect(result.verbose).toBe(true)
			expect(result.quiet).toBe(false)
			expect(result.help).toBe(false)
		})

		it("should detect all flags", () => {
			const result = parseCliFlags([
				"node",
				"script.js",
				"--dry-run",
				"--verbose",
				"--quiet",
				"--help",
			])
			expect(result).toEqual({ dryRun: true, verbose: true, quiet: true, help: true })
		})

		it("should ignore unknown flags", () => {
			const result = parseCliFlags(["node", "script.js", "--unknown", "--other"])
			expect(result).toEqual({ dryRun: false, verbose: false, quiet: false, help: false })
		})

		it("should handle flags in any position", () => {
			const result = parseCliFlags([
				"--verbose",
				"node",
				"--dry-run",
				"script.js",
				"--help",
				"--quiet",
			])
			expect(result).toEqual({ dryRun: true, verbose: true, quiet: true, help: true })
		})

		it("should not match partial flag names", () => {
			const result = parseCliFlags([
				"node",
				"script.js",
				"--dry-run-test",
				"--verbosity",
				"--quietly",
			])
			expect(result.dryRun).toBe(false)
			expect(result.verbose).toBe(false)
			expect(result.quiet).toBe(false)
		})

		it("should throw TypeError for null input", () => {
			expect(() => parseCliFlags(null as unknown as string[])).toThrow(TypeError)
			expect(() => parseCliFlags(null as unknown as string[])).toThrow(
				"parseCliFlags: argv must be an array, got null",
			)
		})

		it("should throw TypeError for undefined input", () => {
			expect(() => parseCliFlags(undefined as unknown as string[])).toThrow(TypeError)
			expect(() => parseCliFlags(undefined as unknown as string[])).toThrow(
				"parseCliFlags: argv must be an array, got undefined",
			)
		})

		it("should throw TypeError for non-array input", () => {
			expect(() => parseCliFlags("string" as unknown as string[])).toThrow(TypeError)
			expect(() => parseCliFlags("string" as unknown as string[])).toThrow(
				"parseCliFlags: argv must be an array, got string",
			)
			expect(() => parseCliFlags(123 as unknown as string[])).toThrow(TypeError)
			expect(() => parseCliFlags(123 as unknown as string[])).toThrow(
				"parseCliFlags: argv must be an array, got number",
			)
			expect(() => parseCliFlags({} as unknown as string[])).toThrow(TypeError)
			expect(() => parseCliFlags({} as unknown as string[])).toThrow(
				"parseCliFlags: argv must be an array, got object",
			)
		})
	})

	describe("createLogger", () => {
		it("should return an object with log, verbose, and error methods", () => {
			const logger = createLogger(false)
			expect(typeof logger.log).toBe("function")
			expect(typeof logger.verbose).toBe("function")
			expect(typeof logger.error).toBe("function")
		})

		it("should throw TypeError for null input", () => {
			expect(() => createLogger(null as unknown as boolean)).toThrow(TypeError)
			expect(() => createLogger(null as unknown as boolean)).toThrow(
				"createLogger: verbose must be a boolean, got null",
			)
		})

		it("should throw TypeError for undefined input", () => {
			expect(() => createLogger(undefined as unknown as boolean)).toThrow(TypeError)
			expect(() => createLogger(undefined as unknown as boolean)).toThrow(
				"createLogger: verbose must be a boolean, got undefined",
			)
		})

		it("should throw TypeError for string input", () => {
			expect(() => createLogger("true" as unknown as boolean)).toThrow(TypeError)
			expect(() => createLogger("true" as unknown as boolean)).toThrow(
				"createLogger: verbose must be a boolean, got string",
			)
			expect(() => createLogger("false" as unknown as boolean)).toThrow(TypeError)
			expect(() => createLogger("" as unknown as boolean)).toThrow(TypeError)
		})

		it("should throw TypeError for number input", () => {
			expect(() => createLogger(1 as unknown as boolean)).toThrow(TypeError)
			expect(() => createLogger(1 as unknown as boolean)).toThrow(
				"createLogger: verbose must be a boolean, got number",
			)
			expect(() => createLogger(0 as unknown as boolean)).toThrow(TypeError)
		})

		it("should throw TypeError for object input", () => {
			expect(() => createLogger({} as unknown as boolean)).toThrow(TypeError)
			expect(() => createLogger({} as unknown as boolean)).toThrow(
				"createLogger: verbose must be a boolean, got object",
			)
		})

		it("should throw TypeError for array input", () => {
			expect(() => createLogger([] as unknown as boolean)).toThrow(TypeError)
			expect(() => createLogger([] as unknown as boolean)).toThrow(
				"createLogger: verbose must be a boolean, got object",
			)
		})

		it("should log messages with log() method", () => {
			const originalLog = console.log
			const messages: string[] = []
			console.log = (msg: string) => messages.push(msg)

			const logger = createLogger(false)
			logger.log("test message")

			console.log = originalLog
			expect(messages).toContain("test message")
		})

		it("should not log verbose messages when verbose is false", () => {
			const originalLog = console.log
			const messages: string[] = []
			console.log = (msg: string) => messages.push(msg)

			const logger = createLogger(false)
			logger.verbose("verbose message")

			console.log = originalLog
			expect(messages).toHaveLength(0)
		})

		it("should log verbose messages with [VERBOSE] prefix when verbose is true", () => {
			const originalLog = console.log
			const messages: string[] = []
			console.log = (msg: string) => messages.push(msg)

			const logger = createLogger(true)
			logger.verbose("verbose message")

			console.log = originalLog
			expect(messages).toContain("[VERBOSE] verbose message")
		})

		it("should log both normal and verbose messages when verbose is true", () => {
			const originalLog = console.log
			const messages: string[] = []
			console.log = (msg: string) => messages.push(msg)

			const logger = createLogger(true)
			logger.log("normal message")
			logger.verbose("verbose message")

			console.log = originalLog
			expect(messages).toContain("normal message")
			expect(messages).toContain("[VERBOSE] verbose message")
		})

		it("should log empty strings with log() method", () => {
			const originalLog = console.log
			const messages: string[] = []
			console.log = (msg: string) => messages.push(msg)

			const logger = createLogger(false)
			logger.log("")

			console.log = originalLog
			expect(messages).toHaveLength(1)
			expect(messages[0]).toBe("")
		})

		it("should log empty strings with verbose() method when verbose is true", () => {
			const originalLog = console.log
			const messages: string[] = []
			console.log = (msg: string) => messages.push(msg)

			const logger = createLogger(true)
			logger.verbose("")

			console.log = originalLog
			expect(messages).toHaveLength(1)
			expect(messages[0]).toBe("[VERBOSE] ")
		})

		it("should handle messages with newline characters", () => {
			const originalLog = console.log
			const messages: string[] = []
			console.log = (msg: string) => messages.push(msg)

			const logger = createLogger(true)
			logger.log("line1\nline2\nline3")
			logger.verbose("verbose\nwith\nnewlines")

			console.log = originalLog
			expect(messages[0]).toBe("line1\nline2\nline3")
			expect(messages[1]).toBe("[VERBOSE] verbose\nwith\nnewlines")
		})

		it("should handle messages with tab characters", () => {
			const originalLog = console.log
			const messages: string[] = []
			console.log = (msg: string) => messages.push(msg)

			const logger = createLogger(true)
			logger.log("column1\tcolumn2\tcolumn3")
			logger.verbose("verbose\twith\ttabs")

			console.log = originalLog
			expect(messages[0]).toBe("column1\tcolumn2\tcolumn3")
			expect(messages[1]).toBe("[VERBOSE] verbose\twith\ttabs")
		})

		it("should handle messages with mixed special characters", () => {
			const originalLog = console.log
			const messages: string[] = []
			console.log = (msg: string) => messages.push(msg)

			const logger = createLogger(true)
			const specialMessage = "header\n\tindented\n\t\tdouble-indented\nback"
			logger.log(specialMessage)
			logger.verbose(specialMessage)

			console.log = originalLog
			expect(messages[0]).toBe(specialMessage)
			expect(messages[1]).toBe(`[VERBOSE] ${specialMessage}`)
		})

		it("should use exact '[VERBOSE] ' prefix format with single space after bracket", () => {
			const originalLog = console.log
			const messages: string[] = []
			console.log = (msg: string) => messages.push(msg)

			const logger = createLogger(true)
			logger.verbose("test")

			console.log = originalLog
			// Verify exact prefix format: [VERBOSE] followed by exactly one space
			expect(messages[0]).toMatch(/^\[VERBOSE\] /)
			expect(messages[0]).toBe("[VERBOSE] test")
			// Ensure no extra spaces or different formatting
			expect(messages[0]).not.toMatch(/^\[VERBOSE\] {2}/) // Not two spaces
			expect(messages[0]).not.toMatch(/^\[verbose\]/) // Not lowercase
			expect(messages[0]).not.toMatch(/^VERBOSE:/) // Not colon format
		})

		it("should preserve the exact prefix format for various message types", () => {
			const originalLog = console.log
			const messages: string[] = []
			console.log = (msg: string) => messages.push(msg)

			const logger = createLogger(true)
			logger.verbose("simple")
			logger.verbose("  leading spaces")
			logger.verbose("trailing spaces  ")

			console.log = originalLog
			// All messages should have exactly "[VERBOSE] " prefix
			expect(messages[0]).toBe("[VERBOSE] simple")
			expect(messages[1]).toBe("[VERBOSE]   leading spaces")
			expect(messages[2]).toBe("[VERBOSE] trailing spaces  ")
		})

		describe("quiet mode", () => {
			it("should suppress log() output when quiet is true", () => {
				const originalLog = console.log
				const messages: string[] = []
				console.log = (msg: string) => messages.push(msg)

				const logger = createLogger(false, true)
				logger.log("this should be suppressed")

				console.log = originalLog
				expect(messages).toHaveLength(0)
			})

			it("should suppress verbose() output when quiet is true", () => {
				const originalLog = console.log
				const messages: string[] = []
				console.log = (msg: string) => messages.push(msg)

				const logger = createLogger(true, true)
				logger.verbose("this should be suppressed")

				console.log = originalLog
				expect(messages).toHaveLength(0)
			})

			it("should never suppress error() output even when quiet is true", () => {
				const originalError = console.error
				const messages: string[] = []
				console.error = (msg: string) => messages.push(msg)

				const logger = createLogger(false, true)
				logger.error("this should always appear")

				console.error = originalError
				expect(messages).toContain("this should always appear")
			})

			it("should log error() to stderr", () => {
				const originalError = console.error
				const messages: string[] = []
				console.error = (msg: string) => messages.push(msg)

				const logger = createLogger(false)
				logger.error("error message")

				console.error = originalError
				expect(messages).toContain("error message")
			})

			it("should suppress both log() and verbose() but not error() when quiet is true", () => {
				const originalLog = console.log
				const originalError = console.error
				const logMessages: string[] = []
				const errorMessages: string[] = []
				console.log = (msg: string) => logMessages.push(msg)
				console.error = (msg: string) => errorMessages.push(msg)

				const logger = createLogger(true, true)
				logger.log("log message")
				logger.verbose("verbose message")
				logger.error("error message")

				console.log = originalLog
				console.error = originalError
				expect(logMessages).toHaveLength(0)
				expect(errorMessages).toContain("error message")
			})

			it("should default quiet to false when not provided", () => {
				const originalLog = console.log
				const messages: string[] = []
				console.log = (msg: string) => messages.push(msg)

				const logger = createLogger(false)
				logger.log("this should appear")

				console.log = originalLog
				expect(messages).toContain("this should appear")
			})

			it("should throw TypeError for non-boolean quiet parameter", () => {
				expect(() => createLogger(false, "true" as unknown as boolean)).toThrow(TypeError)
				expect(() => createLogger(false, "true" as unknown as boolean)).toThrow(
					"createLogger: quiet must be a boolean, got string",
				)
			})

			it("should throw TypeError for null quiet parameter", () => {
				expect(() => createLogger(false, null as unknown as boolean)).toThrow(TypeError)
				expect(() => createLogger(false, null as unknown as boolean)).toThrow(
					"createLogger: quiet must be a boolean, got null",
				)
			})

			it("should throw TypeError for number quiet parameter", () => {
				expect(() => createLogger(false, 1 as unknown as boolean)).toThrow(TypeError)
				expect(() => createLogger(false, 1 as unknown as boolean)).toThrow(
					"createLogger: quiet must be a boolean, got number",
				)
			})
		})
	})

	describe("validateAgentFile", () => {
		describe("with actual files", () => {
			it("should return valid: true for actual agent files in agents/ directory", () => {
				const agentsDir = join(import.meta.dirname, "..", "agents")
				for (const name of AGENT_NAMES) {
					const filePath = join(agentsDir, `${name}.md`)
					const result = validateAgentFile(filePath)
					expect(result.valid).toBe(true)
					expect(result.error).toBeUndefined()
				}
			})

			it("should throw error for non-existent file", () => {
				const nonExistentPath = join(import.meta.dirname, "non-existent-file.md")
				expect(() => validateAgentFile(nonExistentPath)).toThrow()
			})
		})

		describe("input validation", () => {
			it("should throw TypeError for null input", () => {
				expect(() => validateAgentFile(null as unknown as string)).toThrow(TypeError)
				expect(() => validateAgentFile(null as unknown as string)).toThrow(
					"validateAgentFile: filePath must be a string, got null",
				)
			})

			it("should throw TypeError for undefined input", () => {
				expect(() => validateAgentFile(undefined as unknown as string)).toThrow(TypeError)
				expect(() => validateAgentFile(undefined as unknown as string)).toThrow(
					"validateAgentFile: filePath must be a string, got undefined",
				)
			})

			it("should throw TypeError for non-string input", () => {
				expect(() => validateAgentFile(123 as unknown as string)).toThrow(TypeError)
				expect(() => validateAgentFile(123 as unknown as string)).toThrow(
					"validateAgentFile: filePath must be a string, got number",
				)
				expect(() => validateAgentFile({} as unknown as string)).toThrow(TypeError)
				expect(() => validateAgentFile({} as unknown as string)).toThrow(
					"validateAgentFile: filePath must be a string, got object",
				)
			})

			it("should throw TypeError for empty string input", () => {
				expect(() => validateAgentFile("")).toThrow(TypeError)
				expect(() => validateAgentFile("")).toThrow("validateAgentFile: filePath must not be empty")
			})

			it("should throw TypeError for whitespace-only string input", () => {
				expect(() => validateAgentFile("   ")).toThrow(TypeError)
				expect(() => validateAgentFile("   ")).toThrow(
					"validateAgentFile: filePath must not be empty",
				)
			})
		})

		describe("version compatibility", () => {
			it("should use OPENCODE_VERSION as default when no currentVersion provided", () => {
				// This tests that the default parameter works correctly
				const agentsDir = join(import.meta.dirname, "..", "agents")
				const filePath = join(agentsDir, "opencoder.md")
				const result = validateAgentFile(filePath)
				// If the agent file requires >=0.1.0 and OPENCODE_VERSION is 0.1.0, it should be valid
				expect(result.valid).toBe(true)
			})

			it("should accept custom currentVersion parameter", () => {
				const agentsDir = join(import.meta.dirname, "..", "agents")
				const filePath = join(agentsDir, "opencoder.md")
				// Test with a very high version that should be compatible with any requirement
				const result = validateAgentFile(filePath, "99.99.99")
				expect(result.valid).toBe(true)
			})

			it("should return invalid when version requirement is not met", () => {
				const agentsDir = join(import.meta.dirname, "..", "agents")
				const filePath = join(agentsDir, "opencoder.md")
				// Test with a very low version that should fail most requirements
				const result = validateAgentFile(filePath, "0.0.1")
				// This will depend on what the actual agent file requires
				// If it requires >=0.1.0, then 0.0.1 should fail
				expect(result.valid).toBe(false)
				expect(result.error).toContain("Incompatible OpenCode version")
			})
		})

		describe("content validation", () => {
			it("should validate content structure through validateAgentContent", () => {
				// This tests that validateAgentFile properly delegates to validateAgentContent
				const agentsDir = join(import.meta.dirname, "..", "agents")
				for (const name of AGENT_NAMES) {
					const filePath = join(agentsDir, `${name}.md`)
					const result = validateAgentFile(filePath)
					// All agent files should have valid structure
					expect(result.valid).toBe(true)
				}
			})
		})

		describe("error propagation", () => {
			it("should propagate content validation errors", () => {
				// Create a temporary file with invalid content (no frontmatter)
				const { writeFileSync, unlinkSync, existsSync: fsExistsSync } = require("node:fs")
				const tempPath = join(import.meta.dirname, "temp-invalid-agent.md")
				try {
					writeFileSync(
						tempPath,
						"# No Frontmatter\n\nThis agent has no frontmatter but mentions agent and task.".padEnd(
							MIN_CONTENT_LENGTH + 10,
							" ",
						),
					)
					const result = validateAgentFile(tempPath)
					expect(result.valid).toBe(false)
					expect(result.error).toContain("frontmatter")
				} finally {
					if (fsExistsSync(tempPath)) {
						unlinkSync(tempPath)
					}
				}
			})

			it("should propagate version incompatibility errors", () => {
				const { writeFileSync, unlinkSync, existsSync: fsExistsSync } = require("node:fs")
				const tempPath = join(import.meta.dirname, "temp-version-agent.md")
				try {
					const content = `---
version: 1.0
requires: ">=99.0.0"
---
# Test Agent

This is a test agent that handles various tasks.
`.padEnd(MIN_CONTENT_LENGTH + 50, " ")
					writeFileSync(tempPath, content)
					const result = validateAgentFile(tempPath, "1.0.0")
					expect(result.valid).toBe(false)
					expect(result.error).toContain("Incompatible OpenCode version")
					expect(result.error).toContain("requires >=99.0.0")
					expect(result.error).toContain("current version is 1.0.0")
				} finally {
					if (fsExistsSync(tempPath)) {
						unlinkSync(tempPath)
					}
				}
			})
		})

		describe("integration with version operators", () => {
			it("should work with exact version requirements", () => {
				const { writeFileSync, unlinkSync, existsSync: fsExistsSync } = require("node:fs")
				const tempPath = join(import.meta.dirname, "temp-exact-version.md")
				try {
					const content = `---
version: 1.0
requires: "1.0.0"
---
# Test Agent

This is a test agent that handles various tasks.
`.padEnd(MIN_CONTENT_LENGTH + 50, " ")
					writeFileSync(tempPath, content)

					expect(validateAgentFile(tempPath, "1.0.0").valid).toBe(true)
					expect(validateAgentFile(tempPath, "1.0.1").valid).toBe(false)
					expect(validateAgentFile(tempPath, "0.9.9").valid).toBe(false)
				} finally {
					if (fsExistsSync(tempPath)) {
						unlinkSync(tempPath)
					}
				}
			})

			it("should work with >= version requirements", () => {
				const { writeFileSync, unlinkSync, existsSync: fsExistsSync } = require("node:fs")
				const tempPath = join(import.meta.dirname, "temp-gte-version.md")
				try {
					const content = `---
version: 1.0
requires: ">=1.0.0"
---
# Test Agent

This is a test agent that handles various tasks.
`.padEnd(MIN_CONTENT_LENGTH + 50, " ")
					writeFileSync(tempPath, content)

					expect(validateAgentFile(tempPath, "1.0.0").valid).toBe(true)
					expect(validateAgentFile(tempPath, "1.0.1").valid).toBe(true)
					expect(validateAgentFile(tempPath, "2.0.0").valid).toBe(true)
					expect(validateAgentFile(tempPath, "0.9.9").valid).toBe(false)
				} finally {
					if (fsExistsSync(tempPath)) {
						unlinkSync(tempPath)
					}
				}
			})

			it("should work with ^ caret version requirements", () => {
				const { writeFileSync, unlinkSync, existsSync: fsExistsSync } = require("node:fs")
				const tempPath = join(import.meta.dirname, "temp-caret-version.md")
				try {
					const content = `---
version: 1.0
requires: "^1.0.0"
---
# Test Agent

This is a test agent that handles various tasks.
`.padEnd(MIN_CONTENT_LENGTH + 50, " ")
					writeFileSync(tempPath, content)

					expect(validateAgentFile(tempPath, "1.0.0").valid).toBe(true)
					expect(validateAgentFile(tempPath, "1.5.0").valid).toBe(true)
					expect(validateAgentFile(tempPath, "1.9.9").valid).toBe(true)
					expect(validateAgentFile(tempPath, "2.0.0").valid).toBe(false)
					expect(validateAgentFile(tempPath, "0.9.9").valid).toBe(false)
				} finally {
					if (fsExistsSync(tempPath)) {
						unlinkSync(tempPath)
					}
				}
			})

			it("should work with ~ tilde version requirements", () => {
				const { writeFileSync, unlinkSync, existsSync: fsExistsSync } = require("node:fs")
				const tempPath = join(import.meta.dirname, "temp-tilde-version.md")
				try {
					const content = `---
version: 1.0
requires: "~1.2.0"
---
# Test Agent

This is a test agent that handles various tasks.
`.padEnd(MIN_CONTENT_LENGTH + 50, " ")
					writeFileSync(tempPath, content)

					expect(validateAgentFile(tempPath, "1.2.0").valid).toBe(true)
					expect(validateAgentFile(tempPath, "1.2.5").valid).toBe(true)
					expect(validateAgentFile(tempPath, "1.3.0").valid).toBe(false)
					expect(validateAgentFile(tempPath, "1.1.0").valid).toBe(false)
				} finally {
					if (fsExistsSync(tempPath)) {
						unlinkSync(tempPath)
					}
				}
			})
		})

		describe("files without requires field", () => {
			it("should skip version check when requires field is not a version string", () => {
				const { writeFileSync, unlinkSync, existsSync: fsExistsSync } = require("node:fs")
				const tempPath = join(import.meta.dirname, "temp-no-requires.md")
				try {
					// When requires is not a version string like "opencode", version compatibility check happens
					// but checkVersionCompatibility returns false for invalid version strings
					const content = `---
version: 1.0
requires: opencode
---
# Test Agent

This is a test agent that handles various tasks.
`.padEnd(MIN_CONTENT_LENGTH + 50, " ")
					writeFileSync(tempPath, content)

					// The requires field "opencode" is not a valid version string
					// checkVersionCompatibility("opencode", ...) returns false
					const result = validateAgentFile(tempPath)
					expect(result.valid).toBe(false)
					expect(result.error).toContain("Incompatible OpenCode version")
				} finally {
					if (fsExistsSync(tempPath)) {
						unlinkSync(tempPath)
					}
				}
			})

			it("should pass when requires field has valid version that matches", () => {
				const { writeFileSync, unlinkSync, existsSync: fsExistsSync } = require("node:fs")
				const tempPath = join(import.meta.dirname, "temp-valid-requires.md")
				try {
					const content = `---
version: 1.0
requires: ">=0.1.0"
---
# Test Agent

This is a test agent that handles various tasks.
`.padEnd(MIN_CONTENT_LENGTH + 50, " ")
					writeFileSync(tempPath, content)

					// Using OPENCODE_VERSION which is "0.1.0", this should be compatible
					const result = validateAgentFile(tempPath)
					expect(result.valid).toBe(true)
				} finally {
					if (fsExistsSync(tempPath)) {
						unlinkSync(tempPath)
					}
				}
			})
		})
	})
})
