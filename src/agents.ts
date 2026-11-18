import type Anthropic from "@anthropic-ai/sdk";
import { Agent } from "./agent.js";
import type { GetUserMessage } from "./input.js";
import { editFileTool } from "./tools/edit-file.js";
import { listFilesTool } from "./tools/list-files.js";
import { readFileTool } from "./tools/read-file.js";
import { runCommandTool } from "./tools/run-command.js";
import type { ToolDefinition } from "./tools/types.js";
import type { UsageTracker } from "./usage.js";

// What every agent shares: the API client, the terminal, the folder, and one
// token budget for the whole session, so subagents count toward the same limit.
export type AgentDeps = {
  client: Anthropic;
  getUserMessage: GetUserMessage;
  workspaceRoot: string;
  debug: boolean;
  usage: UsageTracker;
};

// Looks around and reports back. Read-only, so it can never change anything.
export function createExplorer(deps: AgentDeps): Agent {
  return new Agent({
    name: "explorer",
    systemPrompt:
      "You are an explorer subagent in a coding project. You get one task from another agent, " +
      "not from a human, and you can't ask questions: work with what the task says. " +
      "Use list_files and read_file to find what the task asks about. You cannot change files. " +
      "When done, reply with a short, concrete summary: the relevant files, the functions and " +
      "conventions in them (e.g. module style, test framework, how tests are run), and anything " +
      "else needed to do the work. Your reply is all the other agent will see.",
    client: deps.client,
    tools: [readFileTool, listFilesTool],
    workspaceRoot: deps.workspaceRoot,
    debug: deps.debug,
    usage: deps.usage,
    maxTurns: 15,
  });
}

// Makes the changes and runs the tests. It never chats with the user, but it
// gets getUserMessage so run_command can still ask [y/N] before every command.
export function createImplementer(deps: AgentDeps): Agent {
  return new Agent({
    name: "implementer",
    systemPrompt:
      "You are an implementer subagent in a coding project. You get one task from another agent, " +
      "not from a human, and you can't ask questions: work with what the task says. " +
      "Read files before editing them, make the change with edit_file, then run the tests with " +
      "run_command and fix problems until they pass. Follow the project's existing style. " +
      "The user approves every command; if they decline one, stop and report that. " +
      "When done, reply with a short summary: which files you changed, what you did, and the " +
      "final test result. Your reply is all the other agent will see.",
    client: deps.client,
    getUserMessage: deps.getUserMessage,
    tools: [readFileTool, listFilesTool, editFileTool, runCommandTool],
    workspaceRoot: deps.workspaceRoot,
    debug: deps.debug,
    usage: deps.usage,
    maxTurns: 30,
  });
}

// Shared input schema for both delegate tools: one self-contained task.
const taskSchema: Anthropic.Tool.InputSchema = {
  type: "object",
  properties: {
    task: {
      type: "string",
      description:
        "The complete task. The subagent sees nothing else: not the user's messages, not your " +
        "earlier tool results. Include the goal, relevant file paths, and any facts you already know.",
    },
  },
  required: ["task"],
};

// Each call starts a brand-new subagent: an empty conversation holding only
// the task, and its own list of read files.
function delegateTool(name: string, description: string, create: () => Agent): ToolDefinition {
  return {
    name,
    description,
    inputSchema: taskSchema,
    fn: async (input: { task: string }) => {
      if (!input.task?.trim()) throw new Error("task is required.");
      return create().runTask(input.task);
    },
  };
}

// Talks to the user and hands out the work. It can look at files itself,
// but can't edit or run anything: that goes through the implementer.
export function createMainAgent(deps: AgentDeps): Agent {
  const delegateExplore = delegateTool(
    "delegate_explore",
    "Start an explorer subagent that reads and lists files (it can't change anything) and returns " +
      "a short summary. Use it to learn how the project is laid out before planning a change.",
    () => createExplorer(deps),
  );
  const delegateImplement = delegateTool(
    "delegate_implement",
    "Start an implementer subagent that can read and edit files and run commands (the user " +
      "approves each command). It makes the change, runs the tests until they pass, and returns " +
      "a summary of what it did.",
    () => createImplementer(deps),
  );

  return new Agent({
    name: "main",
    systemPrompt:
      "You are the main agent of a coding assistant, working in the user's project folder. " +
      "You talk to the user and hand out work to subagents. You can read and list files, but you " +
      "cannot edit files or run commands yourself. " +
      "Use delegate_explore to learn about the project, and delegate_implement for any change. " +
      "Subagents can't see this conversation: every task you write must make sense on its own. " +
      "Spell out the goal, the relevant file paths, conventions and facts you already know, " +
      "and what to report back. " +
      "After a subagent answers, check its result and tell the user briefly what was done.",
    client: deps.client,
    getUserMessage: deps.getUserMessage,
    tools: [readFileTool, listFilesTool, delegateExplore, delegateImplement],
    workspaceRoot: deps.workspaceRoot,
    debug: deps.debug,
    usage: deps.usage,
    maxTurns: 25,
  });
}
