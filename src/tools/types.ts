import type Anthropic from "@anthropic-ai/sdk";

// A tool the agent can use.
// name, description and inputSchema are sent to Claude so it knows the tool exists.
// fn never leaves our code: it's what we run when Claude asks for the tool.
export type ToolDefinition = {
  name: string;
  description: string;
  inputSchema: Anthropic.Tool.InputSchema;
  fn: (input: any) => Promise<string>;
};
