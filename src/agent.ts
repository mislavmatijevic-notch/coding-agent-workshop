import Anthropic from "@anthropic-ai/sdk";
import chalk from "chalk";
import type { GetUserMessage } from "./input.js";

export type AgentOptions = {
  client: Anthropic;
  getUserMessage: GetUserMessage;
  workspaceRoot: string;
  debug: boolean;
};

export class Agent {
  constructor(private readonly options: AgentOptions) {}

  // TODO (A, B): chat with the user: read input, send it to the model, print the reply
  async run(): Promise<void> {
    console.log(chalk.red("TODO: implement run()"));
  }

  // TODO (A): a single model call (client.messages.create)
  async runInference(conversation: Anthropic.MessageParam[]): Promise<Anthropic.Message> {
    throw new Error("TODO: implement runInference()");
  }

  // TODO (D): executeTool(block): run the tool the model asked for and return a tool_result

  // TODO (E): runUntilDone(conversation): loop model ↔ tools until the model is done

  // TODO (H): runTask(task): one task without the user, for subagents
}
