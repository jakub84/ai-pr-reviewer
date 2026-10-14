// CLI entry point of the code review agent: git diff in, structured verdict out.
// Usage: git diff main | npm run review -w @ai-pr-reviewer/code-reviewer
import { text } from 'node:stream/consumers'
import { createOpenRouterModel, DEFAULT_MODEL } from './agent/model.ts'
import { createReviewer, reviewDiff } from './agent/reviewer.ts'

const apiKey = process.env.OPENROUTER_API_KEY
if (!apiKey) {
  throw new Error('OPENROUTER_API_KEY is not set (add it to packages/code-reviewer/.env)')
}
if (process.stdin.isTTY) {
  throw new Error('Pipe a diff into stdin, e.g. `git diff main | npm run review`')
}

const diff = await text(process.stdin)
// `||`, not `??`: the CI action passes REVIEW_MODEL="" when its `model` input is unset.
const modelId = process.env.REVIEW_MODEL || DEFAULT_MODEL
// Optional PR context (CI sets it from the pull request); blank values are left out of the prompt.
const pr = { title: process.env.PR_TITLE, description: process.env.PR_BODY }

const reviewer = createReviewer({ model: createOpenRouterModel({ apiKey, modelId }) })
const result = await reviewDiff(reviewer, diff, pr)
const { review, usage, costUsd } = result

// Cost goes to stderr so stdout stays a clean JSON verdict for the CI gate.
// `model` is the id OpenRouter actually served, which can differ from the requested one.
console.error(
  JSON.stringify({
    model: result.modelId,
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    costUsd,
  }),
)
console.log(JSON.stringify(review, null, 2))
