import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
//#region lib/types/index.js
/**
* Workspace-shared project progress document.
*
* Maintains a per-workspace `PROGRESS.md` with two regions: a curated
* `## Project Facts` (stable facts — publish status, repository, community
* rules, release steps) and an append-only `## Progress Timeline`
* (auto-appended session summaries plus manual entries). Every session in the
* workspace reads the document through an injected prompt section and
* maintains it through three model tools (`project_status` / `project_update`
* / `project_facts`), so a new session starts knowing where the project
* stands and how to release it.
* @module @deepseek-ai/dsh-project-progress
*/
/** Stable Cordis plugin name. */
const name = "dsh-project-progress";
/** Registries the tools and the prompt section mount into. */
const inject = ["tools", "systemPrompt"];
const FILE_NAME = "PROGRESS.md";
const FACTS_HEADER = "## Project Facts";
const TIMELINE_HEADER = "## Progress Timeline";
const MAX_STATUS_CHARS = 8e3;
const MAX_PROMPT_CHARS = 5e3;
const TEMPLATE = `# Project Progress (Shared)

${FACTS_HEADER}

<!-- Key project facts: release status, repository URL, DSH plugin community rules, release/sync workflow, etc. Maintained with the project_facts tool. -->

${TIMELINE_HEADER}

`;
function docPath(cwd) {
	if (cwd === void 0 || cwd.length === 0) return null;
	return join(cwd, FILE_NAME);
}
function splitDoc(text) {
	const factsIdx = text.indexOf(FACTS_HEADER);
	const timelineIdx = text.indexOf(TIMELINE_HEADER);
	if (factsIdx === -1 || timelineIdx === -1) return {
		facts: "",
		timeline: text.trim()
	};
	return {
		facts: text.slice(factsIdx + FACTS_HEADER.length, timelineIdx).trim(),
		timeline: text.slice(timelineIdx + TIMELINE_HEADER.length).trim()
	};
}
function renderDoc(parts) {
	return `# Project Progress (Shared)\n\n${FACTS_HEADER}\n\n${parts.facts.trim()}\n\n${TIMELINE_HEADER}\n\n${parts.timeline.trim()}\n`;
}
function readParts(cwd) {
	const path = docPath(cwd);
	if (path === null || !existsSync(path)) return null;
	return splitDoc(readFileSync(path, "utf-8"));
}
function ensureDoc(cwd) {
	const path = docPath(cwd);
	if (path === null) return null;
	if (!existsSync(path)) {
		mkdirSync(dirname(path), { recursive: true });
		writeFileSync(path, TEMPLATE, "utf-8");
	}
	return path;
}
function cwdOf(exec) {
	return exec.agent?.session?.header?.cwd;
}
function tailChars(text, max) {
	return text.length > max ? text.slice(text.length - max) : text;
}
function stamp() {
	const d = /* @__PURE__ */ new Date();
	const pad = (n) => String(n).padStart(2, "0");
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function fmtTokens(v) {
	if (!Number.isFinite(v)) return "0";
	if (v >= 1e6) return `${(v / 1e6).toFixed(2)}M`;
	if (v >= 1e3) return `${(v / 1e3).toFixed(1)}K`;
	return String(Math.round(v));
}
const answer = (path, message, content, ok = true) => ({
	ok,
	path,
	message,
	content
});
const ANSWER_SCHEMA = {
	type: "object",
	additionalProperties: false,
	properties: {
		ok: { type: "boolean" },
		path: { type: "string" },
		message: { type: "string" },
		content: { type: "string" }
	}
};
const NO_ARGS = {
	type: "object",
	additionalProperties: false,
	properties: {}
};
const CONTENT_ARGS = {
	type: "object",
	additionalProperties: false,
	properties: { content: { type: "string" } },
	required: ["content"]
};
const FACTS_ARGS = {
	type: "object",
	additionalProperties: false,
	properties: { facts: { type: "string" } },
	required: ["facts"]
};
function answerRender(_args, value) {
	const v = value;
	return [{
		type: "text",
		text: v.content.length > 0 ? v.content : v.message
	}];
}
const STATUS_TOOL = {
	name: "project_status",
	description: "Read the workspace-shared project progress document PROGRESS.md (Project Facts + Progress Timeline). Every new session should call this first to learn the project state: whether it has been released, the GitHub repository URL, DSH plugin community rules, recent progress, and next steps.",
	parameters: NO_ARGS,
	output: {
		schema: ANSWER_SCHEMA,
		render: answerRender
	},
	async execute(_args, exec) {
		const path = docPath(cwdOf(exec));
		if (path === null) return answer("", "This session has no working directory, so the shared document cannot be located.", "", false);
		if (!existsSync(path)) return answer(path, "The shared document does not exist yet (it is created automatically after the first session ends; you can also create it with project_facts or project_update).", "", false);
		const parts = splitDoc(readFileSync(path, "utf-8"));
		return answer(path, "Read the shared project progress document.", tailChars(`# Project Progress (Shared)\n\n${FACTS_HEADER}\n${parts.facts}\n\n${TIMELINE_HEADER}\n${parts.timeline}`, MAX_STATUS_CHARS));
	}
};
const UPDATE_TOOL = {
	name: "project_update",
	description: "Append a progress entry to the workspace-shared progress document PROGRESS.md (Progress Timeline). Use it after completing a milestone to record what was done, the outcome, and the next step. Each call appends one entry and never overwrites existing content.",
	parameters: CONTENT_ARGS,
	output: {
		schema: ANSWER_SCHEMA,
		render: answerRender
	},
	async execute(args, exec) {
		const path = ensureDoc(cwdOf(exec));
		if (path === null) return answer("", "This session has no working directory, so the shared document cannot be written.", "", false);
		const text = String(args.content).trim();
		const heading = `## ${stamp()} · Session ${exec.agent?.session?.id.slice(0, 8) ?? "unknown"} · Manual update`;
		appendFileSync(path, `\n${heading}\n\n${text}\n`, "utf-8");
		return answer(path, "Progress appended.", `Appended:\n${heading}\n\n${text}`);
	}
};
const FACTS_TOOL = {
	name: "project_facts",
	description: "Update the Project Facts section of the workspace-shared progress document (the whole section is replaced). The facts should record key project facts, for example: release status (published to GitHub / listed in the DSH plugin community), GitHub repository URL, DSH plugin community rules (dsh.bundle manifest, cordis.patch.yml, dsh-plugin topic, committed lib artifacts, zero runtime dependencies), release and sync workflow (change → sync checkout and release repo → build → push → restart), install commands, etc.",
	parameters: FACTS_ARGS,
	output: {
		schema: ANSWER_SCHEMA,
		render: answerRender
	},
	async execute(args, exec) {
		const path = ensureDoc(cwdOf(exec));
		if (path === null) return answer("", "This session has no working directory, so the shared document cannot be written.", "", false);
		const current = splitDoc(readFileSync(path, "utf-8"));
		const text = String(args.facts).trim();
		writeFileSync(path, renderDoc({
			facts: text,
			timeline: current.timeline
		}), "utf-8");
		return answer(path, "Project facts updated.", `Project facts updated:\n\n${text}`);
	}
};
function apply(ctx) {
	ctx.tools.register(STATUS_TOOL);
	ctx.tools.register(UPDATE_TOOL);
	ctx.tools.register(FACTS_TOOL);
	ctx.systemPrompt.section({
		name: "project-progress",
		order: 60,
		text: (context) => {
			const agent = context.agent;
			if (agent === void 0) return "";
			const parts = readParts(agent.session?.header?.cwd);
			if (parts === null) return "";
			const timeline = tailChars(parts.timeline, MAX_PROMPT_CHARS);
			return [
				"## Project Progress (shared document PROGRESS.md)",
				"",
				"The following is the workspace-shared progress document; read it first to understand the project state and release status.",
				"",
				`${FACTS_HEADER}`,
				parts.facts,
				"",
				`${TIMELINE_HEADER} (recent part)`,
				timeline,
				"",
				"Convention: after completing a milestone, append progress with project_update; when facts such as release status, repository URL, or community rules change, update the facts section with project_facts."
			].join("\n");
		}
	});
	ctx.on("agent/disposed", (payload) => {
		const session = payload.agent.session;
		const header = session.header;
		if (header.origin === "subagent") return;
		const path = ensureDoc(header.cwd);
		if (path === null) return;
		let title = "";
		const sessionTitle = ctx.get("sessionTitle");
		try {
			title = sessionTitle?.get(session)?.title ?? "";
		} catch (error) {
			title = "";
		}
		let turns = 0;
		let steps = 0;
		let input = 0;
		let read = 0;
		let output = 0;
		const sessionProjections = ctx.get("sessionProjections");
		try {
			const snap = sessionProjections?.snapshot(session);
			const stats = snap?.sessionStats;
			const usage = snap?.tokenUsage;
			turns = Number(stats?.turns) || 0;
			steps = Number(stats?.steps) || 0;
			input = Number(usage?.uncachedInputTokens) || 0;
			read = Number(usage?.cacheReadTokens) || 0;
			output = Number(usage?.outputTokens) || 0;
		} catch (error) {}
		const billed = input + read;
		const hitPct = billed > 0 ? Math.round(read / billed * 100) : 0;
		appendFileSync(path, `\n${`## ${stamp()} · Session ${session.id.slice(0, 8)}${title.length > 0 ? ` · ${title}` : ""}`}\n${`- Turns ${turns} · Steps ${steps} · Input ${fmtTokens(input)} (cache hit ${hitPct}%) · Output ${fmtTokens(output)}`}\n`, "utf-8");
	});
}
//#endregion
export { apply, inject, name };
