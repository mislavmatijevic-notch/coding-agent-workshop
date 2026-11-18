import Anthropic from "@anthropic-ai/sdk";
import chalk from "chalk";
import type { GetUserMessage } from "./input.js";
import type { ToolContext, ToolDefinition } from "./tools/types.js";
import type { UsageTracker } from "./usage.js";

export type AgentOptions = {
  // Shown in front of every line this agent prints, e.g. [main].
  name: string;
  // Sent to Claude with every request: who this agent is and how it works.
  systemPrompt: string;
  client: Anthropic;
  // Only needed for run(). An agent that only does runTask() never talks to the user.
  getUserMessage?: GetUserMessage;
  tools: ToolDefinition[];
  workspaceRoot: string;
  debug: boolean;
  usage: UsageTracker;
  // Most calls to Claude allowed while handling one user message.
  maxTurns?: number;
};

export class Agent {
  // Passed to every tool call: the agent's folder and the files it has read.
  // Each agent has its own, so one agent's reads don't let another edit.
  private readonly toolContext: ToolContext;

  constructor(private readonly options: AgentOptions) {
    const { getUserMessage } = options;
    this.toolContext = {
      workspaceRoot: options.workspaceRoot,
      readFiles: new Map(),
      // Only agents that talk to the user can ask for permission.
      confirm: getUserMessage
        ? async (question) => {
            const prefix = chalk.cyan(`[${options.name}]`);
            const [answer, ok] = await getUserMessage(
              `${prefix} ${chalk.magenta(question)} [y/N] `,
            );
            // Anything but y/yes (including Enter or Ctrl+D) means no.
            return ok && ["y", "yes"].includes(answer.trim().toLowerCase());
          }
        : undefined,
    };
  }

  async run(): Promise<void> {
    // The agent's memory: every message so far, sent in full on each call,
    // because the API is stateless and remembers nothing between requests.
    const conversation: Anthropic.MessageParam[] = [];
    const { getUserMessage } = this.options;
    if (!getUserMessage) throw new Error(`Agent ${this.options.name} has no getUserMessage`);

    this.log("Chat with Claude (Ctrl+D to quit)");

    while (true) {
      const [text, ok] = await getUserMessage(chalk.blue("You: "));
      if (!ok) break; // Ctrl+D
      if (text.trim() === "") continue;

      conversation.push({ role: "user", content: text });
      await this.runUntilDone(conversation);
      this.log(chalk.gray(this.options.usage.format()));

      // Out of token budget: end the session.
      if (this.options.usage.isOverLimit()) break;
    }
  }

  // The agent loop: call Claude, run the tools it asks for, send the results
  // back, and repeat until Claude answers without asking for a tool.
  // Returns the text of that final reply.
  // Stops early, returning a warning instead, if it hits maxTurns or the token
  // budget, so a confused agent can't loop forever or run up a big bill.
  async runUntilDone(conversation: Anthropic.MessageParam[]): Promise<string> {
    const maxTurns = this.options.maxTurns ?? 25;
    const { usage } = this.options;

    for (let turn = 0; ; turn++) {
      if (usage.isOverLimit()) {
        return this.warn(
          `Stopped: token limit of ${usage.maxTokens.toLocaleString("en-US")} reached.`,
        );
      }
      if (turn >= maxTurns) {
        return this.warn(
          `Stopped: reached the limit of ${maxTurns} calls to Claude for this message.`,
        );
      }

      const message = await this.runInference(conversation);
      usage.add(message.usage);
      // Keep the full reply, tool_use blocks included: each tool_result we send
      // back must point at a tool_use id that's already in the conversation.
      conversation.push({ role: "assistant", content: message.content });
      this.printMessage(message);

      // Run every tool Claude asked for and send all the results back in one
      // user message.
      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      for (const block of message.content) {
        if (block.type === "tool_use") {
          toolResults.push(await this.executeTool(block));
        }
      }

      // No tool requests means Claude is done: return its final text.
      if (toolResults.length === 0) {
        return message.content
          .filter((block) => block.type === "text")
          .map((block) => block.text)
          .join("\n");
      }

      conversation.push({ role: "user", content: toolResults });
    }
  }

  // One task, no user: a fresh conversation that holds only the task.
  // The agent works until it's done (or hits a limit) and returns its final
  // answer. Subagents use this: they don't see the caller's conversation.
  async runTask(task: string): Promise<string> {
    const conversation: Anthropic.MessageParam[] = [{ role: "user", content: task }];
    return this.runUntilDone(conversation);
  }

  // Print text with the agent's name in front of every line, e.g. [main].
  private log(text: string): void {
    const prefix = chalk.cyan(`[${this.options.name}]`);
    for (const line of text.split("\n")) {
      console.log(`${prefix} ${line}`);
    }
  }

  // Print a warning in red and return it as plain text.
  private warn(text: string): string {
    this.log(chalk.red(text));
    return text;
  }

  // The reply is a list of content blocks: text, or a request to use a tool.
  private printMessage(message: Anthropic.Message): void {
    for (const block of message.content) {
      if (block.type === "text") {
        this.log(`${chalk.yellow("Claude:")} ${block.text}`);
      } else if (block.type === "tool_use") {
        this.log(chalk.green(`tool: ${block.name}(${JSON.stringify(block.input)})`));
      }
    }
  }

  async runInference(conversation: Anthropic.MessageParam[]): Promise<Anthropic.Message> {
    const request: Anthropic.MessageCreateParamsNonStreaming = {
      model: "claude-haiku-5-5",
      max_tokens: 4096,
      system: this.options.systemPrompt,
      messages: conversation,
      // Claude only sees name, description and input schema; fn stays in our code.
      tools: this.options.tools.map((tool) => ({
        name: tool.name,
        description: tool.description,
        input_schema: tool.inputSchema,
      })),
    };

    if (this.options.debug) {
      this.log(chalk.gray("--- request ---\n" + JSON.stringify(request, null, 2)));
    }

    const response = await this.options.client.messages.create(request);

    if (this.options.debug) {
      this.log(chalk.gray("--- response ---\n" + JSON.stringify(response, null, 2)));
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
      const output = await tool.fn(block.input, this.toolContext);
      return { type: "tool_result", tool_use_id: block.id, content: output };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      this.log(chalk.red(`tool error: ${errorMessage}`));
      return {
        type: "tool_result",
        tool_use_id: block.id,
        content: `Error: ${errorMessage}`,
        is_error: true,
      };
    }
  }
}
