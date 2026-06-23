import { describe, it, expect } from "vitest";
import { truncateString } from "../util/util";

describe("truncateString", () => {
  it("returns the string unchanged when shorter than maxLength", () => {
    expect(truncateString("hello", 10)).toBe("hello");
  });

  it("returns the string unchanged when equal to maxLength", () => {
    expect(truncateString("hello", 5)).toBe("hello");
  });

  it("handles strings with special characters", () => {
    expect(truncateString("héllo wörld", 5)).toBe("héllo...");
  });

  it("truncates multi-code-point unicode and emoji grapheme clusters correctly", () => {
    expect(truncateString("Café 🎉 World!", 6)).toBe("Café 🎉...");
    expect(truncateString("👨‍👩‍👧", 1)).toBe("👨‍👩‍👧");
    expect(truncateString("👨‍👩‍👧 and more", 1)).toBe("👨‍👩‍👧...");
  });

  it("throws for negative maxLength", () => {
    expect(() => truncateString("hello", -1)).toThrow("maxLength must be non-negative");
  });

  it("handles empty string", () => {
    expect(truncateString("", 5)).toBe("");
  });

  it("handles maxLength of 0", () => {
    expect(truncateString("hello", 0)).toBe("...");
  });

  it("handles very long strings", () => {
    const long = "a".repeat(1000);
    expect(truncateString(long, 10)).toBe("a".repeat(10) + "...");
  });

  it("handles single-character maxLength", () => {
    expect(truncateString("ab", 1)).toBe("a...");
  });
});
