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
