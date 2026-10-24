English fork of Jolly-J/dsh-project-progress (MIT).

# dsh-project-progress

A **shared project progress document** for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (DSH) workspaces: one `PROGRESS.md` at the root of each workspace, shared by all sessions. New sessions automatically see the project state at startup, and progress is recorded automatically when a session ends.

## What it does

Each workspace has one `PROGRESS.md` with two sections:

- **Project Facts**: stable facts — release status, GitHub repository URL, DSH plugin community rules, release/sync workflow, install commands — maintained by the model through the `project_facts` tool;
- **Progress Timeline**: append-only entries — one is written automatically when a top-level session ends (title, turns/steps, token usage), and you can always add "what was done, the outcome, next steps" manually with `project_update`.

The document is injected into the system prompt of every new session (section `project-progress`, order 60), so the agent knows from the start where the project stands and which rules to follow when releasing. Three model tools:

- `project_status` — read the shared document of the current workspace;
- `project_update` — append a progress entry to the timeline;
- `project_facts` — replace the whole "Project Facts" section (release status, community rules, release workflow, etc.).

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

- All reads and writes happen in **your local workspace**: the plugin only creates/updates `PROGRESS.md` at the workspace root — a plain Markdown file you can edit or delete at any time;
- **No network calls**: nothing is uploaded and no secrets are read;
- Progress is appended automatically only for top-level sessions (subagent sessions do not write); manual records are entirely up to you (or the model).

## Known limitations

- **Single workspace only** — the document lives at the workspace root and is not aggregated across workspaces;
- **Automatic entries are structured** — session end writes a title and usage stats; use `project_update` for natural-language summaries;
- **The timeline is append-only** — old entries are not rewritten; to correct something, append a new entry or rewrite the "Project Facts" section;
- The plugin's user-facing text is currently English only.

## License

[MIT](LICENSE)
