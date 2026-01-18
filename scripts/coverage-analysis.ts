#!/usr/bin/env bash
/**
 * Coverage analysis tool for OpenCoder
 * Generates coverage reports and identifies areas for improvement
 */

import { existsSync, readFileSync } from "node:fs"
import { resolve } from "node:path"

/**
 * Parse coverage text report and extract metrics
 */
function parseCoverageReport(reportPath: string): {
	overall: { funcs: number; lines: number }
	files: Array<{ name: string; funcs: number; lines: number; uncovered: string }>
} {
	if (!existsSync(reportPath)) {
		console.error(`Coverage report not found at ${reportPath}`)
		process.exit(1)
	}

	const content = readFileSync(reportPath, "utf-8")
	const lines = content.split("\n")

	const overall = { funcs: 0, lines: 0 }
	const files: Array<{ name: string; funcs: number; lines: number; uncovered: string }> = []

	for (const line of lines) {
		if (line.includes("All files")) {
			const match = line.match(/\|\s*([\d.]+)\s*\|\s*([\d.]+)\s*\|/)
			if (match) {
				overall.funcs = parseFloat(match[1])
				overall.lines = parseFloat(match[2])
			}
		} else if (line.includes("src/") && line.includes("|")) {
			const parts = line.split("|").map((p) => p.trim())
			if (parts.length >= 4) {
				const name = parts[0]
				const funcs = parseFloat(parts[1])
				const linesCov = parseFloat(parts[2])
				const uncovered = parts[3]

				if (!isNaN(funcs) && !isNaN(linesCov)) {
					files.push({ name, funcs, lines: linesCov, uncovered })
				}
			}
		}
	}

	return { overall, files }
}

/**
 * Generate analysis report with recommendations
 */
function analyzeAndReport(data: {
	overall: { funcs: number; lines: number }
	files: Array<{ name: string; funcs: number; lines: number; uncovered: string }>
}): void {
	console.log("\n")
	console.log("═══════════════════════════════════════════════════════════════")
	console.log("                   COVERAGE ANALYSIS REPORT                      ")
	console.log("═══════════════════════════════════════════════════════════════\n")

	// Overall metrics
	console.log("📊 OVERALL METRICS")
	console.log("─────────────────────────────────────────────────────────────\n")
	console.log(`  Function Coverage:  ${data.overall.funcs.toFixed(2)}%`)
	console.log(`  Line Coverage:      ${data.overall.lines.toFixed(2)}%`)

	// Coverage assessment
	const avgCoverage = (data.overall.funcs + data.overall.lines) / 2
	let assessment = ""
	if (avgCoverage >= 90) {
		assessment = "Excellent ✅ - Great job!"
	} else if (avgCoverage >= 80) {
		assessment = "Good 👍 - Room for improvement"
	} else if (avgCoverage >= 70) {
		assessment = "Fair ⚠️ - Needs attention"
	} else {
		assessment = "Poor ❌ - Requires significant work"
	}
	console.log(`  Overall Assessment: ${assessment}\n`)

	// Files below threshold (70%)
	const lowCoverage = data.files.filter((f) => f.lines < 70)
	if (lowCoverage.length > 0) {
		console.log("⚠️  FILES BELOW 70% LINE COVERAGE\n")
		for (const file of lowCoverage) {
			console.log(`  ${file.name}`)
			console.log(`    Lines: ${file.lines.toFixed(2)}% | Functions: ${file.funcs.toFixed(2)}%`)
			if (file.uncovered) {
				console.log(`    Uncovered: ${file.uncovered}`)
			}
			console.log("")
		}
	}

	// High coverage files
	const highCoverage = data.files.filter((f) => f.lines >= 90)
	if (highCoverage.length > 0) {
		console.log("✅ FILES WITH >90% LINE COVERAGE\n")
		for (const file of highCoverage) {
			console.log(`  ${file.name}: ${file.lines.toFixed(2)}%`)
		}
		console.log("")
	}

	// Recommendations
	console.log("💡 RECOMMENDATIONS\n")
	if (data.overall.lines < 70) {
		console.log(
			"  • Add unit tests to improve overall line coverage to at least 70%",
		)
	}
	if (lowCoverage.length > 0) {
		console.log("  • Focus on testing the following files:")
		for (const file of lowCoverage) {
			console.log(
				`    - ${file.name} (currently ${file.lines.toFixed(2)}%)`,
			)
		}
	}
	console.log("  • Use 'bun test --coverage' to identify untested code paths")
	console.log("  • Consider using 'npm run test:coverage:html' for detailed HTML reports\n")

	console.log(
		"═══════════════════════════════════════════════════════════════\n",
	)
}

// Main execution
async function main(): Promise<void> {
	// Run coverage and save to text file
	const { execSync } = await import("node:child_process")
	const projectRoot = process.cwd()

	console.log("📈 Generating coverage report...\n")

	try {
		execSync("bun test --coverage --coverage-reporter=text", {
			stdio: "inherit",
			cwd: projectRoot,
		})
	} catch (error) {
		console.error("Failed to generate coverage report")
		process.exit(1)
	}

	// Parse and analyze
	const reportPath = resolve(projectRoot, "coverage/coverage.txt")
	const data = parseCoverageReport(reportPath)
	analyzeAndReport(data)
}

main().catch((err) => {
	console.error("Error:", err.message)
	process.exit(1)
})
