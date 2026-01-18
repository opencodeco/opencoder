/**
 * Type declarations for semver.mjs
 */

/**
 * Parsed semver version object.
 */
export interface ParsedVersion {
	major: number
	minor: number
	patch: number
}

/**
 * Parses a semver version string into its numeric components.
 *
 * @param version - The version string (e.g., "1.2.3")
 * @returns Parsed version object or null if invalid
 *
 * @example
 * parseVersion("1.2.3")  // { major: 1, minor: 2, patch: 3 }
 * parseVersion("invalid")  // null
 */
export function parseVersion(version: string): ParsedVersion | null

/**
 * Compares two parsed version objects.
 *
 * @param a - First version
 * @param b - Second version
 * @returns -1 if a < b, 0 if a == b, 1 if a > b
 *
 * @example
 * compareVersions({ major: 1, minor: 0, patch: 0 }, { major: 2, minor: 0, patch: 0 })  // -1
 * compareVersions({ major: 1, minor: 0, patch: 0 }, { major: 1, minor: 0, patch: 0 })  // 0
 * compareVersions({ major: 2, minor: 0, patch: 0 }, { major: 1, minor: 0, patch: 0 })  // 1
 */
export function compareVersions(a: ParsedVersion, b: ParsedVersion): -1 | 0 | 1

/**
 * Checks if a version satisfies a semver range requirement.
 *
 * Supports common semver range patterns:
 * - Exact version: "1.0.0" (must match exactly)
 * - Greater than or equal: ">=1.0.0"
 * - Greater than: ">1.0.0"
 * - Less than or equal: "<=1.0.0"
 * - Less than: "<1.0.0"
 * - Caret (compatible with): "^1.0.0" (>=1.0.0 and <2.0.0)
 * - Tilde (approximately): "~1.2.0" (>=1.2.0 and <1.3.0)
 *
 * @param required - The required version range (e.g., ">=0.1.0", "^1.0.0")
 * @param current - The current version to check (e.g., "1.2.3")
 * @returns True if current version satisfies the required range
 *
 * @example
 * checkVersionCompatibility(">=0.1.0", "0.2.0")  // true
 * checkVersionCompatibility("^1.0.0", "1.5.0")  // true
 * checkVersionCompatibility("^1.0.0", "2.0.0")  // false
 * checkVersionCompatibility("~1.2.0", "1.2.5")  // true
 * checkVersionCompatibility("~1.2.0", "1.3.0")  // false
 */
export function checkVersionCompatibility(required: string, current: string): boolean
