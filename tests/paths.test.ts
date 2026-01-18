import { describe, expect, it } from "bun:test"
import { homedir } from "node:os"
import { join } from "node:path"
import {
	AGENTS_TARGET_DIR,
	checkVersionCompatibility,
	createLogger,
	getAgentsSourceDir,
	getErrorMessage,
	getPackageRoot,
	isTransientError,
	MIN_CONTENT_LENGTH,
	parseCliFlags,
	parseFrontmatter,
	REQUIRED_FRONTMATTER_FIELDS,
	REQUIRED_KEYWORDS,
	retryOnTransientError,
	TRANSIENT_ERROR_CODES,
	validateAgentContent,
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

		it("should return operation not permitted message for EPERM error", () => {
			const error = Object.assign(new Error("EPERM"), { code: "EPERM" })
			const result = getErrorMessage(error, testFile, testTargetPath)
			expect(result).toBe("Operation not permitted. The file may be in use or locked")
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
			expect(result).toBe("Permission denied. Check write permissions for /very/deep/nested/path")
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
	})

	describe("constants", () => {
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
	})

	describe("parseFrontmatter", () => {
		it("should return found: false when content does not start with ---", () => {
			const result = parseFrontmatter("# No frontmatter")
			expect(result.found).toBe(false)
			expect(result.fields).toEqual({})
			expect(result.endIndex).toBe(0)
		})

		it("should return found: false when closing --- is missing", () => {
			const result = parseFrontmatter("---\nversion: 1.0\nno closing delimiter")
			expect(result.found).toBe(false)
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

		it("should return valid: false when frontmatter is missing", () => {
			const content =
				"# No Frontmatter Agent\n\nThis agent has no frontmatter but is an agent for tasks.".padEnd(
					MIN_CONTENT_LENGTH + 10,
					" ",
				)
			const result = validateAgentContent(content)
			expect(result.valid).toBe(false)
			expect(result.error).toContain("YAML frontmatter")
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
				expect(checkVersionCompatibility(">=1.0.0", "")).toBe(false)
			})

			it("should return false for invalid required version", () => {
				expect(checkVersionCompatibility("invalid", "1.0.0")).toBe(false)
				expect(checkVersionCompatibility(">=invalid", "1.0.0")).toBe(false)
				expect(checkVersionCompatibility("^", "1.0.0")).toBe(false)
				expect(checkVersionCompatibility("", "1.0.0")).toBe(false)
			})
		})
	})

	describe("parseCliFlags", () => {
		it("should return all false flags for empty argv", () => {
			const result = parseCliFlags([])
			expect(result).toEqual({ dryRun: false, verbose: false, help: false })
		})

		it("should return all false flags for argv without flags", () => {
			const result = parseCliFlags(["node", "script.js"])
			expect(result).toEqual({ dryRun: false, verbose: false, help: false })
		})

		it("should detect --dry-run flag", () => {
			const result = parseCliFlags(["node", "script.js", "--dry-run"])
			expect(result.dryRun).toBe(true)
			expect(result.verbose).toBe(false)
			expect(result.help).toBe(false)
		})

		it("should detect --verbose flag", () => {
			const result = parseCliFlags(["node", "script.js", "--verbose"])
			expect(result.dryRun).toBe(false)
			expect(result.verbose).toBe(true)
			expect(result.help).toBe(false)
		})

		it("should detect --help flag", () => {
			const result = parseCliFlags(["node", "script.js", "--help"])
			expect(result.dryRun).toBe(false)
			expect(result.verbose).toBe(false)
			expect(result.help).toBe(true)
		})

		it("should detect multiple flags", () => {
			const result = parseCliFlags(["node", "script.js", "--dry-run", "--verbose"])
			expect(result.dryRun).toBe(true)
			expect(result.verbose).toBe(true)
			expect(result.help).toBe(false)
		})

		it("should detect all flags", () => {
			const result = parseCliFlags(["node", "script.js", "--dry-run", "--verbose", "--help"])
			expect(result).toEqual({ dryRun: true, verbose: true, help: true })
		})

		it("should ignore unknown flags", () => {
			const result = parseCliFlags(["node", "script.js", "--unknown", "--other"])
			expect(result).toEqual({ dryRun: false, verbose: false, help: false })
		})

		it("should handle flags in any position", () => {
			const result = parseCliFlags(["--verbose", "node", "--dry-run", "script.js", "--help"])
			expect(result).toEqual({ dryRun: true, verbose: true, help: true })
		})

		it("should not match partial flag names", () => {
			const result = parseCliFlags(["node", "script.js", "--dry-run-test", "--verbosity"])
			expect(result.dryRun).toBe(false)
			expect(result.verbose).toBe(false)
		})
	})

	describe("createLogger", () => {
		it("should return an object with log and verbose methods", () => {
			const logger = createLogger(false)
			expect(typeof logger.log).toBe("function")
			expect(typeof logger.verbose).toBe("function")
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
	})
})
