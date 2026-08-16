/**
 * Workspace-shared project progress document.
 *
 * Maintains a per-workspace `PROGRESS.md` with two regions: a curated
 * `## 项目档案` (stable facts — publish status, repository, community rules,
 * release steps) and an append-only `## 进展时间线` (auto-appended session
 * summaries plus manual entries). Every session in the workspace reads the
 * document through an injected prompt section and maintains it through three
 * model tools (`project_status` / `project_update` / `project_facts`), so a
 * new session starts knowing where the project stands and how to release it.
 * @module @deepseek-ai/dsh-project-progress
 */
import type { Context } from '@deepseek-ai/cordis';
/** Stable Cordis plugin name. */
export declare const name = "dsh-project-progress";
/** Registries the tools and the prompt section mount into. */
export declare const inject: string[];
export declare function apply(ctx: Context): void;
//# sourceMappingURL=index.d.ts.map