/**
 * Workspace-shared project progress, memory map, and modular documentation.
 *
 * Maintains a per-workspace `PROGRESS.md` with two regions: a curated
 * `## Project Facts` (stable facts — publish status, repository, community
 * rules, release steps) and an append-only `## Progress Timeline`
 * (auto-appended session summaries plus manual entries). The injected prompt
 * also teaches every session to read `MEMORY.md` (the project map) and the
 * matching module file under `docs/`, and to keep both current whenever code
 * or structure changes. Four model tools maintain the files
 * (`project_status` / `project_update` / `project_facts` / `project_memory`).
 * @module @deepseek-ai/dsh-project-progress
 */
import type { Context } from '@deepseek-ai/cordis';
/** Stable Cordis plugin name. */
export declare const name = "dsh-project-progress";
/** Registries the tools and the prompt section mount into. */
export declare const inject: string[];
export declare function apply(ctx: Context): void;
//# sourceMappingURL=index.d.ts.map