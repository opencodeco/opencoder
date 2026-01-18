/**
 * Tests for builder module
 */

import { beforeEach, describe, expect, test } from "bun:test"
import {
	type EventLogger,
	extractText,
	handleEvent,
	type Part,
	type ServerEvent,
	type TextPart,
} from "../src/builder.ts"

/** Mock logger calls record */
interface MockLoggerCalls {
	stopSpinner: unknown[][]
	stream: unknown[][]
	streamEnd: unknown[][]
	toolCall: unknown[][]
	startSpinner: unknown[][]
	toolResult: unknown[][]
	thinking: unknown[][]
	tokens: unknown[][]
	logError: unknown[][]
	logVerbose: unknown[][]
	fileChange: unknown[][]
	step: unknown[][]
}

/** Create a mock logger that tracks method calls */
function createMockLogger(): EventLogger & { calls: MockLoggerCalls } {
	const calls: MockLoggerCalls = {
		stopSpinner: [],
		stream: [],
		streamEnd: [],
		toolCall: [],
		startSpinner: [],
		toolResult: [],
		thinking: [],
		tokens: [],
		logError: [],
		logVerbose: [],
		fileChange: [],
		step: [],
	}

	return {
		calls,
		stopSpinner: () => {
			calls.stopSpinner.push([])
		},
		stream: (text: string) => {
			calls.stream.push([text])
		},
		streamEnd: () => {
			calls.streamEnd.push([])
		},
		toolCall: (name: string, input?: unknown) => {
			calls.toolCall.push([name, input])
		},
		startSpinner: (message: string) => {
			calls.startSpinner.push([message])
		},
		toolResult: (output: string) => {
			calls.toolResult.push([output])
		},
		thinking: (text: string) => {
			calls.thinking.push([text])
		},
		tokens: (input: number, output: number) => {
			calls.tokens.push([input, output])
		},
		logError: (message: string) => {
			calls.logError.push([message])
		},
		logVerbose: (message: string) => {
			calls.logVerbose.push([message])
		},
		fileChange: (action: string, filePath: string) => {
			calls.fileChange.push([action, filePath])
		},
		step: (action: string, detail?: string) => {
			calls.step.push([action, detail])
		},
	}
}

describe("builder", () => {
	describe("extractText", () => {
		test("extracts text from single text part", () => {
			const parts: Part[] = [{ type: "text", text: "Hello world" }]
			const result = extractText(parts)

			expect(result).toBe("Hello world")
		})

		test("extracts and joins multiple text parts", () => {
			const parts: Part[] = [
				{ type: "text", text: "First line" },
				{ type: "text", text: "Second line" },
				{ type: "text", text: "Third line" },
			]
			const result = extractText(parts)

			expect(result).toBe("First line\nSecond line\nThird line")
		})

		test("filters out non-text parts", () => {
			const parts: Part[] = [
				{ type: "text", text: "Text content" },
				{ type: "tool_call", name: "bash", input: {} },
				{ type: "text", text: "More text" },
				{ type: "thinking", text: "Thinking..." },
			]
			const result = extractText(parts)

			expect(result).toBe("Text content\nMore text")
		})

		test("returns empty string for empty array", () => {
			const parts: Part[] = []
			const result = extractText(parts)

			expect(result).toBe("")
		})

		test("returns empty string when no text parts exist", () => {
			const parts: Part[] = [
				{ type: "tool_call", name: "read", input: {} },
				{ type: "tool_result", output: "file contents" },
			]
			const result = extractText(parts)

			expect(result).toBe("")
		})

		test("handles parts with missing text property", () => {
			const parts: Part[] = [
				{ type: "text", text: "Valid text" },
				{ type: "text" } as unknown as TextPart, // missing text property
				{ type: "text", text: "Another valid text" },
			]
			const result = extractText(parts)

			expect(result).toBe("Valid text\nAnother valid text")
		})

		test("handles parts with non-string text property", () => {
			const parts: Part[] = [
				{ type: "text", text: "Valid text" },
				{ type: "text", text: 123 } as unknown as TextPart, // number instead of string
				{ type: "text", text: "More valid text" },
			]
			const result = extractText(parts)

			expect(result).toBe("Valid text\nMore valid text")
		})

		test("preserves whitespace in text content", () => {
			const parts: Part[] = [
				{ type: "text", text: "  indented text  " },
				{ type: "text", text: "\ttabbed\t" },
			]
			const result = extractText(parts)

			expect(result).toBe("  indented text  \n\ttabbed\t")
		})

		test("handles empty string text parts", () => {
			const parts: Part[] = [
				{ type: "text", text: "First" },
				{ type: "text", text: "" },
				{ type: "text", text: "Last" },
			]
			const result = extractText(parts)

			expect(result).toBe("First\n\nLast")
		})

		test("handles multiline text within a single part", () => {
			const parts: Part[] = [
				{ type: "text", text: "Line 1\nLine 2\nLine 3" },
				{ type: "text", text: "Next part" },
			]
			const result = extractText(parts)

			expect(result).toBe("Line 1\nLine 2\nLine 3\nNext part")
		})
	})

	describe("handleEvent", () => {
		let mockLogger: ReturnType<typeof createMockLogger>

		beforeEach(() => {
			mockLogger = createMockLogger()
		})

		describe("message.part.text", () => {
			test("streams text and stops spinner", () => {
				const event: ServerEvent = {
					type: "message.part.text",
					properties: { text: "Hello world" },
				}

				handleEvent(event, mockLogger)

				expect(mockLogger.calls.stopSpinner.length).toBe(1)
				expect(mockLogger.calls.stream.length).toBe(1)
				expect(mockLogger.calls.stream[0]).toEqual(["Hello world"])
			})

			test("ignores non-string text", () => {
				const event: ServerEvent = {
					type: "message.part.text",
					properties: { text: 123 },
				}

				handleEvent(event, mockLogger)

				expect(mockLogger.calls.stream.length).toBe(0)
			})

			test("ignores missing text property", () => {
				const event: ServerEvent = {
					type: "message.part.text",
					properties: {},
				}

				handleEvent(event, mockLogger)

				expect(mockLogger.calls.stream.length).toBe(0)
			})
		})

		describe("message.part.tool.start", () => {
			test("logs tool call and starts spinner with context", () => {
				const event: ServerEvent = {
					type: "message.part.tool.start",
					properties: { name: "bash", input: { command: "ls" } },
				}

				handleEvent(event, mockLogger)

				expect(mockLogger.calls.stopSpinner.length).toBe(1)
				expect(mockLogger.calls.streamEnd.length).toBe(1)
				expect(mockLogger.calls.toolCall.length).toBe(1)
				expect(mockLogger.calls.toolCall[0]).toEqual(["bash", { command: "ls" }])
				expect(mockLogger.calls.startSpinner.length).toBe(1)
				expect(mockLogger.calls.startSpinner[0]).toEqual(["Running bash: ls..."])
			})

			test("ignores non-string tool name", () => {
				const event: ServerEvent = {
					type: "message.part.tool.start",
					properties: { name: 123 },
				}

				handleEvent(event, mockLogger)

				expect(mockLogger.calls.toolCall.length).toBe(0)
			})

			test("handles tool without input", () => {
				const event: ServerEvent = {
					type: "message.part.tool.start",
					properties: { name: "read" },
				}

				handleEvent(event, mockLogger)

				expect(mockLogger.calls.toolCall.length).toBe(1)
				expect(mockLogger.calls.toolCall[0]).toEqual(["read", undefined])
				expect(mockLogger.calls.startSpinner.length).toBe(1)
				expect(mockLogger.calls.startSpinner[0]).toEqual(["Running read..."])
			})

			test("includes file path in spinner context", () => {
				const event: ServerEvent = {
					type: "message.part.tool.start",
					properties: { name: "read", input: { filePath: "src/config.ts" } },
				}

				handleEvent(event, mockLogger)

				expect(mockLogger.calls.startSpinner.length).toBe(1)
				expect(mockLogger.calls.startSpinner[0]).toEqual(["Running read: src/config.ts..."])
			})

			test("includes pattern in spinner context", () => {
				const event: ServerEvent = {
					type: "message.part.tool.start",
					properties: { name: "glob", input: { pattern: "**/*.ts" } },
				}

				handleEvent(event, mockLogger)

				expect(mockLogger.calls.startSpinner.length).toBe(1)
				expect(mockLogger.calls.startSpinner[0]).toEqual(["Running glob: **/*.ts..."])
			})

			test("truncates long commands in spinner context", () => {
				const longCommand = "a".repeat(60)
				const event: ServerEvent = {
					type: "message.part.tool.start",
					properties: { name: "bash", input: { command: longCommand } },
				}

				handleEvent(event, mockLogger)

				expect(mockLogger.calls.startSpinner.length).toBe(1)
				const spinnerCall = mockLogger.calls.startSpinner[0]
				expect(spinnerCall).toBeDefined()
				const spinnerMsg = spinnerCall?.[0]
				expect(typeof spinnerMsg).toBe("string")
				if (typeof spinnerMsg === "string") {
					expect(spinnerMsg).toContain("Running bash:")
					expect(spinnerMsg).toContain("...")
					expect(spinnerMsg.length).toBeLessThan(longCommand.length + 20)
				}
			})
		})

		describe("message.part.tool.result", () => {
			test("logs tool result", () => {
				const event: ServerEvent = {
					type: "message.part.tool.result",
					properties: { output: "file contents here" },
				}

				handleEvent(event, mockLogger)

				expect(mockLogger.calls.stopSpinner.length).toBe(1)
				expect(mockLogger.calls.toolResult.length).toBe(1)
				expect(mockLogger.calls.toolResult[0]).toEqual(["file contents here"])
			})

			test("ignores empty output", () => {
				const event: ServerEvent = {
					type: "message.part.tool.result",
					properties: { output: "" },
				}

				handleEvent(event, mockLogger)

				expect(mockLogger.calls.stopSpinner.length).toBe(1)
				expect(mockLogger.calls.toolResult.length).toBe(0)
			})

			test("ignores non-string output", () => {
				const event: ServerEvent = {
					type: "message.part.tool.result",
					properties: { output: { data: "object" } },
				}

				handleEvent(event, mockLogger)

				expect(mockLogger.calls.toolResult.length).toBe(0)
			})
		})

		describe("message.part.thinking", () => {
			test("logs thinking text", () => {
				const event: ServerEvent = {
					type: "message.part.thinking",
					properties: { text: "Let me think about this..." },
				}

				handleEvent(event, mockLogger)

				expect(mockLogger.calls.stopSpinner.length).toBe(1)
				expect(mockLogger.calls.thinking.length).toBe(1)
				expect(mockLogger.calls.thinking[0]).toEqual(["Let me think about this..."])
			})

			test("ignores non-string thinking text", () => {
				const event: ServerEvent = {
					type: "message.part.thinking",
					properties: { text: null },
				}

				handleEvent(event, mockLogger)

				expect(mockLogger.calls.thinking.length).toBe(0)
			})
		})

		describe("message.complete", () => {
			test("logs token usage when available", () => {
				const event: ServerEvent = {
					type: "message.complete",
					properties: { usage: { input: 100, output: 50 } },
				}

				handleEvent(event, mockLogger)

				expect(mockLogger.calls.stopSpinner.length).toBe(1)
				expect(mockLogger.calls.streamEnd.length).toBe(1)
				expect(mockLogger.calls.tokens.length).toBe(1)
				expect(mockLogger.calls.tokens[0]).toEqual([100, 50])
			})

			test("handles missing usage data", () => {
				const event: ServerEvent = {
					type: "message.complete",
					properties: {},
				}

				handleEvent(event, mockLogger)

				expect(mockLogger.calls.stopSpinner.length).toBe(1)
				expect(mockLogger.calls.streamEnd.length).toBe(1)
				expect(mockLogger.calls.tokens.length).toBe(0)
			})

			test("handles partial usage data (missing output)", () => {
				const event: ServerEvent = {
					type: "message.complete",
					properties: { usage: { input: 100 } },
				}

				handleEvent(event, mockLogger)

				expect(mockLogger.calls.tokens.length).toBe(0)
			})

			test("handles partial usage data (missing input)", () => {
				const event: ServerEvent = {
					type: "message.complete",
					properties: { usage: { output: 50 } },
				}

				handleEvent(event, mockLogger)

				expect(mockLogger.calls.tokens.length).toBe(0)
			})
		})

		describe("message.error", () => {
			test("logs error message", () => {
				const event: ServerEvent = {
					type: "message.error",
					properties: { message: "Something went wrong" },
				}

				handleEvent(event, mockLogger)

				expect(mockLogger.calls.stopSpinner.length).toBe(1)
				expect(mockLogger.calls.logError.length).toBe(1)
				expect(mockLogger.calls.logError[0]).toEqual(["Something went wrong"])
			})

			test("ignores non-string error message", () => {
				const event: ServerEvent = {
					type: "message.error",
					properties: { message: { code: 500 } },
				}

				handleEvent(event, mockLogger)

				expect(mockLogger.calls.logError.length).toBe(0)
			})
		})

		describe("session events", () => {
			test("handles session.complete", () => {
				const event: ServerEvent = {
					type: "session.complete",
					properties: {},
				}

				handleEvent(event, mockLogger)

				expect(mockLogger.calls.stopSpinner.length).toBe(1)
				expect(mockLogger.calls.logVerbose.length).toBe(1)
				expect(mockLogger.calls.logVerbose[0]).toEqual(["Session session.complete"])
			})

			test("handles session.abort", () => {
				const event: ServerEvent = {
					type: "session.abort",
					properties: {},
				}

				handleEvent(event, mockLogger)

				expect(mockLogger.calls.stopSpinner.length).toBe(1)
				expect(mockLogger.calls.logVerbose.length).toBe(1)
				expect(mockLogger.calls.logVerbose[0]).toEqual(["Session session.abort"])
			})
		})

		describe("unknown events", () => {
			test("logs unknown event types in verbose mode", () => {
				const event: ServerEvent = {
					type: "custom.event",
					properties: {},
				}

				handleEvent(event, mockLogger)

				expect(mockLogger.calls.logVerbose.length).toBe(1)
				expect(mockLogger.calls.logVerbose[0]).toEqual(["Event: custom.event"])
			})

			test("ignores server.* events", () => {
				const event: ServerEvent = {
					type: "server.heartbeat",
					properties: {},
				}

				handleEvent(event, mockLogger)

				expect(mockLogger.calls.logVerbose.length).toBe(0)
			})

			test("ignores noisy events like message.part.updated", () => {
				const event: ServerEvent = {
					type: "message.part.updated",
					properties: {},
				}

				handleEvent(event, mockLogger)

				expect(mockLogger.calls.logVerbose.length).toBe(0)
			})

			test("ignores session.updated events", () => {
				const event: ServerEvent = {
					type: "session.updated",
					properties: {},
				}

				handleEvent(event, mockLogger)

				expect(mockLogger.calls.logVerbose.length).toBe(0)
			})

			test("handles undefined event type", () => {
				const event: ServerEvent = {
					properties: {},
				}

				handleEvent(event, mockLogger)

				expect(mockLogger.calls.logVerbose.length).toBe(0)
			})

			test("handles empty event type", () => {
				const event: ServerEvent = {
					type: "",
					properties: {},
				}

				handleEvent(event, mockLogger)

				expect(mockLogger.calls.logVerbose.length).toBe(0)
			})
		})

		describe("file events", () => {
			test("logs file.edited with path property", () => {
				const event: ServerEvent = {
					type: "file.edited",
					properties: { path: "src/index.ts" },
				}

				handleEvent(event, mockLogger)

				expect(mockLogger.calls.fileChange.length).toBe(1)
				expect(mockLogger.calls.fileChange[0]).toEqual(["Edited", "src/index.ts"])
			})

			test("logs file.edited with filePath property", () => {
				const event: ServerEvent = {
					type: "file.edited",
					properties: { filePath: "src/config.ts" },
				}

				handleEvent(event, mockLogger)

				expect(mockLogger.calls.fileChange.length).toBe(1)
				expect(mockLogger.calls.fileChange[0]).toEqual(["Edited", "src/config.ts"])
			})

			test("logs file.created event", () => {
				const event: ServerEvent = {
					type: "file.created",
					properties: { path: "src/new-file.ts" },
				}

				handleEvent(event, mockLogger)

				expect(mockLogger.calls.fileChange.length).toBe(1)
				expect(mockLogger.calls.fileChange[0]).toEqual(["Created", "src/new-file.ts"])
			})

			test("logs file.deleted event", () => {
				const event: ServerEvent = {
					type: "file.deleted",
					properties: { path: "src/old-file.ts" },
				}

				handleEvent(event, mockLogger)

				expect(mockLogger.calls.fileChange.length).toBe(1)
				expect(mockLogger.calls.fileChange[0]).toEqual(["Deleted", "src/old-file.ts"])
			})

			test("ignores file.edited without path", () => {
				const event: ServerEvent = {
					type: "file.edited",
					properties: {},
				}

				handleEvent(event, mockLogger)

				expect(mockLogger.calls.fileChange.length).toBe(0)
			})
		})

		describe("session.status events", () => {
			test("logs session status changes", () => {
				const event: ServerEvent = {
					type: "session.status",
					properties: { status: "running" },
				}

				handleEvent(event, mockLogger)

				expect(mockLogger.calls.step.length).toBe(1)
				expect(mockLogger.calls.step[0]).toEqual(["Session", "running"])
			})

			test("ignores idle status", () => {
				const event: ServerEvent = {
					type: "session.status",
					properties: { status: "idle" },
				}

				handleEvent(event, mockLogger)

				expect(mockLogger.calls.step.length).toBe(0)
			})

			test("ignores non-string status", () => {
				const event: ServerEvent = {
					type: "session.status",
					properties: { status: 123 },
				}

				handleEvent(event, mockLogger)

				expect(mockLogger.calls.step.length).toBe(0)
			})
		})

		describe("edge cases", () => {
			test("handles event with no properties", () => {
				const event: ServerEvent = {
					type: "message.part.text",
				}

				handleEvent(event, mockLogger)

				// Should not throw, text should not be streamed
				expect(mockLogger.calls.stream.length).toBe(0)
			})

			test("handles completely empty event", () => {
				const event: ServerEvent = {}

				// Should not throw
				handleEvent(event, mockLogger)

				expect(mockLogger.calls.logVerbose.length).toBe(0)
			})
		})
	})
})
