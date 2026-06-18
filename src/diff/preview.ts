import * as vscode from "vscode";
import * as path from "node:path";
import * as fs from "node:fs";
import { stripAnsi } from "../chat/format";

export class ProposedDiffContentProvider implements vscode.TextDocumentContentProvider {
  private _onDidChange = new vscode.EventEmitter<vscode.Uri>();
  readonly onDidChange = this._onDidChange.event;

  private contentMap = new Map<string, string>();

  updateContent(uri: vscode.Uri, content: string) {
    this.contentMap.set(uri.toString(), content);
    this._onDidChange.fire(uri);
  }

  provideTextDocumentContent(uri: vscode.Uri): string {
    return this.contentMap.get(uri.toString()) ?? "";
  }
}

export const proposedDiffProvider = new ProposedDiffContentProvider();


interface CodeBlock {
  language?: string;
  filePath?: string;
  content: string;
  startLine: number;
  endLine: number;
}

export function parseCodeBlocks(output: string): CodeBlock[] {
  const clean = stripAnsi(output);
  const blocks: CodeBlock[] = [];
  const lines = clean.split(/\r?\n/);
  let inBlock = false;
  let blockContent = "";
  let blockLang = "";
  let blockFilePath: string | undefined;
  let blockStart = 0;
  let blockEnd = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const fenceMatch = /^```(\w+)?/.exec(line);
    if (fenceMatch && !inBlock) {
      inBlock = true;
      blockLang = fenceMatch[1] ?? "";
      blockContent = "";
      blockFilePath = undefined;
      blockStart = i + 1;
      continue;
    }
    if (line === "```" && inBlock) {
      blockEnd = i;
      if (blockContent.trim()) {
        const fp = blockFilePath ?? detectFilePath(blockContent, blockLang);
        blocks.push({
          language: blockLang || undefined,
          filePath: fp,
          content: blockContent.replace(/\n$/, ""),
          startLine: blockStart,
          endLine: blockEnd,
        });
      }
      inBlock = false;
      continue;
    }
    if (inBlock) {
      blockContent += line + "\n";
      if (!blockFilePath) {
        const fpMatch = /\/\/\s*File:\s*(.+?)(?:\n|$)/.exec(line);
        if (fpMatch) blockFilePath = fpMatch[1];
        const commentMatch = /#\s*File:\s*(.+?)(?:\n|$)/.exec(line);
        if (commentMatch) blockFilePath = commentMatch[1];
      }
    }
  }

  return blocks;
}

function detectFilePath(_content: string, _language: string): string | undefined {
  return undefined;
}

export async function showDiff(
  originalUri: vscode.Uri,
  modifiedContent: string,
  title: string,
): Promise<void> {
  let originalFileUri = originalUri;
  if (!fs.existsSync(originalUri.fsPath)) {
    const emptyUri = vscode.Uri.parse(`commandcode-diff://empty${originalUri.path}`);
    proposedDiffProvider.updateContent(emptyUri, "");
    originalFileUri = emptyUri;
  }

  const virtualUri = vscode.Uri.parse(`commandcode-diff://proposed${originalUri.path}`);
  proposedDiffProvider.updateContent(virtualUri, modifiedContent);

  await vscode.commands.executeCommand(
    "vscode.diff",
    originalFileUri,
    virtualUri,
    `${title}: proposed changes for ${path.basename(originalUri.fsPath)}`,
  );
}

export async function showInlineDiff(
  filePath: string,
  newContent: string,
  title: string,
): Promise<void> {
  const uri = vscode.Uri.file(filePath);
  await showDiff(uri, newContent, title);
}


export function hasCodeProposal(output: string): boolean {
  const blocks = parseCodeBlocks(output);
  return blocks.length > 0;
}

export function extractFirstDiffFile(
  output: string,
): { filePath: string; content: string } | null {
  const blocks = parseCodeBlocks(output);
  if (blocks.length === 0) return null;

  const b = blocks[0];
  if (!b.filePath) return null;

  return { filePath: b.filePath, content: b.content };
}
