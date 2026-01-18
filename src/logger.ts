/**
 * Logging infrastructure with console and file output
 */

import { appendFileSync, existsSync, readdirSync, renameSync, statSync, unlinkSync } from "node:fs"
import { join } from "node:path"
import type { Paths } from "./types.ts"

/** ANSI escape codes for terminal formatting */
const ANSI = {
	reset: "\x1b[0m",
	bold: "\x1b[1m",
	dim: "\x1b[2m",
	italic: "\x1b[3m",
	red: "\x1b[31m",
	green: "\x1b[32m",
	yellow: "\x1b[33m",
	blue: "\x1b[34m",
	magenta: "\x1b[35m",
	cyan: "\x1b[36m",
	gray: "\x1b[90m",
	clearLine: "\r\x1b[K",
}

/** Symbols for visual indicators */
const SYMBOLS = {
	thinking: "💭",
	tool: "🔧",
	result: "  →",
	success: "✓",
	error: "✗",
	arrow: "▶",
	phase: "●",
	step: "◦",
	spinner: ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"],
}

export class Logger {
	private paths: Paths
	private verbose: boolean
	private cycleLogFile?: string
	private logBuffer: string[] = []
	private readonly BUFFER_SIZE = 2048
	private spinnerInterval?: ReturnType<typeof setInterval>
	private spinnerIndex = 0
	private currentSpinnerMessage = ""
	private isSpinning = false

	constructor(paths: Paths, verbose: boolean) {
		this.paths = paths
		this.verbose = verbose
	}

	/**
	 * Set the cycle-specific log file
	 */
	setCycleLog(cycle: number): void {
		const filename = `cycle_${String(cycle).padStart(3, "0")}.log`
		this.cycleLogFile = join(this.paths.cycleLogDir, filename)
	}

	/**
	 * Log to file only (silent)
	 */
	log(message: string): void {
		this.writeToBuffer(this.formatForFile(message))
	}

	/**
	 * Log to console and file
	 */
	say(message: string): void {
		console.log(message)
		this.writeToBuffer(this.formatForFile(message))
	}

	/**
	 * Log with color formatting to console and file
	 */
	info(message: string): void {
		console.log(`${ANSI.blue}${message}${ANSI.reset}`)
		this.writeToBuffer(this.formatForFile(message))
	}

	/**
	 * Log success message
	 */
	success(message: string): void {
		console.log(`${ANSI.green}${message}${ANSI.reset}`)
		this.writeToBuffer(this.formatForFile(message))
	}

	/**
	 * Log warning message
	 */
	warn(message: string): void {
		console.log(`${ANSI.yellow}[WARN] ${message}${ANSI.reset}`)
		this.writeToBuffer(this.formatForFile(`[WARN] ${message}`))
	}

	/**
	 * Overwrite current line (for status updates)
	 */
	status(message: string): void {
		process.stdout.write(`${ANSI.clearLine}${message}`)
		this.writeToBuffer(this.formatForFile(message))
	}

	/**
	 * Log error to console, file, and alerts
	 */
	logError(message: string): void {
		const formatted = `[ERROR] ${message}`
		console.error(`${ANSI.red}${formatted}${ANSI.reset}`)
		this.writeToBuffer(this.formatForFile(formatted))
		this.writeToAlerts(formatted)
	}

	/**
	 * Log a critical alert - always written to alerts file and shown prominently
	 */
	alert(message: string): void {
		const formatted = `[ALERT] ${message}`
		console.error(`${ANSI.red}${ANSI.bold}${formatted}${ANSI.reset}`)
		this.writeToBuffer(this.formatForFile(formatted))
		this.writeToAlerts(formatted)
	}

	/**
	 * Log only if verbose mode enabled
	 */
	logVerbose(message: string): void {
		if (this.verbose) {
			console.log(`${ANSI.dim}[VERBOSE] ${message}${ANSI.reset}`)
		}
		this.writeToBuffer(this.formatForFile(`[VERBOSE] ${message}`))
	}

	/**
	 * Log a section header
	 */
	header(title: string, char = "="): void {
		const line = char.repeat(60)
		this.say(`\n${line}`)
		this.say(title)
		this.say(line)
	}

	/**
	 * Log a sub-section header
	 */
	subheader(title: string): void {
		const line = "-".repeat(60)
		this.say(`\n${line}`)
		this.say(title)
		this.say(line)
	}

	/**
	 * Log a major phase transition (always shown)
	 */
	phase(name: string, detail?: string): void {
		this.stopSpinner()
		const detailStr = detail ? ` ${ANSI.dim}${detail}${ANSI.reset}` : ""
		console.log(`${ANSI.cyan}${SYMBOLS.phase} ${ANSI.bold}${name}${ANSI.reset}${detailStr}`)
		this.writeToBuffer(this.formatForFile(`[PHASE] ${name} ${detail || ""}`))
	}

	/**
	 * Log a step within a phase (always shown)
	 */
	step(action: string, detail?: string): void {
		this.stopSpinner()
		const detailStr = detail ? ` ${ANSI.dim}${detail}${ANSI.reset}` : ""
		console.log(`  ${ANSI.blue}${SYMBOLS.step} ${action}${detailStr}${ANSI.reset}`)
		this.writeToBuffer(this.formatForFile(`[STEP] ${action} ${detail || ""}`))
	}

	/**
	 * Log file change (always shown - important feedback)
	 */
	fileChange(action: string, filePath: string): void {
		this.stopSpinner()
		// Shorten the path for display
		const shortPath = filePath.length > 60 ? `...${filePath.slice(-57)}` : filePath
		console.log(`  ${ANSI.green}${SYMBOLS.success} ${action}: ${shortPath}${ANSI.reset}`)
		this.writeToBuffer(this.formatForFile(`[FILE] ${action}: ${filePath}`))
	}

	/**
	 * Stream text without newline (for real-time output)
	 */
	stream(text: string): void {
		process.stdout.write(text)
		this.writeToBuffer(text)
	}

	/**
	 * End a streamed line
	 */
	streamEnd(): void {
		console.log()
	}

	/**
	 * Log a tool call
	 */
	toolCall(name: string, input?: unknown): void {
		this.stopSpinner()
		const inputStr = input ? this.formatToolInput(input) : ""
		console.log(
			`${ANSI.cyan}${SYMBOLS.tool} ${ANSI.bold}${name}${ANSI.reset}${ANSI.dim}${inputStr}${ANSI.reset}`,
		)
		this.writeToBuffer(this.formatForFile(`[TOOL] ${name}${inputStr}`))
	}

	/**
	 * Format tool input for display
	 */
	private formatToolInput(input: unknown): string {
		if (typeof input === "string") {
			return input.length > 80 ? ` ${input.slice(0, 80)}...` : ` ${input}`
		}
		if (typeof input === "object" && input !== null) {
			const obj = input as Record<string, unknown>
			// Show key parameters for common tools
			if ("filePath" in obj) return ` ${obj.filePath}`
			if ("path" in obj) return ` ${obj.path}`
			if ("pattern" in obj) return ` ${obj.pattern}`
			if ("command" in obj) {
				const cmd = String(obj.command)
				return cmd.length > 60 ? ` ${cmd.slice(0, 60)}...` : ` ${cmd}`
			}
			if ("query" in obj) return ` "${obj.query}"`
			// Fallback: stringify and truncate
			const str = JSON.stringify(input)
			return str.length > 80 ? ` ${str.slice(0, 80)}...` : ` ${str}`
		}
		return ""
	}

	/**
	 * Log a tool result
	 */
	toolResult(output: string): void {
		// Show brief result in non-verbose mode, full result in verbose mode
		const firstLine = output.split("\n")[0] || output
		const truncated = firstLine.length > 100 ? `${firstLine.slice(0, 100)}...` : firstLine

		if (this.verbose) {
			// Verbose mode: show more detail (up to 200 chars)
			const verboseTruncated = output.length > 200 ? `${output.slice(0, 200)}...` : output
			const verboseFirstLine = verboseTruncated.split("\n")[0] || verboseTruncated
			console.log(`${ANSI.gray}${SYMBOLS.result} ${verboseFirstLine}${ANSI.reset}`)
		} else {
			// Non-verbose mode: show brief result (first line, max 100 chars)
			console.log(`${ANSI.gray}${SYMBOLS.result} ${truncated}${ANSI.reset}`)
		}

		this.writeToBuffer(this.formatForFile(`[RESULT] ${output}`))
	}

	/**
	 * Log thinking/reasoning - shown by default for visibility
	 */
	thinking(text: string): void {
		this.stopSpinner()
		// Show thinking in a visually distinct way
		const lines = text.split("\n")
		const firstLine = lines[0] || text
		const display = firstLine.length > 150 ? `${firstLine.slice(0, 150)}...` : firstLine
		console.log(`${ANSI.magenta}${SYMBOLS.thinking} ${ANSI.italic}${display}${ANSI.reset}`)
		this.writeToBuffer(this.formatForFile(`[THINKING] ${text}`))
	}

	/**
	 * Log token usage
	 */
	tokens(input: number, output: number): void {
		const msg = `[TOKENS] in: ${input}, out: ${output}`
		if (this.verbose) {
			console.log(`${ANSI.dim}${msg}${ANSI.reset}`)
		}
		this.writeToBuffer(this.formatForFile(msg))
	}

	/**
	 * Start a spinner with a message (for long-running operations)
	 */
	startSpinner(message: string): void {
		if (this.isSpinning) {
			this.stopSpinner()
		}

		this.isSpinning = true
		this.currentSpinnerMessage = message
		this.spinnerIndex = 0

		this.spinnerInterval = setInterval(() => {
			const frame = SYMBOLS.spinner[this.spinnerIndex % SYMBOLS.spinner.length]
			process.stdout.write(
				`${ANSI.clearLine}${ANSI.cyan}${frame}${ANSI.reset} ${this.currentSpinnerMessage}`,
			)
			this.spinnerIndex++
		}, 80)
	}

	/**
	 * Update spinner message without stopping it
	 */
	updateSpinner(message: string): void {
		if (this.isSpinning) {
			this.currentSpinnerMessage = message
		}
	}

	/**
	 * Stop the spinner and clear the line
	 */
	stopSpinner(): void {
		if (this.spinnerInterval) {
			clearInterval(this.spinnerInterval)
			this.spinnerInterval = undefined
		}
		if (this.isSpinning) {
			process.stdout.write(ANSI.clearLine)
			this.isSpinning = false
		}
	}

	/**
	 * Log activity indicator (brief visual feedback)
	 */
	activity(action: string, detail?: string): void {
		this.stopSpinner()
		const detailStr = detail ? ` ${ANSI.dim}${detail}${ANSI.reset}` : ""
		console.log(`${ANSI.blue}${SYMBOLS.arrow} ${action}${detailStr}${ANSI.reset}`)
		this.writeToBuffer(this.formatForFile(`[ACTIVITY] ${action} ${detail || ""}`))
	}

	/**
	 * Format message for file output with timestamp
	 */
	private formatForFile(message: string): string {
		const now = new Date()
		const timestamp = now.toISOString().replace("T", " ").slice(0, 19)
		return `[${timestamp}] ${message}\n`
	}

	/**
	 * Write to log buffer
	 */
	private writeToBuffer(content: string): void {
		this.logBuffer.push(content)

		// Flush when buffer exceeds threshold
		const totalSize = this.logBuffer.reduce((acc, s) => acc + s.length, 0)
		if (totalSize >= this.BUFFER_SIZE) {
			this.flush()
		}
	}

	/**
	 * Flush log buffer to files
	 */
	flush(): void {
		if (this.logBuffer.length === 0) return

		const content = this.logBuffer.join("")
		this.logBuffer = []

		try {
			// Write to main log
			appendFileSync(this.paths.mainLog, content)

			// Write to cycle log if set
			if (this.cycleLogFile) {
				appendFileSync(this.cycleLogFile, content)
			}
		} catch (err) {
			// Fallback to console if file write fails
			console.error(`Failed to write to log file: ${err}`)
		}
	}

	/**
	 * Write to alerts file
	 */
	private writeToAlerts(message: string): void {
		try {
			const timestamp = new Date().toISOString()
			appendFileSync(this.paths.alertsFile, `[${timestamp}] ${message}\n`)
		} catch {
			// Ignore alert write failures
		}
	}

	/**
	 * Rotate the main log file
	 */
	rotate(): void {
		if (!existsSync(this.paths.mainLog)) return

		try {
			const timestamp = new Date().toISOString().replace(/[:.]/g, "-")
			const rotatedPath = `${this.paths.mainLog}.${timestamp}`
			renameSync(this.paths.mainLog, rotatedPath)
		} catch (err) {
			this.logError(`Failed to rotate log: ${err}`)
		}
	}

	/**
	 * Clean up old log files
	 */
	cleanup(days: number): number {
		const cutoffMs = Date.now() - days * 24 * 60 * 60 * 1000
		let deletedCount = 0

		// Cleanup old cycle logs
		if (existsSync(this.paths.cycleLogDir)) {
			for (const file of readdirSync(this.paths.cycleLogDir)) {
				const filePath = join(this.paths.cycleLogDir, file)
				try {
					const stats = statSync(filePath)
					if (stats.mtimeMs < cutoffMs) {
						unlinkSync(filePath)
						deletedCount++
					}
				} catch {
					// Ignore individual file errors
				}
			}
		}

		return deletedCount
	}
}
