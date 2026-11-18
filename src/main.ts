import Anthropic from "@anthropic-ai/sdk";
import chalk from "chalk";
import { Agent } from "./agent.js";
import { createUserInput } from "./input.js";
import { editFileTool } from "./tools/edit-file.js";
import { listFilesTool } from "./tools/list-files.js";
import { readFileTool } from "./tools/read-file.js";
import { runCommandTool } from "./tools/run-command.js";
import { UsageTracker } from "./usage.js";

const workspaceRoot = process.cwd();

const debug = process.argv.includes("--debug");

const client = new Anthropic();
const usage = new UsageTracker(1_000_000);
const input = createUserInput();
const agent = new Agent({
  name: "main",
  systemPrompt:
    "You are a coding agent working in the user's project folder. " +
    "Use your tools to look at the files before answering. Keep answers short and concrete.",
  client,
  getUserMessage: input.getUserMessage,
  tools: [readFileTool, listFilesTool, editFileTool, runCommandTool],
  workspaceRoot,
  debug,
  usage,
  maxTurns: 25,
});

try {
  await agent.run();
} finally {
  input.close();
  console.log(chalk.gray(`Total ${usage.format()}`));
}
