import { readdir } from "node:fs/promises";
import { join } from "node:path";
import type { ToolDefinition } from "./types.js";

// Folders that are big and never useful to look through.
const SKIPPED = new Set(["node_modules", ".git"]);

// Walk a folder and its subfolders, collecting paths relative to the start.
// Folder names end with "/" so Claude can tell them apart from files.
async function listRecursive(root: string, relative: string, out: string[]): Promise<void> {
  const entries = await readdir(join(root, relative), { withFileTypes: true });
  entries.sort((a, b) => a.name.localeCompare(b.name));

  for (const entry of entries) {
    if (SKIPPED.has(entry.name)) continue;
    const path = relative ? `${relative}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      out.push(`${path}/`);
      await listRecursive(root, path, out);
    } else {
      out.push(path);
    }
  }
}

export const listFilesTool: ToolDefinition = {
  name: "list_files",
  description:
    "List all files and folders at a path, including subfolders (node_modules and .git are skipped). Folder names end with '/'. Use this to see which files exist. If no path is given, lists the current working directory.",
  inputSchema: {
    type: "object",
    properties: {
      path: {
        type: "string",
        description:
          "Optional relative path of the folder to list, e.g. 'src'. Defaults to the current directory.",
      },
    },
  },
  fn: async (input: { path?: string }) => {
    const out: string[] = [];
    await listRecursive(input.path || ".", "", out);
    return out.join("\n");
  },
};
