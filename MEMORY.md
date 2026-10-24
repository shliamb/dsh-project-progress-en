# Project Memory

**IMPORTANT: If code changed but `MEMORY.md` or `docs/` were not updated, I will consider the task NOT COMPLETED.**

## Project Map

`dsh-project-progress` is a DSH plugin that maintains workspace-shared project memory and progress files. It has no runtime dependencies on other DSH packages: it imports Node built-ins only.

- `src/index.ts` — plugin entry: registers the four tools, injects prompt rules, and runs the session-end memory check.
- `src/invariant.ts` — package-owned invariant companion (no runtime invariant).
- `lib/` — committed runtime artifacts; translated by hand because this standalone checkout cannot run the DSH workspace build.
- `docs/` — module documentation.
- `README.md` — installation, usage, and privacy notes.

## Modules

- [Plugin entry](docs/plugin-entry.md) — tools, prompt injection, and session-end audit.
- [Invariant companion](docs/invariant.md) — package-owned invariant registration.
