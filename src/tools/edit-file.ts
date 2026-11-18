import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { ToolDefinition } from "./types.js";
import { checkCanEdit, recordRead, resolveInWorkspace } from "./workspace.js";

// Count how many times needle appears in text (non-overlapping).
function countOccurrences(text: string, needle: string): number {
  return text.split(needle).length - 1;
}

// Read a file, or return null if it doesn't exist.
async function readIfExists(path: string): Promise<string | null> {
  try {
    return await readFile(path, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
}

export const editFileTool: ToolDefinition = {
  name: "edit_file",
  description:
    "Make an edit to a text file by replacing old_str with new_str. " +
    "old_str must appear exactly once in the file, matching it character for character " +
    "(including whitespace and indentation); include a few surrounding lines to make it unique. " +
    "To create a new file, pass an empty old_str and the full file contents as new_str; " +
    "missing parent folders are created. You must read an existing file with read_file before editing it. " +
    "The path is relative to the current working directory and must stay inside it.",
  inputSchema: {
    type: "object",
    properties: {
      path: {
        type: "string",
        description: "The relative path of the file to edit or create, e.g. 'src/index.js'.",
      },
      old_str: {
        type: "string",
        description:
          "The exact text to replace. Must appear exactly once in the file. Empty to create a new file.",
      },
      new_str: {
        type: "string",
        description: "The text to put in place of old_str (or the full contents of a new file).",
      },
    },
    required: ["path", "old_str", "new_str"],
  },
  fn: async (input: { path: string; old_str: string; new_str: string }, context) => {
    const { path, old_str, new_str } = input;
    if (!path) throw new Error("path is required.");
    if (old_str === new_str) {
      throw new Error("old_str and new_str are the same, so there is nothing to change.");
    }

    const absolutePath = await resolveInWorkspace(context, path);
    const content = await readIfExists(absolutePath);

    // Create a new file.
    if (content === null) {
      if (old_str !== "") {
        throw new Error(
          `File ${path} does not exist. To create it, call edit_file again with an empty old_str ` +
            `and the full file contents as new_str. If you meant an existing file, use list_files to find the right path.`,
        );
      }
      await mkdir(dirname(absolutePath), { recursive: true });
      await writeFile(absolutePath, new_str, "utf8");
      // Claude wrote the whole file, so it knows the contents: it may edit it next.
      recordRead(context, absolutePath, new_str);
      return `Created ${path}`;
    }

    if (old_str === "") {
      throw new Error(
        `File ${path} already exists, so old_str can't be empty. ` +
          `Use read_file to see its contents, then pass the exact text you want to replace as old_str.`,
      );
    }

    checkCanEdit(context, absolutePath, path, content);

    const count = countOccurrences(content, old_str);
    if (count === 0) {
      throw new Error(
        `old_str was not found in ${path}. It must match the file exactly, including whitespace ` +
          `and indentation. Use read_file to see the current contents and copy the text exactly.`,
      );
    }
    if (count > 1) {
      throw new Error(
        `old_str appears ${count} times in ${path}, but it must appear exactly once. ` +
          `Include more surrounding lines in old_str so it matches only the place you want to change.`,
      );
    }

    // Use a function so "$" patterns in new_str are inserted literally.
    const updated = content.replace(old_str, () => new_str);
    await writeFile(absolutePath, updated, "utf8");
    // Claude knows exactly what changed, so it can keep editing without re-reading.
    recordRead(context, absolutePath, updated);
    return `Edited ${path}`;
  },
};
