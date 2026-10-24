# Invariant companion (`src/invariant.ts`)

Registers `dsh-project-progress` with the invariants service.

There is no runtime invariant: the plugin owns per-workspace Markdown files only, writes through `node:fs` guarded by existence checks, and holds no cross-plugin mutable state. The per-agent git baseline used by the memory check lives in a `WeakMap` inside the plugin and is not shared with other plugins.
