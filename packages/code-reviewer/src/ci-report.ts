// ci-report.ts — CI entry: reads the review CLI's captured output, writes the PR comment file
// and prints the outcome (passed | failed | error) as the only stdout. Exits 0 for all three;
// a missing env var or file is a workflow bug and fails the step.
// Not exported from index.ts, so the library stays side-effect free.
import { readFileSync, writeFileSync } from 'node:fs'
import { buildCiReport } from './ci/report.ts'

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(`${name} is not set`)
  }
  return value
}

// One JSON-encoded comment body per line, oldest first (gh api ... --jq '... | @json').
// Optional: without it the review is numbered #1 and has nothing to compare against.
function readPreviousComments(file: string | undefined): string[] {
  if (!file) return []
  return readFileSync(file, 'utf8')
    .split(/\r?\n/)
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line) as unknown)
    .filter((body): body is string => typeof body === 'string')
}

const stdoutFile = requireEnv('REVIEW_STDOUT_FILE')
const stderrFile = requireEnv('REVIEW_STDERR_FILE')
const exitCodeRaw = requireEnv('REVIEW_EXIT_CODE')
const headSha = requireEnv('HEAD_SHA')
const commentFile = requireEnv('COMMENT_FILE')
const runUrl = process.env.RUN_URL || undefined
const previousCommentsFile = process.env.PREVIOUS_COMMENTS_FILE || undefined

const exitCode = Number(exitCodeRaw)
if (!Number.isInteger(exitCode)) {
  throw new Error(`REVIEW_EXIT_CODE is not an integer: ${exitCodeRaw}`)
}

const { outcome, comment } = buildCiReport({
  stdout: readFileSync(stdoutFile, 'utf8'),
  stderr: readFileSync(stderrFile, 'utf8'),
  exitCode,
  headSha,
  runUrl,
  previousComments: readPreviousComments(previousCommentsFile),
})

writeFileSync(commentFile, comment)
console.log(outcome)
