import type Anthropic from "@anthropic-ai/sdk";
import type { ProcessManager } from "./processes.js";

// Extra info our code passes to every tool call. Claude never sees it.
export type ToolContext = {
  // The folder the agent was started in. Tools can't touch anything outside it.
  workspaceRoot: string;
  // Files Claude has read: absolute path -> hash of the contents it saw.
  // edit_file uses this to refuse edits to files Claude hasn't read, or that
  // changed since it read them.
  readFiles: Map<string, string>;
  // Ask the user a yes/no question; resolves true only if they say yes.
  // Missing for agents that never talk to the user (subagents): nobody can approve.
  confirm?: (question: string) => Promise<boolean>;
  // Background processes (servers) this agent started with start_process.
  // The agent stops them all when it finishes.
  processes: ProcessManager;
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
