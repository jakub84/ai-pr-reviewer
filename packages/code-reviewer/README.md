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

## Layout

| Path                            | Role                                                                     |
| ------------------------------- | ------------------------------------------------------------------------ |
| `src/schemas/review.ts`         | The contract: `REVIEW_SCHEMA` (zod), `REVIEW_JSON_SCHEMA`, type `Review` |
| `src/prompts/system.ts`         | `SYSTEM_PROMPT`                                                          |
| `src/prompts/review-request.ts` | `buildReviewPrompt(diff)` wraps the diff in the user prompt              |
| `src/agent/model.ts`            | `createOpenRouterModel({ apiKey, modelId? })`, `DEFAULT_MODEL`           |
| `src/agent/reviewer.ts`         | `createReviewer` (`ToolLoopAgent`), `reviewDiff`, per-run caps           |
| `src/cli.ts`                    | CLI: env and stdin checks, cost log on stderr, verdict on stdout         |
| `src/index.ts`                  | Public API barrel, no side effects                                       |

## Library API

The package exports `./src/index.ts`, so other workspaces (e.g. evals) can import it by name.
Config is passed in explicitly; the library never reads `process.env`.

```ts
import { createOpenRouterModel, createReviewer, reviewDiff } from '@ai-pr-reviewer/code-reviewer'

const model = createOpenRouterModel({ apiKey: process.env.OPENROUTER_API_KEY! })
const reviewer = createReviewer({ model })
const { review, modelId, usage, costUsd } = await reviewDiff(reviewer, diff)
```

`reviewDiff` rejects empty diffs and diffs above `MAX_DIFF_CHARS` before any tokens are billed,
and sums the OpenRouter cost over all agent steps into `costUsd`.
