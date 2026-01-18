/**
 * OpenCode SDK builder with live event streaming
 */

import { createOpencode } from "@opencode-ai/sdk"
import { parseModel } from "./config.ts"
import type { Logger } from "./logger.ts"
import {
	extractPlanFromResponse,
	generateEvaluationPrompt,
	generateIdeaPlanPrompt,
	generateIdeaSelectionPrompt,
	generatePlanPrompt,
	generateTaskPrompt,
} from "./plan.ts"
import type { BuildResult, Config } from "./types.ts"

/** Type for the OpenCode client */
type Client = Awaited<ReturnType<typeof createOpencode>>["client"]

/** Type for the OpenCode server */
type Server = Awaited<ReturnType<typeof createOpencode>>["server"]

/** Message part with text */
interface TextPart {
	type: "text"
	text: string
}

/** Message part (union type) */
type Part = TextPart | { type: string; [key: string]: unknown }

export class Builder {
	private client!: Client
	private server!: Server
	private sessionId?: string
	private config: Config
	private logger: Logger
	private eventStreamAbort?: AbortController

	constructor(config: Config, logger: Logger) {
		this.config = config
		this.logger = logger
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
		this.logger.header(`CYCLE ${cycle} - PLAN PHASE`)

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
		this.logger.subheader(`TASK ${taskNum}/${totalTasks}`)
		this.logger.say(task)

		if (!this.sessionId) {
			return { success: false, error: "No active session" }
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
	 * Run the evaluation phase
	 */
	async runEvaluation(cycle: number, planContent: string): Promise<string> {
		this.logger.header(`CYCLE ${cycle} - EVALUATION PHASE`)

		if (!this.sessionId) {
			throw new Error("No active session")
		}

		const prompt = generateEvaluationPrompt(cycle, planContent)

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
			} catch {
				// Ignore cleanup errors
			}
		}
	}

	/**
	 * Run plan for a specific idea
	 */
	async runIdeaPlan(ideaContent: string, ideaFilename: string, cycle: number): Promise<string> {
		this.logger.header(`CYCLE ${cycle} - IDEA PLAN`)
		this.logger.info(`Planning for: ${ideaFilename}`)

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

		const result = await this.client.session.prompt({
			path: { id: sessionId },
			body: {
				model: { providerID, modelID },
				parts: [{ type: "text", text: prompt }],
			},
		})

		if (!result.data) {
			throw new Error("No response from OpenCode")
		}

		return this.extractText(result.data.parts as Part[])
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

				this.handleEvent(event)
			}
		} catch (err) {
			// Stream ended or errored
			this.logger.logVerbose(`Event stream ended: ${err}`)
		}
	}

	/**
	 * Handle a single event from the stream
	 */
	private handleEvent(event: { type?: string; properties?: Record<string, unknown> }): void {
		const { type, properties } = event

		switch (type) {
			case "message.part.text": {
				// Stream text output in real-time
				const text = properties?.text
				if (typeof text === "string") {
					this.logger.stream(text)
				}
				break
			}

			case "message.part.tool.start": {
				const name = properties?.name
				const input = properties?.input
				if (typeof name === "string") {
					this.logger.streamEnd()
					this.logger.toolCall(name, input)
				}
				break
			}

			case "message.part.tool.result": {
				const output = properties?.output
				if (typeof output === "string" && output.length > 0) {
					this.logger.toolResult(output)
				}
				break
			}

			case "message.part.thinking": {
				const text = properties?.text
				if (typeof text === "string") {
					this.logger.thinking(text)
				}
				break
			}

			case "message.complete": {
				this.logger.streamEnd()
				const usage = properties?.usage as { input?: number; output?: number } | undefined
				if (usage?.input !== undefined && usage?.output !== undefined) {
					this.logger.tokens(usage.input, usage.output)
				}
				break
			}

			case "message.error": {
				const message = properties?.message
				if (typeof message === "string") {
					this.logger.logError(message)
				}
				break
			}

			case "session.complete":
			case "session.abort":
				// Session ended
				this.logger.logVerbose(`Session ${type}`)
				break

			default:
				// Log unknown events in verbose mode
				if (type && !type.startsWith("server.")) {
					this.logger.logVerbose(`Event: ${type}`)
				}
		}
	}

	/**
	 * Extract text content from message parts
	 */
	private extractText(parts: Part[]): string {
		return parts
			.filter((p): p is TextPart => p.type === "text" && typeof p.text === "string")
			.map((p) => p.text)
			.join("\n")
	}

	/**
	 * Abort the current session
	 */
	async abortSession(): Promise<void> {
		if (this.sessionId) {
			try {
				await this.client.session.abort({ path: { id: this.sessionId } })
				this.logger.logVerbose("Session aborted")
			} catch {
				// Ignore abort errors
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
			} catch {
				// Ignore close errors
			}
		}
	}
}
