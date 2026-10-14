// prompts/review-request.test.ts — user prompt builder: diff wrapping, PR context and description cap.
import { describe, expect, it } from 'vitest'
import { buildReviewPrompt, MAX_DESCRIPTION_CHARS } from './review-request.ts'

const diff = 'diff --git a/x.ts b/x.ts\n@@ -1 +1 @@\n-old\n+new'
const diffBlock = `Review the following diff:\n\n\`\`\`diff\n${diff}\n\`\`\``

describe('buildReviewPrompt', () => {
  it('wraps a diff alone exactly as before PR context was added', () => {
    expect(buildReviewPrompt(diff)).toBe(diffBlock)
    expect(buildReviewPrompt(diff, {})).toBe(diffBlock)
  })

  it('puts the title and a delimited description before the diff', () => {
    const prompt = buildReviewPrompt(diff, {
      title: 'Fix login',
      description: 'Handles empty input.',
    })
    expect(prompt).toBe(
      '<pr_title>\nFix login\n</pr_title>\n\n' +
        '<pr_description>\nHandles empty input.\n</pr_description>\n\n' +
        diffBlock,
    )
  })

  it('cuts a description over the cap and marks it as truncated', () => {
    const description = 'a'.repeat(MAX_DESCRIPTION_CHARS) + 'b'
    const prompt = buildReviewPrompt(diff, { description })
    expect(prompt).toContain(
      `<pr_description>\n${'a'.repeat(MAX_DESCRIPTION_CHARS)}\n[description truncated]\n</pr_description>`,
    )
    expect(prompt).not.toContain('ab')
  })

  it('keeps a description of exactly the cap whole', () => {
    const description = 'a'.repeat(MAX_DESCRIPTION_CHARS)
    const prompt = buildReviewPrompt(diff, { description })
    expect(prompt).toContain(`<pr_description>\n${description}\n</pr_description>`)
    expect(prompt).not.toContain('[description truncated]')
  })

  it('leaves out a blank title and description', () => {
    expect(buildReviewPrompt(diff, { title: '  ', description: ' \n\t ' })).toBe(diffBlock)
    expect(buildReviewPrompt(diff, { title: 'Fix login', description: '' })).toBe(
      `<pr_title>\nFix login\n</pr_title>\n\n${diffBlock}`,
    )
  })
})
