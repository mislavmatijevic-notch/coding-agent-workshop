import { readFile } from "node:fs/promises";
import type { ToolDefinition } from "./types.js";

export const readFileTool: ToolDefinition = {
  name: "read_file",
  description:
    "Read the contents of a given relative file path. Use this when you want to see what's inside a file. Do not use this with directory names.",
  inputSchema: {
    type: "object",
    properties: {
      path: {
        type: "string",
        description: "The relative path of a file in the working directory.",
      },
    },
    required: ["path"],
  },
  fn: async (input: { path: string }) => {
    return readFile(input.path, "utf8");
  },
};
