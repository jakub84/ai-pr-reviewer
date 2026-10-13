// agent/reviewer.ts — ToolLoopAgent configured for code review, plus the reviewDiff entry call.
import { isStepCount, Output, ToolLoopAgent, type LanguageModel } from 'ai'
import { buildReviewPrompt } from '../prompts/review-request.ts'
import { SYSTEM_PROMPT } from '../prompts/system.ts'
import { REVIEW_SCHEMA, type Review } from '../schemas/review.ts'
import { isCostAtLeast, MAX_COST_USD, sumCostUsd } from './cost.ts'
import { countChangedLines } from './diff-size.ts'

// Hard caps per run: oversized diffs are rejected before any tokens are billed.
export const MAX_DIFF_LINES = 3_000
export const MAX_OUTPUT_TOKENS = 4_096
// Budget for future tools; with no tools the agent finishes in a single step.
export const MAX_STEPS = 5

export type ReviewResult = {
  review: Review
  modelId: string
  usage: { inputTokens?: number; outputTokens?: number; totalTokens?: number }
  costUsd?: number
}

export function createReviewer({
  model,
  instructions = SYSTEM_PROMPT,
  maxOutputTokens = MAX_OUTPUT_TOKENS,
  maxCostUsd = MAX_COST_USD,
}: {
  model: LanguageModel
  instructions?: string
  maxOutputTokens?: number
  maxCostUsd?: number
}) {
  return new ToolLoopAgent({
    model,
    instructions,
    output: Output.object({ schema: REVIEW_SCHEMA }),
    maxOutputTokens,
    stopWhen: [isStepCount(MAX_STEPS), isCostAtLeast(maxCostUsd)],
    tools: {},
  })
}

export type Reviewer = ReturnType<typeof createReviewer>

export async function reviewDiff(reviewer: Reviewer, diff: string): Promise<ReviewResult> {
  if (!diff.trim()) {
    throw new Error('The diff is empty')
  }
  const changedLines = countChangedLines(diff)
  if (changedLines > MAX_DIFF_LINES) {
    throw new Error(`The diff changes ${changedLines} lines, above the ${MAX_DIFF_LINES} limit`)
  }

  const result = await reviewer.generate({ prompt: buildReviewPrompt(diff) })

  const { inputTokens, outputTokens, totalTokens } = result.totalUsage
  return {
    review: result.output,
    modelId: result.response.modelId,
    usage: { inputTokens, outputTokens, totalTokens },
    // Summed over steps: result.providerMetadata only describes the final step.
    costUsd: sumCostUsd(result.steps),
  }
}
