import { describe, expect, it } from "bun:test"
import { OpenCoderPlugin } from "../src/plugin"

describe("OpenCoderPlugin", () => {
	it("should be an async function", () => {
		expect(OpenCoderPlugin).toBeInstanceOf(Function)
	})

	it("should return a hooks object when called", async () => {
		// Create a mock context (minimal implementation)
		const mockContext = {
			project: {},
			client: {},
			$: () => {},
			directory: "/tmp",
			worktree: "/tmp",
		}

		const result = await OpenCoderPlugin(mockContext as Parameters<typeof OpenCoderPlugin>[0])

		expect(result).toBeDefined()
		expect(typeof result).toBe("object")
	})

	it("should return an empty hooks object (minimal implementation)", async () => {
		const mockContext = {
			project: {},
			client: {},
			$: () => {},
			directory: "/tmp",
			worktree: "/tmp",
		}

		const result = await OpenCoderPlugin(mockContext as Parameters<typeof OpenCoderPlugin>[0])

		expect(Object.keys(result)).toHaveLength(0)
	})
})
