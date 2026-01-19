/**
 * OpenCoder Plugin - Main plugin function
 *
 * This module exports the plugin function that follows the OpenCode plugin API.
 * The plugin provides autonomous development agents for continuous codebase improvement.
 *
 * Note: Agents are installed via postinstall script since the plugin API
 * does not currently support dynamic agent registration.
 */

import type { Hooks, Plugin, PluginInput } from "@opencode-ai/plugin"

/** Plugin metadata for logging */
const PLUGIN_NAME = "opencoder"

/**
 * Creates lifecycle hooks for debugging and visibility.
 *
 * These hooks provide optional logging points for plugin activity.
 * Set OPENCODER_DEBUG=1 environment variable to enable debug logging.
 *
 * @param ctx - Plugin context from OpenCode containing session information
 * @returns Hooks object with lifecycle callbacks for `event`, `tool.execute.before`, and `tool.execute.after`
 *
 * @example
 * // Enable debug logging by setting environment variable:
 * // OPENCODER_DEBUG=1 opencode @opencoder
 *
 * @example
 * // Debug output format for events:
 * // [2026-01-19T12:00:00.000Z] [opencoder] Event received {
 * //   "directory": "/home/user/project",
 * //   "type": "session.created",
 * //   "properties": ["sessionId", "timestamp"]
 * // }
 */
function createLifecycleHooks(ctx: PluginInput): Hooks {
	const debug = process.env.OPENCODER_DEBUG === "1"

	/**
	 * Logs a debug message with context when OPENCODER_DEBUG=1 is set.
	 *
	 * Messages are formatted with ISO timestamp and plugin name prefix,
	 * followed by the message and context data as pretty-printed JSON.
	 *
	 * @param message - The log message describing the event
	 * @param data - Optional additional context to include in the log output
	 * @returns void
	 *
	 * @example
	 * // Output when debug is enabled:
	 * // [2026-01-19T12:00:00.000Z] [opencoder] Tool executing {
	 * //   "directory": "/home/user/project",
	 * //   "tool": "bash",
	 * //   "sessionID": "abc123"
	 * // }
	 */
	const log = (message: string, data?: Record<string, unknown>): void => {
		if (debug) {
			const timestamp = new Date().toISOString()
			const prefix = `[${timestamp}] [${PLUGIN_NAME}]`
			const context = { directory: ctx.directory, ...data }
			console.log(prefix, message, JSON.stringify(context, null, 2))
		}
	}

	return {
		/**
		 * Called on OpenCode events (sessions, messages, etc.)
		 */
		event: async ({ event }) => {
			log("Event received", {
				type: event.type,
				properties: Object.keys(event.properties),
			})
		},

		/**
		 * Called before tool execution
		 */
		"tool.execute.before": async ({ tool, sessionID, callID }, output) => {
			log("Tool executing", {
				tool,
				sessionID,
				callID,
				argsKeys: Object.keys(output.args || {}),
			})
		},

		/**
		 * Called after tool execution completes
		 */
		"tool.execute.after": async ({ tool, sessionID, callID }, output) => {
			log("Tool completed", {
				tool,
				sessionID,
				callID,
				title: output.title,
				outputLength: output.output?.length ?? 0,
			})
		},
	}
}

/**
 * The OpenCoder plugin function.
 *
 * This plugin provides autonomous development agents:
 * - opencoder: Main orchestrator that runs the continuous Plan-Build-Commit loop
 * - opencoder-planner: Subagent that analyzes codebases and creates development plans
 * - opencoder-builder: Subagent that executes tasks with precision
 *
 * Usage:
 *   opencode @opencoder
 *
 * @param ctx - Plugin context provided by OpenCode
 * @returns Hooks object with lifecycle callbacks for debugging visibility
 */
export const OpenCoderPlugin: Plugin = async (ctx) => {
	return createLifecycleHooks(ctx)
}
