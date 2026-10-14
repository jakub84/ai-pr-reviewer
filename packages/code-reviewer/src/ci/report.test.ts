// ci/report.test.ts — CI report builder: outcome mapping, comment layout and error reasons.
import { describe, expect, it } from 'vitest'
import type { Review } from '../schemas/review.ts'
import {
  buildCiReport,
  COMMENT_MARKER,
  findPreviousReview,
  MAX_ERROR_REASON_CHARS,
} from './report.ts'

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
      comment.startsWith(`${COMMENT_MARKER}\n## ✅ AI code review #1: passed · \`0f80079\``),
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
    expect(comment).toContain(`### Summary\n\n${review.summary}`)
    expect(comment).toContain('add the `ai-cr:review` label')
  })

  it('maps a valid fail to failed', () => {
    const { outcome, comment } = ok(JSON.stringify({ ...review, verdict: 'fail' }))
    expect(outcome).toBe('failed')
    expect(comment).toContain('## ❌ AI code review #1: failed')
  })

  it('formats the footer from the cost line, with the run link', () => {
    const { comment } = ok(JSON.stringify(review), `some warning\n${costLine}\n`)
    expect(comment).toContain(
      `---\n<sub>Model: \`anthropic/claude-sonnet-5.5\` · Tokens: 12345 in / 678 out · Cost: $0.0946 · [Workflow run](${runUrl})</sub>`,
    )
  })

  it('shows n/a in the footer when stderr has no cost line', () => {
    const { comment } = buildCiReport({
      stdout: JSON.stringify(review),
      stderr: 'not json\n{"no":"model"}',
      exitCode: 0,
      headSha,
    })
    expect(comment).toContain('---\n<sub>Model: n/a · Tokens: n/a in / n/a out · Cost: n/a</sub>')
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
    expect(comment).toContain('## ⚠️ AI code review #1: review skipped · `0f80079`')
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

describe('buildCiReport with earlier reviews', () => {
  const previousSha = '9ebf47eaaaaaaa'
  const failed: Review = {
    ...review,
    implementationCorrectness: 4,
    testRiskCoverage: 3,
    documentation: 6,
    verdict: 'fail',
  }

  // A real earlier comment, so the test also covers the hidden data line round trip.
  const commentFor = (earlier: Review, previousComments: string[] = []) =>
    buildCiReport({
      stdout: JSON.stringify(earlier),
      stderr: costLine,
      exitCode: 0,
      headSha: previousSha,
      previousComments,
    }).comment

  const rerun = (previousComments: string[], current: Review = review) =>
    buildCiReport({
      stdout: JSON.stringify(current),
      stderr: costLine,
      exitCode: 0,
      headSha,
      runUrl,
      previousComments,
    })

  it('numbers the review after every earlier bot comment', () => {
    const skipped = buildCiReport({ stdout: '', stderr: 'Error: boom', exitCode: 1, headSha })
    const { comment } = rerun([commentFor(failed), skipped.comment])
    expect(comment).toContain('## ✅ AI code review #3: passed · `0f80079`')
  })

  it('ignores comments that are not from the reviewer when numbering', () => {
    const { comment } = rerun(['LGTM', 'Please fix the typo'])
    expect(comment).toContain('## ✅ AI code review #1: passed')
    expect(comment).toContain('| Criterion | Score |')
  })

  it('shows previous and current scores with the change per criterion', () => {
    const { comment } = rerun([commentFor(failed)])
    expect(comment).toContain(
      [
        '| Criterion | Previous | Now | Change |',
        '| --- | --- | --- | --- |',
        '| Implementation correctness | 4/10 | 8/10 | 🟢 +4 |',
        '| Idiomaticity | 7/10 | 7/10 | ➖ 0 |',
        '| Complexity | 9/10 | 9/10 | ➖ 0 |',
        '| Test / risk coverage | 3/10 | 6/10 | 🟢 +3 |',
        '| Documentation | 6/10 | 5/10 | 🔴 −1 |',
        '| Security and safety | 10/10 | 10/10 | ➖ 0 |',
      ].join('\n'),
    )
    expect(comment).not.toContain('| Criterion | Score |')
  })

  it('names the compared review, the verdict change and what improved or declined', () => {
    const { comment } = rerun([commentFor(failed)])
    expect(comment).toContain(
      'Compared with review #1 on `9ebf47e`. Verdict changed: ❌ fail → ✅ pass.',
    )
    expect(comment).toContain(
      '**Improved:** Implementation correctness (+4), Test / risk coverage (+3)  \n**Declined:** Documentation (−1)',
    )
  })

  it('says when nothing changed', () => {
    const { comment } = rerun([commentFor(review)])
    expect(comment).toContain('Verdict unchanged: ✅ pass.')
    expect(comment).toContain('No score changed.')
  })

  it('compares with the latest review that has scores, skipping a review skipped comment', () => {
    const first = commentFor(failed)
    const second = commentFor({ ...failed, implementationCorrectness: 6 }, [first])
    const skipped = buildCiReport({
      stdout: '',
      stderr: 'Error: boom',
      exitCode: 1,
      headSha,
      previousComments: [first, second],
    }).comment
    const { comment } = rerun([first, second, skipped])
    expect(comment).toContain('Compared with review #2')
    expect(comment).toContain('| Implementation correctness | 6/10 | 8/10 | 🟢 +2 |')
  })

  it('does not write a data line into a review skipped comment', () => {
    const { comment } = buildCiReport({ stdout: '', stderr: 'Error: boom', exitCode: 1, headSha })
    expect(comment).not.toContain('ai-cr-data')
    expect(comment).toContain('add the `ai-cr:review` label to retry')
  })
})

describe('findPreviousReview', () => {
  it('returns undefined without a valid data line', () => {
    expect(findPreviousReview([])).toBeUndefined()
    expect(findPreviousReview([`${COMMENT_MARKER}\n## old comment without data`])).toBeUndefined()
    expect(
      findPreviousReview([`${COMMENT_MARKER}\n<!-- ai-cr-data {not json} -->`]),
    ).toBeUndefined()
    expect(
      findPreviousReview([`${COMMENT_MARKER}\n<!-- ai-cr-data {"review":1,"sha":"abc"} -->`]),
    ).toBeUndefined()
  })
})
