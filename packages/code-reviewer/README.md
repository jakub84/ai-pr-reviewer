# @ai-pr-reviewer/code-reviewer

AI code review agent for pull requests: takes a `git diff`, returns a structured JSON verdict
(per-criterion scores, pass/fail, summary). Runs locally and as a CI step.

Stack: AI SDK 7 (`ai`, `ToolLoopAgent`), OpenRouter provider (`@openrouter/ai-sdk-provider@3`), zod 4, run with tsx on Node 22+.

## Run

```bash
cp .env.example .env   # set OPENROUTER_API_KEY, optionally REVIEW_MODEL
git diff main | npm run review -w @ai-pr-reviewer/code-reviewer
```

The verdict (matching `src/schemas/review.ts`) goes to stdout; model, token usage and cost go to stderr.
Optional `PR_TITLE` and `PR_BODY` env vars give the reviewer the PR title and description (capped at
`MAX_DESCRIPTION_CHARS`, 4000) to check against the diff; library callers pass them as
`reviewDiff(reviewer, diff, { title, description })`.

## Layout

| Path                            | Role                                                                                  |
| ------------------------------- | ------------------------------------------------------------------------------------- |
| `src/schemas/review.ts`         | The contract: `REVIEW_SCHEMA` (zod), `REVIEW_JSON_SCHEMA`, type `Review`              |
| `src/prompts/system.ts`         | `SYSTEM_PROMPT`                                                                       |
| `src/prompts/review-request.ts` | `buildReviewPrompt(diff, pr?)` wraps the diff and optional PR context                 |
| `src/agent/model.ts`            | `createOpenRouterModel({ apiKey, modelId? })`, `DEFAULT_MODEL`                        |
| `src/agent/reviewer.ts`         | `createReviewer` (`ToolLoopAgent`), `reviewDiff`, per-run caps                        |
| `src/agent/cost.ts`             | `sumCostUsd`, `isCostAtLeast` stop condition, `MAX_COST_USD`                          |
| `src/agent/diff-size.ts`        | `countChangedLines(diff)`, the input for the `MAX_DIFF_LINES` cap                     |
| `src/cli.ts`                    | CLI: env and stdin checks, cost log on stderr, verdict on stdout                      |
| `src/ci/report.ts`              | `buildCiReport`: CLI output to PR comment and outcome (passed/failed/error)           |
| `src/ci-report.ts`              | CI entry (`npm run ci-report`): env and files in, comment file out, outcome on stdout |
| `src/index.ts`                  | Public API barrel, no side effects                                                    |

## Library API

The package exports `./src/index.ts`, so other workspaces (e.g. evals) can import it by name.
Config is passed in explicitly; the library never reads `process.env`.

```ts
import { createOpenRouterModel, createReviewer, reviewDiff } from '@ai-pr-reviewer/code-reviewer'

const model = createOpenRouterModel({ apiKey: process.env.OPENROUTER_API_KEY! })
const reviewer = createReviewer({ model })
const { review, modelId, usage, costUsd } = await reviewDiff(reviewer, diff)
```

`reviewDiff` rejects empty diffs and diffs that change more than `MAX_DIFF_LINES` (3000 added + removed lines,
see `countChangedLines`) before any tokens are billed, and sums the OpenRouter cost over all agent steps into `costUsd`.

Each run also has a hard USD cap: `createReviewer({ model, maxCostUsd })` (default `MAX_COST_USD`, $0.50).
AI SDK 7 has no built-in `maxCost`, so the cap is a custom stop condition (`isCostAtLeast`) checked
between agent steps. It stops the loop from starting another step but cannot cut a step already in
flight; `MAX_OUTPUT_TOKENS` and `MAX_DIFF_LINES` bound the cost of that single step.
