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
    expect(truncateString("hello", 0)).toBe("...");
  });

  it("handles maxLength smaller than ellipsis length", () => {
    expect(truncateString("hello", 1)).toBe("h...");
    expect(truncateString("hello", 2)).toBe("he...");
  });

  it("handles very long strings", () => {
    const long = "a".repeat(1000);
    expect(truncateString(long, 500)).toBe("a".repeat(500) + "...");
  });

  it("throws for negative maxLength", () => {
    expect(() => truncateString("abc", -1)).toThrow(
      "maxLength must be non-negative",
    );
  });
});
