English fork of Jolly-J/dsh-project-progress (MIT).

# dsh-project-progress

A **shared project memory and progress** plugin for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (DSH) workspaces: one `PROGRESS.md`, one `MEMORY.md`, and a `docs/` folder at the root of each workspace, shared by all sessions. New sessions automatically see the project state at startup; progress is recorded automatically when a session ends.

## What it does

Each workspace gets three shared artifacts:

- **`PROGRESS.md`** — the chronological record:
  - **Project Facts**: stable facts — release status, GitHub repository URL, DSH plugin community rules, release/sync workflow, install commands — maintained by the model through the `project_facts` tool;
  - **Progress Timeline**: append-only entries — one is written automatically when a top-level session ends (title, turns/steps, token usage, changed code files, memory check), and you can always add "what was done, the outcome, next steps" manually with `project_update`.
- **`MEMORY.md`** — the project map: the project's purpose, key entry points, and links to the matching module descriptions in `docs/`. It starts with the strict rule that a code change without a memory/docs update leaves the task incomplete.
- **`docs/`** — modular documentation, one file per module or subsystem, kept in sync with `MEMORY.md`.

The document is injected into the system prompt of every new session (section `project-progress`, order 60), so the agent knows from the start where the project stands, which rules to follow when releasing, and how to work with the project map:

- at session start, read `MEMORY.md` to understand the structure; use the map and `docs/` instead of reading the whole codebase without need;
- if you create files, change the folder structure, or change a module's architecture, update `MEMORY.md` (add links) and the corresponding file in `docs/`;
- before finishing, check `git status`; if code changed, make sure `MEMORY.md` and `docs/` were updated too;
- while the session runs, if `git status` reports uncommitted code changes without a `MEMORY.md`/`docs/` update, the injected prompt adds a live reminder listing the changed code files.

Four model tools:

- `project_status` — read the shared progress document of the current workspace;
- `project_update` — append a progress entry to the timeline;
- `project_facts` — replace the whole "Project Facts" section (release status, community rules, release workflow, etc.);
- `project_memory` — read `MEMORY.md`, replace the whole map with `content`, or add a module link with `module` + `doc` (+ optional `summary`).

## Session-end memory check

When a top-level session ends, the plugin runs `git status` locally (no network) and compares the result with the session's starting state. If code files changed, the automatic `PROGRESS.md` entry records:

- the changed code files;
- the question **"Were MEMORY.md and docs/ updated according to the new changes?"** plus the list of updated memory/docs files, or `not updated`.

The next session sees that reminder in the injected progress timeline. The plugin also logs a warning when code changed but neither `MEMORY.md` nor `docs/` was touched.

> The agent itself is already disposed when this check runs, so the reminder is persisted to `PROGRESS.md` (and the log) rather than sent as a new chat message. During the session, the prompt section also adds a live reminder while uncommitted code changes lack a memory/docs update, which gives the agent a chance to fix the files before it finishes.

## Installation

### Option 1 (easiest): one command

```sh
dsh plugin --profile web add https://github.com/Jolly-J/dsh-project-progress.git
```

Then restart `dsh web` (the plugin is added to the composition automatically as a profile layer; the `lib/` artifacts are committed to the repository, so no local build is needed).

### Option 2: let an AI install it for you

Send this repository URL to your DSH agent and say:

> Install this plugin into my DSH: <repository URL>

Your agent will follow the 6 steps below; then restart `dsh web`:

1. Put this repository at `packages/extensions/dsh-project-progress` in the DSH project;
2. Add a line to `packages/bundle/web-app/cordis.patch.yml`:
   ```yaml
   - id: dsh-project-progress
     name: 'dsh-project-progress'
   ```
3. Add to `dependencies` in `packages/bundle/web-app/package.json`:
   ```json
   "dsh-project-progress": "workspace:^"
   ```
4. Add `{ "path": "./packages/extensions/dsh-project-progress" }` to `references` in the root `tsconfig.host.json`;
5. Run `pnpm install`, then build: `pnpm --filter dsh-project-progress bundle`;
6. Restart `dsh web`.

> Requirements: the DSH project itself must build, and `pnpm` version 11.7.0 (matching DSH's `packageManager`).

## Data and privacy

- All reads and writes happen in **your local workspace**: the plugin only creates/updates `PROGRESS.md`, `MEMORY.md`, and files under `docs/` — plain Markdown files you can edit or delete at any time;
- **No network calls**: the only external process is the local `git status` used for the session-end memory check; nothing is uploaded and no secrets are read;
- Progress is appended automatically only for top-level sessions (subagent sessions do not write); manual records are entirely up to you (or the model).

## Known limitations

- **Single workspace only** — the files live at the workspace root and are not aggregated across workspaces;
- **Automatic entries are structured** — session end writes a title and usage stats; use `project_update` for natural-language summaries;
- **The timeline is append-only** — old entries are not rewritten; to correct something, append a new entry or rewrite the "Project Facts" section;
- **The memory check sees uncommitted changes** — code committed during the session is not reported by `git status`; the prompt rule still applies;
- **`MEMORY.md` is not auto-created on read** — create it via `project_memory` (`content` or a module entry) or with `write`;
- The plugin's user-facing text is currently English only.

## License

[MIT](LICENSE)
