// ci/report.ts — turns the review CLI's captured output into a PR comment and a CI outcome.
// Pure: no env, no files; the CI entry (ci-report.ts) does the I/O.
import { z } from 'zod'
import { REVIEW_SCHEMA, type Review } from '../schemas/review.ts'

export type CiOutcome = 'passed' | 'failed' | 'error'

export type CiReportInput = {
  stdout: string
  stderr: string
  exitCode: number
  headSha: string
  runUrl?: string
  // Bodies of the bot's earlier review comments on this PR, oldest first.
  previousComments?: readonly string[]
}

export type CiReport = { outcome: CiOutcome; comment: string }

// Hidden first line of every comment, so a later change can find the bot's own comments.
export const COMMENT_MARKER = '<!-- ai-cr -->'
// Hidden second line of a verdict comment: the scores, so the next review can show what changed.
// Its JSON holds only numbers, a short hex SHA and the verdict enum, so it cannot close the comment.
const DATA_PREFIX = '<!-- ai-cr-data '
const DATA_LINE = /^<!-- ai-cr-data (\{.*\}) -->$/m
// Caps the error reason taken from stderr; the full stack trace stays in the workflow logs.
export const MAX_ERROR_REASON_CHARS = 500

// Derived from the review schema, so a schema change breaks the build, not the comment.
// The rationale stays out, so the hidden data line keeps holding numbers only.
const SCORES_SCHEMA = REVIEW_SCHEMA.omit({ verdict: true, summary: true, rationale: true })
type Scores = z.infer<typeof SCORES_SCHEMA>
type ScoreKey = keyof Scores

const REVIEW_DATA_SCHEMA = z.object({
  review: z.number(),
  sha: z.string(),
  verdict: REVIEW_SCHEMA.shape.verdict,
  scores: SCORES_SCHEMA,
})
export type ReviewData = z.infer<typeof REVIEW_DATA_SCHEMA>

// In schema order; the table rows follow this order.
const SCORE_LABELS: Record<ScoreKey, string> = {
  implementationCorrectness: 'Implementation correctness',
  idiomaticity: 'Idiomaticity',
  complexity: 'Complexity',
  testRiskCoverage: 'Test / risk coverage',
  documentation: 'Documentation',
  securitySafety: 'Security and safety',
}
const SCORE_KEYS = Object.keys(SCORE_LABELS) as ScoreKey[]

const HEADERS: Record<CiOutcome, string> = {
  passed: '✅ AI code review #{n}: passed',
  failed: '❌ AI code review #{n}: failed',
  error: '⚠️ AI code review #{n}: review skipped',
}

const VERDICT_LABELS: Record<Review['verdict'], string> = { pass: '✅ pass', fail: '❌ fail' }

const RETRY_HINT = 'Ready for another review? Push your changes, then add the `ai-cr:review` label.'
const ERROR_RETRY_HINT = 'Fix the cause, then add the `ai-cr:review` label to retry.'

// Matches Node's uncaught error line: `Error: …`, `TypeError: …`, `AI_APICallError: …`.
const ERROR_LINE = /^(?:[A-Za-z_$][\w$]*)?Error: /

type CostLine = { model: string; inputTokens?: unknown; outputTokens?: unknown; costUsd?: unknown }

export function buildCiReport(input: CiReportInput): CiReport {
  const result = parseReview(input)
  const footer = buildFooter(input.stderr, input.runUrl)
  const previousComments = input.previousComments ?? []
  // Every earlier bot comment counts, "review skipped" ones included.
  const reviewNumber = previousComments.filter((body) => body.startsWith(COMMENT_MARKER)).length + 1

  if ('reason' in result) {
    return {
      outcome: 'error',
      comment: joinSections([
        buildHeader('error', reviewNumber, input.headSha),
        'The review could not be completed, so this PR has no verdict.',
        `Reason:\n\n${fenced(result.reason)}`,
        footer,
        `<sub>${ERROR_RETRY_HINT}</sub>`,
      ]),
    }
  }

  const { review } = result
  const outcome: CiOutcome = review.verdict === 'pass' ? 'passed' : 'failed'
  const current: ReviewData = {
    review: reviewNumber,
    sha: input.headSha.slice(0, 7),
    verdict: review.verdict,
    scores: SCORES_SCHEMA.parse(review),
  }
  const previous = findPreviousReview(previousComments)
  return {
    outcome,
    comment: joinSections([
      `${buildHeader(outcome, reviewNumber, input.headSha)}\n${DATA_PREFIX}${JSON.stringify(current)} -->`,
      previous ? buildComparison(previous, current) : buildScoreTable(current.scores),
      buildRationale(current.scores, review.rationale),
      `### Summary\n\n${review.summary}`,
      footer,
      `<sub>${RETRY_HINT}</sub>`,
    ]),
  }
}

// The scores of the latest earlier review that has them; a "review skipped" comment has none.
export function findPreviousReview(comments: readonly string[]): ReviewData | undefined {
  for (const body of [...comments].reverse()) {
    const json = DATA_LINE.exec(body)?.[1]
    if (!json) continue
    try {
      const parsed = REVIEW_DATA_SCHEMA.safeParse(JSON.parse(json))
      if (parsed.success) return parsed.data
    } catch {
      // Malformed data line; try an older comment.
    }
  }
  return undefined
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

function buildHeader(outcome: CiOutcome, reviewNumber: number, headSha: string): string {
  const title = HEADERS[outcome].replace('{n}', String(reviewNumber))
  return `${COMMENT_MARKER}\n## ${title} · ${inlineCode(headSha.slice(0, 7))}`
}

function buildScoreTable(scores: Scores): string {
  const rows = SCORE_KEYS.map((key) => `| ${SCORE_LABELS[key]} | ${scores[key]}/10 |`)
  return ['| Criterion | Score |', '| --- | --- |', ...rows].join('\n')
}

// One bullet per criterion, in table order; line breaks are folded so each item stays one list entry.
function buildRationale(scores: Scores, rationale: Review['rationale']): string {
  const items = SCORE_KEYS.map(
    (key) =>
      `- **${SCORE_LABELS[key]} (${scores[key]}/10):** ${rationale[key].trim().replace(/\s*\n\s*/g, ' ')}`,
  )
  return ['### Rationale', ...items].join('\n')
}

// Previous vs current scores, the verdict change and the criteria that moved.
function buildComparison(previous: ReviewData, current: ReviewData): string {
  const delta = (key: ScoreKey) => current.scores[key] - previous.scores[key]

  const verdict =
    previous.verdict === current.verdict
      ? `Verdict unchanged: ${VERDICT_LABELS[current.verdict]}.`
      : `Verdict changed: ${VERDICT_LABELS[previous.verdict]} → ${VERDICT_LABELS[current.verdict]}.`
  const intro = `Compared with review #${previous.review} on ${inlineCode(previous.sha)}. ${verdict}`

  const rows = SCORE_KEYS.map(
    (key) =>
      `| ${SCORE_LABELS[key]} | ${previous.scores[key]}/10 | ${current.scores[key]}/10 | ${formatDelta(delta(key))} |`,
  )
  const table = [
    '| Criterion | Previous | Now | Change |',
    '| --- | --- | --- | --- |',
    ...rows,
  ].join('\n')

  const list = (keys: ScoreKey[]) =>
    keys.map((key) => `${SCORE_LABELS[key]} (${formatSigned(delta(key))})`).join(', ')
  const improved = SCORE_KEYS.filter((key) => delta(key) > 0)
  const declined = SCORE_KEYS.filter((key) => delta(key) < 0)
  const changes: string[] = []
  if (improved.length > 0) changes.push(`**Improved:** ${list(improved)}`)
  if (declined.length > 0) changes.push(`**Declined:** ${list(declined)}`)
  if (changes.length === 0) changes.push('No score changed.')

  // Two trailing spaces force a Markdown line break between the two lists.
  return [intro, table, changes.join('  \n')].join('\n\n')
}

function formatDelta(delta: number): string {
  if (delta > 0) return `🟢 ${formatSigned(delta)}`
  if (delta < 0) return `🔴 ${formatSigned(delta)}`
  return '➖ 0'
}

function formatSigned(delta: number): string {
  return delta > 0 ? `+${delta}` : `−${Math.abs(delta)}`
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
  return `---\n<sub>${parts.join(' · ')}</sub>`
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
