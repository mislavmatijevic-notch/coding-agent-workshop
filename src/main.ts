import Anthropic from "@anthropic-ai/sdk";
import { Agent } from "./agent.js";
import { createUserInput } from "./input.js";
import { readFileTool } from "./tools/read-file.js";

const workspaceRoot = process.cwd();

const debug = process.argv.includes("--debug");

const client = new Anthropic();
const input = createUserInput();
const agent = new Agent({
  client,
  getUserMessage: input.getUserMessage,
  tools: [readFileTool],
  workspaceRoot,
  debug,
});

try {
  await agent.run();
} finally {
  input.close();
}
