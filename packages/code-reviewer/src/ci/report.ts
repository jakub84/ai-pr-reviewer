// ci/report.ts — turns the review CLI's captured output into a PR comment and a CI outcome.
// Pure: no env, no files; the CI entry (ci-report.ts) does the I/O.
import { REVIEW_SCHEMA, type Review } from '../schemas/review.ts'

export type CiOutcome = 'passed' | 'failed' | 'error'

export type CiReportInput = {
  stdout: string
  stderr: string
  exitCode: number
  headSha: string
  runUrl?: string
}

export type CiReport = { outcome: CiOutcome; comment: string }

// Hidden first line of every comment, so a later change can find the bot's own comments.
export const COMMENT_MARKER = '<!-- ai-cr -->'
// Caps the error reason taken from stderr; the full stack trace stays in the workflow logs.
export const MAX_ERROR_REASON_CHARS = 500

// Typed against the score keys of Review, so a schema change breaks the build, not the comment.
type ScoreKey = Exclude<keyof Review, 'verdict' | 'summary'>

// In schema order; the table rows follow this order.
const SCORE_LABELS: Record<ScoreKey, string> = {
  implementationCorrectness: 'Implementation correctness',
  idiomaticity: 'Idiomaticity',
  complexity: 'Complexity',
  testRiskCoverage: 'Test / risk coverage',
  documentation: 'Documentation',
  securitySafety: 'Security and safety',
}

const HEADERS: Record<CiOutcome, string> = {
  passed: '✅ AI code review: passed',
  failed: '❌ AI code review: failed',
  error: '⚠️ AI code review: review skipped',
}

// Matches Node's uncaught error line: `Error: …`, `TypeError: …`, `AI_APICallError: …`.
const ERROR_LINE = /^(?:[A-Za-z_$][\w$]*)?Error: /

type CostLine = { model: string; inputTokens?: unknown; outputTokens?: unknown; costUsd?: unknown }

export function buildCiReport(input: CiReportInput): CiReport {
  const result = parseReview(input)
  const footer = buildFooter(input.stderr, input.runUrl)

  if ('reason' in result) {
    return {
      outcome: 'error',
      comment: joinSections([
        buildHeader('error', input.headSha),
        'The review could not be completed, so this PR has no verdict.',
        `Reason:\n\n${fenced(result.reason)}`,
        footer,
      ]),
    }
  }

  const { review } = result
  const outcome: CiOutcome = review.verdict === 'pass' ? 'passed' : 'failed'
  return {
    outcome,
    comment: joinSections([
      buildHeader(outcome, input.headSha),
      buildScoreTable(review),
      review.summary,
      footer,
    ]),
  }
}

function parseReview({
  stdout,
  stderr,
  exitCode,
}: CiReportInput): { review: Review } | { reason: string } {
  if (exitCode !== 0) {
    return {
      reason: findErrorReason(stderr) ?? 'No error message found; see the workflow run logs.',
    }
  }
  const trimmed = stdout.trim()
  if (!trimmed) {
    return { reason: 'The review produced no output; see the workflow run logs.' }
  }
  let json: unknown
  try {
    json = JSON.parse(trimmed)
  } catch {
    return { reason: 'The review output is not valid JSON; see the workflow run logs.' }
  }
  const parsed = REVIEW_SCHEMA.safeParse(json)
  if (!parsed.success) {
    const fields = [
      ...new Set(parsed.error.issues.map((issue) => issue.path.join('.') || '(root)')),
    ]
    return { reason: `The review output does not match the schema (fields: ${fields.join(', ')}).` }
  }
  return { review: parsed.data }
}

// The first `…Error: message` line of stderr, capped; never the source excerpt or the stack.
function findErrorReason(stderr: string): string | undefined {
  const line = stderr.split(/\r?\n/).find((l) => ERROR_LINE.test(l))
  return line?.slice(0, MAX_ERROR_REASON_CHARS)
}

// The last stderr line that parses as a JSON object with a string `model` (the CLI's cost log).
function findCostLine(stderr: string): CostLine | undefined {
  const lines = stderr.split(/\r?\n/).reverse()
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed.startsWith('{')) continue
    try {
      const value: unknown = JSON.parse(trimmed)
      if (
        typeof value === 'object' &&
        value !== null &&
        typeof (value as { model?: unknown }).model === 'string'
      ) {
        return value as CostLine
      }
    } catch {
      // Not the cost line; keep looking.
    }
  }
  return undefined
}

function buildHeader(outcome: CiOutcome, headSha: string): string {
  return `${COMMENT_MARKER}\n## ${HEADERS[outcome]} · ${inlineCode(headSha.slice(0, 7))}`
}

function buildScoreTable(review: Review): string {
  const keys = Object.keys(SCORE_LABELS) as ScoreKey[]
  const rows = keys.map((key) => `| ${SCORE_LABELS[key]} | ${review[key]}/10 |`)
  return ['| Criterion | Score |', '| --- | --- |', ...rows].join('\n')
}

function buildFooter(stderr: string, runUrl?: string): string {
  const cost = findCostLine(stderr)
  const parts = [
    `Model: ${cost ? inlineCode(cost.model) : 'n/a'}`,
    `Tokens: ${formatNumber(cost?.inputTokens)} in / ${formatNumber(cost?.outputTokens)} out`,
    `Cost: ${formatCost(cost?.costUsd)}`,
  ]
  if (runUrl) {
    parts.push(`[Workflow run](${runUrl})`)
  }
  return `---\n${parts.join(' · ')}`
}

function formatNumber(value: unknown): string {
  return typeof value === 'number' && Number.isFinite(value) ? String(value) : 'n/a'
}

function formatCost(value: unknown): string {
  return typeof value === 'number' && Number.isFinite(value) ? `$${value.toFixed(4)}` : 'n/a'
}

// Inline code span for short single-line values (SHA, model id); backticks are dropped.
function inlineCode(text: string): string {
  return `\`${text.replace(/`/g, '')}\``
}

// Fenced block for untrusted text (stderr), so it cannot inject Markdown or HTML into the comment.
// The fence is longer than any backtick run in the text, so the text cannot close it.
function fenced(text: string): string {
  const longestRun = Math.max(0, ...(text.match(/`+/g) ?? []).map((run) => run.length))
  const fence = '`'.repeat(Math.max(3, longestRun + 1))
  return `${fence}text\n${text}\n${fence}`
}

function joinSections(sections: string[]): string {
  return `${sections.join('\n\n')}\n`
}
