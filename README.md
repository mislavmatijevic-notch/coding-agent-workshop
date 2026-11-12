# Build a Coding Agent from Scratch

In this lab you build your own coding agent: a small Claude Code that can read and edit files, run tests and delegate work to subagents. At the end it builds a REST API on its own, from a spec, in an empty folder.

An agent is **LLM + loop + tools**. The model only *asks* for a tool to be called. Our code runs the tool and sends the result back, and this repeats until the model is done.

You'll write the code with Claude Code, but you should understand every step. Each step ends with a question you should be able to answer.

## What you need

- **Node.js 22+** (`node -v`)
- **Claude Code** (`npm install -g @anthropic-ai/claude-code`, then run `claude` and log in)
- **An Anthropic API key** from [console.anthropic.com](https://console.anthropic.com). The agent you build uses it to call the model.
- A code editor and a terminal. On Windows, use WSL.

You don't need to know TypeScript or install it separately.

## Setup

```bash
npm install
cp .env.example .env    # put your ANTHROPIC_API_KEY in .env
npm run playground      # starts the agent; for now it only prints a TODO
```

Then open Claude Code in this folder (the repo root). You'll paste each step's prompt there.

## What's in the starter

| Path | What it is |
|---|---|
| `src/agent.ts` | Skeleton of the `Agent` class, with TODOs. This is where most of the work happens. |
| `src/main.ts` | Wires everything together and starts the agent. |
| `src/input.ts` | Reads input from the terminal. |
| `src/tools/types.ts` | The shape of a tool: `name`, `description`, `inputSchema`, `fn`. |
| `src/tools/read-file.ts` | A finished tool, as an example. |
| `src/tools/truncate.ts` | Shortens text that's too long. |
| `playground/` | A small project (`math.js` and its tests) for your agent to work on. |
| `todo-api/TASK.md` | The spec for the finale. |

`npm run playground` runs your agent inside `playground/`. Add `-- --debug` to see everything sent to and from the model.

The agent only works inside the folder it was started in. That's why it runs in `playground/` and not here: it can't change its own code or read your `.env`.

**How each step works:**
1. Paste the prompt into Claude Code.
2. Read what it wrote.
3. Run the check.
4. Answer the question.
5. Commit, so you have a save point: `git add -A && git commit -m "Step A"`

Your code doesn't have to look exactly like anyone else's. If the check passes, move on.

If Claude breaks something in a step, go back to your last commit with `git reset --hard && git clean -fd` and try the step again. Commits stay on your laptop; nothing is pushed anywhere.

---

## Part 1: The agent

### A. A single model call

**Goal:** send one message to the model and print the reply.

```text
Make the agent talk to Claude for the first time.
In src/agent.ts, write runInference(): it sends a message to Claude (model claude-haiku-5-5) and returns the reply.
In run(), ask me for one line of text, send it, and print Claude's answer.
If I start the program with --debug, also print the full request and the full response.
```

**Check:** `npm run playground -- --debug`, then type `Hi`. You get a reply.

**Question:** what does the API return in `content`, and why is it a list instead of a string?

### B. Chat with memory

**Goal:** a chat that remembers what was said earlier.

```text
Turn the agent into a chat.
In run(), add a loop: read my message, send it to Claude, print the reply, and repeat. Stop on Ctrl+D and skip empty messages.
Save every message (mine and Claude's) in a conversation array, and send the whole conversation to Claude each time.
```

**Check:** type "My name is Ana", then "What's my name?". The agent answers "Ana".

**Question:** where is the agent's memory, and why do we send the whole conversation every time?

### C. The model asks for a tool

**Goal:** tell the model which tools exist, and see it ask for one.

```text
Give the agent its first tool.
Add a tools list to the agent's options, and give it the read_file tool from src/tools.
Send the tools to Claude with every request (name, description and input schema).
Don't run any tools yet. When Claude asks for a tool, just print the tool name and its input.
Keep it simple: it's OK if the chat breaks after a tool request, we fix that in the next step.
```

**Check:** "What's in package.json?" You see the agent ask for `read_file` with `{"path":"package.json"}`.

**Question:** what does the model know about a tool, and what doesn't it see? Can the model read the file by itself?

### D. Run the tool (one round)

**Goal:** run the tool the model asked for and send the result back, even when the tool fails.

```text
Now run the tool Claude asks for.
Add an executeTool() method: find the tool by name, call it with Claude's input, and return the result as a tool_result.
In run(), send the tool results back to Claude so it can answer. Do this only once per message for now.
Keep Claude's full reply (with the tool request) in the conversation.
If the tool fails or doesn't exist, send the error back to Claude instead of crashing.
```

**Check:**
- "What's in package.json?" The agent answers correctly.
- "What's in nope.txt?" The agent gets an error back and answers sensibly instead of crashing.

**Question:** why does `tool_result` go under `role: "user"`, and what is `tool_use_id` for?

**Question:** why is it better to send a tool error back to the model than to crash?

### E. The loop

**Goal:** keep running tools until the model is done.

```text
Let Claude keep using tools until it can answer my question.
Add a runUntilDone() method with a loop: call Claude, run the tools it asks for, send back the results, and repeat. Stop when Claude replies without asking for a tool, and return its final text.
run() should just add my message and call runUntilDone().
```

**Check:** "Read package.json, then read the README." The agent calls two tools in a row and stops on its own.

**Question:** who decides when the agent is done?

### F. Your first tool: `list_files`

**Goal:** write a tool yourself.

```text
Write a new tool, list_files, so Claude can see which files exist.
Put it in src/tools/, like read_file. It lists all files and folders, including subfolders, but skips node_modules and .git. Folder names end with "/". The path is optional (default: the current folder).
Add it to the agent's tools in main.ts, next to read_file.
```

**Check:** "What files are in this project?" The agent calls `list_files` and answers correctly.

**Question:** why is a tool's `description` so important?

### G. Brakes

**Goal:** the agent can't run forever or spend unlimited tokens.

```text
Add two limits so the agent can't run forever or cost too much.
1. Claude can be called at most 25 times per message (make it a maxTurns option). If the limit is hit, stop, print a warning in red and return it as plain text.
2. Count the tokens from every response in a small UsageTracker class in src/usage.ts. Stop when the total goes over 1,000,000. Show the token count after every answer and when the program exits.
```

**Check:** temporarily set `maxTurns: 2` and ask "Read every file in the project one by one." The agent stops and says why. Set it back afterwards.

**Question:** what could happen without this limit?

### H. One class, many agents

**Goal:** the same class can be different agents.

```text
Prepare the Agent class so we can create different agents from it.
Add two options: a name and a system prompt. Send the system prompt to Claude, and start every line the agent prints with its name, e.g. [main].
Add a runTask(task) method: it starts a new, empty conversation with just that task, works on it without asking me anything, and returns the final answer. Subagents will use this later.
In main.ts, call the agent "main" and give it a short system prompt.
```

**Check:** change the system prompt (e.g. "Only answer in rhyme") and remove a tool. The agent behaves differently.

**Question:** what's the difference between `run()` and `runTask()`?

---

## Part 2: Tools

The agent is done. From here on we add tools and safety. Each tool is a new file in `src/tools/`.

### T1. `edit_file` + sandbox

**Goal:** the agent can create and change files, but only inside its folder, and only files it has read.

This step has two prompts. Paste the first one, run its check, then do the same with the second.

**Prompt 1: edit_file**

```text
Let the agent create and change files.
Add an edit_file tool: it replaces a piece of text in a file (old_str) with new text (new_str). The old text must appear exactly once in the file. If it's missing or appears more than once, return an error that tells Claude how to fix it.
If old_str is empty and the file doesn't exist, create the file.
Add it to the agent's tools in main.ts.
```

**Check:** "Create hello.txt with the text Hi, then change Hi to Hello." The file is created and then changed.

**Prompt 2: safety rules**

```text
Add two safety rules for all file tools, in src/tools/workspace.ts:
- Tools can't read or write anything outside the folder where the agent was started.
- Claude must read a file before editing it. If the file has changed since Claude last read it, refuse the edit.
The tools need extra info for this (the agent's folder and which files were read), so pass it to them in a context object.
```

**Check:**
- "Read ../.env". It refuses.
- "Change Hello in hello.txt to Hey." It still works: Claude reads the file first, then edits it.

**Question:** why find & replace instead of rewriting the whole file? What would happen without read-before-edit?

### T2. `run_command` + confirmation

**Goal:** the agent can run tests, but only with your permission.

```text
Let the agent run shell commands, like npm test, but only if I say yes.
Add a run_command tool. Before running anything, ask me [y/N], with no as the default. If I say no, tell Claude instead of throwing an error.
Run the command in the agent's folder. If it takes longer than 30 seconds, stop it.
Send back to Claude whether the command succeeded (the exit code) and what it printed. If the output is very long, shorten it.
A failing command, like failing tests, is a normal result, not a tool error.
```

**Check:** break `multiply` in `playground/math.js` (make it return `a + b`), then ask "Run the tests and fix what fails." The agent runs the tests, fixes the code and runs them again until they pass.

**Question:** why aren't failing tests (exit 1) a tool error? What does `[y/N]` protect against, and what doesn't it?

### T3. Subagents

**Goal:** a main agent that delegates work to specialized agents.

```text
Split the work between three agents: a main agent that hands out tasks, and two helpers.
In src/agents.ts, create three agents from the Agent class, each with its own system prompt and tools:
- explorer: can only read and list files. It looks around the project and sends back a short summary.
- implementer: can read, edit files and run commands. It makes changes and runs the tests until they pass.
- main: can only read and list files. Instead of editing, it has two tools, delegate_explore and delegate_implement. Each one starts a new explorer or implementer with runTask() and returns its answer.
The helpers can't see my chat with main, so main must write every task so it makes sense on its own.
The helpers must still ask me [y/N] before running commands.
main.ts should start the main agent.
```

**Check:** "Add a divide function to the math module, with tests, that throws on division by zero." The log shows `[main]` → `[explorer]` → `[implementer]`, and the tests pass.

**Question:** why doesn't a subagent see the conversation with the user, and why is that good?

### T4. Background processes

**Goal:** the agent can start a server, test it and stop it.

```text
Let the implementer start a server, test it, and stop it. run_command can't do this, because it waits for the command to finish and a server never finishes.
Add three tools and give them to the implementer:
- start_process: asks me [y/N], starts a command in the background, waits about 2 seconds, and returns an id and what it printed so far (so Claude can see if it crashed).
- read_process_output: shows what the process has printed and whether it's still running.
- stop_process: stops the process, including anything it started (like the node process behind npm run dev).
When the agent exits, stop every process it started.
Tell the implementer in its system prompt to test servers this way: start the server, call it with curl, then stop it.
Also update the delegate_implement description, so main knows the implementer can test servers.
```

**Check:** "Create server.js that responds ok on port 3017, start it, check it with curl and stop it." The log shows `start_process` → `run_command curl` → `stop_process`. After you quit the agent, `lsof -i :3017` returns nothing.

**Question:** why can't everything go through `run_command`? Why kill the whole process group instead of just the `pid`?

---

## Finale

**Goal:** the agent builds an app on its own from a spec.

`todo-api/` contains only `TASK.md`, the spec for a todo REST API. Start your agent in that folder:

```bash
npm run todo
```

Tell it:

```text
Read TASK.md and implement everything in it.
```

There will be many `[y/N]` questions. Read them before pressing `y`.

**Done when:**
- `npm install`, `npm run build` and `npm test` pass.
- You start the server yourself, then try it:

```bash
cd todo-api
npm run dev

# in another terminal:
curl -X POST localhost:3007/todos -H 'Content-Type: application/json' -d '{"text":"buy milk"}'
curl localhost:3007/todos
```

**Bonus:** "Start the server on port 3017, try all routes with curl and stop it."
