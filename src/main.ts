import Anthropic from "@anthropic-ai/sdk";
import chalk from "chalk";
import { Agent } from "./agent.js";
import { createUserInput } from "./input.js";
import { listFilesTool } from "./tools/list-files.js";
import { readFileTool } from "./tools/read-file.js";
import { UsageTracker } from "./usage.js";

const workspaceRoot = process.cwd();

const debug = process.argv.includes("--debug");

const client = new Anthropic();
const usage = new UsageTracker(1_000_000);
const input = createUserInput();
const agent = new Agent({
  client,
  getUserMessage: input.getUserMessage,
  tools: [readFileTool, listFilesTool],
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
