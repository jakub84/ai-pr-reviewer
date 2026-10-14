// agent/model.ts — OpenRouter model factory for the reviewer.
// Config is passed in explicitly (no process.env), so the CLI and the evals can each supply their own.
import { createOpenRouter } from '@openrouter/ai-sdk-provider'
import type { LanguageModel } from 'ai'

export const DEFAULT_MODEL = 'anthropic/claude-sonnet-5.5'

export function createOpenRouterModel({
  apiKey,
  modelId = DEFAULT_MODEL,
}: {
  apiKey: string
  modelId?: string
}): LanguageModel {
  const openrouter = createOpenRouter({ apiKey })
  // usage.include makes OpenRouter report the cost of each call in providerMetadata.
  return openrouter(modelId, { usage: { include: true } })
}
