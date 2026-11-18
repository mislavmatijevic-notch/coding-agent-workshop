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

  // TODO (B): turn this into a chat loop with memory
  async run(): Promise<void> {
    const [text, ok] = await this.options.getUserMessage(chalk.blue("You: "));
    if (!ok || text.trim() === "") return;

    const conversation: Anthropic.MessageParam[] = [{ role: "user", content: text }];
    const message = await this.runInference(conversation);

    // The reply is a list of content blocks; print the text ones.
    for (const block of message.content) {
      if (block.type === "text") {
        console.log(`${chalk.yellow("Claude:")} ${block.text}`);
      }
    }
  }

  async runInference(conversation: Anthropic.MessageParam[]): Promise<Anthropic.Message> {
    const request: Anthropic.MessageCreateParamsNonStreaming = {
      model: "claude-haiku-5-5",
      max_tokens: 4096,
      messages: conversation,
    };

    if (this.options.debug) {
      console.log(chalk.gray("--- request ---\n" + JSON.stringify(request, null, 2)));
    }

    const response = await this.options.client.messages.create(request);

    if (this.options.debug) {
      console.log(chalk.gray("--- response ---\n" + JSON.stringify(response, null, 2)));
    }

    return response;
  }

  // TODO (D): executeTool(block): run the tool the model asked for and return a tool_result

  // TODO (E): runUntilDone(conversation): loop model ↔ tools until the model is done

  // TODO (H): runTask(task): one task without the user, for subagents
}
