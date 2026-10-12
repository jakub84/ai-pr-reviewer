// prompts/review-request.ts — user prompt that wraps the diff for review, shared with the evals.

export function buildReviewPrompt(diff: string): string {
  return `Review the following diff:\n\n\`\`\`diff\n${diff}\n\`\`\``
}
