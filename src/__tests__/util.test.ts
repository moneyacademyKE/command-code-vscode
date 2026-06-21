import { describe, it, expect } from "vitest";
import { truncateString } from "../util/util";

describe("truncateString", () => {
  it("returns the string unchanged when shorter than maxLength", () => {
    expect(truncateString("hello", 10)).toBe("hello");
  });

  it("returns the string unchanged when equal to maxLength", () => {
    expect(truncateString("hello", 5)).toBe("hello");
  });

  it("truncates and appends ... when longer than maxLength", () => {
    expect(truncateString("hello world", 5)).toBe("hello...");
  });

  it("handles empty string", () => {
    expect(truncateString("", 5)).toBe("");
  });

  it("handles maxLength of 0", () => {
    expect(truncateString("abc", 0)).toBe("...");
  });

  it("throws for negative maxLength", () => {
    expect(() => truncateString("abc", -1)).toThrow(
      "maxLength must be non-negative",
    );
  });
});
