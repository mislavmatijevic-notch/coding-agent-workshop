# Task: Todo REST API

Build a small REST API for a todo list in this folder, in TypeScript with Express.

## Packages

- Check the latest versions of `express` and `supertest` on the npm registry:
  - https://registry.npmjs.org/express/latest
  - https://registry.npmjs.org/supertest/latest
- `dependencies`: `express`
- `devDependencies`: `typescript`, `@types/express`, `@types/node`, `supertest`, `@types/supertest`

## package.json

- `"type": "module"`
- scripts:
  - `build`: `tsc`
  - `test`: `npm run build && node --test`
  - `dev`: `npm run build && node dist/server.js`

## tsconfig.json

- `src` → `dist`
- `module` and `moduleResolution`: `NodeNext`
- `strict: true`

## src/app.ts

- Exports the Express app. It **does not call `app.listen`**, so tests can use it without a real server.
- The todo list is kept in memory. A todo looks like this: `{ id: number, text: string, done: boolean }`.
- Also exports `resetTodos()`, which empties the list and resets the id counter to 1, so tests are independent of each other.

| Route | What it does | Success | Errors |
|---|---|---|---|
| `GET /todos` | returns all todos | 200 | |
| `POST /todos` | body `{ text }`, creates a todo with `done: false` | 201 + the new todo | 400 if `text` is missing or empty (including only whitespace) |
| `PATCH /todos/:id` | marks the todo as done (`done: true`) | 200 + the todo | 404 if the id doesn't exist |
| `DELETE /todos/:id` | deletes the todo | 204, no body | 404 if the id doesn't exist |

Errors return JSON in the form `{ "error": "..." }`.

## src/server.ts

- Imports `app` from `./app.js` and starts it on the port from the `PORT` environment variable, defaulting to `3007`.
- If starting fails (e.g. the port is taken), it must print the error and exit with `process.exit(1)`. In Express 5, the `app.listen` callback receives the error as its first argument.
- On success, it prints `Server running on http://localhost:<port>`.

## src/app.test.ts

Tests with `node:test` and `supertest` for all routes, including:

- empty and missing `text` → 400
- non-existent id for `PATCH` and `DELETE` → 404
- `DELETE` actually removes the todo from the list

## Done when

1. `npm install` succeeds.
2. `npm run build` succeeds with no TypeScript errors.
3. `npm test` succeeds and all tests are green.

**Do not run `npm run dev`.** I will start the server myself.
