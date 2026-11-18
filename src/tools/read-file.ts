import { readFile } from "node:fs/promises";
import type { ToolDefinition } from "./types.js";

export const readFileTool: ToolDefinition = {
  name: "read_file",
  description:
    "Read the contents of a file. Use this when you need to see what's inside a file. The path is relative to the current working directory.",
  inputSchema: {
    type: "object",
    properties: {
      path: {
        type: "string",
        description: "The relative path of the file to read, e.g. 'src/index.js'.",
      },
    },
    required: ["path"],
  },
  fn: async (input: { path: string }) => {
    return await readFile(input.path, "utf8");
  },
};
