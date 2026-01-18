/**
 * OpenCode SDK build module with live event streaming
 */

import { createOpencode } from "@opencode-ai/sdk"
import { parseModel } from "./config.ts"
import type { Logger } from "./logger.ts"
import {
	extractPlanFromResponse,
	generateEvalPrompt,
	generateIdeaPlanPrompt,
	generateIdeaSelectionPrompt,
	generatePlanPrompt,
	generateTaskPrompt,
} from "./plan.ts"
import type { BuildResult, Config, SessionStats } from "./types.ts"

/** Type for the OpenCode client */
type Client = Awaited<ReturnType<typeof createOpencode>>["client"]

/** Type for the OpenCode server */
type Server = Awaited<ReturnType<typeof createOpencode>>["server"]

/** Message part with text */
export interface TextPart {
	type: "text"
	text: string
}

/** Message part (union type) */
export type Part = TextPart | { type: string; [key: string]: unknown }

/**
 * Extract text content from message parts
 */
export function extractText(parts: Part[] | undefined | null): string {
	if (!parts || !Array.isArray(parts)) {
		return ""
	}
	return parts
		.filter((p): p is TextPart => p.type === "text" && typeof p.text === "string")
		.map((p) => p.text)
		.join("\n")
}

/** Event from the OpenCode server */
export interface ServerEvent {
	type?: string
	properties?: Record<string, unknown>
}

/** Logger interface for event handling */
export interface EventLogger {
	stopSpinner(): void
	stream(text: string): void
	streamEnd(): void
	toolCall(name: string, input?: unknown): void
	startSpinner(message: string): void
	toolResult(output: string): void
	thinking(text: string): void
	tokens(input: number, output: number): void
	logError(message: string): void
	logVerbose(message: string): void
	fileChange(action: string, filePath: string): void
	step(action: string, detail?: string): void
}

/**
 * Model pricing per million tokens (approximate, as of 2024)
 * Format: { input: $/1M tokens, output: $/1M tokens }
 */
const MODEL_PRICING: Record<string, { input: number; output: number }> = {
	// Claude models
	"claude-opus-4": { input: 15.0, output: 75.0 },
	"claude-sonnet-4": { input: 3.0, output: 15.0 },
	"claude-3-5-sonnet": { input: 3.0, output: 15.0 },
	"claude-3-opus": { input: 15.0, output: 75.0 },
	"claude-3-sonnet": { input: 3.0, output: 15.0 },
	"claude-3-haiku": { input: 0.25, output: 1.25 },
	// GPT models
	"gpt-4o": { input: 2.5, output: 10.0 },
	"gpt-4o-mini": { input: 0.15, output: 0.6 },
	"gpt-4-turbo": { input: 10.0, output: 30.0 },
	"gpt-4": { input: 30.0, output: 60.0 },
	"gpt-3.5-turbo": { input: 0.5, output: 1.5 },
	// Default fallback for unknown models
	default: { input: 3.0, output: 15.0 },
}

/**
 * Estimate cost based on model and token usage
 */
export function estimateCost(model: string, inputTokens: number, outputTokens: number): number {
	// Extract model ID from provider/model format
	const modelId = model.includes("/") ? model.split("/")[1] : model

	// Find matching pricing (check if model name contains any of our known models)
	let pricing = MODEL_PRICING.default
	if (modelId) {
		for (const [key, value] of Object.entries(MODEL_PRICING)) {
			if (key !== "default" && modelId.toLowerCase().includes(key.toLowerCase())) {
				pricing = value
				break
			}
		}
	}

	// Calculate cost (pricing is per million tokens)
	const inputCost = (inputTokens / 1_000_000) * (pricing?.input ?? 3.0)
	const outputCost = (outputTokens / 1_000_000) * (pricing?.output ?? 15.0)

	return inputCost + outputCost
}

/**
 * Create initial session stats
 */
export function createSessionStats(): SessionStats {
	return {
		toolCalls: 0,
		inputTokens: 0,
		outputTokens: 0,
		costUsd: 0,
		filesModified: [],
		startTime: Date.now(),
	}
}

/**
 * Extract contextual information from tool input for display
 */
function extractToolContext(input: unknown): string {
	if (typeof input === "string") {
		return input.length > 50 ? `${input.slice(0, 50)}...` : input
	}
	if (typeof input === "object" && input !== null) {
		const obj = input as Record<string, unknown>
		// Extract key parameters for common tools
		if ("filePath" in obj) return String(obj.filePath)
		if ("path" in obj) return String(obj.path)
		if ("pattern" in obj) return String(obj.pattern)
		if ("command" in obj) {
			const cmd = String(obj.command)
			return cmd.length > 50 ? `${cmd.slice(0, 50)}...` : cmd
		}
		if ("query" in obj) return `"${obj.query}"`
	}
	return ""
}

/** Events that are too noisy to show even in verbose mode */
const NOISY_EVENTS = new Set([
	"message.part.updated",
	"session.updated",
	"session.diff",
	"lsp.updated",
	"lsp.client.diagnostics",
])

/** Events that indicate important state changes */
const IMPORTANT_EVENTS = new Set([
	"session.created",
	"session.status",
	"session.idle",
	"file.edited",
	"file.created",
	"file.deleted",
])

/** Callback for tracking session stats from events */
export type StatsCallback = (update: {
	toolCall?: boolean
	inputTokens?: number
	outputTokens?: number
	fileModified?: string
}) => void

/**
 * Handle a single event from the server stream
 */
export function handleEvent(
	event: ServerEvent,
	logger: EventLogger,
	onStats?: StatsCallback,
): void {
	const { type, properties } = event

	switch (type) {
		case "message.part.text": {
			// Stream text output in real-time
			const text = properties?.text
			if (typeof text === "string") {
				logger.stopSpinner()
				logger.stream(text)
			}
			break
		}

		case "message.part.tool.start": {
			const name = properties?.name
			const input = properties?.input
			if (typeof name === "string") {
				logger.stopSpinner()
				logger.streamEnd()
				logger.toolCall(name, input)
				// Track tool call in stats
				onStats?.({ toolCall: true })
				// Build spinner message with context from tool input
				const context = extractToolContext(input)
				const spinnerMsg = context ? `Running ${name}: ${context}...` : `Running ${name}...`
				logger.startSpinner(spinnerMsg)
			}
			break
		}

		case "message.part.tool.result": {
			logger.stopSpinner()
			const output = properties?.output
			if (typeof output === "string" && output.length > 0) {
				logger.toolResult(output)
			}
			break
		}

		case "message.part.thinking": {
			const text = properties?.text
			if (typeof text === "string") {
				logger.stopSpinner()
				logger.thinking(text)
			}
			break
		}

		case "message.complete": {
			logger.stopSpinner()
			logger.streamEnd()
			const usage = properties?.usage as { input?: number; output?: number } | undefined
			if (usage?.input !== undefined && usage?.output !== undefined) {
				logger.tokens(usage.input, usage.output)
				// Track token usage in stats
				onStats?.({ inputTokens: usage.input, outputTokens: usage.output })
			}
			break
		}

		case "message.error": {
			logger.stopSpinner()
			const message = properties?.message
			if (typeof message === "string") {
				logger.logError(message)
			}
			break
		}

		case "file.edited": {
			const filePath = properties?.path || properties?.filePath
			if (typeof filePath === "string") {
				logger.fileChange("Edited", filePath)
				onStats?.({ fileModified: filePath })
			}
			break
		}

		case "file.created": {
			const filePath = properties?.path || properties?.filePath
			if (typeof filePath === "string") {
				logger.fileChange("Created", filePath)
				onStats?.({ fileModified: filePath })
			}
			break
		}

		case "file.deleted": {
			const filePath = properties?.path || properties?.filePath
			if (typeof filePath === "string") {
				logger.fileChange("Deleted", filePath)
				onStats?.({ fileModified: filePath })
			}
			break
		}

		case "session.status": {
			const status = properties?.status
			if (typeof status === "string" && status !== "idle") {
				logger.step("Session", status)
			}
			break
		}

		case "session.complete":
		case "session.abort":
			// Session ended
			logger.stopSpinner()
			logger.logVerbose(`Session ${type}`)
			break

		default:
			// Filter out noisy events
			if (type && NOISY_EVENTS.has(type)) {
				// Don't log anything for noisy events
				break
			}
			// Log important or unknown events in verbose mode
			if (type && !type.startsWith("server.")) {
				if (IMPORTANT_EVENTS.has(type)) {
					logger.logVerbose(`Event: ${type}`)
				} else {
					// Only show truly unknown events
					logger.logVerbose(`Event: ${type}`)
				}
			}
	}
}

export class Builder {
	private client!: Client
	private server!: Server
	private sessionId?: string
	private config: Config
	private logger: Logger
	private eventStreamAbort?: AbortController
	private currentStats: SessionStats = createSessionStats()

	constructor(config: Config, logger: Logger) {
		this.config = config
		this.logger = logger
	}

	/**
	 * Get current session stats
	 */
	getStats(): SessionStats {
		return { ...this.currentStats }
	}

	/**
	 * Reset session stats for a new operation
	 */
	resetStats(): void {
		this.currentStats = createSessionStats()
	}

	/**
	 * Handle stats update from event processing
	 */
	private handleStatsUpdate(update: {
		toolCall?: boolean
		inputTokens?: number
		outputTokens?: number
		fileModified?: string
	}): void {
		if (update.toolCall) {
			this.currentStats.toolCalls++
		}
		if (update.inputTokens !== undefined) {
			this.currentStats.inputTokens += update.inputTokens
		}
		if (update.outputTokens !== undefined) {
			this.currentStats.outputTokens += update.outputTokens
		}
		if (update.fileModified && !this.currentStats.filesModified.includes(update.fileModified)) {
			this.currentStats.filesModified.push(update.fileModified)
		}

		// Update cost estimate
		this.currentStats.costUsd = estimateCost(
			this.config.buildModel,
			this.currentStats.inputTokens,
			this.currentStats.outputTokens,
		)
	}

	/**
	 * Initialize the OpenCode SDK server and client
	 */
	async init(): Promise<void> {
		this.logger.say("Starting OpenCode server...")

		try {
			const opencode = await createOpencode({
				timeout: 30000, // 30 second timeout for server start
			})

			this.client = opencode.client
			this.server = opencode.server

			this.logger.success("OpenCode server ready")

			// Start event subscription
			await this.subscribeToEvents()
		} catch (err) {
			this.logger.logError(`Failed to start OpenCode server: ${err}`)
			throw err
		}
	}

	/**
	 * Run the plan phase
	 */
	async runPlan(cycle: number, hint?: string): Promise<string> {
		this.logger.phase("Planning", `Cycle ${cycle}`)

		const prompt = generatePlanPrompt(cycle, hint)

		// Create a new session for this cycle
		const session = await this.client.session.create({
			body: { title: `Cycle ${cycle}` },
		})

		if (!session.data) {
			throw new Error("Failed to create session")
		}

		this.sessionId = session.data.id
		this.logger.logVerbose(`Created session: ${this.sessionId}`)

		// Send the plan prompt
		const result = await this.sendPrompt(prompt, this.config.planModel, "Planning")

		return extractPlanFromResponse(result)
	}

	/**
	 * Run a single task build
	 */
	async runTask(
		task: string,
		cycle: number,
		taskNum: number,
		totalTasks: number,
	): Promise<BuildResult> {
		this.logger.phase("Building", `Task ${taskNum}/${totalTasks}`)
		this.logger.say(`  ${task}`)

		// Ensure we have a valid session before building
		if (!this.sessionId) {
			try {
				await this.ensureSession(cycle, `Cycle ${cycle} - Recovery`)
			} catch (err) {
				return { success: false, error: `Failed to create session: ${err}` }
			}
		}

		const prompt = generateTaskPrompt(task, cycle, taskNum, totalTasks)

		try {
			const result = await this.sendPrompt(prompt, this.config.buildModel, "Building")
			return { success: true, output: result }
		} catch (err) {
			return { success: false, error: String(err) }
		}
	}

	/**
	 * Run the eval phase
	 */
	async runEval(cycle: number, planContent: string): Promise<string> {
		this.logger.phase("Evaluating", `Cycle ${cycle}`)

		// Ensure we have a valid session before evaluating
		if (!this.sessionId) {
			await this.ensureSession(cycle, `Cycle ${cycle} - Eval Recovery`)
		}

		const prompt = generateEvalPrompt(cycle, planContent)

		return await this.sendPrompt(prompt, this.config.planModel, "Evaluating")
	}

	/**
	 * Run idea selection when multiple ideas are available
	 */
	async runIdeaSelection(ideasFormatted: string, cycle: number): Promise<string> {
		this.logger.info("Selecting idea from queue...")

		// Create a temporary session for idea selection
		const session = await this.client.session.create({
			body: { title: `Cycle ${cycle} - Idea Selection` },
		})

		if (!session.data) {
			throw new Error("Failed to create session for idea selection")
		}

		const tempSessionId = session.data.id
		const prompt = generateIdeaSelectionPrompt(ideasFormatted)

		try {
			const result = await this.sendPromptToSession(
				tempSessionId,
				prompt,
				this.config.planModel,
				"Selecting",
			)
			return result
		} finally {
			// Clean up the temporary session
			try {
				await this.client.session.delete({ path: { id: tempSessionId } })
			} catch (err) {
				// Session cleanup is best-effort; log but don't fail
				this.logger.logVerbose(`Failed to delete temporary session: ${err}`)
			}
		}
	}

	/**
	 * Run plan for a specific idea
	 */
	async runIdeaPlan(ideaContent: string, ideaFilename: string, cycle: number): Promise<string> {
		this.logger.phase("Planning from Idea", `Cycle ${cycle}`)
		this.logger.step("Idea", ideaFilename)

		const prompt = generateIdeaPlanPrompt(ideaContent, ideaFilename, cycle)

		// Create a new session for this cycle
		const session = await this.client.session.create({
			body: { title: `Cycle ${cycle} - ${ideaFilename}` },
		})

		if (!session.data) {
			throw new Error("Failed to create session")
		}

		this.sessionId = session.data.id
		this.logger.logVerbose(`Created session: ${this.sessionId}`)

		const result = await this.sendPrompt(prompt, this.config.planModel, "Planning")

		return extractPlanFromResponse(result)
	}

	/**
	 * Send a prompt to the current session
	 */
	private async sendPrompt(prompt: string, model: string, phase: string): Promise<string> {
		if (!this.sessionId) {
			throw new Error("No active session")
		}

		return this.sendPromptToSession(this.sessionId, prompt, model, phase)
	}

	/**
	 * Send a prompt to a specific session
	 */
	private async sendPromptToSession(
		sessionId: string,
		prompt: string,
		model: string,
		phase: string,
	): Promise<string> {
		const { providerID, modelID } = parseModel(model)

		this.logger.logVerbose(`${phase} with ${model}...`)
		this.logger.startSpinner(`${phase}...`)

		const result = await this.client.session.prompt({
			path: { id: sessionId },
			body: {
				model: { providerID, modelID },
				parts: [{ type: "text", text: prompt }],
			},
		})

		this.logger.stopSpinner()

		if (!result.data) {
			throw new Error("No response from OpenCode")
		}

		const text = extractText(result.data.parts as Part[] | undefined)
		if (!text) {
			throw new Error("Empty response from OpenCode")
		}

		return text
	}

	/**
	 * Subscribe to server events for real-time output
	 */
	private async subscribeToEvents(): Promise<void> {
		this.eventStreamAbort = new AbortController()

		try {
			const events = await this.client.event.subscribe()

			// Process events in background
			this.processEvents(events.stream)
		} catch (err) {
			this.logger.logVerbose(`Event subscription setup: ${err}`)
		}
	}

	/**
	 * Process incoming events from the server
	 */
	private async processEvents(
		stream: AsyncIterable<{ type?: string; properties?: Record<string, unknown> }>,
	): Promise<void> {
		try {
			for await (const event of stream) {
				if (this.eventStreamAbort?.signal.aborted) break

				handleEvent(event, this.logger, (update) => this.handleStatsUpdate(update))
			}
		} catch (err) {
			// Stream ended or errored
			this.logger.logVerbose(`Event stream ended: ${err}`)
		}
	}

	/**
	 * Abort the current session
	 */
	async abortSession(): Promise<void> {
		if (this.sessionId) {
			try {
				await this.client.session.abort({ path: { id: this.sessionId } })
				this.logger.logVerbose("Session aborted")
			} catch (err) {
				// Session abort is best-effort during shutdown; log but don't fail
				this.logger.logVerbose(`Failed to abort session: ${err}`)
			}
		}
	}

	/**
	 * Get the current session ID
	 */
	getSessionId(): string | undefined {
		return this.sessionId
	}

	/**
	 * Clear the current session
	 */
	clearSession(): void {
		this.sessionId = undefined
	}

	/**
	 * Ensure a session exists, creating one if needed
	 * Used when resuming from a saved state where the session may be stale
	 */
	async ensureSession(cycle: number, title?: string): Promise<void> {
		if (this.sessionId) {
			// Check if session still exists
			try {
				await this.client.session.get({ path: { id: this.sessionId } })
				this.logger.logVerbose(`Resuming with existing session: ${this.sessionId}`)
				return
			} catch {
				// Session doesn't exist anymore, create a new one
				this.logger.logVerbose(`Session ${this.sessionId} no longer exists, creating new session`)
				this.sessionId = undefined
			}
		}

		// Create a new session
		const sessionTitle = title ?? `Cycle ${cycle}`
		const session = await this.client.session.create({
			body: { title: sessionTitle },
		})

		if (!session.data) {
			throw new Error("Failed to create session")
		}

		this.sessionId = session.data.id
		this.logger.logVerbose(`Created new session: ${this.sessionId}`)
	}

	/**
	 * Shutdown the builder and close the server
	 */
	async shutdown(): Promise<void> {
		// Abort event stream
		this.eventStreamAbort?.abort()

		// Abort any running session
		await this.abortSession()

		// Close the server
		if (this.server) {
			try {
				this.server.close()
				this.logger.say("OpenCode server stopped")
			} catch (err) {
				// Server close is best-effort during shutdown; log but don't fail
				this.logger.logVerbose(`Failed to close server: ${err}`)
			}
		}
	}
}
