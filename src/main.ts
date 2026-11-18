import Anthropic from "@anthropic-ai/sdk";
import chalk from "chalk";
import { createMainAgent } from "./agents.js";
import { createUserInput } from "./input.js";
import { UsageTracker } from "./usage.js";

const workspaceRoot = process.cwd();

const debug = process.argv.includes("--debug");

const client = new Anthropic();
// One budget for the whole session: subagents' tokens count too.
const usage = new UsageTracker(1_000_000);
const input = createUserInput();
const agent = createMainAgent({
  client,
  getUserMessage: input.getUserMessage,
  workspaceRoot,
  debug,
  usage,
});

try {
  await agent.run();
} finally {
  input.close();
  console.log(chalk.gray(`Total ${usage.format()}`));
}
