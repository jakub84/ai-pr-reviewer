// Entry point of the code review agent: git diff in, structured verdict out.
// Usage: git diff main | npm run review -w @ai-pr-reviewer/code-reviewer
import { text } from 'node:stream/consumers'
import { createOpenRouter, type OpenRouterUsageAccounting } from '@openrouter/ai-sdk-provider'
import { generateText, Output } from 'ai'
import { buildReviewPrompt } from './prompts/review-request.ts'
import { SYSTEM_PROMPT } from './prompts/system.ts'
import { REVIEW_SCHEMA } from './schemas/review.ts'

const DEFAULT_MODEL = 'anthropic/claude-sonnet-5.5'
// Hard caps per run: oversized diffs are rejected before any tokens are billed.
const MAX_DIFF_CHARS = 200_000
const MAX_OUTPUT_TOKENS = 4_096

if (!process.env.OPENROUTER_API_KEY) {
  throw new Error('OPENROUTER_API_KEY is not set (add it to packages/code-reviewer/.env)')
}
if (process.stdin.isTTY) {
  throw new Error('Pipe a diff into stdin, e.g. `git diff main | npm run review`')
}

const diff = await text(process.stdin)
if (!diff.trim()) {
  throw new Error('The diff on stdin is empty')
}
if (diff.length > MAX_DIFF_CHARS) {
  throw new Error(`The diff has ${diff.length} chars, above the ${MAX_DIFF_CHARS} limit`)
}

const openrouter = createOpenRouter({ apiKey: process.env.OPENROUTER_API_KEY })
const modelId = process.env.REVIEW_MODEL ?? DEFAULT_MODEL

const { output, usage, providerMetadata } = await generateText({
  model: openrouter(modelId, { usage: { include: true } }),
  system: SYSTEM_PROMPT,
  prompt: buildReviewPrompt(diff),
  output: Output.object({ schema: REVIEW_SCHEMA }),
  maxOutputTokens: MAX_OUTPUT_TOKENS,
})

// Cost goes to stderr so stdout stays a clean JSON verdict for the CI gate.
const accounting = providerMetadata?.openrouter?.usage as OpenRouterUsageAccounting | undefined
console.error(
  JSON.stringify({
    model: modelId,
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    costUsd: accounting?.cost,
  }),
)
console.log(JSON.stringify(output, null, 2))
