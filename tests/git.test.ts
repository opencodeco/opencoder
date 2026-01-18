/**
 * Tests for git.ts module
 */

import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test"
import { execSync } from "node:child_process"
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import {
	commitChanges,
	generateCommitMessage,
	hasChanges,
	hasUnpushedCommits,
	pushChanges,
} from "../src/git.ts"
import type { Logger } from "../src/logger.ts"

const TEST_DIR = "/tmp/opencoder-test-git"

describe("git", () => {
	describe("hasChanges", () => {
		beforeEach(() => {
			// Create a test directory with git repo
			if (existsSync(TEST_DIR)) {
				rmSync(TEST_DIR, { recursive: true })
			}
			mkdirSync(TEST_DIR, { recursive: true })
			execSync("git init", { cwd: TEST_DIR })
			execSync('git config user.email "test@test.com"', { cwd: TEST_DIR })
			execSync('git config user.name "Test User"', { cwd: TEST_DIR })
		})

		afterEach(() => {
			if (existsSync(TEST_DIR)) {
				rmSync(TEST_DIR, { recursive: true })
			}
		})

		test("returns false for clean repo", () => {
			// Create initial commit so repo is not empty
			writeFileSync(join(TEST_DIR, "README.md"), "# Test")
			execSync("git add . && git commit -m 'Initial commit'", { cwd: TEST_DIR })

			expect(hasChanges(TEST_DIR)).toBe(false)
		})

		test("returns true for untracked files", () => {
			// Create initial commit
			writeFileSync(join(TEST_DIR, "README.md"), "# Test")
			execSync("git add . && git commit -m 'Initial commit'", { cwd: TEST_DIR })

			// Add untracked file
			writeFileSync(join(TEST_DIR, "new-file.txt"), "new content")

			expect(hasChanges(TEST_DIR)).toBe(true)
		})

		test("returns true for modified files", () => {
			// Create initial commit
			writeFileSync(join(TEST_DIR, "README.md"), "# Test")
			execSync("git add . && git commit -m 'Initial commit'", { cwd: TEST_DIR })

			// Modify file
			writeFileSync(join(TEST_DIR, "README.md"), "# Modified")

			expect(hasChanges(TEST_DIR)).toBe(true)
		})

		test("returns true for staged files", () => {
			// Create initial commit
			writeFileSync(join(TEST_DIR, "README.md"), "# Test")
			execSync("git add . && git commit -m 'Initial commit'", { cwd: TEST_DIR })

			// Stage a change
			writeFileSync(join(TEST_DIR, "README.md"), "# Staged")
			execSync("git add README.md", { cwd: TEST_DIR })

			expect(hasChanges(TEST_DIR)).toBe(true)
		})

		test("returns false for non-git directory", () => {
			const nonGitDir = "/tmp/opencoder-test-non-git"
			if (existsSync(nonGitDir)) {
				rmSync(nonGitDir, { recursive: true })
			}
			mkdirSync(nonGitDir, { recursive: true })

			expect(hasChanges(nonGitDir)).toBe(false)

			rmSync(nonGitDir, { recursive: true })
		})

		test("returns false for non-existent directory", () => {
			expect(hasChanges("/tmp/does-not-exist-xyz")).toBe(false)
		})
	})

	describe("generateCommitMessage", () => {
		test("generates fix prefix for bug-related tasks", () => {
			expect(generateCommitMessage("fix the login bug")).toBe("fix: fix the login bug")
			expect(generateCommitMessage("Fix null pointer exception")).toBe(
				"fix: Fix null pointer exception",
			)
			expect(generateCommitMessage("Resolve the timeout issue")).toBe(
				"fix: Resolve the timeout issue",
			)
			expect(generateCommitMessage("Address bug in parser")).toBe("fix: Address bug in parser")
			expect(generateCommitMessage("Issue with authentication")).toBe(
				"fix: Issue with authentication",
			)
		})

		test("generates feat prefix for feature-related tasks", () => {
			expect(generateCommitMessage("Add new login feature")).toBe("feat: Add new login feature")
			expect(generateCommitMessage("Implement user dashboard")).toBe(
				"feat: Implement user dashboard",
			)
			expect(generateCommitMessage("new API endpoint for users")).toBe(
				"feat: new API endpoint for users",
			)
			// Note: If description already has prefix, it will be doubled
			expect(generateCommitMessage("dark mode support")).toBe("feat: dark mode support")
		})

		test("generates test prefix for test-related tasks", () => {
			expect(generateCommitMessage("Add unit tests for parser")).toBe(
				"test: Add unit tests for parser",
			)
			expect(generateCommitMessage("Write spec for login component")).toBe(
				"test: Write spec for login component",
			)
			expect(generateCommitMessage("Improve test coverage")).toBe("test: Improve test coverage")
		})

		test("generates docs prefix for documentation tasks", () => {
			expect(generateCommitMessage("Update README with instructions")).toBe(
				"docs: Update README with instructions",
			)
			expect(generateCommitMessage("Add documentation for API")).toBe(
				"docs: Add documentation for API",
			)
			expect(generateCommitMessage("Add code comments")).toBe("docs: Add code comments")
		})

		test("generates refactor prefix for refactoring tasks", () => {
			expect(generateCommitMessage("Refactor the auth module")).toBe(
				"refactor: Refactor the auth module",
			)
			expect(generateCommitMessage("Rewrite parser for clarity")).toBe(
				"refactor: Rewrite parser for clarity",
			)
			expect(generateCommitMessage("Restructure project layout")).toBe(
				"refactor: Restructure project layout",
			)
			expect(generateCommitMessage("Improve code organization")).toBe(
				"refactor: Improve code organization",
			)
		})

		test("defaults to feat for unrecognized patterns", () => {
			expect(generateCommitMessage("Some random task")).toBe("feat: Some random task")
			expect(generateCommitMessage("Random work")).toBe("feat: Random work")
		})

		test("is case insensitive", () => {
			expect(generateCommitMessage("FIX THE BUG")).toBe("fix: FIX THE BUG")
			expect(generateCommitMessage("ADD NEW FEATURE")).toBe("feat: ADD NEW FEATURE")
			expect(generateCommitMessage("REFACTOR CODE")).toBe("refactor: REFACTOR CODE")
		})
	})

	describe("commitChanges", () => {
		let mockLogger: Logger
		let testGitDir: string

		beforeEach(() => {
			// Create mock logger
			mockLogger = {
				log: mock(() => {}),
				logError: mock(() => {}),
				logVerbose: mock(() => {}),
				say: mock(() => {}),
				info: mock(() => {}),
				success: mock(() => {}),
				warn: mock(() => {}),
				alert: mock(() => {}),
				flush: mock(() => {}),
				setCycleLog: mock(() => {}),
				cleanup: mock(() => 0),
			} as unknown as Logger

			// Create a test git repository
			testGitDir = "/tmp/opencoder-test-git-commit"
			if (existsSync(testGitDir)) {
				rmSync(testGitDir, { recursive: true })
			}
			mkdirSync(testGitDir, { recursive: true })
			execSync("git init", { cwd: testGitDir })
			execSync('git config user.email "test@test.com"', { cwd: testGitDir })
			execSync('git config user.name "Test User"', { cwd: testGitDir })
		})

		afterEach(() => {
			if (existsSync(testGitDir)) {
				rmSync(testGitDir, { recursive: true })
			}
		})

		test("commits changes without signoff", () => {
			// Create a file to commit
			writeFileSync(join(testGitDir, "test.txt"), "test content")

			commitChanges(testGitDir, mockLogger, "feat: add test file", false)

			// Verify commit was created
			const log = execSync("git log --oneline", { cwd: testGitDir, encoding: "utf-8" })
			expect(log).toContain("feat: add test file")

			// Verify logger was called
			expect(mockLogger.log).toHaveBeenCalledWith("Committed: feat: add test file")

			// Verify no signoff in commit message
			const fullLog = execSync("git log --format=%B -n 1", {
				cwd: testGitDir,
				encoding: "utf-8",
			})
			expect(fullLog).not.toContain("Signed-off-by")
		})

		test("commits changes with signoff", () => {
			// Create a file to commit
			writeFileSync(join(testGitDir, "test2.txt"), "test content 2")

			commitChanges(testGitDir, mockLogger, "fix: bug fix", true)

			// Verify commit was created
			const log = execSync("git log --oneline", { cwd: testGitDir, encoding: "utf-8" })
			expect(log).toContain("fix: bug fix")

			// Verify logger was called
			expect(mockLogger.log).toHaveBeenCalledWith("Committed: fix: bug fix")

			// Verify signoff in commit message
			const fullLog = execSync("git log --format=%B -n 1", {
				cwd: testGitDir,
				encoding: "utf-8",
			})
			expect(fullLog).toContain("Signed-off-by: Test User <test@test.com>")
		})

		test("logs error when commit fails (no changes)", () => {
			// Try to commit with no changes (should fail)
			commitChanges(testGitDir, mockLogger, "feat: nothing to commit", false)

			// Verify error was logged
			expect(mockLogger.logError).toHaveBeenCalledWith(expect.stringContaining("Failed to commit"))
		})

		test("logs error for non-git directory", () => {
			const nonGitDir = "/tmp/opencoder-test-non-git-commit"
			if (existsSync(nonGitDir)) {
				rmSync(nonGitDir, { recursive: true })
			}
			mkdirSync(nonGitDir, { recursive: true })

			commitChanges(nonGitDir, mockLogger, "feat: test", false)

			// Verify error was logged
			expect(mockLogger.logError).toHaveBeenCalledWith(expect.stringContaining("Failed to commit"))

			rmSync(nonGitDir, { recursive: true })
		})
	})

	describe("pushChanges", () => {
		let mockLogger: Logger
		let testGitDir: string

		beforeEach(() => {
			// Create mock logger
			mockLogger = {
				log: mock(() => {}),
				logError: mock(() => {}),
				logVerbose: mock(() => {}),
				say: mock(() => {}),
				info: mock(() => {}),
				success: mock(() => {}),
				warn: mock(() => {}),
				alert: mock(() => {}),
				flush: mock(() => {}),
				setCycleLog: mock(() => {}),
				cleanup: mock(() => 0),
			} as unknown as Logger

			// Create a test git repository
			testGitDir = "/tmp/opencoder-test-git-push"
			if (existsSync(testGitDir)) {
				rmSync(testGitDir, { recursive: true })
			}
			mkdirSync(testGitDir, { recursive: true })
			execSync("git init", { cwd: testGitDir })
			execSync('git config user.email "test@test.com"', { cwd: testGitDir })
			execSync('git config user.name "Test User"', { cwd: testGitDir })
		})

		afterEach(() => {
			if (existsSync(testGitDir)) {
				rmSync(testGitDir, { recursive: true })
			}
		})

		test("logs error when push fails (no remote)", () => {
			// Try to push without remote configured (should fail)
			pushChanges(testGitDir, mockLogger)

			// Verify error was logged
			expect(mockLogger.logError).toHaveBeenCalledWith(expect.stringContaining("Failed to push"))
		})

		test("logs error for non-git directory", () => {
			const nonGitDir = "/tmp/opencoder-test-non-git-push"
			if (existsSync(nonGitDir)) {
				rmSync(nonGitDir, { recursive: true })
			}
			mkdirSync(nonGitDir, { recursive: true })

			pushChanges(nonGitDir, mockLogger)

			// Verify error was logged
			expect(mockLogger.logError).toHaveBeenCalledWith(expect.stringContaining("Failed to push"))

			rmSync(nonGitDir, { recursive: true })
		})
	})

	describe("hasUnpushedCommits", () => {
		let testGitDir: string

		beforeEach(() => {
			// Create a test git repository
			testGitDir = "/tmp/opencoder-test-git-unpushed"
			if (existsSync(testGitDir)) {
				rmSync(testGitDir, { recursive: true })
			}
			mkdirSync(testGitDir, { recursive: true })
			execSync("git init", { cwd: testGitDir })
			execSync('git config user.email "test@test.com"', { cwd: testGitDir })
			execSync('git config user.name "Test User"', { cwd: testGitDir })
		})

		afterEach(() => {
			if (existsSync(testGitDir)) {
				rmSync(testGitDir, { recursive: true })
			}
		})

		test("returns false for non-git directory", () => {
			const nonGitDir = "/tmp/opencoder-test-non-git-unpushed"
			if (existsSync(nonGitDir)) {
				rmSync(nonGitDir, { recursive: true })
			}
			mkdirSync(nonGitDir, { recursive: true })

			expect(hasUnpushedCommits(nonGitDir)).toBe(false)

			rmSync(nonGitDir, { recursive: true })
		})

		test("returns false for non-existent directory", () => {
			expect(hasUnpushedCommits("/tmp/does-not-exist-xyz")).toBe(false)
		})

		test("returns false when no upstream is configured", () => {
			// Create a commit but no upstream
			writeFileSync(join(testGitDir, "test.txt"), "test content")
			execSync("git add . && git commit -m 'Initial commit'", { cwd: testGitDir })

			expect(hasUnpushedCommits(testGitDir)).toBe(false)
		})

		test("returns false for empty repo", () => {
			expect(hasUnpushedCommits(testGitDir)).toBe(false)
		})
	})

	describe("commitChanges with special characters", () => {
		let mockLogger: Logger
		let testGitDir: string

		beforeEach(() => {
			mockLogger = {
				log: mock(() => {}),
				logError: mock(() => {}),
				logVerbose: mock(() => {}),
				say: mock(() => {}),
				info: mock(() => {}),
				success: mock(() => {}),
				warn: mock(() => {}),
				alert: mock(() => {}),
				flush: mock(() => {}),
				setCycleLog: mock(() => {}),
				cleanup: mock(() => 0),
			} as unknown as Logger

			testGitDir = "/tmp/opencoder-test-git-special"
			if (existsSync(testGitDir)) {
				rmSync(testGitDir, { recursive: true })
			}
			mkdirSync(testGitDir, { recursive: true })
			execSync("git init", { cwd: testGitDir })
			execSync('git config user.email "test@test.com"', { cwd: testGitDir })
			execSync('git config user.name "Test User"', { cwd: testGitDir })
		})

		afterEach(() => {
			if (existsSync(testGitDir)) {
				rmSync(testGitDir, { recursive: true })
			}
		})

		test("handles double quotes in commit message", () => {
			writeFileSync(join(testGitDir, "test.txt"), "test content")

			commitChanges(testGitDir, mockLogger, 'feat: add "quoted" feature', false)

			const log = execSync("git log --oneline", { cwd: testGitDir, encoding: "utf-8" })
			expect(log).toContain('add "quoted" feature')
		})

		test("handles dollar signs in commit message", () => {
			writeFileSync(join(testGitDir, "test.txt"), "test content")

			commitChanges(testGitDir, mockLogger, "feat: update $variable handling", false)

			const log = execSync("git log --format=%B -n 1", { cwd: testGitDir, encoding: "utf-8" })
			expect(log).toContain("$variable")
		})

		test("handles backticks in commit message", () => {
			writeFileSync(join(testGitDir, "test.txt"), "test content")

			commitChanges(testGitDir, mockLogger, "feat: add `code` formatting", false)

			const log = execSync("git log --format=%B -n 1", { cwd: testGitDir, encoding: "utf-8" })
			expect(log).toContain("`code`")
		})

		test("handles backslashes in commit message", () => {
			writeFileSync(join(testGitDir, "test.txt"), "test content")

			commitChanges(testGitDir, mockLogger, "feat: fix path\\to\\file handling", false)

			const log = execSync("git log --format=%B -n 1", { cwd: testGitDir, encoding: "utf-8" })
			expect(log).toContain("path\\to\\file")
		})
	})
})
