# Plugin entry (`src/index.ts`)

Registers the workspace tools and the `project-progress` prompt section (order 60).

## Tools

- `project_status` — reads `PROGRESS.md` (Project Facts + Progress Timeline).
- `project_update` — appends a manual timeline entry.
- `project_facts` — replaces the Project Facts section.
- `project_memory` — reads or updates `MEMORY.md`; can replace the whole map or append a module link under `## Modules`.

`project_memory` does not create module pages itself. The agent writes `docs/<module>.md` with the standard `write` / `edit` tools, then adds the link with `module` + `doc`.

## Prompt injection

Always injects the `MEMORY.md` / `docs/` rules, even when `PROGRESS.md` does not exist yet. When progress exists, it prepends the Project Facts and the recent timeline. While the session runs, it also appends a live reminder when the session's git state shows changed code files but no `MEMORY.md`/`docs/` update.

## Session end

For top-level sessions only, appends turns/steps/token usage to `PROGRESS.md`. It captures `git status` at `agent/created` and compares it at `agent/disposed`; when new code files changed, it adds a memory check line and warns if neither `MEMORY.md` nor `docs/` was touched.

No network access is used.
