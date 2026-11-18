import type Anthropic from "@anthropic-ai/sdk";

// Extra info our code passes to every tool call. Claude never sees it.
export type ToolContext = {
  // The folder the agent was started in. Tools can't touch anything outside it.
  workspaceRoot: string;
  // Files Claude has read: absolute path -> hash of the contents it saw.
  // edit_file uses this to refuse edits to files Claude hasn't read, or that
  // changed since it read them.
  readFiles: Map<string, string>;
};

// A tool the agent can use.
// name, description and inputSchema are sent to Claude so it knows the tool exists.
// fn never leaves our code: it's what we run when Claude asks for the tool.
export type ToolDefinition = {
  name: string;
  description: string;
  inputSchema: Anthropic.Tool.InputSchema;
  fn: (input: any, context: ToolContext) => Promise<string>;
};
