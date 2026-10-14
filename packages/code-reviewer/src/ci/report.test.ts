// ci/report.test.ts — CI report builder: outcome mapping, comment layout and error reasons.
import { describe, expect, it } from 'vitest'
import type { Review } from '../schemas/review.ts'
import { buildCiReport, COMMENT_MARKER, MAX_ERROR_REASON_CHARS } from './report.ts'

const headSha = '0f80079abcdef1234567890'
const runUrl = 'https://github.com/acme/repo/actions/runs/42'

const review: Review = {
  implementationCorrectness: 8,
  idiomaticity: 7,
  complexity: 9,
  testRiskCoverage: 6,
  documentation: 5,
  securitySafety: 10,
  verdict: 'pass',
  summary: 'Solid change. **Add** a test for the empty case.',
}

const costLine = JSON.stringify({
  model: 'anthropic/claude-sonnet-5.5',
  inputTokens: 12345,
  outputTokens: 678,
  costUsd: 0.09456,
})

// What Node prints for an uncaught error: source excerpt, blank line, error line, stack.
const nodeCrash = (errorLine: string) =>
  [
    'file:///repo/packages/code-reviewer/src/agent/reviewer.ts:57',
    '    throw new Error(`The diff changes ${changedLines} lines, above the ${MAX_DIFF_LINES} limit`)',
    '          ^',
    '',
    errorLine,
    '    at reviewDiff (file:///repo/packages/code-reviewer/src/agent/reviewer.ts:57:11)',
    '    at file:///repo/packages/code-reviewer/src/cli.ts:21:22',
    '',
    'Node.js v22.20.0',
  ].join('\n')

const ok = (stdout: string, stderr = costLine) =>
  buildCiReport({ stdout, stderr, exitCode: 0, headSha, runUrl })

describe('buildCiReport', () => {
  it('maps a valid pass to passed with all six labels and scores', () => {
    const { outcome, comment } = ok(JSON.stringify(review, null, 2))
    expect(outcome).toBe('passed')
    expect(
      comment.startsWith(`${COMMENT_MARKER}\n## ✅ AI code review: passed · \`0f80079\``),
    ).toBe(true)
    expect(comment).toContain(
      [
        '| Criterion | Score |',
        '| --- | --- |',
        '| Implementation correctness | 8/10 |',
        '| Idiomaticity | 7/10 |',
        '| Complexity | 9/10 |',
        '| Test / risk coverage | 6/10 |',
        '| Documentation | 5/10 |',
        '| Security and safety | 10/10 |',
      ].join('\n'),
    )
    expect(comment).toContain(review.summary)
  })

  it('maps a valid fail to failed', () => {
    const { outcome, comment } = ok(JSON.stringify({ ...review, verdict: 'fail' }))
    expect(outcome).toBe('failed')
    expect(comment).toContain('## ❌ AI code review: failed')
  })

  it('formats the footer from the cost line, with the run link', () => {
    const { comment } = ok(JSON.stringify(review), `some warning\n${costLine}\n`)
    expect(comment).toContain(
      `---\nModel: \`anthropic/claude-sonnet-5.5\` · Tokens: 12345 in / 678 out · Cost: $0.0946 · [Workflow run](${runUrl})`,
    )
  })

  it('shows n/a in the footer when stderr has no cost line', () => {
    const { comment } = buildCiReport({
      stdout: JSON.stringify(review),
      stderr: 'not json\n{"no":"model"}',
      exitCode: 0,
      headSha,
    })
    expect(comment).toContain('---\nModel: n/a · Tokens: n/a in / n/a out · Cost: n/a')
    expect(comment).not.toContain('Workflow run')
  })

  it('shows n/a for a missing cost when the cost line has no costUsd', () => {
    const stderr = JSON.stringify({ model: 'x/y', inputTokens: 10, outputTokens: 2 })
    expect(ok(JSON.stringify(review), stderr).comment).toContain(
      'Tokens: 10 in / 2 out · Cost: n/a',
    )
  })

  it('maps a non-zero exit to error with the stderr error line', () => {
    const errorLine = 'Error: The diff changes 3508 lines, above the 3000 limit'
    const { outcome, comment } = buildCiReport({
      stdout: '',
      stderr: nodeCrash(errorLine),
      exitCode: 1,
      headSha,
      runUrl,
    })
    expect(outcome).toBe('error')
    expect(comment).toContain('## ⚠️ AI code review: review skipped · `0f80079`')
    expect(comment).toContain(`\`\`\`text\n${errorLine}\n\`\`\``)
    expect(comment).toContain(`[Workflow run](${runUrl})`)
  })

  it('never includes the source excerpt or stack lines in the error comment', () => {
    const { comment } = buildCiReport({
      stdout: '',
      stderr: nodeCrash('Error: boom'),
      exitCode: 1,
      headSha,
    })
    expect(comment).not.toContain('    at ')
    expect(comment).not.toContain('throw new Error')
    expect(comment).not.toContain('Node.js v22')
  })

  it('picks up a named error such as AI_APICallError', () => {
    const errorLine = 'AI_APICallError: Insufficient credits'
    const { outcome, comment } = buildCiReport({
      stdout: '',
      stderr: nodeCrash(errorLine),
      exitCode: 1,
      headSha,
    })
    expect(outcome).toBe('error')
    expect(comment).toContain(errorLine)
  })

  it('points to the run logs when stderr has no error line', () => {
    const { comment } = buildCiReport({ stdout: '', stderr: 'Killed', exitCode: 137, headSha })
    expect(comment).toContain('see the workflow run logs')
  })

  it('caps a long stderr error at 500 characters', () => {
    const errorLine = `Error: ${'x'.repeat(1000)}`
    const { comment } = buildCiReport({
      stdout: '',
      stderr: nodeCrash(errorLine),
      exitCode: 1,
      headSha,
    })
    expect(comment).toContain(`\`\`\`text\n${errorLine.slice(0, MAX_ERROR_REASON_CHARS)}\n\`\`\``)
    expect(comment).not.toContain(errorLine.slice(0, MAX_ERROR_REASON_CHARS + 1))
  })

  it('fences the error reason so it cannot inject Markdown, even with backticks', () => {
    const errorLine = 'Error: bad ``` <img src=x onerror=alert(1)>'
    const { comment } = buildCiReport({
      stdout: '',
      stderr: errorLine,
      exitCode: 1,
      headSha,
    })
    expect(comment).toContain(`\`\`\`\`text\n${errorLine}\n\`\`\`\``)
  })

  it('maps non-JSON stdout to error', () => {
    const { outcome, comment } = ok('Sure! Here is my review: pass')
    expect(outcome).toBe('error')
    expect(comment).toContain('not valid JSON')
  })

  it('maps JSON missing verdict to error', () => {
    const { verdict: _verdict, ...noVerdict } = review
    const { outcome, comment } = ok(JSON.stringify(noVerdict))
    expect(outcome).toBe('error')
    expect(comment).toContain('fields: verdict')
  })

  it('maps an exit code of 0 with empty stdout to error', () => {
    expect(ok('  \n').outcome).toBe('error')
  })
})
