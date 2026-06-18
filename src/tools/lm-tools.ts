import * as path from "node:path";
import * as vscode from "vscode";
import { runPrint, listModels } from "../cli/commands";
import { getActiveCwd, getEffectiveModel, getEffectiveMaxTurns, getEffectivePermissionMode } from "../config";
import { getGitContext } from "../context/git";
import { runParallel, formatParallelResults, type AgentTask } from "../agents/orchestrator";

export function registerLmTools(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.lm.registerTool(
      "cmd-lite_runPrint",
      new RunPrintTool(),
    ),
    vscode.lm.registerTool(
      "cmd-lite_getTaste",
      new GetTasteTool(),
    ),
    vscode.lm.registerTool(
      "cmd-lite_getDiagnostics",
      new GetDiagnosticsTool(),
    ),
    vscode.lm.registerTool(
      "cmd-lite_getGitContext",
      new GetGitContextTool(),
    ),
    vscode.lm.registerTool(
      "cmd-lite_getOpenFiles",
      new GetOpenFilesTool(),
    ),
    vscode.lm.registerTool(
      "cmd-lite_listModels",
      new ListModelsTool(),
    ),
    vscode.lm.registerTool(
      "cmd-lite_runParallel",
      new RunParallelTool(),
    ),
  );
}

interface RunPrintParams {
  prompt: string;
  model?: string;
  maxTurns?: number;
  plan?: boolean;
}

class RunPrintTool implements vscode.LanguageModelTool<RunPrintParams> {
  async invoke(
    options: vscode.LanguageModelToolInvocationOptions<RunPrintParams>,
    _token: vscode.CancellationToken,
  ): Promise<vscode.LanguageModelToolResult> {
    const params = options.input;
    const result = await runPrint(params.prompt, {
      cwd: getActiveCwd(),
      model: params.model ?? getEffectiveModel(),
      maxTurns: params.maxTurns ?? getEffectiveMaxTurns(),
      permissionMode: getEffectivePermissionMode(),
      plan: params.plan,
    });

    const parts: vscode.LanguageModelTextPart[] = [
      new vscode.LanguageModelTextPart(result.stdout || "(no output)"),
    ];

    if (result.stderr.trim()) {
      parts.push(new vscode.LanguageModelTextPart(`\n\nstderr (exit ${result.exitCode}):\n${result.stderr}`));
    }

    return new vscode.LanguageModelToolResult(parts);
  }

  async prepareInvocation(
    options: vscode.LanguageModelToolInvocationPrepareOptions<RunPrintParams>,
    _token: vscode.CancellationToken,
  ): Promise<vscode.PreparedToolInvocation> {
    const preview = options.input.prompt.length > 120
      ? options.input.prompt.slice(0, 117) + "..."
      : options.input.prompt;
    return {
      invocationMessage: `Running cmd: ${preview}`,
    };
  }
}

interface GetTasteParams {
  cwd?: string;
}

class GetTasteTool implements vscode.LanguageModelTool<GetTasteParams> {
  async invoke(
    options: vscode.LanguageModelToolInvocationOptions<GetTasteParams>,
    _token: vscode.CancellationToken,
  ): Promise<vscode.LanguageModelToolResult> {
    const cwd = options.input.cwd ?? getActiveCwd();
    const tastePath = vscode.Uri.file(
      path.join(cwd, ".commandcode", "taste", "taste.md"),
    );

    let content: string;
    try {
      const bytes = await vscode.workspace.fs.readFile(tastePath);
      content = new TextDecoder().decode(bytes);
    } catch {
      content = "No taste file found. Run `cmd taste learn .` first.";
    }

    return new vscode.LanguageModelToolResult([
      new vscode.LanguageModelTextPart(content),
    ]);
  }
}

interface GetDiagnosticsParams {
  filePath?: string;
}

class GetDiagnosticsTool implements vscode.LanguageModelTool<GetDiagnosticsParams> {
  async invoke(
    options: vscode.LanguageModelToolInvocationOptions<GetDiagnosticsParams>,
    _token: vscode.CancellationToken,
  ): Promise<vscode.LanguageModelToolResult> {
    const filePaths = options.input.filePath ? [options.input.filePath] : undefined;
    const fileDiagnostics = filePaths
      ? filePaths.map((fp) => {
        const uri = vscode.Uri.file(fp);
        return [uri, vscode.languages.getDiagnostics(uri)] as const;
      })
      : vscode.languages.getDiagnostics();

    const filtered = fileDiagnostics.filter(
      ([uri, diags]) => uri.scheme === "file" && diags.length > 0,
    );

    if (filtered.length === 0) {
      return new vscode.LanguageModelToolResult([
        new vscode.LanguageModelTextPart("No diagnostics found."),
      ]);
    }

    const lines: string[] = [];
    for (const [fileUri, diags] of filtered) {
      lines.push(`## ${fileUri.fsPath}`);
      for (const d of diags) {
        const sev = severityLabel(d.severity);
        const line = d.range.start.line + 1;
        const col = d.range.start.character + 1;
        lines.push(`  ${sev} [${line}:${col}] ${d.message}${d.source ? ` (${d.source})` : ""}`);
      }
    }

    return new vscode.LanguageModelToolResult([
      new vscode.LanguageModelTextPart(lines.join("\n")),
    ]);
  }

  async prepareInvocation(
    options: vscode.LanguageModelToolInvocationPrepareOptions<GetDiagnosticsParams>,
    _token: vscode.CancellationToken,
  ): Promise<vscode.PreparedToolInvocation> {
    const target = options.input.filePath ?? "all files";
    return {
      invocationMessage: `Collecting diagnostics for ${target}`,
    };
  }
}

function severityLabel(s: vscode.DiagnosticSeverity): string {
  switch (s) {
    case vscode.DiagnosticSeverity.Error: return "ERROR";
    case vscode.DiagnosticSeverity.Warning: return "WARN";
    case vscode.DiagnosticSeverity.Information: return "INFO";
    case vscode.DiagnosticSeverity.Hint: return "HINT";
    default: return "?";
  }
}

// --- getGitContext ---

class GetGitContextTool implements vscode.LanguageModelTool<object> {
  async invoke(
    _options: vscode.LanguageModelToolInvocationOptions<object>,
    _token: vscode.CancellationToken,
  ): Promise<vscode.LanguageModelToolResult> {
    const cwd = getActiveCwd();
    const git = await getGitContext(cwd);

    if (!git) {
      return new vscode.LanguageModelToolResult([
        new vscode.LanguageModelTextPart("Not a git repository or unable to read git state."),
      ]);
    }

    const lines = [
      `Branch: ${git.branch}`,
      `HEAD: ${git.headCommit}`,
      `Message: ${git.headCommitMessage}`,
    ];
    if (git.dirtyFiles.length > 0) {
      lines.push(`Dirty files (${git.dirtyFiles.length}):`);
      for (const f of git.dirtyFiles) lines.push(`  ${f}`);
    } else {
      lines.push("Working tree: clean");
    }

    return new vscode.LanguageModelToolResult([
      new vscode.LanguageModelTextPart(lines.join("\n")),
    ]);
  }

  async prepareInvocation(
    _options: vscode.LanguageModelToolInvocationPrepareOptions<object>,
    _token: vscode.CancellationToken,
  ): Promise<vscode.PreparedToolInvocation> {
    return { invocationMessage: "Reading git context" };
  }
}

// --- getOpenFiles ---

type GetOpenFilesParams = Record<string, never>;

class GetOpenFilesTool implements vscode.LanguageModelTool<GetOpenFilesParams> {
  async invoke(
    _options: vscode.LanguageModelToolInvocationOptions<GetOpenFilesParams>,
    _token: vscode.CancellationToken,
  ): Promise<vscode.LanguageModelToolResult> {
    const editors = vscode.window.visibleTextEditors;
    const activePath = vscode.window.activeTextEditor?.document.uri.fsPath;

    if (editors.length === 0) {
      return new vscode.LanguageModelToolResult([
        new vscode.LanguageModelTextPart("No files open."),
      ]);
    }

    const lines: string[] = [`Open files (${editors.length}):`];
    for (const editor of editors) {
      const fp = editor.document.uri.fsPath;
      const lang = editor.document.languageId;
      const active = fp === activePath ? " (active)" : "";
      lines.push(`  ${fp} [${lang}]${active}`);
    }

    return new vscode.LanguageModelToolResult([
      new vscode.LanguageModelTextPart(lines.join("\n")),
    ]);
  }

  async prepareInvocation(
    _options: vscode.LanguageModelToolInvocationPrepareOptions<GetOpenFilesParams>,
    _token: vscode.CancellationToken,
  ): Promise<vscode.PreparedToolInvocation> {
    return { invocationMessage: "Reading open files" };
  }
}

// --- listModels ---

type ListModelsParams = Record<string, never>;

class ListModelsTool implements vscode.LanguageModelTool<ListModelsParams> {
  async invoke(
    _options: vscode.LanguageModelToolInvocationOptions<ListModelsParams>,
    _token: vscode.CancellationToken,
  ): Promise<vscode.LanguageModelToolResult> {
    const cwd = getActiveCwd();
    const models = await listModels(cwd);

    if (models.length === 0) {
      return new vscode.LanguageModelToolResult([
        new vscode.LanguageModelTextPart("Unable to list models. Ensure Command Code CLI is installed and authenticated."),
      ]);
    }

    const lines: string[] = [`Available models (${models.length}):`];
    let currentProvider = "";
    for (const m of models) {
      if (m.provider && m.provider !== currentProvider) {
        currentProvider = m.provider;
        lines.push(`\n  ${currentProvider}:`);
      }
      const label = m.label ? ` — ${m.label}` : "";
      lines.push(`    ${m.id}${label}`);
    }

    return new vscode.LanguageModelToolResult([
      new vscode.LanguageModelTextPart(lines.join("\n")),
    ]);
  }

  async prepareInvocation(
    _options: vscode.LanguageModelToolInvocationPrepareOptions<ListModelsParams>,
    _token: vscode.CancellationToken,
  ): Promise<vscode.PreparedToolInvocation> {
    return { invocationMessage: "Listing available models" };
  }
}

// --- runParallel ---

interface RunParallelParams {
  tasks: AgentTask[];
  model?: string;
  maxTurns?: number;
  planMode?: boolean;
}

class RunParallelTool implements vscode.LanguageModelTool<RunParallelParams> {
  async invoke(
    options: vscode.LanguageModelToolInvocationOptions<RunParallelParams>,
    _token: vscode.CancellationToken,
  ): Promise<vscode.LanguageModelToolResult> {
    const params = options.input;
    if (!params.tasks || params.tasks.length === 0) {
      return new vscode.LanguageModelToolResult([
        new vscode.LanguageModelTextPart("No tasks specified."),
      ]);
    }

    const results = await runParallel(params.tasks, {
      cwd: getActiveCwd(),
      defaultModel: params.model ?? getEffectiveModel(),
      maxTurns: params.maxTurns ?? getEffectiveMaxTurns(),
      permissionMode: getEffectivePermissionMode(),
      planMode: params.planMode,
    });

    const formatted = formatParallelResults(results);
    return new vscode.LanguageModelToolResult([
      new vscode.LanguageModelTextPart(formatted),
    ]);
  }

  async prepareInvocation(
    options: vscode.LanguageModelToolInvocationPrepareOptions<RunParallelParams>,
    _token: vscode.CancellationToken,
  ): Promise<vscode.PreparedToolInvocation> {
    const count = options.input.tasks?.length ?? 0;
    return {
      invocationMessage: `Running ${count} parallel agents`,
    };
  }
}
