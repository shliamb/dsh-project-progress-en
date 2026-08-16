//#region lib/types/invariant.js
/**
* Package-owned invariant companion for `@deepseek-ai/dsh-project-progress`.
* @module @deepseek-ai/dsh-project-progress/invariant
*/
const PACKAGE_NAME = "dsh-project-progress";
/** Cordis companion plugin name. */
const name = "dsh-project-progress-invariant";
/** Service required before the companion can reserve package ownership. */
const inject = ["invariants"];
/**
* No runtime invariant: the plugin owns per-workspace markdown files only,
* writes through node:fs guarded by existence checks, and holds no
* cross-plugin mutable state.
*/
const install = () => {};
/**
* Register this package's invariant companion.
* @param ctx - Cordis context carrying the invariant service.
* @returns the installed registration's disposer after setup succeeds.
*/
const apply = (ctx) => Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install));
//#endregion
export { apply, inject, name };
