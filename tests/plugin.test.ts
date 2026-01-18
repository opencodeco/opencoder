import { describe, expect, it } from "bun:test"
import type { PluginInput } from "@opencode-ai/plugin"
import type { Event } from "@opencode-ai/sdk"
import { OpenCoderPlugin } from "../src/plugin"

describe("OpenCoderPlugin", () => {
	// Create a mock context (minimal implementation for testing)
	const createMockContext = () =>
		({
			project: {},
			client: {},
			$: () => {},
			directory: "/tmp/test-project",
			worktree: "/tmp/test-project",
			serverUrl: new URL("http://localhost:3000"),
		}) as unknown as PluginInput

	it("should be an async function", () => {
		expect(OpenCoderPlugin).toBeInstanceOf(Function)
	})

	it("should return a hooks object when called", async () => {
		const result = await OpenCoderPlugin(createMockContext())

		expect(result).toBeDefined()
		expect(typeof result).toBe("object")
	})

	it("should return hooks object with lifecycle callbacks", async () => {
		const result = await OpenCoderPlugin(createMockContext())

		// Verify expected hooks are present
		expect(result.event).toBeDefined()
		expect(typeof result.event).toBe("function")
		expect(result["tool.execute.before"]).toBeDefined()
		expect(typeof result["tool.execute.before"]).toBe("function")
		expect(result["tool.execute.after"]).toBeDefined()
		expect(typeof result["tool.execute.after"]).toBe("function")
	})

	it("should have callable event hook", async () => {
		const result = await OpenCoderPlugin(createMockContext())

		// Event hook should be callable without throwing
		const mockEvent: Event = {
			type: "session.idle",
			properties: { sessionID: "test-123" },
		}
		await expect(result.event?.({ event: mockEvent })).resolves.toBeUndefined()
	})

	it("should have callable tool.execute.before hook", async () => {
		const result = await OpenCoderPlugin(createMockContext())

		const input = { tool: "bash", sessionID: "test-123", callID: "call-456" }
		const output = { args: { command: "ls" } }

		await expect(result["tool.execute.before"]?.(input, output)).resolves.toBeUndefined()
	})

	it("should have callable tool.execute.after hook", async () => {
		const result = await OpenCoderPlugin(createMockContext())

		const input = { tool: "bash", sessionID: "test-123", callID: "call-456" }
		const output = { title: "Command executed", output: "file1.txt\nfile2.txt", metadata: {} }

		await expect(result["tool.execute.after"]?.(input, output)).resolves.toBeUndefined()
	})
})
