import { describe, expect, it } from "bun:test"
import { checkVersionCompatibility, compareVersions, parseVersion } from "../src/semver.mjs"

describe("semver.mjs exports", () => {
	describe("parseVersion", () => {
		it("should parse valid semver strings", () => {
			expect(parseVersion("1.0.0")).toEqual({ major: 1, minor: 0, patch: 0 })
			expect(parseVersion("1.2.3")).toEqual({ major: 1, minor: 2, patch: 3 })
			expect(parseVersion("0.0.0")).toEqual({ major: 0, minor: 0, patch: 0 })
			expect(parseVersion("10.20.30")).toEqual({ major: 10, minor: 20, patch: 30 })
		})

		it("should return null for invalid semver strings", () => {
			expect(parseVersion("invalid")).toBeNull()
			expect(parseVersion("1.0")).toBeNull()
			expect(parseVersion("1")).toBeNull()
			expect(parseVersion("1.0.0.0")).toBeNull()
			expect(parseVersion("v1.0.0")).toBeNull()
			expect(parseVersion("1.0.0-alpha")).toBeNull()
			expect(parseVersion("")).toBeNull()
		})

		it("should handle edge cases", () => {
			expect(parseVersion("0.0.1")).toEqual({ major: 0, minor: 0, patch: 1 })
			expect(parseVersion("999.999.999")).toEqual({ major: 999, minor: 999, patch: 999 })
		})

		it("should throw TypeError for null", () => {
			expect(() => parseVersion(null as unknown as string)).toThrow(TypeError)
			expect(() => parseVersion(null as unknown as string)).toThrow(
				"parseVersion: version must be a string, got null",
			)
		})

		it("should throw TypeError for undefined", () => {
			expect(() => parseVersion(undefined as unknown as string)).toThrow(TypeError)
			expect(() => parseVersion(undefined as unknown as string)).toThrow(
				"parseVersion: version must be a string, got undefined",
			)
		})

		it("should throw TypeError for non-string inputs", () => {
			expect(() => parseVersion(123 as unknown as string)).toThrow(TypeError)
			expect(() => parseVersion(123 as unknown as string)).toThrow(
				"parseVersion: version must be a string, got number",
			)
			expect(() => parseVersion({} as unknown as string)).toThrow(TypeError)
			expect(() => parseVersion({} as unknown as string)).toThrow(
				"parseVersion: version must be a string, got object",
			)
		})
	})

	describe("compareVersions", () => {
		it("should return 0 for equal versions", () => {
			expect(
				compareVersions({ major: 1, minor: 0, patch: 0 }, { major: 1, minor: 0, patch: 0 }),
			).toBe(0)
			expect(
				compareVersions({ major: 0, minor: 0, patch: 0 }, { major: 0, minor: 0, patch: 0 }),
			).toBe(0)
		})

		it("should return -1 when first version is less", () => {
			// Major version difference
			expect(
				compareVersions({ major: 1, minor: 0, patch: 0 }, { major: 2, minor: 0, patch: 0 }),
			).toBe(-1)
			// Minor version difference
			expect(
				compareVersions({ major: 1, minor: 0, patch: 0 }, { major: 1, minor: 1, patch: 0 }),
			).toBe(-1)
			// Patch version difference
			expect(
				compareVersions({ major: 1, minor: 0, patch: 0 }, { major: 1, minor: 0, patch: 1 }),
			).toBe(-1)
		})

		it("should return 1 when first version is greater", () => {
			// Major version difference
			expect(
				compareVersions({ major: 2, minor: 0, patch: 0 }, { major: 1, minor: 0, patch: 0 }),
			).toBe(1)
			// Minor version difference
			expect(
				compareVersions({ major: 1, minor: 1, patch: 0 }, { major: 1, minor: 0, patch: 0 }),
			).toBe(1)
			// Patch version difference
			expect(
				compareVersions({ major: 1, minor: 0, patch: 1 }, { major: 1, minor: 0, patch: 0 }),
			).toBe(1)
		})

		it("should compare major before minor before patch", () => {
			// Higher major wins even with lower minor/patch
			expect(
				compareVersions({ major: 2, minor: 0, patch: 0 }, { major: 1, minor: 9, patch: 9 }),
			).toBe(1)
			// Higher minor wins even with lower patch
			expect(
				compareVersions({ major: 1, minor: 2, patch: 0 }, { major: 1, minor: 1, patch: 9 }),
			).toBe(1)
		})

		it("should throw TypeError for null parameter a", () => {
			expect(() =>
				compareVersions(null as unknown as { major: number; minor: number; patch: number }, {
					major: 1,
					minor: 0,
					patch: 0,
				}),
			).toThrow(TypeError)
			expect(() =>
				compareVersions(null as unknown as { major: number; minor: number; patch: number }, {
					major: 1,
					minor: 0,
					patch: 0,
				}),
			).toThrow("compareVersions: a must be a ParsedVersion object, got null")
		})

		it("should throw TypeError for undefined parameter b", () => {
			expect(() =>
				compareVersions(
					{ major: 1, minor: 0, patch: 0 },
					undefined as unknown as { major: number; minor: number; patch: number },
				),
			).toThrow(TypeError)
			expect(() =>
				compareVersions(
					{ major: 1, minor: 0, patch: 0 },
					undefined as unknown as { major: number; minor: number; patch: number },
				),
			).toThrow("compareVersions: b must be a ParsedVersion object, got undefined")
		})

		it("should throw TypeError for non-object parameters", () => {
			expect(() =>
				compareVersions("1.0.0" as unknown as { major: number; minor: number; patch: number }, {
					major: 1,
					minor: 0,
					patch: 0,
				}),
			).toThrow(TypeError)
			expect(() =>
				compareVersions("1.0.0" as unknown as { major: number; minor: number; patch: number }, {
					major: 1,
					minor: 0,
					patch: 0,
				}),
			).toThrow("compareVersions: a must be a ParsedVersion object, got string")
		})

		it("should throw TypeError for empty objects", () => {
			expect(() =>
				compareVersions({} as unknown as { major: number; minor: number; patch: number }, {
					major: 1,
					minor: 0,
					patch: 0,
				}),
			).toThrow(TypeError)
			expect(() =>
				compareVersions({} as unknown as { major: number; minor: number; patch: number }, {
					major: 1,
					minor: 0,
					patch: 0,
				}),
			).toThrow("compareVersions: a must have numeric major, minor, and patch properties")
		})

		it("should throw TypeError for objects with non-numeric properties", () => {
			expect(() =>
				compareVersions(
					{ major: "1", minor: 0, patch: 0 } as unknown as {
						major: number
						minor: number
						patch: number
					},
					{ major: 1, minor: 0, patch: 0 },
				),
			).toThrow(TypeError)
			expect(() =>
				compareVersions(
					{ major: 1, minor: null, patch: 0 } as unknown as {
						major: number
						minor: number
						patch: number
					},
					{ major: 1, minor: 0, patch: 0 },
				),
			).toThrow("compareVersions: a must have numeric major, minor, and patch properties")
		})
	})

	describe("checkVersionCompatibility", () => {
		describe("exact version matching", () => {
			it("should return true for exact match", () => {
				expect(checkVersionCompatibility("1.0.0", "1.0.0")).toBe(true)
			})

			it("should return false for different versions", () => {
				expect(checkVersionCompatibility("1.0.0", "1.0.1")).toBe(false)
				expect(checkVersionCompatibility("1.0.0", "1.1.0")).toBe(false)
				expect(checkVersionCompatibility("1.0.0", "2.0.0")).toBe(false)
			})
		})

		describe(">= operator", () => {
			it("should return true when current equals required", () => {
				expect(checkVersionCompatibility(">=1.0.0", "1.0.0")).toBe(true)
			})

			it("should return true when current is greater", () => {
				expect(checkVersionCompatibility(">=1.0.0", "1.0.1")).toBe(true)
				expect(checkVersionCompatibility(">=1.0.0", "1.1.0")).toBe(true)
				expect(checkVersionCompatibility(">=1.0.0", "2.0.0")).toBe(true)
				expect(checkVersionCompatibility(">=0.1.0", "0.2.0")).toBe(true)
			})

			it("should return false when current is less", () => {
				expect(checkVersionCompatibility(">=1.0.0", "0.9.9")).toBe(false)
				expect(checkVersionCompatibility(">=1.0.0", "0.1.0")).toBe(false)
			})
		})

		describe("> operator", () => {
			it("should return false when current equals required", () => {
				expect(checkVersionCompatibility(">1.0.0", "1.0.0")).toBe(false)
			})

			it("should return true when current is greater", () => {
				expect(checkVersionCompatibility(">1.0.0", "1.0.1")).toBe(true)
				expect(checkVersionCompatibility(">1.0.0", "2.0.0")).toBe(true)
			})

			it("should return false when current is less", () => {
				expect(checkVersionCompatibility(">1.0.0", "0.9.9")).toBe(false)
			})
		})

		describe("<= operator", () => {
			it("should return true when current equals required", () => {
				expect(checkVersionCompatibility("<=1.0.0", "1.0.0")).toBe(true)
			})

			it("should return true when current is less", () => {
				expect(checkVersionCompatibility("<=1.0.0", "0.9.9")).toBe(true)
				expect(checkVersionCompatibility("<=1.0.0", "0.1.0")).toBe(true)
			})

			it("should return false when current is greater", () => {
				expect(checkVersionCompatibility("<=1.0.0", "1.0.1")).toBe(false)
				expect(checkVersionCompatibility("<=1.0.0", "2.0.0")).toBe(false)
			})
		})

		describe("< operator", () => {
			it("should return false when current equals required", () => {
				expect(checkVersionCompatibility("<1.0.0", "1.0.0")).toBe(false)
			})

			it("should return true when current is less", () => {
				expect(checkVersionCompatibility("<1.0.0", "0.9.9")).toBe(true)
				expect(checkVersionCompatibility("<1.0.0", "0.1.0")).toBe(true)
			})

			it("should return false when current is greater", () => {
				expect(checkVersionCompatibility("<1.0.0", "1.0.1")).toBe(false)
			})
		})

		describe("^ caret operator", () => {
			it("should return true for compatible versions with major >= 1", () => {
				expect(checkVersionCompatibility("^1.0.0", "1.0.0")).toBe(true)
				expect(checkVersionCompatibility("^1.0.0", "1.5.0")).toBe(true)
				expect(checkVersionCompatibility("^1.0.0", "1.9.9")).toBe(true)
				expect(checkVersionCompatibility("^1.2.3", "1.5.0")).toBe(true)
			})

			it("should return false for incompatible major versions", () => {
				expect(checkVersionCompatibility("^1.0.0", "2.0.0")).toBe(false)
				expect(checkVersionCompatibility("^1.0.0", "0.9.9")).toBe(false)
			})

			it("should return false when current is below required", () => {
				expect(checkVersionCompatibility("^1.2.0", "1.1.0")).toBe(false)
			})

			it("should handle 0.x versions (minor must match)", () => {
				expect(checkVersionCompatibility("^0.1.0", "0.1.0")).toBe(true)
				expect(checkVersionCompatibility("^0.1.0", "0.1.5")).toBe(true)
				expect(checkVersionCompatibility("^0.1.0", "0.2.0")).toBe(false)
				expect(checkVersionCompatibility("^0.1.0", "1.0.0")).toBe(false)
			})
		})

		describe("~ tilde operator", () => {
			it("should return true for compatible patch versions", () => {
				expect(checkVersionCompatibility("~1.2.0", "1.2.0")).toBe(true)
				expect(checkVersionCompatibility("~1.2.0", "1.2.5")).toBe(true)
				expect(checkVersionCompatibility("~1.2.0", "1.2.99")).toBe(true)
			})

			it("should return false when minor version differs", () => {
				expect(checkVersionCompatibility("~1.2.0", "1.3.0")).toBe(false)
				expect(checkVersionCompatibility("~1.2.0", "1.1.0")).toBe(false)
			})

			it("should return false when major version differs", () => {
				expect(checkVersionCompatibility("~1.2.0", "2.2.0")).toBe(false)
				expect(checkVersionCompatibility("~1.2.0", "0.2.0")).toBe(false)
			})

			it("should return false when current is below required patch", () => {
				expect(checkVersionCompatibility("~1.2.5", "1.2.4")).toBe(false)
			})
		})

		describe("invalid inputs", () => {
			it("should return false for invalid current version", () => {
				expect(checkVersionCompatibility(">=1.0.0", "invalid")).toBe(false)
				expect(checkVersionCompatibility(">=1.0.0", "1.0")).toBe(false)
				expect(checkVersionCompatibility(">=1.0.0", "1")).toBe(false)
			})

			it("should return false for invalid required version", () => {
				expect(checkVersionCompatibility("invalid", "1.0.0")).toBe(false)
				expect(checkVersionCompatibility(">=invalid", "1.0.0")).toBe(false)
				expect(checkVersionCompatibility("^", "1.0.0")).toBe(false)
			})

			it("should return false for malformed range with missing patch version", () => {
				// "^1.2" is missing the patch number, so parseVersion returns null
				expect(checkVersionCompatibility("^1.2", "1.2.0")).toBe(false)
				expect(checkVersionCompatibility("~1.2", "1.2.0")).toBe(false)
				expect(checkVersionCompatibility(">=1.2", "1.2.0")).toBe(false)
				expect(checkVersionCompatibility(">1.2", "1.2.0")).toBe(false)
				expect(checkVersionCompatibility("<=1.2", "1.2.0")).toBe(false)
				expect(checkVersionCompatibility("<1.2", "1.2.0")).toBe(false)
			})

			it("should return false for malformed range with too many version parts", () => {
				// ">=1.2.3.4" has too many parts, so parseVersion returns null
				expect(checkVersionCompatibility(">=1.2.3.4", "1.2.3")).toBe(false)
				expect(checkVersionCompatibility("^1.2.3.4", "1.2.3")).toBe(false)
				expect(checkVersionCompatibility("~1.2.3.4", "1.2.3")).toBe(false)
				expect(checkVersionCompatibility(">1.2.3.4", "1.2.3")).toBe(false)
				expect(checkVersionCompatibility("<=1.2.3.4", "1.2.3")).toBe(false)
				expect(checkVersionCompatibility("<1.2.3.4", "1.2.3")).toBe(false)
			})

			it("should return false for malformed range with double operator", () => {
				// ">>1.0.0" - the first > is consumed, leaving ">1.0.0" which is still invalid
				// because parseVersion(">1.0.0") returns null (starts with non-digit)
				expect(checkVersionCompatibility(">>1.0.0", "1.0.1")).toBe(false)
				expect(checkVersionCompatibility(">>1.0.0", "2.0.0")).toBe(false)
				expect(checkVersionCompatibility(">>=1.0.0", "1.0.0")).toBe(false)
				expect(checkVersionCompatibility("^^1.0.0", "1.0.0")).toBe(false)
				expect(checkVersionCompatibility("~~1.0.0", "1.0.0")).toBe(false)
			})

			it("should return false for operator-only ranges without version numbers", () => {
				// These are operators with no version number
				expect(checkVersionCompatibility("^", "1.0.0")).toBe(false)
				expect(checkVersionCompatibility("~", "1.0.0")).toBe(false)
				expect(checkVersionCompatibility(">=", "1.0.0")).toBe(false)
				expect(checkVersionCompatibility(">", "1.0.0")).toBe(false)
				expect(checkVersionCompatibility("<=", "1.0.0")).toBe(false)
				expect(checkVersionCompatibility("<", "1.0.0")).toBe(false)
			})

			it("should throw TypeError for null required", () => {
				expect(() => checkVersionCompatibility(null as unknown as string, "1.0.0")).toThrow(
					TypeError,
				)
				expect(() => checkVersionCompatibility(null as unknown as string, "1.0.0")).toThrow(
					"checkVersionCompatibility: required must be a string, got null",
				)
			})

			it("should throw TypeError for undefined required", () => {
				expect(() => checkVersionCompatibility(undefined as unknown as string, "1.0.0")).toThrow(
					TypeError,
				)
				expect(() => checkVersionCompatibility(undefined as unknown as string, "1.0.0")).toThrow(
					"checkVersionCompatibility: required must be a string, got undefined",
				)
			})

			it("should throw TypeError for non-string required", () => {
				expect(() => checkVersionCompatibility(123 as unknown as string, "1.0.0")).toThrow(
					TypeError,
				)
				expect(() => checkVersionCompatibility(123 as unknown as string, "1.0.0")).toThrow(
					"checkVersionCompatibility: required must be a string, got number",
				)
			})

			it("should throw TypeError for empty string required", () => {
				expect(() => checkVersionCompatibility("", "1.0.0")).toThrow(TypeError)
				expect(() => checkVersionCompatibility("", "1.0.0")).toThrow(
					"checkVersionCompatibility: required must not be empty",
				)
			})

			it("should throw TypeError for whitespace-only required", () => {
				expect(() => checkVersionCompatibility("   ", "1.0.0")).toThrow(TypeError)
				expect(() => checkVersionCompatibility("   ", "1.0.0")).toThrow(
					"checkVersionCompatibility: required must not be empty",
				)
			})

			it("should throw TypeError for null current", () => {
				expect(() => checkVersionCompatibility(">=1.0.0", null as unknown as string)).toThrow(
					TypeError,
				)
				expect(() => checkVersionCompatibility(">=1.0.0", null as unknown as string)).toThrow(
					"checkVersionCompatibility: current must be a string, got null",
				)
			})

			it("should throw TypeError for undefined current", () => {
				expect(() => checkVersionCompatibility(">=1.0.0", undefined as unknown as string)).toThrow(
					TypeError,
				)
				expect(() => checkVersionCompatibility(">=1.0.0", undefined as unknown as string)).toThrow(
					"checkVersionCompatibility: current must be a string, got undefined",
				)
			})

			it("should throw TypeError for non-string current", () => {
				expect(() => checkVersionCompatibility(">=1.0.0", 100 as unknown as string)).toThrow(
					TypeError,
				)
				expect(() => checkVersionCompatibility(">=1.0.0", 100 as unknown as string)).toThrow(
					"checkVersionCompatibility: current must be a string, got number",
				)
			})

			it("should throw TypeError for empty string current", () => {
				expect(() => checkVersionCompatibility(">=1.0.0", "")).toThrow(TypeError)
				expect(() => checkVersionCompatibility(">=1.0.0", "")).toThrow(
					"checkVersionCompatibility: current must not be empty",
				)
			})

			it("should throw TypeError for whitespace-only current", () => {
				expect(() => checkVersionCompatibility(">=1.0.0", "   ")).toThrow(TypeError)
				expect(() => checkVersionCompatibility(">=1.0.0", "   ")).toThrow(
					"checkVersionCompatibility: current must not be empty",
				)
			})
		})
	})
})
