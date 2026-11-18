import Anthropic from "@anthropic-ai/sdk";
import chalk from "chalk";
import type { GetUserMessage } from "./input.js";
import type { ToolDefinition } from "./tools/types.js";

export type AgentOptions = {
  client: Anthropic;
  getUserMessage: GetUserMessage;
  tools: ToolDefinition[];
  workspaceRoot: string;
  debug: boolean;
};

export class Agent {
  constructor(private readonly options: AgentOptions) {}

  async run(): Promise<void> {
    // The agent's memory: every message so far, sent in full on each call,
    // because the API is stateless and remembers nothing between requests.
    const conversation: Anthropic.MessageParam[] = [];

    console.log("Chat with Claude (Ctrl+D to quit)");

    while (true) {
      const [text, ok] = await this.options.getUserMessage(chalk.blue("You: "));
      if (!ok) break; // Ctrl+D
      if (text.trim() === "") continue;

      conversation.push({ role: "user", content: text });
      const message = await this.runInference(conversation);
      // Keep the full reply, tool_use blocks included: each tool_result we send
      // back must point at a tool_use id that's already in the conversation.
      conversation.push({ role: "assistant", content: message.content });
      this.printMessage(message);

      // Run every tool Claude asked for and send all the results back in one
      // user message. Only one round for now; step E turns this into a loop.
      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      for (const block of message.content) {
        if (block.type === "tool_use") {
          toolResults.push(await this.executeTool(block));
        }
      }
      if (toolResults.length === 0) continue;

      conversation.push({ role: "user", content: toolResults });
      const followUp = await this.runInference(conversation);
      conversation.push({ role: "assistant", content: followUp.content });
      this.printMessage(followUp);
    }
  }

  // The reply is a list of content blocks: text, or a request to use a tool.
  private printMessage(message: Anthropic.Message): void {
    for (const block of message.content) {
      if (block.type === "text") {
        console.log(`${chalk.yellow("Claude:")} ${block.text}`);
      } else if (block.type === "tool_use") {
        console.log(chalk.green(`tool: ${block.name}(${JSON.stringify(block.input)})`));
      }
    }
  }

  async runInference(conversation: Anthropic.MessageParam[]): Promise<Anthropic.Message> {
    const request: Anthropic.MessageCreateParamsNonStreaming = {
      model: "claude-haiku-5-5",
      max_tokens: 4096,
      messages: conversation,
      // Claude only sees name, description and input schema; fn stays in our code.
      tools: this.options.tools.map((tool) => ({
        name: tool.name,
        description: tool.description,
        input_schema: tool.inputSchema,
      })),
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

  // Run the tool Claude asked for and wrap the output in a tool_result.
  // Errors go back to Claude (is_error: true) instead of crashing the agent,
  // so it can read what went wrong and try something else.
  async executeTool(block: Anthropic.ToolUseBlock): Promise<Anthropic.ToolResultBlockParam> {
    const tool = this.options.tools.find((t) => t.name === block.name);
    if (!tool) {
      return {
        type: "tool_result",
        tool_use_id: block.id,
        content: `Unknown tool: ${block.name}`,
        is_error: true,
      };
    }

    try {
      const output = await tool.fn(block.input);
      return { type: "tool_result", tool_use_id: block.id, content: output };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      console.log(chalk.red(`tool error: ${errorMessage}`));
      return {
        type: "tool_result",
        tool_use_id: block.id,
        content: `Error: ${errorMessage}`,
        is_error: true,
      };
    }
  }

  // TODO (E): runUntilDone(conversation): loop model ↔ tools until the model is done

  // TODO (H): runTask(task): one task without the user, for subagents
}
