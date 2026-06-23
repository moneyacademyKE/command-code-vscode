import { describe, it, expect } from "vitest";
import { parseJsonLinesDefensive } from "../util/util";

describe("parseJsonLinesDefensive", () => {
  it("parses valid JSON lines", () => {
    const input = '{"a": 1}\n{"b": 2}\n{"c": 3}';
    expect(parseJsonLinesDefensive(input)).toEqual([
      { a: 1 },
      { b: 2 },
      { c: 3 },
    ]);
  });

  it("skips empty lines", () => {
    const input = '{"a": 1}\n\n\n{"b": 2}';
    expect(parseJsonLinesDefensive(input)).toEqual([{ a: 1 }, { b: 2 }]);
  });

  it("skips whitespace-only lines", () => {
    const input = '{"a": 1}\n   \n\t\n{"b": 2}';
    expect(parseJsonLinesDefensive(input)).toEqual([{ a: 1 }, { b: 2 }]);
  });

  it("skips invalid JSON lines", () => {
    const input = '{"a": 1}\nnot json\n{"b": 2}';
    expect(parseJsonLinesDefensive(input)).toEqual([{ a: 1 }, { b: 2 }]);
  });

  it("skips arrays (not valid records)", () => {
    const input = '{"a": 1}\n[1, 2, 3]\n{"b": 2}';
    expect(parseJsonLinesDefensive(input)).toEqual([{ a: 1 }, { b: 2 }]);
  });

  it("skips primitives (not valid records)", () => {
    const input = '{"a": 1}\n"hello"\n42\ntrue\nnull\n{"b": 2}';
    expect(parseJsonLinesDefensive(input)).toEqual([{ a: 1 }, { b: 2 }]);
  });

  it("handles empty string", () => {
    expect(parseJsonLinesDefensive("")).toEqual([]);
  });

  it("handles only whitespace", () => {
    expect(parseJsonLinesDefensive("  \n \n")).toEqual([]);
  });

  it("handles trailing newline", () => {
    const input = '{"a": 1}\n{"b": 2}\n';
    expect(parseJsonLinesDefensive(input)).toEqual([{ a: 1 }, { b: 2 }]);
  });

  it("returns objects with nested values", () => {
    const input = '{"a": {"b": [1, 2]}}\n{"c": true}';
    expect(parseJsonLinesDefensive(input)).toEqual([
      { a: { b: [1, 2] } },
      { c: true },
    ]);
  });

  it("all lines invalid returns empty array", () => {
    const input = "invalid\nnot json\n42";
    expect(parseJsonLinesDefensive(input)).toEqual([]);
  });
});
