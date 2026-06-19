import { describe, it, expect, vi } from "vitest";
import * as path from "node:path";
import * as os from "node:os";
import { writeFileSync, chmodSync, unlinkSync, existsSync, accessSync, constants } from "node:fs";

vi.mock("vscode", () => {
  return {
    workspace: {
      getConfiguration: () => ({ get: vi.fn() })
    }
  };
});

describe("validateCliPath logic", () => {
  function validateCliPath(cliPath: string): { valid: boolean; message?: string } {
    if (cliPath === "cmd" || cliPath === "command-code") {
      return { valid: true };
    }
    if (existsSync(cliPath)) {
      try {
        accessSync(cliPath, constants.X_OK);
        return { valid: true };
      } catch {
        return {
          valid: false,
          message: `CLI path "${cliPath}" is not executable.`,
        };
      }
    }
    return {
      valid: false,
      message: `CLI binary not found at "${cliPath}".`,
    };
  }

  it("accepts 'cmd' as valid", () => {
    expect(validateCliPath("cmd")).toEqual({ valid: true });
  });

  it("accepts 'command-code' as valid", () => {
    expect(validateCliPath("command-code")).toEqual({ valid: true });
  });

  it("rejects non-existent path", () => {
    const result = validateCliPath("/nonexistent/path/to/cmd");
    expect(result.valid).toBe(false);
    expect(result.message).toContain("not found");
  });

  it("rejects non-executable file", () => {
    const tmpFile = path.join(os.tmpdir(), `cmd-test-${Date.now()}`);
    writeFileSync(tmpFile, "#!/bin/sh\necho hi");
    try {
      chmodSync(tmpFile, 0o644); // not executable
      const result = validateCliPath(tmpFile);
      expect(result.valid).toBe(false);
      expect(result.message).toContain("not executable");
    } finally {
      unlinkSync(tmpFile);
    }
  });

  it("accepts executable file", () => {
    const tmpFile = path.join(os.tmpdir(), `cmd-test-${Date.now()}`);
    writeFileSync(tmpFile, "#!/bin/sh\necho hi");
    try {
      chmodSync(tmpFile, 0o755);
      const result = validateCliPath(tmpFile);
      expect(result.valid).toBe(true);
    } finally {
      unlinkSync(tmpFile);
    }
  });
});

import { checkCliVersion } from "../cli/resolve";

describe("checkCliVersion logic", () => {
  it("returns compatible for version >= 0.39.0", () => {
    const tmpFile = path.join(os.tmpdir(), `cmd-version-test-ok-${Date.now()}`);
    writeFileSync(tmpFile, "#!/bin/sh\necho 0.39.0");
    chmodSync(tmpFile, 0o755);
    try {
      const result = checkCliVersion(tmpFile);
      expect(result.compatible).toBe(true);
      expect(result.version).toBe("0.39.0");
    } finally {
      unlinkSync(tmpFile);
    }
  });

  it("returns incompatible for version < 0.39.0", () => {
    const tmpFile = path.join(os.tmpdir(), `cmd-version-test-bad-${Date.now()}`);
    writeFileSync(tmpFile, "#!/bin/sh\necho 0.38.2");
    chmodSync(tmpFile, 0o755);
    try {
      const result = checkCliVersion(tmpFile);
      expect(result.compatible).toBe(false);
      expect(result.version).toBe("0.38.2");
      expect(result.message).toContain("too old");
    } finally {
      unlinkSync(tmpFile);
    }
  });

  it("returns compatible if version cannot be parsed", () => {
    const tmpFile = path.join(os.tmpdir(), `cmd-version-test-unparseable-${Date.now()}`);
    writeFileSync(tmpFile, "#!/bin/sh\necho hello world");
    chmodSync(tmpFile, 0o755);
    try {
      const result = checkCliVersion(tmpFile);
      expect(result.compatible).toBe(true);
    } finally {
      unlinkSync(tmpFile);
    }
  });
});
