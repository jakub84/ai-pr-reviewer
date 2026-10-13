// agent/reviewer.ts — ToolLoopAgent configured for code review, plus the reviewDiff entry call.
import type { OpenRouterUsageAccounting } from '@openrouter/ai-sdk-provider'
import { isStepCount, Output, ToolLoopAgent, type LanguageModel } from 'ai'
import { buildReviewPrompt } from '../prompts/review-request.ts'
import { SYSTEM_PROMPT } from '../prompts/system.ts'
import { REVIEW_SCHEMA, type Review } from '../schemas/review.ts'

// Hard caps per run: oversized diffs are rejected before any tokens are billed.
export const MAX_DIFF_CHARS = 200_000
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
}: {
  model: LanguageModel
  instructions?: string
  maxOutputTokens?: number
}) {
  return new ToolLoopAgent({
    model,
    instructions,
    output: Output.object({ schema: REVIEW_SCHEMA }),
    maxOutputTokens,
    stopWhen: isStepCount(MAX_STEPS),
    tools: {},
  })
}

export type Reviewer = ReturnType<typeof createReviewer>

export async function reviewDiff(reviewer: Reviewer, diff: string): Promise<ReviewResult> {
  if (!diff.trim()) {
    throw new Error('The diff is empty')
  }
  if (diff.length > MAX_DIFF_CHARS) {
    throw new Error(`The diff has ${diff.length} chars, above the ${MAX_DIFF_CHARS} limit`)
  }

  const result = await reviewer.generate({ prompt: buildReviewPrompt(diff) })

  // Sum per-step costs: result.providerMetadata only describes the final step.
  let costUsd: number | undefined
  for (const step of result.steps) {
    const accounting = step.providerMetadata?.openrouter?.usage as
      OpenRouterUsageAccounting | undefined
    if (accounting?.cost !== undefined) {
      costUsd = (costUsd ?? 0) + accounting.cost
    }
  }

  const { inputTokens, outputTokens, totalTokens } = result.totalUsage
  return {
    review: result.output,
    modelId: result.response.modelId,
    usage: { inputTokens, outputTokens, totalTokens },
    costUsd,
  }
}
