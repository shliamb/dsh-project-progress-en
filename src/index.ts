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
const FACTS_HEADER = '## 项目档案'
const TIMELINE_HEADER = '## 进展时间线'
const MAX_STATUS_CHARS = 8000
const MAX_PROMPT_CHARS = 5000

const TEMPLATE = `# 项目进展(共享)

${FACTS_HEADER}

<!-- 项目重要事实:发布状态、仓库地址、DSH 插件社区规则、发布/同步流程等,用 project_facts 工具维护 -->

${TIMELINE_HEADER}

`

/** One tool execution with the fields this plugin reads. */
interface ExecLike {
  agent?: Agent
}

interface DocParts {
  facts: string
  timeline: string
}

function docPath(cwd: string | undefined): string | null {
  if (cwd === undefined || cwd.length === 0) return null
  return join(cwd, FILE_NAME)
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
  return `# 项目进展(共享)\n\n${FACTS_HEADER}\n\n${parts.facts.trim()}\n\n${TIMELINE_HEADER}\n\n${parts.timeline.trim()}\n`
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

function answerRender(_args: unknown, value: unknown): Array<{ type: 'text'; text: string }> {
  const v = value as ToolAnswer
  return [{ type: 'text', text: v.content.length > 0 ? v.content : v.message }]
}

const STATUS_TOOL: ToolDefinition = {
  name: 'project_status',
  description:
    '读取当前工作区的共享项目进展文档 PROGRESS.md(项目档案 + 进展时间线)。'
    + '每个新会话应先调用它了解项目状态:是否已发布、GitHub 仓库地址、DSH 插件社区规则、最近的进展与下一步。',
  parameters: NO_ARGS,
  output: { schema: ANSWER_SCHEMA, render: answerRender },
  async execute(_args, exec) {
    const cwd = cwdOf(exec)
    const path = docPath(cwd)
    if (path === null) return answer('', '当前会话没有工作目录,无法定位共享文档。', '', false)
    if (!existsSync(path)) {
      return answer(path, '共享文档尚不存在(首次会话结束后会自动创建;也可以用 project_facts 或 project_update 创建)。', '', false)
    }
    const parts = splitDoc(readFileSync(path, 'utf-8'))
    const content = tailChars(`# 项目进展(共享)\n\n${FACTS_HEADER}\n${parts.facts}\n\n${TIMELINE_HEADER}\n${parts.timeline}`, MAX_STATUS_CHARS)
    return answer(path, '已读取共享项目进展文档。', content)
  },
}

const UPDATE_TOOL: ToolDefinition = {
  name: 'project_update',
  description:
    '向当前工作区的共享进展文档 PROGRESS.md 追加一条进展(时间线)。'
    + '完成阶段性工作后用它记录:做了什么、结果如何、下一步计划。每次调用追加一条,不会覆盖已有内容。',
  parameters: CONTENT_ARGS,
  output: { schema: ANSWER_SCHEMA, render: answerRender },
  async execute(args, exec) {
    const cwd = cwdOf(exec)
    const path = ensureDoc(cwd)
    if (path === null) return answer('', '当前会话没有工作目录,无法写入共享文档。', '', false)
    const text = String((args as { content: string }).content).trim()
    const heading = `## ${stamp()} · 会话 ${exec.agent?.session?.id.slice(0, 8) ?? 'unknown'} · 手动更新`
    appendFileSync(path, `\n${heading}\n\n${text}\n`, 'utf-8')
    return answer(path, '已追加进展。', `已追加:\n${heading}\n\n${text}`)
  },
}

const FACTS_TOOL: ToolDefinition = {
  name: 'project_facts',
  description:
    '更新当前工作区共享进展文档的「项目档案」区(整体替换该区内容)。'
    + '档案应记录项目重要事实,例如:发布状态(是否已发布 GitHub / 是否收录进 DSH 插件社区)、GitHub 仓库地址、'
    + 'DSH 插件社区规则(dsh.bundle manifest、cordis.patch.yml、dsh-plugin topic、lib 产物入库、零运行时依赖)、'
    + '发布与同步流程(改动 → 同步 checkout 与发布仓库 → 构建 → 推送 → 重启)、安装命令等。',
  parameters: FACTS_ARGS,
  output: { schema: ANSWER_SCHEMA, render: answerRender },
  async execute(args, exec) {
    const cwd = cwdOf(exec)
    const path = ensureDoc(cwd)
    if (path === null) return answer('', '当前会话没有工作目录,无法写入共享文档。', '', false)
    const current = splitDoc(readFileSync(path, 'utf-8'))
    const text = String((args as { facts: string }).facts).trim()
    writeFileSync(path, renderDoc({ facts: text, timeline: current.timeline }), 'utf-8')
    return answer(path, '已更新项目档案。', `项目档案已更新:\n\n${text}`)
  },
}

export function apply(ctx: Context): void {
  // ── 工具:读取共享进度文档 ────────────────────────────────────────────────
  ctx.tools.register(STATUS_TOOL)

  // ── 工具:手动追加进展 ────────────────────────────────────────────────────
  ctx.tools.register(UPDATE_TOOL)

  // ── 工具:维护项目档案(发布状态、社区规则等) ─────────────────────────────
  ctx.tools.register(FACTS_TOOL)

  // ── 提示词注入:每个新会话开局即知项目进展 ────────────────────────────────
  ctx.systemPrompt.section({
    name: 'project-progress',
    order: 60,
    text: (context) => {
      const agent = (context as { agent?: Agent }).agent
      if (agent === undefined) return ''
      const parts = readParts(agent.session?.header?.cwd)
      if (parts === null) return ''
      const timeline = tailChars(parts.timeline, MAX_PROMPT_CHARS)
      return [
        '## 项目进展(共享文档 PROGRESS.md)',
        '',
        '以下是当前工作区的共享进展文档,请先了解项目状态与发布情况。',
        '',
        `${FACTS_HEADER}`,
        parts.facts,
        '',
        `${TIMELINE_HEADER}(最近部分)`,
        timeline,
        '',
        '约定:完成阶段性工作后用 project_update 追加进展;发布状态、仓库地址、社区规则等事实变化时用 project_facts 更新档案。',
      ].join('\n')
    },
  })

  // ── 会话结束自动追加进展(仅顶层会话) ─────────────────────────────────────
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
    const heading = `## ${stamp()} · 会话 ${session.id.slice(0, 8)}${title.length > 0 ? ` · ${title}` : ''}`
    const line = `- 轮次 ${turns} · 步骤 ${steps} · 输入 ${fmtTokens(input)}(命中 ${hitPct}%)· 输出 ${fmtTokens(output)}`
    appendFileSync(path, `\n${heading}\n${line}\n`, 'utf-8')
  })
}
