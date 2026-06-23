/**
 * Pure utility functions shared across both Node and browser environments.
 */


export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}


export function parseJsonLinesDefensive(jsonl: string): Record<string, unknown>[] {
  const result: Record<string, unknown>[] = [];
  for (const line of jsonl.split("\n")) {
    const trimmed = line.trim();
    if (trimmed === "") continue;
    try {
      const parsed = JSON.parse(trimmed);
      if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
        result.push(parsed as Record<string, unknown>);
      }
    } catch {
      continue;
    }
  }
  return result;
}


export function truncateString(str: string, maxLength: number): string {
  if (maxLength < 0) {
    throw new Error("maxLength must be non-negative");
  }
  const segmenter = new Intl.Segmenter("en", { granularity: "grapheme" });
  const segments = Array.from(segmenter.segment(str), (s) => s.segment);
  if (segments.length <= maxLength) return str;
  return segments.slice(0, maxLength).join("") + "...";
}

export function stripAnsi(input: string): string {
  // eslint-disable-next-line no-control-regex
  let out = input.replace(/\x1b\[[0-9;]*m/g, "");
  // Strip OSC hyperlink sequences: \x1b]8;;URL\x1b\\TEXT\x1b]8;;\x1b\\
  // eslint-disable-next-line no-control-regex
  out = out.replace(/\x1b\]8;;[^\x07\x1b]*(\x07|\x1b\\)/g, "");
  // eslint-disable-next-line no-control-regex
  out = out.replace(/\x1b\]8;;\x1b\\/g, "");
  return out;
}
