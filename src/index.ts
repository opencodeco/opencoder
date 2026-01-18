/**
 * OpenCode Plugin: OpenCoder
 *
 * This plugin provides autonomous development agents for continuous codebase improvement.
 *
 * Agents installed:
 * - opencoder: Main orchestrator that runs the continuous Plan-Build-Commit loop
 * - opencoder-planner: Subagent that analyzes codebases and creates development plans
 * - opencoder-builder: Subagent that executes tasks with precision
 *
 * Usage:
 *   opencode @opencoder
 *
 * The agents are installed to ~/.config/opencode/agents/ via the postinstall script.
 */

export const name = "opencode-plugin-opencoder"
export const version = "0.1.0"
export const description = "Autonomous development agents for continuous codebase improvement"

export const agents = ["opencoder", "opencoder-planner", "opencoder-builder"]
