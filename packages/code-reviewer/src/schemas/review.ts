// schemas/review.ts — shared contract for the code-review agent (M5L2, M5L3).
// The entry point, the CI gate and the promptfoo evals read this one definition.
// Criteria follow m5l3-requirements: six scores on a 1-10 scale, a binding verdict, a summary.
import { z } from 'zod'

// Scores are plain z.number(): Anthropic structured output rejects minimum/maximum on
// integer types, so the 1-10 range is carried by the field description and the prompt.
export const REVIEW_SCHEMA = z.object({
  implementationCorrectness: z
    .number()
    .describe(
      'Implementation correctness (1-10 scale). ' +
        '1: the logic is wrong, misses obvious edge cases or silently breaks existing behavior. ' +
        '10: correct on the happy path, in edge cases and in error handling, with no regressions.',
    ),
  idiomaticity: z
    .number()
    .describe(
      'Idiomaticity (1-10 scale). ' +
        '1: fights the idioms of the stack and the patterns of the repository. ' +
        '10: indistinguishable from the well-written code around it.',
    ),
  complexity: z
    .number()
    .describe(
      'Complexity (1-10 scale). ' +
        '1: over-engineered or tangled, accidental complexity obscures the intent. ' +
        '10: the simplest design that fully solves the problem.',
    ),
  testRiskCoverage: z
    .number()
    .describe(
      'Test coverage proportional to risk (1-10 scale). ' +
        '1: risky logic without tests, or tests that verify nothing. ' +
        '10: the riskiest paths are tested deliberately and well.',
    ),
  documentation: z
    .number()
    .describe(
      'Documentation (1-10 scale). ' +
        '1: no comments or docs where they are needed; the intent has to be reverse-engineered. ' +
        '10: just enough documentation to explain the "why", without restating the obvious.',
    ),
  securitySafety: z
    .number()
    .describe(
      'Security (1-10 scale). ' +
        '1: a vulnerability, leaked secrets or unsafe trust in external input. ' +
        '10: input is validated, secrets are handled correctly, no new attack surface.',
    ),
  verdict: z
    .enum(['pass', 'fail'])
    .describe('Binding verdict for the whole change; read by the CI gate'),
  summary: z.string().describe('Markdown summary, ready to post as a PR comment'),
})

// draft-07 keeps zod output compatible with the Claude Agent SDK outputFormat.
export const REVIEW_JSON_SCHEMA = z.toJSONSchema(REVIEW_SCHEMA, { target: 'draft-07' })

export type Review = z.infer<typeof REVIEW_SCHEMA>
