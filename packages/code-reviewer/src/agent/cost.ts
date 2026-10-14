// agent/cost.ts — OpenRouter cost accounting across agent steps, and the hard USD cap built on it.
import type { OpenRouterUsageAccounting } from '@openrouter/ai-sdk-provider'
import type { ProviderMetadata, StopCondition } from 'ai'

// Default hard budget per review run, in USD.
export const MAX_COST_USD = 0.5

// Sums the cost OpenRouter reports per step (needs `usage: { include: true }` on the model).
// Returns undefined when no step reported a cost, so missing data never looks like a free run.
export function sumCostUsd(
  steps: ReadonlyArray<{ providerMetadata?: ProviderMetadata }>,
): number | undefined {
  let costUsd: number | undefined
  for (const step of steps) {
    const accounting = step.providerMetadata?.openrouter?.usage as
      OpenRouterUsageAccounting | undefined
    if (accounting?.cost !== undefined) {
      costUsd = (costUsd ?? 0) + accounting.cost
    }
  }
  return costUsd
}

// AI SDK 7 has no built-in maxCost, so the cap is a custom stop condition. It runs between
// steps: it stops the loop from starting another step, but cannot cut a step already in flight.
export function isCostAtLeast(maxCostUsd: number): StopCondition<any, any> {
  return ({ steps }) => (sumCostUsd(steps) ?? 0) >= maxCostUsd
}
