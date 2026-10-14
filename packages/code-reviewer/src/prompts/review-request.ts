// prompts/review-request.ts — user prompt that wraps the diff (and optional PR context) for review,
// shared with the evals.

// Caps the PR description to bound cost and the prompt-injection surface of author-written text.
export const MAX_DESCRIPTION_CHARS = 4_000

// The author's own claims about the change; blank fields are treated as absent.
export type PullRequestContext = { title?: string; description?: string }

export function buildReviewPrompt(diff: string, pr: PullRequestContext = {}): string {
  const sections: string[] = []

  const title = pr.title?.trim()
  if (title) {
    sections.push(`<pr_title>\n${title}\n</pr_title>`)
  }

  const description = pr.description?.trim()
  if (description) {
    const capped =
      description.length > MAX_DESCRIPTION_CHARS
        ? `${description.slice(0, MAX_DESCRIPTION_CHARS)}\n[description truncated]`
        : description
    sections.push(`<pr_description>\n${capped}\n</pr_description>`)
  }

  sections.push(`Review the following diff:\n\n\`\`\`diff\n${diff}\n\`\`\``)
  return sections.join('\n\n')
}
