import { createHash } from "node:crypto";
import { realpath } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import type { ToolContext } from "./types.js";

// Safety rules shared by all file tools:
// 1. Every path must stay inside the agent's folder (workspaceRoot).
// 2. A file must be read before it can be edited, and must not have changed since.

// Turn a path from Claude into an absolute path inside the workspace.
// Throws if it points outside, also through ".." or a symlink.
export async function resolveInWorkspace(context: ToolContext, path: string): Promise<string> {
  const root = await realpath(context.workspaceRoot);
  const absolute = await realpathAllowMissing(resolve(root, path));
  const rel = relative(root, absolute);
  if (rel.startsWith("..") || isAbsolute(rel)) {
    throw new Error(
      `Access denied: ${path} is outside the project folder. ` +
        `You can only use files inside the folder the agent was started in.`,
    );
  }
  return absolute;
}

// Like realpath, but works for files that don't exist yet (edit_file can create
// them): resolve the closest folder that exists and add the rest back on.
async function realpathAllowMissing(path: string): Promise<string> {
  try {
    return await realpath(path);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    const parent = dirname(path);
    if (parent === path) throw err; // reached the filesystem root
    return join(await realpathAllowMissing(parent), basename(path));
  }
}

function hash(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

// Remember what a file looked like when Claude saw it (after read_file, or
// after Claude wrote it with edit_file, since then it knows the contents too).
export function recordRead(context: ToolContext, absolutePath: string, content: string): void {
  context.readFiles.set(absolutePath, hash(content));
}

// Throw unless Claude has read this file and it hasn't changed since.
export function checkCanEdit(
  context: ToolContext,
  absolutePath: string,
  path: string,
  currentContent: string,
): void {
  const seen = context.readFiles.get(absolutePath);
  if (seen === undefined) {
    throw new Error(`You must read ${path} with read_file before editing it.`);
  }
  if (seen !== hash(currentContent)) {
    throw new Error(
      `${path} has changed since you last read it. Read it again with read_file, then retry the edit.`,
    );
  }
}
