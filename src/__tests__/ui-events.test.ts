import { describe, it, expect } from "vitest";

// Ported from test-ui-events.clj

function makeUiEvent(type: string, payload: unknown) {
  return {
    jsonrpc: "2.0",
    method: "webview/dispatchEvent",
    params: { type, payload }
  };
}

function renderMessage(id: string, role: string, content: string) {
  return makeUiEvent("RenderMessage", { id, role, content });
}

function updateTokens(prompt: number, completion: number) {
  return makeUiEvent("UpdateTokens", { prompt, completion, total: prompt + completion });
}

function modelChanged(modelId: string) {
  return makeUiEvent("ModelChanged", { modelId });
}

function claimUiLock() {
  return {
    type: "request",
    id: "lock-req-1",
    payload: { action: "claimUiLock" }
  };
}

describe("UI Payload Tests", () => {
  it("RenderMessage event generation", () => {
    const evt = renderMessage("msg-1", "user", "Math calculation: 1+1");
    expect(evt.method).toBe("webview/dispatchEvent");
    expect(evt.params.type).toBe("RenderMessage");
    expect((evt.params.payload as any).id).toBe("msg-1");
    expect((evt.params.payload as any).role).toBe("user");
    expect((evt.params.payload as any).content).toBe("Math calculation: 1+1");
  });

  it("UpdateTokens event generation", () => {
    const evt = updateTokens(14800, 262100);
    expect(evt.params.type).toBe("UpdateTokens");
    expect((evt.params.payload as any).total).toBe(276900);
  });

  it("ModelChanged event generation", () => {
    const evt = modelChanged("Nex-N2-Pro");
    expect(evt.params.type).toBe("ModelChanged");
    expect((evt.params.payload as any).modelId).toBe("Nex-N2-Pro");
  });

  it("CLAIM_UI_LOCK request generation", () => {
    const evt = claimUiLock();
    expect(evt.type).toBe("request");
    expect(evt.payload.action).toBe("claimUiLock");
  });
});
