import { spawn, type ChildProcess } from "node:child_process";
import { truncate } from "./truncate.js";
import type { ToolDefinition } from "./types.js";

// How long start_process waits before answering, so Claude sees the first
// output: "listening on port 3000", or the error if it crashed right away.
const STARTUP_WAIT_MS = 2_000;
// How long stop_process gives a process to exit after SIGTERM before SIGKILL.
const STOP_GRACE_MS = 3_000;
const MAX_OUTPUT_CHARS = 10_000;

type BackgroundProcess = {
  id: string;
  command: string;
  child: ChildProcess;
  output: string;
  // How it ended, e.g. "code 1" or "signal SIGTERM"; null while running.
  exitStatus: string | null;
};

// Every process group started by any agent, so we can still kill them if the
// program ends without cleaning up (Ctrl+C, a crash).
const allGroups = new Set<number>();
process.on("exit", () => {
  // Only synchronous code runs here, so no waiting: kill hard right away.
  for (const pid of allGroups) killGroup(pid, "SIGKILL");
});

// Send a signal to the whole process group: the shell, and everything it
// started (npm run dev -> node server.js), not just the shell's pid.
function killGroup(pid: number, signal: NodeJS.Signals): void {
  try {
    process.kill(-pid, signal);
  } catch {
    // Group is already gone.
  }
}

// Signal 0 doesn't kill anything; it only checks if the group still exists.
function groupIsAlive(pid: number): boolean {
  try {
    process.kill(-pid, 0);
    return true;
  } catch {
    return false;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// The background processes started by one agent. Each agent has its own, so
// it can only see and stop its own processes, and stops them all when it's done.
export class ProcessManager {
  private readonly processes = new Map<string, BackgroundProcess>();
  private nextId = 1;

  start(command: string, cwd: string): BackgroundProcess {
    const child = spawn(command, {
      cwd,
      shell: true,
      // No stdin, like run_command: it can't wait for input or steal the user's.
      stdio: ["ignore", "pipe", "pipe"],
      // Own process group, so stop() can kill everything the command started.
      detached: true,
    });

    const proc: BackgroundProcess = {
      id: `p${this.nextId++}`,
      command,
      child,
      output: "",
      exitStatus: null,
    };
    child.stdout!.on("data", (chunk) => (proc.output += chunk));
    child.stderr!.on("data", (chunk) => (proc.output += chunk));
    child.on("error", (err) => {
      proc.output += `\n[failed to start: ${err.message}]\n`;
      proc.exitStatus = "failed to start";
    });
    child.on("exit", (code, signal) => {
      proc.exitStatus = signal ? `signal ${signal}` : `code ${code}`;
    });

    if (child.pid !== undefined) allGroups.add(child.pid);
    this.processes.set(proc.id, proc);
    return proc;
  }

  get(id: string): BackgroundProcess {
    const proc = this.processes.get(id);
    if (!proc) {
      const known = [...this.processes.keys()].join(", ") || "none";
      throw new Error(`No process with id ${id}. Running processes: ${known}.`);
    }
    return proc;
  }

  // Ask the whole group to exit (SIGTERM); if it's still there after a few
  // seconds, kill it (SIGKILL). Done even if the shell itself already exited,
  // because something it started may still be running.
  async stop(id: string): Promise<BackgroundProcess> {
    const proc = this.get(id);
    const pid = proc.child.pid;
    if (pid !== undefined) {
      killGroup(pid, "SIGTERM");
      const deadline = Date.now() + STOP_GRACE_MS;
      while (groupIsAlive(pid) && Date.now() < deadline) await sleep(100);
      if (groupIsAlive(pid)) killGroup(pid, "SIGKILL");
      allGroups.delete(pid);
      // Give Node a moment to notice the exit, so the status we report is right.
      for (let i = 0; i < 10 && proc.exitStatus === null; i++) await sleep(50);
    }
    this.processes.delete(id);
    return proc;
  }

  // Stop every process this agent started. Returns the ones it stopped.
  async stopAll(): Promise<BackgroundProcess[]> {
    const ids = [...this.processes.keys()];
    return Promise.all(ids.map((id) => this.stop(id)));
  }
}

// What Claude sees about a process: whether it's running, and its output.
function describe(proc: BackgroundProcess): string {
  const status = proc.exitStatus ? `Status: exited (${proc.exitStatus})` : "Status: running";
  const printed =
    proc.output.trim() === "" ? "(no output yet)" : truncate(proc.output, MAX_OUTPUT_CHARS);
  return `Process ${proc.id}: \`${proc.command}\`\n${status}\n\nOutput so far:\n${printed}`;
}

export const startProcessTool: ToolDefinition = {
  name: "start_process",
  description:
    "Start a long-running command in the background, e.g. a server ('npm run dev', 'node server.js'), " +
    "in the project folder. The user must approve it, and may decline. Waits about 2 seconds, then " +
    "returns the process id, whether it's still running, and what it printed so far: check this to " +
    "see if it started or crashed. Use read_process_output to see more output later, and always " +
    "stop it with stop_process when you're done. For commands that finish on their own " +
    "(tests, builds, curl), use run_command instead.",
  inputSchema: {
    type: "object",
    properties: {
      command: {
        type: "string",
        description: "The shell command to start, e.g. 'node server.js'.",
      },
    },
    required: ["command"],
  },
  fn: async (input: { command: string }, context) => {
    const { command } = input;
    if (!command?.trim()) throw new Error("command is required.");

    if (!context.confirm) {
      return `The process was not started: there is no user here to approve it.`;
    }
    if (!(await context.confirm(`Start \`${command}\` in the background?`))) {
      return `The user declined to start \`${command}\`. Don't retry it; report that you couldn't start it.`;
    }

    const proc = context.processes.start(command, context.workspaceRoot);
    // Wait for the startup output, but answer early if it exits right away.
    const deadline = Date.now() + STARTUP_WAIT_MS;
    while (proc.exitStatus === null && Date.now() < deadline) await sleep(100);
    return describe(proc);
  },
};

export const readProcessOutputTool: ToolDefinition = {
  name: "read_process_output",
  description:
    "Show everything a background process (from start_process) has printed so far, " +
    "and whether it's still running or has exited (with its exit code).",
  inputSchema: {
    type: "object",
    properties: {
      id: { type: "string", description: "The process id returned by start_process, e.g. 'p1'." },
    },
    required: ["id"],
  },
  fn: async (input: { id: string }, context) => describe(context.processes.get(input.id)),
};

export const stopProcessTool: ToolDefinition = {
  name: "stop_process",
  description:
    "Stop a background process started with start_process, together with everything it " +
    "started (e.g. the node process behind 'npm run dev'). Returns its final output.",
  inputSchema: {
    type: "object",
    properties: {
      id: { type: "string", description: "The process id returned by start_process, e.g. 'p1'." },
    },
    required: ["id"],
  },
  fn: async (input: { id: string }, context) => {
    const proc = await context.processes.stop(input.id);
    return `Stopped.\n\n${describe(proc)}`;
  },
};
