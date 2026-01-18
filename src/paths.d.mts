/**
 * Type declarations for paths.mjs
 */

/**
 * Get the package root directory from a module's import.meta.url
 */
export function getPackageRoot(importMetaUrl: string): string

/**
 * Get the source directory containing agent markdown files.
 */
export function getAgentsSourceDir(packageRoot: string): string

/**
 * The target directory where agents are installed.
 */
export declare const AGENTS_TARGET_DIR: string

/**
 * Returns a user-friendly error message based on the error code.
 */
export function getErrorMessage(
	error: Error & { code?: string },
	file: string,
	targetPath: string,
): string
