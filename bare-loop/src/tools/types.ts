import Anthropic from "@anthropic-ai/sdk";

// A tool = a description for the model (name, description, inputSchema) + a function our code runs (fn)
export type ToolDefinition = {
  name: string;
  description: string;
  inputSchema: Anthropic.Tool.InputSchema;
  fn: (input: any) => Promise<string>;
};
