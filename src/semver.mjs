/**
 * Semver version comparison utilities.
 *
 * This module provides functions for parsing and comparing semantic versions,
 * supporting common range patterns like ^, ~, >=, >, <=, <, and exact matching.
 */

/**
 * A parsed semantic version with numeric components.
 * @typedef {Object} ParsedVersion
 * @property {number} major - The major version number (breaking changes)
 * @property {number} minor - The minor version number (new features, backwards compatible)
 * @property {number} patch - The patch version number (bug fixes, backwards compatible)
 */

/**
 * Parses a semver version string into its numeric components.
 *
 * @param {string} version - The version string (e.g., "1.2.3")
 * @returns {ParsedVersion | null} Parsed version or null if invalid
 * @throws {TypeError} If version is not a string
 */
export function parseVersion(version) {
	if (typeof version !== "string") {
		throw new TypeError(
			`parseVersion: version must be a string, got ${version === null ? "null" : typeof version}`,
		)
	}
	const match = version.match(/^(\d+)\.(\d+)\.(\d+)$/)
	if (!match) return null
	return {
		major: Number.parseInt(match[1], 10),
		minor: Number.parseInt(match[2], 10),
		patch: Number.parseInt(match[3], 10),
	}
}

/**
 * Validates that a value is a valid ParsedVersion object.
 *
 * This internal helper ensures that values passed to version comparison functions
 * conform to the expected ParsedVersion structure with numeric major, minor, and
 * patch properties. It provides descriptive error messages when validation fails.
 *
 * @param {unknown} value - The value to validate as a ParsedVersion object
 * @param {string} paramName - The parameter name used in error messages for context
 * @returns {void} Returns nothing if validation passes
 * @throws {TypeError} If value is null or undefined
 * @throws {TypeError} If value is not an object
 * @throws {TypeError} If value lacks numeric major, minor, or patch properties
 *
 * @example
 * // Valid ParsedVersion - passes silently
 * validateParsedVersion({ major: 1, minor: 2, patch: 3 }, "version")
 *
 * @example
 * // Null value - throws TypeError
 * validateParsedVersion(null, "a")
 * // Throws: "compareVersions: a must be a ParsedVersion object, got null"
 *
 * @example
 * // Missing properties - throws TypeError
 * validateParsedVersion({ major: 1 }, "b")
 * // Throws: "compareVersions: b must have numeric major, minor, and patch properties"
 */
function validateParsedVersion(value, paramName) {
	if (value === null || value === undefined) {
		throw new TypeError(
			`compareVersions: ${paramName} must be a ParsedVersion object, got ${value === null ? "null" : "undefined"}`,
		)
	}
	if (typeof value !== "object") {
		throw new TypeError(
			`compareVersions: ${paramName} must be a ParsedVersion object, got ${typeof value}`,
		)
	}
	const v = /** @type {Record<string, unknown>} */ (value)
	if (typeof v.major !== "number" || typeof v.minor !== "number" || typeof v.patch !== "number") {
		throw new TypeError(
			`compareVersions: ${paramName} must have numeric major, minor, and patch properties`,
		)
	}
}

/**
 * Compares two parsed version objects.
 *
 * @param {ParsedVersion} a - First version
 * @param {ParsedVersion} b - Second version
 * @returns {number} -1 if a < b, 0 if a == b, 1 if a > b
 * @throws {TypeError} If a or b is not a valid ParsedVersion object
 */
export function compareVersions(a, b) {
	validateParsedVersion(a, "a")
	validateParsedVersion(b, "b")
	if (a.major !== b.major) return a.major < b.major ? -1 : 1
	if (a.minor !== b.minor) return a.minor < b.minor ? -1 : 1
	if (a.patch !== b.patch) return a.patch < b.patch ? -1 : 1
	return 0
}

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
 * @param {string} required - The required version range (e.g., ">=0.1.0", "^1.0.0")
 * @param {string} current - The current version to check (e.g., "1.2.3")
 * @returns {boolean} True if current version satisfies the required range
 *
 * @example
 * checkVersionCompatibility(">=0.1.0", "0.2.0")  // true
 * checkVersionCompatibility("^1.0.0", "1.5.0")  // true
 * checkVersionCompatibility("^1.0.0", "2.0.0")  // false
 * checkVersionCompatibility("~1.2.0", "1.2.5")  // true
 * checkVersionCompatibility("~1.2.0", "1.3.0")  // false
 * @throws {TypeError} If required or current is not a non-empty string
 */
export function checkVersionCompatibility(required, current) {
	if (typeof required !== "string") {
		throw new TypeError(
			`checkVersionCompatibility: required must be a string, got ${required === null ? "null" : typeof required}`,
		)
	}
	if (required.trim() === "") {
		throw new TypeError("checkVersionCompatibility: required must not be empty")
	}
	if (typeof current !== "string") {
		throw new TypeError(
			`checkVersionCompatibility: current must be a string, got ${current === null ? "null" : typeof current}`,
		)
	}
	if (current.trim() === "") {
		throw new TypeError("checkVersionCompatibility: current must not be empty")
	}
	const currentVersion = parseVersion(current)
	if (!currentVersion) return false

	// Handle caret range: ^1.0.0 means >=1.0.0 and <2.0.0 (for major >= 1)
	// For ^0.x.y, it means >=0.x.y and <0.(x+1).0
	if (required.startsWith("^")) {
		const rangeVersion = parseVersion(required.slice(1))
		if (!rangeVersion) return false

		// Must be >= the specified version
		if (compareVersions(currentVersion, rangeVersion) < 0) return false

		// For major version 0, only minor version must match
		if (rangeVersion.major === 0) {
			return currentVersion.major === 0 && currentVersion.minor === rangeVersion.minor
		}

		// Major version must match
		return currentVersion.major === rangeVersion.major
	}

	// Handle tilde range: ~1.2.0 means >=1.2.0 and <1.3.0
	if (required.startsWith("~")) {
		const rangeVersion = parseVersion(required.slice(1))
		if (!rangeVersion) return false

		// Must be >= the specified version
		if (compareVersions(currentVersion, rangeVersion) < 0) return false

		// Major and minor must match
		return (
			currentVersion.major === rangeVersion.major && currentVersion.minor === rangeVersion.minor
		)
	}

	// Handle >= operator
	if (required.startsWith(">=")) {
		const rangeVersion = parseVersion(required.slice(2))
		if (!rangeVersion) return false
		return compareVersions(currentVersion, rangeVersion) >= 0
	}

	// Handle > operator
	if (required.startsWith(">")) {
		const rangeVersion = parseVersion(required.slice(1))
		if (!rangeVersion) return false
		return compareVersions(currentVersion, rangeVersion) > 0
	}

	// Handle <= operator
	if (required.startsWith("<=")) {
		const rangeVersion = parseVersion(required.slice(2))
		if (!rangeVersion) return false
		return compareVersions(currentVersion, rangeVersion) <= 0
	}

	// Handle < operator
	if (required.startsWith("<")) {
		const rangeVersion = parseVersion(required.slice(1))
		if (!rangeVersion) return false
		return compareVersions(currentVersion, rangeVersion) < 0
	}

	// Handle exact version match
	const rangeVersion = parseVersion(required)
	if (!rangeVersion) return false
	return compareVersions(currentVersion, rangeVersion) === 0
}
