/**
 * CLI argument parsing and program setup
 */

import { resolve } from "node:path"
import { Command } from "commander"
import { loadConfig } from "./config.ts"
import { initializePaths } from "./fs.ts"
import { runLoop } from "./loop.ts"
import { formatMetricsSummary, loadMetrics } from "./metrics.ts"
import type { CliOptions } from "./types.ts"

const VERSION = "1.0.0"

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
 * Create and configure the CLI program
 */
function createProgram(): Command {
	const program = new Command()

	program
		.name("opencoder")
		.description("Autonomous development loop powered by OpenCode")
		.version(VERSION)
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

  $ opencoder --status
    Display metrics summary without starting the loop

  $ opencoder --status -p ./myproject
    Display metrics for a specific project

Options:
    -p, --project <dir>         Project directory (default: current directory)
    -m, --model <model>         Model for both plan and build
    -P, --plan-model            Model for plan phase
    -B, --build-model           Model for build phase
    -v, --verbose               Enable verbose logging
    --no-auto-commit            Disable automatic commits after tasks
    --no-auto-push              Disable automatic push after cycles
    -s, --signoff               Add Signed-off-by line to commits
    --status                    Display metrics summary and exit

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

			const config = await loadConfig(cliOptions, hint)
			await runLoop(config)
		} catch (err) {
			console.error(`Error: ${err instanceof Error ? err.message : String(err)}`)
			process.exit(1)
		}
	})

	await program.parseAsync()
}
