/**
 * CLI argument parsing and program setup
 */

import { Command } from "commander"
import { loadConfig } from "./config.ts"
import { runLoop } from "./loop.ts"
import type { CliOptions } from "./types.ts"

const VERSION = "0.1.0"

/**
 * Parse CLI arguments and run the application
 */
export async function run(): Promise<void> {
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
		.action(async (hint: string | undefined, opts: Record<string, unknown>) => {
			try {
				const cliOptions: CliOptions = {
					project: opts.project as string | undefined,
					model: opts.model as string | undefined,
					planModel: opts.planModel as string | undefined,
					buildModel: opts.buildModel as string | undefined,
					verbose: opts.verbose as boolean | undefined,
				}

				const config = await loadConfig(cliOptions, hint)
				await runLoop(config)
			} catch (err) {
				console.error(`Error: ${err instanceof Error ? err.message : String(err)}`)
				process.exit(1)
			}
		})

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

Options:
    -p, --project <dir>         Project directory (default: current directory)
    -m, --model <model>         Model for both plan and build
    -P, --plan-model            Model for plan phase
    -B, --build-model           Model for build phase
    -v, --verbose               Enable verbose logging

Environment variables:
    OPENCODER_PLAN_MODEL        Default plan model
    OPENCODER_BUILD_MODEL       Default build model
    OPENCODER_VERBOSE           Enable verbose logging (true/1)
    OPENCODER_PROJECT_DIR       Default project directory

Config file (.opencode/opencoder/config.json):
    {
      "planModel": "anthropic/claude-sonnet-4",
      "buildModel": "anthropic/claude-sonnet-4",
      "verbose": false
    }
`,
	)

	await program.parseAsync()
}
