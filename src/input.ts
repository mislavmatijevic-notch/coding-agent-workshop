import readline from "node:readline";

export type GetUserMessage = (prompt: string) => Promise<[string, boolean]>;

export function createUserInput() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: process.stdin.isTTY,
  });

  rl.on("SIGINT", () => {
    rl.close();
    process.exit(130);
  });
  const lines = rl[Symbol.asyncIterator]();

  const getUserMessage: GetUserMessage = async (prompt) => {
    rl.setPrompt(prompt);
    rl.prompt();
    const { value, done } = await lines.next();
    if (done) return ["", false];
    return [value, true];
  };

  return { getUserMessage, close: () => rl.close() };
}
