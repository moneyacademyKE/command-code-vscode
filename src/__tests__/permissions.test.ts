import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as os from "node:os";
import * as fs from "node:fs";
import * as path from "node:path";
import { checkPermissionStore, setPermissionStore, clearPermissionStore, initializePermissionStore } from "../permission/store";
import * as vscode from "vscode";

const testHome = path.join(os.tmpdir(), `cmd-lite-test-permissions-home-${Date.now()}`);

vi.mock("node:os", async () => {
  const actual = await vi.importActual<typeof os>("node:os");
  return {
    ...actual,
    homedir: () => testHome,
  };
});

vi.mock("vscode", () => {
  return {
    window: {
      createOutputChannel: () => ({
        info: vi.fn(),
        error: vi.fn(),
        warn: vi.fn(),
        debug: vi.fn(),
        trace: vi.fn(),
        clear: vi.fn(),
        show: vi.fn(),
        dispose: vi.fn(),
      }),
    },
  };
});

describe("Filesystem Permission Store", () => {
  beforeEach(() => {
    if (fs.existsSync(testHome)) {
      fs.rmSync(testHome, { recursive: true, force: true });
    }
    initializePermissionStore({} as vscode.ExtensionContext);
  });

  afterEach(() => {
    if (fs.existsSync(testHome)) {
      fs.rmSync(testHome, { recursive: true, force: true });
    }
  });

  it("should return null if permission key is not found", () => {
    expect(checkPermissionStore("non-existent-key")).toBeNull();
  });

  it("should set and check permission correctly", () => {
    setPermissionStore("test-action", "allow-always");
    expect(checkPermissionStore("test-action")).toBe("allow-always");

    const storeFile = path.join(testHome, ".commandcode", "permissions.json");
    expect(fs.existsSync(storeFile)).toBe(true);

    const fileContent = JSON.parse(fs.readFileSync(storeFile, "utf-8"));
    expect(fileContent["test-action"]).toBe("allow-always");
  });

  it("should overwrite/clear permissions correctly", () => {
    setPermissionStore("test-action-1", "allow-always");
    setPermissionStore("test-action-2", "deny-always");

    expect(checkPermissionStore("test-action-1")).toBe("allow-always");
    expect(checkPermissionStore("test-action-2")).toBe("deny-always");

    clearPermissionStore("test-action-1");
    expect(checkPermissionStore("test-action-1")).toBeNull();
    expect(checkPermissionStore("test-action-2")).toBe("deny-always");

    clearPermissionStore();
    expect(checkPermissionStore("test-action-2")).toBeNull();
  });
});
