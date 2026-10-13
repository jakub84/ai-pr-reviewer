# Modular ToolLoopAgent Reviewer — Implementation Plan

## Overview

We turn the single-file reviewer (`packages/code-reviewer/src/index.ts`, `generateText` + `Output.object`) into a modular agent built on `ToolLoopAgent` from AI SDK 7. The structured-output schema and the prompts move into separate modules, and the agent module exports a reviewer factory and a `reviewDiff` function that a future promptfoo provider will call. This change does not set up any eval environment.

## Current State Analysis

- `src/index.ts` does everything in a top-level `await`: it checks `OPENROUTER_API_KEY` and the TTY, reads stdin, checks for an empty diff and the `MAX_DIFF_CHARS = 200_000` limit, creates the OpenRouter model (`usage: { include: true }`), calls `generateText` with `maxOutputTokens: 4_096`, prints the cost (`providerMetadata.openrouter.usage.cost`) to stderr and the JSON verdict to stdout (`src/index.ts:1-50`).
- `src/review-schema.ts` combines `SYSTEM_PROMPT`, `REVIEW_SCHEMA` (six 1-10 scores, `verdict`, `summary`), `REVIEW_JSON_SCHEMA` (draft-07) and the `Review` type. The user prompt ("Review the following diff…") is hard-coded in `src/index.ts:34`.
- The package has no tests and no lint. Verification is `npm run typecheck` (tsc `--noEmit`, `allowImportingTsExtensions`) and the root `npm run format:check` (prettier).
- `ai@7.0.137` is installed. `ToolLoopAgent` accepts `instructions`, `output`, `tools`, `stopWhen` and `maxOutputTokens` (`node_modules/ai/src/agent/tool-loop-agent-settings.ts:63-127`). `agent.generate()` returns a result with `output`, `totalUsage`, `steps` and `response` (`node_modules/ai/docs/03-agents/02-building-agents.mdx`).

## Desired End State

- `git diff main | npm run review -w @ai-pr-reviewer/code-reviewer` works as it does today: the same JSON on stdout (same fields), the same cost log on stderr and the same error messages.
- `import { createReviewer, createOpenRouterModel, reviewDiff, REVIEW_SCHEMA, type Review } from '@ai-pr-reviewer/code-reviewer'` works from another module with no side effects on import: nothing reads stdin or checks env.
- The model, system prompt and limits can be swapped through the factory config, which prepares the ground for comparing models in evals.

### Key Discoveries:

- The hard cost caps (`MAX_DIFF_CHARS`, `MAX_OUTPUT_TOKENS`) live only in the CLI today (`src/index.ts:9-11`), so a call from outside the CLI would bypass them. We move them into the agent module.
- `providerMetadata` on the `generate()` result describes only the last step. In a multi-step loop the cost has to be summed over `steps[].providerMetadata.openrouter.usage.cost`, and tokens are taken from `totalUsage`.
- The comment in `src/review-schema.ts:3-4` declares the schema as the shared contract for the CLI, the CI gate and the evals. Field names and `verdict` values stay unchanged (hard rule from CLAUDE.md).

## What We're NOT Doing

- No promptfoo or any eval environment setup (no `promptfooconfig`, provider or dataset).
- No tools for the agent. The `tools` object stays empty but ready to be extended.
- No unit tests or test framework. Verification is typecheck plus a smoke test.
- No changes to the meaning of the system prompt, the criteria, the field names or `verdict` in the schema.
- No changes to CI (`.github/workflows/ci.yml`) or the verdict gate.

## Implementation Approach

The refactor happens in three steps, and the CLI keeps working after each phase. First we move the contract (schema + prompts) without changing behavior. Then we add the agent module alongside. Finally we switch the entry point to the new API and turn `src/index.ts` into the public barrel. `index.ts` stops being a script, because importing the library must have no side effects. The entry logic (stdin, env, TTY) moves to `src/cli.ts`.

Target layout of `src/`:

```
src/
  schemas/review.ts          REVIEW_SCHEMA, REVIEW_JSON_SCHEMA, Review
  prompts/system.ts          SYSTEM_PROMPT
  prompts/review-request.ts  buildReviewPrompt(diff)
  agent/model.ts             createOpenRouterModel(), DEFAULT_MODEL
  agent/reviewer.ts          createReviewer(), reviewDiff(), limits, ReviewResult
  index.ts                   public API (re-exports)
  cli.ts                     stdin → reviewDiff → stdout/stderr
```

## Critical Implementation Details

- **Cost across steps**: `reviewDiff` computes `costUsd` as the sum of OpenRouter costs over all `steps`, not from `result.providerMetadata`. When no step reported a cost, `costUsd` is `undefined`, not `0`, so missing data does not look like a free run.
- **Validation order**: an empty diff and a diff over `MAX_DIFF_CHARS` must throw in `reviewDiff` **before** the model is called, because an exceeded limit must not cost any tokens.

## Phase 1: Extract the schema and prompts

### Overview

We move the contract into the `schemas/` and `prompts/` directories without changing CLI behavior.

> Note (during implementation): at the user's request the system prompt, the user prompt and the schema field descriptions were translated from Polish to English. Field names, `verdict` values and the 1-10 scale are unchanged; the model now writes `summary` in English.

### Changes Required:

#### 1. Output schema

**File**: `packages/code-reviewer/src/schemas/review.ts`

**Intent**: New home of the schema moved from `review-schema.ts`, keeping the comment about the contract and about `z.number()` without min/max.

**Contract**: Exports `REVIEW_SCHEMA`, `REVIEW_JSON_SCHEMA` (draft-07), `type Review` — content identical to `src/review-schema.ts:15-62`.

#### 2. Prompts

**File**: `packages/code-reviewer/src/prompts/system.ts`, `packages/code-reviewer/src/prompts/review-request.ts`

**Intent**: The system prompt and the user prompt with the diff move into separate modules, so evals can test the same prompts the agent uses.

**Contract**: `SYSTEM_PROMPT: string` (content unchanged) and `buildReviewPrompt(diff: string): string`, which returns exactly today's text from `src/index.ts:34`.

#### 3. Rewire imports and remove the old file

**File**: `packages/code-reviewer/src/index.ts`, `packages/code-reviewer/src/review-schema.ts` (removed)

**Intent**: The current entry point imports from the new modules and uses `buildReviewPrompt`. `review-schema.ts` goes away, and references to it (including the README) point to `src/schemas/review.ts`.

**Contract**: No change in CLI behavior or in the stdout/stderr format.

### Success Criteria:

#### Automated Verification:

- Typecheck passes: `npm run typecheck -w @ai-pr-reviewer/code-reviewer`
- Formatting passes: `npm run format:check`
- No references to `review-schema` remain in the repository: `git grep -n "review-schema" -- packages` returns nothing

#### Manual Verification:

- `git diff HEAD~1 | npm run review -w @ai-pr-reviewer/code-reviewer` returns a valid JSON verdict and a cost log on stderr

**Implementation Note**: After automated verification is green, pause for manual confirmation of the smoke test before the next phase.

---

## Phase 2: Agent module on ToolLoopAgent

### Overview

We add a reusable agent module next to the existing entry point. The CLI does not use it yet, so behavior does not change.

### Changes Required:

#### 1. Model factory

**File**: `packages/code-reviewer/src/agent/model.ts`

**Intent**: Creates the OpenRouter model with usage reporting enabled, from an explicitly passed key and model id. The module does not read `process.env`, so evals can pass their own configuration.

**Contract**: `DEFAULT_MODEL = 'anthropic/claude-sonnet-5.5'`, `createOpenRouterModel({ apiKey: string; modelId?: string }): LanguageModel` (defaults to `DEFAULT_MODEL`, always `usage: { include: true }`).

#### 2. Reviewer

**File**: `packages/code-reviewer/src/agent/reviewer.ts`

**Intent**: `createReviewer` builds a `ToolLoopAgent` configured for review: `instructions` from `SYSTEM_PROMPT`, `output: Output.object({ schema: REVIEW_SCHEMA })`, `maxOutputTokens`, an explicit `stopWhen: isStepCount(MAX_STEPS)` as a budget for future tools, and an empty `tools`. `reviewDiff` validates the diff, calls the agent and returns the verdict together with usage and cost. These two functions are the only API that the CLI and the future promptfoo provider call.

**Contract**:

- Constants: `MAX_DIFF_CHARS = 200_000`, `MAX_OUTPUT_TOKENS = 4_096`, `MAX_STEPS` (a small number, e.g. 5).
- `createReviewer(config: { model: LanguageModel; instructions?: string; maxOutputTokens?: number }): Reviewer`. `instructions` defaults to `SYSTEM_PROMPT`, `maxOutputTokens` defaults to `MAX_OUTPUT_TOKENS`. `type Reviewer = ReturnType<typeof createReviewer>`.
- `reviewDiff(reviewer: Reviewer, diff: string): Promise<ReviewResult>`. Throws on an empty diff and on `diff.length > MAX_DIFF_CHARS`, with the same messages as today in `src/index.ts:21-26`.
- `type ReviewResult = { review: Review; modelId: string; usage: { inputTokens?: number; outputTokens?: number; totalTokens?: number }; costUsd?: number }`. `modelId` comes from `result.response.modelId`, `usage` from `totalUsage`, and `costUsd` is the sum of costs over steps (see Critical Implementation Details).

### Success Criteria:

#### Automated Verification:

- Typecheck passes: `npm run typecheck -w @ai-pr-reviewer/code-reviewer`
- Formatting passes: `npm run format:check`

#### Manual Verification:

- Code review: `src/agent/*` does not read `process.env` or `process.stdin`

**Implementation Note**: After automated verification is green, pause for manual confirmation before the next phase.

---

## Phase 3: CLI, public API and documentation

### Overview

We switch the entry point to `reviewDiff`, turn `src/index.ts` into a side-effect-free barrel and update the README.

### Changes Required:

#### 1. CLI

**File**: `packages/code-reviewer/src/cli.ts`

**Intent**: Takes over the env and TTY checks and the stdin read from `src/index.ts`. Reads the model id from `REVIEW_MODEL`, then calls `createOpenRouterModel` → `createReviewer` → `reviewDiff`. Prints the cost to stderr and the verdict to stdout.

**Contract**: stderr: `JSON.stringify({ model, inputTokens, outputTokens, costUsd })` (same keys as today), stdout: `JSON.stringify(review, null, 2)`. The usage comment moves over from `src/index.ts:1-2`.

#### 2. Public API

**File**: `packages/code-reviewer/src/index.ts`

**Intent**: A barrel re-exporting the library API. Importing it has no side effects.

**Contract**: Exports: `createReviewer`, `reviewDiff`, `createOpenRouterModel`, `DEFAULT_MODEL`, `MAX_DIFF_CHARS`, `MAX_OUTPUT_TOKENS`, `MAX_STEPS`, `REVIEW_SCHEMA`, `REVIEW_JSON_SCHEMA`, `SYSTEM_PROMPT`, `buildReviewPrompt` and the types `Review`, `Reviewer`, `ReviewResult`.

#### 3. Package manifest

**File**: `packages/code-reviewer/package.json`

**Intent**: The `review` script points to `src/cli.ts`, and the `exports` field exposes `./src/index.ts`, so a future eval provider can import the package by name.

**Contract**: `"review": "tsx --env-file-if-exists=.env src/cli.ts"`, `"exports": { ".": "./src/index.ts" }`. Dependency versions unchanged.

#### 4. README

**File**: `packages/code-reviewer/README.md`

**Intent**: Describes the new module layout, points to the schema in `src/schemas/review.ts` and gives a short example of programmatic use (`createReviewer` + `reviewDiff`).

**Contract**: The "Run" section keeps the same command; a new section covers the library API.

### Success Criteria:

#### Automated Verification:

- Typecheck passes: `npm run typecheck -w @ai-pr-reviewer/code-reviewer`
- Formatting passes: `npm run format:check`
- Importing the library has no side effects: `npx tsx -e "import('./src/index.ts').then(m => console.log(Object.keys(m).sort().join(',')))"` run in `packages/code-reviewer` without `OPENROUTER_API_KEY` prints the exports without an error
- The CLI keeps the TTY/env error: `npm run review -w @ai-pr-reviewer/code-reviewer < /dev/null` without a key ends with the `OPENROUTER_API_KEY` message

#### Manual Verification:

- `git diff HEAD~1 | npm run review -w @ai-pr-reviewer/code-reviewer` returns JSON with the same fields as before the change, and stderr shows a log with `model`, `inputTokens`, `outputTokens`, `costUsd`
- A diff that is too large (>200,000 chars) is rejected before the model is called (no cost log)

**Implementation Note**: After automated verification is green, pause for manual confirmation of the smoke test.

---

## Testing Strategy

### Unit Tests:

- None in this change (a deliberate decision). Verdict quality will be measured by future promptfoo evals that call `reviewDiff`.

### Integration Tests:

- None. A smoke test through the CLI on a real diff.

### Manual Testing Steps:

1. `git diff HEAD~1 | npm run review -w @ai-pr-reviewer/code-reviewer` → valid JSON and a cost log.
2. Empty stdin (`echo "" | npm run review ...`) → the "The diff on stdin is empty" error.
3. A diff that is too large → the character-limit error without calling the model.

## Performance Considerations

Without tools the agent runs a single step, so cost and latency are the same as today. `MAX_STEPS` caps cost in case tools are added in the future.

## Migration Notes

`src/review-schema.ts` goes away. Nothing outside the package imports it (there are no evals or gate yet), so we do not leave an alias.

## References

- Current implementation: `packages/code-reviewer/src/index.ts:1-50`, `packages/code-reviewer/src/review-schema.ts:1-64`
- ToolLoopAgent API: `node_modules/ai/docs/03-agents/02-building-agents.mdx`, `node_modules/ai/src/agent/tool-loop-agent-settings.ts`
- Contract and rules: `CLAUDE.md` (schema is the contract, pin major versions, track cost per run)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Extract the schema and prompts

#### Automated

- [x] 1.1 Typecheck passes: `npm run typecheck -w @ai-pr-reviewer/code-reviewer` — 4268ea9
- [x] 1.2 Formatting passes: `npm run format:check` — 4268ea9
- [x] 1.3 No references to `review-schema` remain in the repository: `git grep -n "review-schema" -- packages` returns nothing — 4268ea9

#### Manual

- [x] 1.4 `git diff HEAD~1 | npm run review -w @ai-pr-reviewer/code-reviewer` returns a valid JSON verdict and a cost log on stderr — 4268ea9

### Phase 2: Agent module on ToolLoopAgent

#### Automated

- [x] 2.1 Typecheck passes: `npm run typecheck -w @ai-pr-reviewer/code-reviewer` — 08412ae
- [x] 2.2 Formatting passes: `npm run format:check` — 08412ae

#### Manual

- [x] 2.3 Code review: `src/agent/*` does not read `process.env` or `process.stdin` — 08412ae

### Phase 3: CLI, public API and documentation

#### Automated

- [x] 3.1 Typecheck passes: `npm run typecheck -w @ai-pr-reviewer/code-reviewer`
- [x] 3.2 Formatting passes: `npm run format:check`
- [x] 3.3 Importing the library has no side effects: `npx tsx -e "import('./src/index.ts').then(m => console.log(Object.keys(m).sort().join(',')))"` run in `packages/code-reviewer` without `OPENROUTER_API_KEY` prints the exports without an error
- [x] 3.4 The CLI keeps the TTY/env error: `npm run review -w @ai-pr-reviewer/code-reviewer < /dev/null` without a key ends with the `OPENROUTER_API_KEY` message

#### Manual

- [ ] 3.5 `git diff HEAD~1 | npm run review -w @ai-pr-reviewer/code-reviewer` returns JSON with the same fields as before the change, and stderr shows a log with `model`, `inputTokens`, `outputTokens`, `costUsd`
- [ ] 3.6 A diff that is too large (>200,000 chars) is rejected before the model is called (no cost log)
