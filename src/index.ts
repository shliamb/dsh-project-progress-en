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

import { execFileSync } from 'node:child_process'
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { Session } from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-system-prompt'
import type { ToolDefinition } from '@deepseek-ai/dsh-tools'

/** Stable Cordis plugin name. */
export const name = 'dsh-project-progress'

/** Registries the tools and the prompt section mount into. */
export const inject = ['tools', 'systemPrompt']

const FILE_NAME = 'PROGRESS.md'
const MEMORY_FILE = 'MEMORY.md'
const DOCS_DIR = 'docs'
const FACTS_HEADER = '## Project Facts'
const TIMELINE_HEADER = '## Progress Timeline'
const MAX_STATUS_CHARS = 8000
const MAX_PROMPT_CHARS = 5000

const MEMORY_RULE = '**IMPORTANT: If code changed but `MEMORY.md` or `docs/` were not updated, I will consider the task NOT COMPLETED.**'
const MEMORY_UPDATE_RULE = '**IMPORTANT: If you create new files, change the folder structure, or change a module\'s architecture, you MUST update `MEMORY.md` (add links) and the corresponding module description file in `docs/`.**'

const TEMPLATE = `# Project Progress (Shared)

${FACTS_HEADER}

<!-- Key project facts: release status, repository URL, DSH plugin community rules, release/sync workflow, etc. Maintained with the project_facts tool. -->

${TIMELINE_HEADER}

`

const MEMORY_TEMPLATE = `# Project Memory

${MEMORY_RULE}

## Project Map

<!-- Short map of the project: purpose, key entry points, and how modules fit together. -->

## Modules

`

/** Source extensions treated as code when auditing session changes. */
const CODE_EXTENSIONS = new Set([
  '.ts', '.tsx', '.mts', '.cts',
  '.js', '.jsx', '.mjs', '.cjs',
  '.py', '.pyi', '.go', '.rs', '.java', '.kt', '.kts',
  '.c', '.h', '.cc', '.cpp', '.cxx', '.hpp', '.hh',
  '.cs', '.rb', '.php', '.swift', '.scala',
  '.sh', '.bash', '.zsh', '.fish', '.lua', '.dart',
  '.ex', '.exs', '.erl', '.hrl', '.clj', '.cljs',
  '.fs', '.fsx', '.vb', '.sql', '.proto',
  '.vue', '.svelte', '.astro', '.html', '.css', '.scss', '.sass', '.less',
])

/** One tool execution with the fields this plugin reads. */
interface ExecLike {
  agent?: Agent
}

interface DocParts {
  facts: string
  timeline: string
}

/** Uncommitted code and memory/documentation files reported by git. */
interface GitChanges {
  code: string[]
  memory: string[]
}

function workspaceFile(cwd: string | undefined, fileName: string): string | null {
  if (cwd === undefined || cwd.length === 0) return null
  return join(cwd, fileName)
}

function docPath(cwd: string | undefined): string | null {
  return workspaceFile(cwd, FILE_NAME)
}

function memoryPath(cwd: string | undefined): string | null {
  return workspaceFile(cwd, MEMORY_FILE)
}

function splitDoc(text: string): DocParts {
  const factsIdx = text.indexOf(FACTS_HEADER)
  const timelineIdx = text.indexOf(TIMELINE_HEADER)
  if (factsIdx === -1 || timelineIdx === -1) return { facts: '', timeline: text.trim() }
  const facts = text.slice(factsIdx + FACTS_HEADER.length, timelineIdx).trim()
  const timeline = text.slice(timelineIdx + TIMELINE_HEADER.length).trim()
  return { facts, timeline }
}

function renderDoc(parts: DocParts): string {
  return `# Project Progress (Shared)\n\n${FACTS_HEADER}\n\n${parts.facts.trim()}\n\n${TIMELINE_HEADER}\n\n${parts.timeline.trim()}\n`
}

function readParts(cwd: string | undefined): DocParts | null {
  const path = docPath(cwd)
  if (path === null || !existsSync(path)) return null
  return splitDoc(readFileSync(path, 'utf-8'))
}

function ensureDoc(cwd: string | undefined): string | null {
  const path = docPath(cwd)
  if (path === null) return null
  if (!existsSync(path)) {
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, TEMPLATE, 'utf-8')
  }
  return path
}

function cwdOf(exec: ExecLike): string | undefined {
  return exec.agent?.session?.header?.cwd
}

function tailChars(text: string, max: number): string {
  return text.length > max ? text.slice(text.length - max) : text
}

function stamp(): string {
  const d = new Date()
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function fmtTokens(v: number): string {
  if (!Number.isFinite(v)) return '0'
  if (v >= 1e6) return `${(v / 1e6).toFixed(2)}M`
  if (v >= 1e3) return `${(v / 1e3).toFixed(1)}K`
  return String(Math.round(v))
}

/** Normalize a module documentation path and require it to stay under `docs/`. */
function normalizeDocsPath(doc: string): string | null {
  const trimmed = doc.trim().replace(/\\/g, '/').replace(/^\.\//, '')
  if (trimmed.length === 0 || trimmed.startsWith('/') || trimmed.includes('\0')) return null
  const relative = trimmed.startsWith(`${DOCS_DIR}/`)
    ? trimmed.slice(DOCS_DIR.length + 1)
    : trimmed
  if (relative.length === 0 || relative.includes('..') || !relative.toLowerCase().endsWith('.md')) return null
  return `${DOCS_DIR}/${relative}`
}

/** Append one module link inside the `## Modules` section of MEMORY.md. */
function appendModuleEntry(text: string, entry: string): string {
  const heading = '## Modules'
  const headingAt = text.indexOf(heading)
  if (headingAt === -1) return `${text.trimEnd()}\n\n${heading}\n\n${entry}\n`
  const nextHeading = text.indexOf('\n## ', headingAt + heading.length)
  if (nextHeading === -1) return `${text.trimEnd()}\n\n${entry}\n`
  const before = text.slice(0, nextHeading).trimEnd()
  const after = text.slice(nextHeading + 1)
  return `${before}\n\n${entry}\n\n${after}`
}

function isCodePath(path: string): boolean {
  const dot = path.lastIndexOf('.')
  return dot !== -1 && CODE_EXTENSIONS.has(path.slice(dot).toLowerCase())
}

/** Read uncommitted changes from local git; `null` when this is not a git workspace. */
function gitChanges(cwd: string | undefined): GitChanges | null {
  if (cwd === undefined || cwd.length === 0) return null
  let output = ''
  try {
    output = String(execFileSync('git', ['status', '--porcelain', '--untracked-files=all'], {
      cwd,
      encoding: 'utf-8',
      timeout: 2000,
      stdio: ['ignore', 'pipe', 'ignore'],
    }))
  } catch {
    return null
  }
  const code: string[] = []
  const memory: string[] = []
  for (const line of output.split('\n')) {
    if (line.length < 4) continue
    let path = line.slice(3).trim()
    if (path.startsWith('"') && path.endsWith('"')) path = path.slice(1, -1)
    const arrow = path.indexOf(' -> ')
    if (arrow !== -1) path = path.slice(arrow + 4)
    path = path.replace(/\\/g, '/')
    if (path === MEMORY_FILE || path.startsWith(`${DOCS_DIR}/`)) {
      memory.push(path)
    } else if (path !== FILE_NAME && isCodePath(path)) {
      code.push(path)
    }
  }
  return { code, memory }
}

function newGitChanges(baseline: GitChanges | null | undefined, current: GitChanges | null): GitChanges | null {
  if (current === null) return null
  if (baseline === null || baseline === undefined) return current
  return {
    code: current.code.filter(path => !baseline.code.includes(path)),
    memory: current.memory.filter(path => !baseline.memory.includes(path)),
  }
}

function formatPathList(paths: string[]): string {
  const shown = paths.slice(0, 8).join(', ')
  return paths.length > 8 ? `${shown} (+${paths.length - 8} more)` : shown
}

/** One lossless-JSON tool answer. */
interface ToolAnswer {
  ok: boolean
  path: string
  message: string
  content: string
}

const answer = (path: string, message: string, content: string, ok = true): ToolAnswer =>
  ({ ok, path, message, content })

const ANSWER_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    ok: { type: 'boolean' },
    path: { type: 'string' },
    message: { type: 'string' },
    content: { type: 'string' },
  },
} as const

const NO_ARGS = { type: 'object', additionalProperties: false, properties: {} }

const CONTENT_ARGS = {
  type: 'object',
  additionalProperties: false,
  properties: {
    content: { type: 'string' },
  },
  required: ['content'],
}

const FACTS_ARGS = {
  type: 'object',
  additionalProperties: false,
  properties: {
    facts: { type: 'string' },
  },
  required: ['facts'],
}

const MEMORY_ARGS = {
  type: 'object',
  additionalProperties: false,
  properties: {
    content: { type: 'string' },
    module: { type: 'string' },
    doc: { type: 'string' },
    summary: { type: 'string' },
  },
}

function answerRender(_args: unknown, value: unknown): Array<{ type: 'text'; text: string }> {
  const v = value as ToolAnswer
  return [{ type: 'text', text: v.content.length > 0 ? v.content : v.message }]
}

const STATUS_TOOL: ToolDefinition = {
  name: 'project_status',
  description:
    'Read the workspace-shared project progress document PROGRESS.md (Project Facts + Progress Timeline). '
    + 'Every new session should call this first to learn the project state: whether it has been released, the GitHub repository URL, DSH plugin community rules, recent progress, and next steps.',
  parameters: NO_ARGS,
  output: { schema: ANSWER_SCHEMA, render: answerRender },
  async execute(_args, exec) {
    const cwd = cwdOf(exec)
    const path = docPath(cwd)
    if (path === null) return answer('', 'This session has no working directory, so the shared document cannot be located.', '', false)
    if (!existsSync(path)) {
      return answer(path, 'The shared document does not exist yet (it is created automatically after the first session ends; you can also create it with project_facts or project_update).', '', false)
    }
    const parts = splitDoc(readFileSync(path, 'utf-8'))
    const content = tailChars(`# Project Progress (Shared)\n\n${FACTS_HEADER}\n${parts.facts}\n\n${TIMELINE_HEADER}\n${parts.timeline}`, MAX_STATUS_CHARS)
    return answer(path, 'Read the shared project progress document.', content)
  },
}

const UPDATE_TOOL: ToolDefinition = {
  name: 'project_update',
  description:
    'Append a progress entry to the workspace-shared progress document PROGRESS.md (Progress Timeline). '
    + 'Use it after completing a milestone to record what was done, the outcome, and the next step. Each call appends one entry and never overwrites existing content.',
  parameters: CONTENT_ARGS,
  output: { schema: ANSWER_SCHEMA, render: answerRender },
  async execute(args, exec) {
    const cwd = cwdOf(exec)
    const path = ensureDoc(cwd)
    if (path === null) return answer('', 'This session has no working directory, so the shared document cannot be written.', '', false)
    const text = String((args as { content: string }).content).trim()
    const heading = `## ${stamp()} · Session ${exec.agent?.session?.id.slice(0, 8) ?? 'unknown'} · Manual update`
    appendFileSync(path, `\n${heading}\n\n${text}\n`, 'utf-8')
    return answer(path, 'Progress appended.', `Appended:\n${heading}\n\n${text}`)
  },
}

const FACTS_TOOL: ToolDefinition = {
  name: 'project_facts',
  description:
    'Update the Project Facts section of the workspace-shared progress document (the whole section is replaced). '
    + 'The facts should record key project facts, for example: release status (published to GitHub / listed in the DSH plugin community), GitHub repository URL, '
    + 'DSH plugin community rules (dsh.bundle manifest, cordis.patch.yml, dsh-plugin topic, committed lib artifacts, zero runtime dependencies), '
    + 'release and sync workflow (change → sync checkout and release repo → build → push → restart), install commands, etc.',
  parameters: FACTS_ARGS,
  output: { schema: ANSWER_SCHEMA, render: answerRender },
  async execute(args, exec) {
    const cwd = cwdOf(exec)
    const path = ensureDoc(cwd)
    if (path === null) return answer('', 'This session has no working directory, so the shared document cannot be written.', '', false)
    const current = splitDoc(readFileSync(path, 'utf-8'))
    const text = String((args as { facts: string }).facts).trim()
    writeFileSync(path, renderDoc({ facts: text, timeline: current.timeline }), 'utf-8')
    return answer(path, 'Project facts updated.', `Project facts updated:\n\n${text}`)
  },
}

const MEMORY_TOOL: ToolDefinition = {
  name: 'project_memory',
  description:
    'Read or update MEMORY.md, the workspace project map. '
    + 'Call with no arguments to read the map. Provide `content` to replace the whole map, or `module` + `doc` (+ optional `summary`) to append a module link to the "Modules" section. '
    + 'The docs/ file itself is created or updated with the standard `write` / `edit` tools.',
  parameters: MEMORY_ARGS,
  output: { schema: ANSWER_SCHEMA, render: answerRender },
  async execute(args, exec) {
    const cwd = cwdOf(exec)
    const path = memoryPath(cwd)
    if (path === null) return answer('', 'This session has no working directory, so MEMORY.md cannot be accessed.', '', false)
    const input = args as { content?: string; module?: string; doc?: string; summary?: string }

    if (input.content !== undefined) {
      if (input.content.trim().length === 0) return answer(path, '`content` must not be empty.', '', false)
      mkdirSync(dirname(path), { recursive: true })
      writeFileSync(path, input.content, 'utf-8')
      return answer(path, 'MEMORY.md updated.', `MEMORY.md updated:\n\n${input.content}`)
    }

    if (input.module !== undefined || input.doc !== undefined) {
      if (input.module === undefined || input.module.trim().length === 0 || input.doc === undefined) {
        return answer(path, 'Both `module` and `doc` are required to add a module entry.', '', false)
      }
      const docsPath = normalizeDocsPath(input.doc)
      if (docsPath === null) return answer(path, 'The `doc` path must be a relative Markdown file under docs/.', '', false)
      const existing = existsSync(path) ? readFileSync(path, 'utf-8') : MEMORY_TEMPLATE
      const summary = input.summary !== undefined && input.summary.trim().length > 0 ? ` — ${input.summary.trim()}` : ''
      const entry = `- [${input.module.trim()}](${docsPath})${summary}`
      const next = appendModuleEntry(existing, entry)
      mkdirSync(dirname(path), { recursive: true })
      writeFileSync(path, next, 'utf-8')
      return answer(path, 'Module link added to MEMORY.md.', `Added:\n${entry}\n\n${next}`)
    }

    if (!existsSync(path)) {
      return answer(path, 'MEMORY.md does not exist yet. Create it with project_memory (content) or add a module entry.', '', false)
    }
    return answer(path, 'Read MEMORY.md.', readFileSync(path, 'utf-8'))
  },
}

export function apply(ctx: Context): void {
  /** Per-agent starting point so pre-existing dirty files are not reported as session changes. */
  const gitBaselines = new WeakMap<Agent, GitChanges | null>()

  // ── Tool: read the shared progress document ──────────────────────────────
  ctx.tools.register(STATUS_TOOL)

  // ── Tool: manually append a progress entry ───────────────────────────────
  ctx.tools.register(UPDATE_TOOL)

  // ── Tool: maintain the project facts (release status, community rules, etc.) ──
  ctx.tools.register(FACTS_TOOL)

  // ── Tool: read or update the project memory map ──────────────────────────
  ctx.tools.register(MEMORY_TOOL)

  // ── Prompt injection: every new session starts aware of progress and memory ──
  ctx.systemPrompt.section({
    name: 'project-progress',
    order: 60,
    text: (context) => {
      const agent = (context as { agent?: Agent }).agent
      if (agent === undefined) return ''
      const cwd = agent.session?.header?.cwd
      const parts = readParts(cwd)
      const lines: string[] = []

      if (parts === null) {
        lines.push(
          '## Project Progress (shared document PROGRESS.md)',
          '',
          'The shared progress document does not exist yet. It is created automatically after the first session ends, or you can create it with project_update / project_facts.',
          '',
        )
      } else {
        const timeline = tailChars(parts.timeline, MAX_PROMPT_CHARS)
        lines.push(
          '## Project Progress (shared document PROGRESS.md)',
          '',
          'The following is the workspace-shared progress document; read it first to understand the project state and release status.',
          '',
          `${FACTS_HEADER}`,
          parts.facts,
          '',
          `${TIMELINE_HEADER} (recent part)`,
          timeline,
          '',
          'Convention: after completing a milestone, append progress with project_update; when facts such as release status, repository URL, or community rules change, update the facts section with project_facts.',
          '',
        )
      }

      lines.push(
        '## Project Memory (MEMORY.md + docs/)',
        '',
        'At session start, read `MEMORY.md` to understand the project structure. Do not read the whole codebase without need; use the map and the matching file in `docs/`.',
        '',
        MEMORY_UPDATE_RULE,
        '',
        'Use `project_memory` to read or update `MEMORY.md`, and the standard `read`, `write`, and `edit` tools to create or update files under `docs/`.',
        '',
        MEMORY_RULE,
        '',
        'Before finishing a task, verify your changes with `git status`; if code files changed, update `MEMORY.md` and `docs/` accordingly.',
      )

      const baseline = gitBaselines.get(agent)
      const changed = baseline === undefined ? null : newGitChanges(baseline, gitChanges(cwd))
      if (changed !== null && changed.code.length > 0 && changed.memory.length === 0) {
        lines.push(
          '',
          '**Reminder: code files changed in this session but neither `MEMORY.md` nor `docs/` was updated. Update them before finishing the task.**',
          `Changed code: ${formatPathList(changed.code)}`,
        )
      }

      return lines.join('\n')
    },
  })

  // ── Capture the session's starting git state for the end-of-session audit ──
  ctx.on('agent/created', (payload: { agent: Agent }) => {
    gitBaselines.set(payload.agent, gitChanges(payload.agent.session?.header?.cwd))
  })

  // ── Append progress automatically when a session ends (top-level sessions only) ──
  ctx.on('agent/disposed', (payload: { agent: Agent }) => {
    const agent = payload.agent
    const session: Session = agent.session
    const header = session.header
    if (header.origin === 'subagent') return
    const path = ensureDoc(header.cwd)
    if (path === null) return

    let title = ''
    const sessionTitle = ctx.get('sessionTitle') as { get(session: Session): { title?: string } | undefined } | undefined
    try {
      title = sessionTitle?.get(session)?.title ?? ''
    } catch (error) {
      title = ''
    }

    let turns = 0
    let steps = 0
    let input = 0
    let read = 0
    let output = 0
    const sessionProjections = ctx.get('sessionProjections') as {
      snapshot(session: Session): Record<string, unknown>
    } | undefined
    try {
      const snap = sessionProjections?.snapshot(session)
      const stats = snap?.sessionStats as { turns?: number; steps?: number } | undefined
      const usage = snap?.tokenUsage as { uncachedInputTokens?: number; cacheReadTokens?: number; outputTokens?: number } | undefined
      turns = Number(stats?.turns) || 0
      steps = Number(stats?.steps) || 0
      input = Number(usage?.uncachedInputTokens) || 0
      read = Number(usage?.cacheReadTokens) || 0
      output = Number(usage?.outputTokens) || 0
    } catch (error) {
      /* projections unavailable: keep zeros */
    }

    const billed = input + read
    const hitPct = billed > 0 ? Math.round(read / billed * 100) : 0
    const heading = `## ${stamp()} · Session ${session.id.slice(0, 8)}${title.length > 0 ? ` · ${title}` : ''}`
    const line = `- Turns ${turns} · Steps ${steps} · Input ${fmtTokens(input)} (cache hit ${hitPct}%) · Output ${fmtTokens(output)}`
    const entry = [heading, line]

    const changed = newGitChanges(gitBaselines.get(agent), gitChanges(header.cwd))
    if (changed !== null && changed.code.length > 0) {
      entry.push(`- Code files changed: ${formatPathList(changed.code)}`)
      const memory = changed.memory.length > 0
        ? `updated: ${formatPathList(changed.memory)}`
        : 'not updated'
      entry.push(`- Memory check: were MEMORY.md and docs/ updated according to the new changes? (${memory})`)
      if (changed.memory.length === 0) {
        ctx.logger.warn(`project-progress: code files changed but MEMORY.md/docs were not updated: ${formatPathList(changed.code)}`)
      }
    }

    appendFileSync(path, `\n${entry.join('\n')}\n`, 'utf-8')
  })
}
