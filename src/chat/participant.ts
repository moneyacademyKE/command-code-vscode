import * as vscode from "vscode";
import { runPrint } from "../cli/commands";
import type { PermissionMode } from "../cli/types";
import { getActiveCwd, getEffectivePermissionMode, getEffectiveModel, getEffectiveMaxTurns } from "../config";
import { markdownFromCli } from "./format";
import { hasCodeProposal } from "../diff/preview";

interface ParticipantState {
  permissionMode: PermissionMode;
  model: string | undefined;
  planMode: boolean;
}

export function registerChatParticipant(context: vscode.ExtensionContext): void {
  loadPersistedState(context);

  const participant = vscode.chat.createChatParticipant(
    "cmd-lite.chat",
    async (
      request: vscode.ChatRequest,
      _chatContext: vscode.ChatContext,
      stream: vscode.ChatResponseStream,
      token: vscode.CancellationToken,
    ) => {
      const state = readState();
      const command = request.command;
      const prompt = buildPrompt(request, state, command);

      stream.progress(`Running cmd -p ${summarize(prompt)}…`);

      try {
        const abortController = new AbortController();
        token.onCancellationRequested(() => abortController.abort());

        const result = await runPrint(prompt, {
          cwd: getActiveCwd(),
          model: state.model ?? getEffectiveModel(),
          maxTurns: getEffectiveMaxTurns(),
          permissionMode: state.permissionMode ?? getEffectivePermissionMode(),
          plan: state.planMode || command === "plan",
          onStdoutChunk: (chunk: string) => {
            stream.markdown(markdownFromCli(chunk));
          },
          timeoutMs: 0,
        });
        abortController.abort();

        if (result.timedOut) {
          stream.markdown("\n\n_(Command Code was cancelled.)_\n");
        }

        if (result.exitCode !== 0 && result.stderr.trim()) {
          stream.markdown(
            `\n\n<details><summary>stderr (exit ${result.exitCode})</summary>\n\n\`\`\`\n${escape(result.stderr.trim())}\n\`\`\`\n</details>\n`,
          );
        }

        if (hasCodeProposal(result.stdout)) {
          stream.button({
            command: "cmd-lite.diff.show",
            title: "📊 Show Diff",
            arguments: [result.stdout],
          });
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        stream.markdown(`\n\n**Error:** ${escape(message)}\n`);
      }

      updateState(state);
      persistState(context);
      return { metadata: { command, planMode: state.planMode } } satisfies vscode.ChatResult;
    },
  );

  participant.iconPath = vscode.Uri.joinPath(context.extensionUri, "assets", "icon.png");
  participant.followupProvider = {
    provideFollowups(
      result: vscode.ChatResult,
      _context: vscode.ChatContext,
      _token: vscode.CancellationToken,
    ): vscode.ProviderResult<vscode.ChatFollowup[]> {
      const metadata = result.metadata as { command?: string; planMode?: boolean } | undefined;
      if (metadata?.command === "plan" || metadata?.planMode) {
        return [
          { prompt: "Start implementing the plan", label: "Implement" },
          { prompt: "Refine the plan with more detail", label: "Refine" },
          { prompt: "Split the plan into smaller steps", label: "Split" },
        ];
      }
      if (metadata?.command === "review") {
        return [
          { prompt: "Apply the suggested fix", label: "Apply fix" },
          { prompt: "Explain the issue in more detail", label: "Explain more" },
          { prompt: "Check for similar issues elsewhere", label: "Check elsewhere" },
        ];
      }
      if (metadata?.command === "taste") {
        return [
          { prompt: "Apply the taste to the current file", label: "Apply taste" },
          { prompt: "Show me the raw taste file", label: "Show taste" },
          { prompt: "Learn more taste from other repositories", label: "Learn more" },
        ];
      }
      return [
        { prompt: "Show me the taste learned so far", label: "Show taste" },
        { prompt: "Plan the next change", label: "Plan next" },
        { prompt: "Run the test suite", label: "Run tests" },
      ];
    },
  };

  context.subscriptions.push(participant);
}

function readState(): ParticipantState {
  const stored = currentSessionState;
  return stored ?? { permissionMode: "standard", model: undefined, planMode: false };
}

function updateState(next: ParticipantState): void {
  currentSessionState = next;
}

let currentSessionState: ParticipantState | undefined;

function persistState(context: vscode.ExtensionContext): void {
  context.globalState.update("cmd-lite.participantState", currentSessionState);
}

function loadPersistedState(context: vscode.ExtensionContext): void {
  const stored = context.globalState.get<ParticipantState>("cmd-lite.participantState");
  if (stored) {
    currentSessionState = stored;
  }
}

export function setParticipantPermissionMode(mode: PermissionMode): void {
  const state = readState();
  currentSessionState = { ...state, permissionMode: mode, planMode: mode === "plan" };
}

export function setParticipantModel(model: string | undefined): void {
  const state = readState();
  currentSessionState = { ...state, model };
}

export function getParticipantModel(): string | undefined {
  return readState().model;
}

function buildPrompt(
  request: vscode.ChatRequest,
  state: ParticipantState,
  command: string | undefined,
): string {
  const prefix: string[] = [];
  if (command === "plan") {
    prefix.push("Use plan mode. Do not modify files. Output a concrete plan.");
  }
  if (command === "review") {
    prefix.push("Review the current changes (or specified PR). Be specific and actionable.");
  }
  if (command === "taste") {
    prefix.push("Summarize and apply the project's learned taste from .commandcode/taste/.");
  }
  if (command === "learn") {
    prefix.push("Run `cmd taste learn .` to learn taste from the current repository, then summarize what was learned.");
  }
  if (state.planMode && command !== "plan") {
    prefix.push("Operate in plan mode: do not modify files, only propose.");
  }
  const userText = request.prompt.trim();
  const refs = formatReferences(request.references);
  const pieces = [...prefix];
  if (refs) pieces.push(refs);
  if (userText) pieces.push(userText);
  return pieces.join("\n\n").trim();
}

function formatReferences(refs: readonly vscode.ChatPromptReference[]): string {
  if (!refs || refs.length === 0) return "";
  const lines: string[] = [];
  for (const ref of refs) {
    const id = ref.id;
    const value = ref.value;
    if (value instanceof vscode.Uri) {
      lines.push(`Reference: ${value.fsPath} (id: ${id})`);
    } else if (typeof value === "string") {
      lines.push(`Reference: ${value} (id: ${id})`);
    }
  }
  return lines.join("\n");
}

function escape(input: string): string {
  return input.replace(/`/g, "\\`");
}

function summarize(input: string): string {
  const collapsed = input.replace(/\s+/g, " ").trim();
  return collapsed.length > 80 ? collapsed.slice(0, 77) + "…" : collapsed;
}