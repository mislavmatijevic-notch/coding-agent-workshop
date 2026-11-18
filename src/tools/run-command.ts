import { spawn } from "node:child_process";
import { truncate } from "./truncate.js";
import type { ToolDefinition } from "./types.js";

const TIMEOUT_MS = 30_000;
// Long output (e.g. a big test run) would fill Claude's context; keep the
// start and the end, which is where commands usually say what went wrong.
const MAX_OUTPUT_CHARS = 10_000;

type CommandResult = { exitCode: number | null; output: string; timedOut: boolean };

// Run a shell command in cwd and collect stdout and stderr together, in the
// order they were printed. Kills it if it runs longer than TIMEOUT_MS.
function runShell(command: string, cwd: string): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, {
      cwd,
      shell: true,
      // No stdin: the command can't wait for input, and can't steal the user's.
      stdio: ["ignore", "pipe", "pipe"],
      // Own process group, so on timeout we can kill the command and
      // everything it started (npm test -> node -> ...), not just the shell.
      detached: true,
    });

    let output = "";
    child.stdout.on("data", (chunk) => (output += chunk));
    child.stderr.on("data", (chunk) => (output += chunk));

    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      try {
        process.kill(-child.pid!, "SIGKILL");
      } catch {
        // Already exited.
      }
    }, TIMEOUT_MS);

    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on("close", (exitCode) => {
      clearTimeout(timer);
      resolve({ exitCode, output, timedOut });
    });
  });
}

export const runCommandTool: ToolDefinition = {
  name: "run_command",
  description:
    "Run a shell command in the project folder, e.g. 'npm test' or 'node script.js', and get back " +
    "its exit code and output (stdout and stderr combined). The user must approve every command, " +
    "and may decline. Commands are stopped after 30 seconds, so don't start servers or watchers " +
    "here: use start_process for those. " +
    "Commands can't read input, so pass flags that avoid interactive prompts. " +
    "A non-zero exit code (e.g. failing tests) is a normal result: read the output to see what failed.",
  inputSchema: {
    type: "object",
    properties: {
      command: {
        type: "string",
        description: "The shell command to run, e.g. 'npm test'.",
      },
    },
    required: ["command"],
  },
  fn: async (input: { command: string }, context) => {
    const { command } = input;
    if (!command?.trim()) throw new Error("command is required.");

    // Declining is an answer, not an error: Claude should adapt, e.g. ask the
    // user what to do instead, rather than treat it as a broken tool.
    if (!context.confirm) {
      return `The command was not run: there is no user here to approve it. Do the task without running commands.`;
    }
    if (!(await context.confirm(`Run \`${command}\`?`))) {
      return `The user declined to run \`${command}\`. Don't retry it; ask the user how they want to proceed.`;
    }

    const { exitCode, output, timedOut } = await runShell(command, context.workspaceRoot);

    const status = timedOut
      ? `Stopped: the command ran longer than ${TIMEOUT_MS / 1000} seconds and was killed.`
      : exitCode === 0
        ? "Exit code: 0 (success)"
        : `Exit code: ${exitCode} (failed)`;
    const printed = output.trim() === "" ? "(no output)" : truncate(output, MAX_OUTPUT_CHARS);
    return `${status}\n\nOutput:\n${printed}`;
  },
};
