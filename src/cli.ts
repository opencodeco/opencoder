/**
 * CLI argument parsing and program setup
 */

import { existsSync, mkdirSync } from "node:fs"
import { join, resolve } from "node:path"
import { createInterface } from "node:readline"
import { Command } from "commander"
import { loadConfig } from "./config.ts"
import { getTimestampForFilename, initializePaths } from "./fs.ts"
import { countIdeas, getIdeaSummary, loadAllIdeas } from "./ideas.ts"
import { runLoop } from "./loop.ts"
import { formatMetricsSummary, loadMetrics, resetMetrics, saveMetrics } from "./metrics.ts"
import type { CliOptions } from "./types.ts"
import { formatVersionInfo, getVersionInfo } from "./version.ts"

/**
 * Result of CLI argument parsing.
 * Contains the parsed options and optional hint argument.
 */
export interface ParsedCli {
	/** Parsed CLI options (project, model, verbose, etc.) */
	options: CliOptions
	/** Optional hint/instruction for the AI, passed as a positional argument */
	hint?: string
}

/**
 * Handle the 'idea' subcommand: save an idea to the queue
 */
async function handleIdeaCommand(
	description: string,
	opts: Record<string, unknown>,
): Promise<void> {
	try {
		// Validate description is not empty
		if (!description || !description.trim()) {
			console.error("Error: Idea description cannot be empty")
			process.exit(1)
		}

		const projectDir = opts.project ? resolve(opts.project as string) : process.cwd()
		const paths = initializePaths(projectDir)

		// Ensure ideas directory exists
		if (!existsSync(paths.ideasDir)) {
			mkdirSync(paths.ideasDir, { recursive: true })
		}

		// Generate filename: YYYYMMDD_HHMMSS_slugified-description.md
		const timestamp = getTimestampForFilename()
		const slug = description
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, "-")
			.replace(/^-+|-+$/g, "")
			.slice(0, 50) // Limit slug length

		const filename = `${timestamp}_${slug}.md`
		const filepath = join(paths.ideasDir, filename)

		// Create markdown content
		const content = `# ${description}

<!-- Add details, steps, or context here -->
`

		// Write the file
		await Bun.write(filepath, content)

		console.log(`\n✓ Idea added to queue: ${filename}`)
		console.log(`  Location: ${filepath}`)
		console.log(`\nYou can edit this file to add more details before opencoder processes it.\n`)
	} catch (err) {
		console.error(`Error: Failed to add idea: ${err instanceof Error ? err.message : String(err)}`)
		process.exit(1)
	}
}

/**
 * Handle the 'idea list' subcommand: list all ideas in the queue
 */
async function handleIdeasListCommand(opts: Record<string, unknown>): Promise<void> {
	try {
		const projectDir = opts.project ? resolve(opts.project as string) : process.cwd()
		const paths = initializePaths(projectDir)

		const ideas = await loadAllIdeas(paths.ideasDir)
		const count = await countIdeas(paths.ideasDir)

		console.log("\nIdeas Queue")
		console.log("===========\n")

		if (count === 0) {
			console.log("No ideas in queue.")
			console.log(`\nTo add ideas, run: opencoder idea "<description>"`)
			console.log(`Or place .md files in: ${paths.ideasDir}`)
		} else {
			console.log(`Found ${count} idea(s):\n`)
			for (let i = 0; i < ideas.length; i++) {
				const idea = ideas[i]
				if (!idea) continue
				const summary = getIdeaSummary(idea.content)
				console.log(`  ${i + 1}. ${idea.filename}`)
				console.log(`     ${summary}`)
				console.log("")
			}
		}

		console.log("")
	} catch (err) {
		console.error(
			`Error: Failed to list ideas: ${err instanceof Error ? err.message : String(err)}`,
		)
		process.exit(1)
	}
}

/**
 * Create and configure the CLI program
 */
function createProgram(): Command {
	const program = new Command()

	program
		.name("opencoder")
		.description("Autonomous development loop powered by OpenCode")
		.option("-V, --version", "Display version information and exit")
		.argument("[hint]", "Optional hint/instruction for the AI")
		.option("-p, --project <dir>", "Project directory (default: current directory)")
		.option("-m, --model <model>", "Model for both plan and build (provider/model format)")
		.option("-P, --plan-model <model>", "Model for plan phase (provider/model format)")
		.option("-B, --build-model <model>", "Model for build phase (provider/model format)")
		.option("-v, --verbose", "Enable verbose logging")
		.option("--no-auto-commit", "Disable automatic commits after tasks")
		.option("--no-auto-push", "Disable automatic push after cycles")
		.option("-s, --signoff", "Add Signed-off-by line to commits")
		.option("--status", "Display metrics summary and exit")
		.option("--metrics-reset", "Reset metrics to default values (requires confirmation)")

	// Add 'idea' command with subcommands
	const ideaCommand = program.command("idea").description("Manage ideas in the queue")

	// 'idea add' subcommand (default action)
	ideaCommand
		.argument("<description>", "Description of the idea")
		.option("-p, --project <dir>", "Project directory (default: current directory)")
		.action(async (description: string, opts: Record<string, unknown>) => {
			await handleIdeaCommand(description, opts)
		})

	// 'idea list' subcommand
	ideaCommand
		.command("list")
		.description("List all ideas in the queue")
		.option("-p, --project <dir>", "Project directory (default: current directory)")
		.action(async (opts: Record<string, unknown>) => {
			await handleIdeasListCommand(opts)
		})

	// Add help text for idea command
	ideaCommand.addHelpText(
		"after",
		`
Examples:
  $ opencoder idea "Fix login bug"
  $ opencoder idea "Add dark mode support" -p ./myproject
  $ opencoder idea "Implement user authentication with JWT tokens"
  $ opencoder idea list
  $ opencoder idea list -p ./myproject
`,
	)

	// Add examples to help
	program.addHelpText(
		"after",
		`
Examples:
  $ opencoder --model anthropic/claude-sonnet-4
    Run with Claude Sonnet for both plan and build

  $ opencoder -m anthropic/claude-sonnet-4 "build a REST API"
    Run with a specific hint/instruction

  $ opencoder -P anthropic/claude-opus-4 -B anthropic/claude-sonnet-4
    Use different models for plan and build

  $ opencoder -m openai/gpt-4o -p ./myproject -v
    Run with verbose logging in a specific directory

  $ opencoder -m anthropic/claude-sonnet-4 --no-auto-commit --no-auto-push
    Run without automatic git operations

  $ opencoder -m anthropic/claude-sonnet-4 -s
    Run with commit signoff enabled

  $ opencoder --version
    Display version information

  $ opencoder --status
    Display metrics summary without starting the loop

  $ opencoder --status -p ./myproject
    Display metrics for a specific project

  $ opencoder --metrics-reset
    Reset metrics to default values (with confirmation)

  $ opencoder idea "Fix login bug"
    Add a new idea to the queue

  $ opencoder idea "Add dark mode support" -p ./myproject
    Add idea to a specific project

  $ opencoder idea list
    List all ideas in the queue

  $ opencoder idea list -p ./myproject
    List ideas for a specific project

Commands:
    idea <description>          Add a new idea to the queue
    idea list                   List all ideas in the queue

Options:
    -p, --project <dir>         Project directory (default: current directory)
    -m, --model <model>         Model for both plan and build
    -P, --plan-model            Model for plan phase
    -B, --build-model           Model for build phase
    -v, --verbose               Enable verbose logging
    -V, --version               Display version information
    --no-auto-commit            Disable automatic commits after tasks
    --no-auto-push              Disable automatic push after cycles
    -s, --signoff               Add Signed-off-by line to commits
    --status                    Display metrics summary and exit
    --metrics-reset             Reset metrics to default values (requires confirmation)

Environment variables:
    OPENCODER_PLAN_MODEL        Default plan model
    OPENCODER_BUILD_MODEL       Default build model
    OPENCODER_VERBOSE           Enable verbose logging (true/1)
    OPENCODER_PROJECT_DIR       Default project directory
    OPENCODER_AUTO_COMMIT       Enable auto-commit (true/1, default: true)
    OPENCODER_AUTO_PUSH         Enable auto-push (true/1, default: true)
    OPENCODER_COMMIT_SIGNOFF    Add signoff to commits (true/1, default: false)

Config file (.opencode/opencoder/config.json):
    {
      "planModel": "anthropic/claude-sonnet-4",
      "buildModel": "anthropic/claude-sonnet-4",
      "verbose": false,
      "autoCommit": true,
      "autoPush": true,
      "commitSignoff": false
    }
`,
	)

	return program
}

/**
 * Prompt user for confirmation
 * @param message - The confirmation message to display
 * @returns Promise that resolves to true if user confirms, false otherwise
 */
async function promptConfirmation(message: string): Promise<boolean> {
	const rl = createInterface({
		input: process.stdin,
		output: process.stdout,
	})

	return new Promise((resolve) => {
		rl.question(`${message} (yes/no): `, (answer) => {
			rl.close()
			const normalized = answer.trim().toLowerCase()
			resolve(normalized === "yes" || normalized === "y")
		})
	})
}

/**
 * Parse CLI arguments without executing the action.
 * Useful for testing or when you need to inspect arguments before running.
 *
 * @param argv - Command line arguments array. Defaults to process.argv.
 *               Should include the node executable and script name as first two elements.
 * @returns Parsed CLI options and hint
 *
 * @example
 * ```typescript
 * // Parse default process arguments
 * const { options, hint } = parseCli()
 *
 * // Parse custom arguments for testing
 * const { options, hint } = parseCli(['node', 'opencoder', '-m', 'anthropic/claude-sonnet-4', 'my hint'])
 * ```
 */
export function parseCli(argv: string[] = process.argv): ParsedCli {
	const program = createProgram()

	// Parse without running the action
	program.parse(argv)

	const opts = program.opts()
	const args = program.args

	return {
		options: {
			project: opts.project as string | undefined,
			model: opts.model as string | undefined,
			planModel: opts.planModel as string | undefined,
			buildModel: opts.buildModel as string | undefined,
			verbose: opts.verbose as boolean | undefined,
			autoCommit: opts.autoCommit as boolean | undefined,
			autoPush: opts.autoPush as boolean | undefined,
			commitSignoff: opts.signoff as boolean | undefined,
			status: opts.status as boolean | undefined,
			metricsReset: opts.metricsReset as boolean | undefined,
			ideasList: opts.ideasList as boolean | undefined,
		},
		hint: args[0],
	}
}

/**
 * Parse CLI arguments and run the autonomous development loop.
 * This is the main entry point for the CLI application.
 *
 * Parses command line arguments, loads configuration from all sources
 * (defaults, config file, environment variables, CLI options), and
 * starts the autonomous development loop.
 *
 * @throws Will call process.exit(1) if configuration is invalid or an error occurs
 *
 * @example
 * ```typescript
 * // In your entry point (e.g., index.ts)
 * import { run } from './cli.ts'
 * await run()
 * ```
 */
export async function run(): Promise<void> {
	const program = createProgram()

	program.action(async (hint: string | undefined, opts: Record<string, unknown>) => {
		try {
			const cliOptions: CliOptions = {
				project: opts.project as string | undefined,
				model: opts.model as string | undefined,
				planModel: opts.planModel as string | undefined,
				buildModel: opts.buildModel as string | undefined,
				verbose: opts.verbose as boolean | undefined,
				autoCommit: opts.autoCommit as boolean | undefined,
				autoPush: opts.autoPush as boolean | undefined,
				commitSignoff: opts.signoff as boolean | undefined,
				status: opts.status as boolean | undefined,
				metricsReset: opts.metricsReset as boolean | undefined,
			}

			// Handle --version flag: display version info and exit
			if (opts.version) {
				const versionInfo = getVersionInfo()
				console.log("")
				console.log(formatVersionInfo(versionInfo))
				console.log("")
				return
			}

			// Handle --status flag: display metrics and exit
			if (cliOptions.status) {
				const projectDir = cliOptions.project ? resolve(cliOptions.project) : process.cwd()
				const paths = initializePaths(projectDir)
				const metrics = await loadMetrics(paths.metricsFile)

				console.log("\nOpenCoder Metrics")
				console.log("=================\n")
				console.log(formatMetricsSummary(metrics))
				console.log(`\nLast activity: ${metrics.lastActivityTime}`)
				console.log("")
				return
			}

			// Handle --metrics-reset flag: reset metrics with confirmation
			if (cliOptions.metricsReset) {
				const projectDir = cliOptions.project ? resolve(cliOptions.project) : process.cwd()
				const paths = initializePaths(projectDir)

				// Show current metrics before reset
				const currentMetrics = await loadMetrics(paths.metricsFile)
				console.log("\nCurrent Metrics:")
				console.log("================\n")
				console.log(formatMetricsSummary(currentMetrics))
				console.log("")

				// Ask for confirmation
				const confirmed = await promptConfirmation(
					"Are you sure you want to reset all metrics to default values?",
				)

				if (confirmed) {
					const freshMetrics = resetMetrics()
					await saveMetrics(paths.metricsFile, freshMetrics)
					console.log("\n✓ Metrics have been reset to default values.\n")
				} else {
					console.log("\nMetrics reset cancelled.\n")
				}

				return
			}

			const config = await loadConfig(cliOptions, hint)
			await runLoop(config)
		} catch (err) {
			console.error(`Error: ${err instanceof Error ? err.message : String(err)}`)
			process.exit(1)
		}
	})

	await program.parseAsync()
}
