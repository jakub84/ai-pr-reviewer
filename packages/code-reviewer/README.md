# @ai-pr-reviewer/code-reviewer

AI code review agent for pull requests: takes a `git diff`, returns a structured JSON verdict
(per-criterion scores, pass/fail, summary). Runs locally and as a CI step.

Stack: AI SDK 7 (`ai`), OpenRouter provider (`@openrouter/ai-sdk-provider@3`), zod 4, run with tsx on Node 22+.

## Run

```bash
cp .env.example .env   # set OPENROUTER_API_KEY, optionally REVIEW_MODEL
git diff main | npm run review -w @ai-pr-reviewer/code-reviewer
```

The verdict (matching `src/schemas/review.ts`) goes to stdout; model, token usage and cost go to stderr.
