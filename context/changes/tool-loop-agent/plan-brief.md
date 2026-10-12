# Modular ToolLoopAgent Reviewer — Plan Brief

> Full plan: `context/changes/tool-loop-agent/plan.md`

## What & Why

We turn the single-file reviewer into a modular agent built on `ToolLoopAgent` from AI SDK 7. The output schema and the prompts get their own modules, and the agent module exports a reusable API (`createReviewer` + `reviewDiff`). That way future promptfoo evals call exactly the same code as the CLI and the CI gate.

## Starting Point

`src/index.ts` is a script with a top-level `await`: env/TTY, stdin, limits, `generateText` with `Output.object`, cost on stderr. `src/review-schema.ts` combines the system prompt, the zod schema, the JSON Schema and the `Review` type. Importing anything from `index.ts` runs the CLI right away.

## Desired End State

`git diff | npm run review` works as it does today (same JSON and cost log). The package can be imported without side effects, and a reviewer can be created with any model or prompt. The hard cost caps apply to every call, not just the CLI.

## Key Decisions Made

| Decision         | Choice                                                               | Why (1 sentence)                                                            |
| ---------------- | -------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Agent tools      | No tools, empty `tools` + explicit `stopWhen`                        | Same cost and behavior as today, a clean baseline for future evals.         |
| Export API       | `createReviewer(config)` + `reviewDiff(reviewer, diff)`              | Evals can swap the model, and the CLI and promptfoo call a single function. |
| Guardrails       | Diff limit, `maxOutputTokens`, `MAX_STEPS`, cost in the agent module | Every call (CLI, CI, evals) has the same hard budget.                       |
| Directory layout | `schemas/`, `prompts/`, `agent/`, `index.ts`, `cli.ts`               | Schemas and prompts are separate and easy to extend.                        |
| Tests            | None, typecheck + smoke test only                                    | Small scope; verdict quality will be measured by evals.                     |
| Schema contract  | Unchanged (fields, `verdict`, criteria)                              | Hard rule from CLAUDE.md: the schema is the contract.                       |
| Prompt language  | Prompts and schema descriptions translated to English (Phase 1)      | User request; the `summary` in PR comments is now written in English.       |

## Scope

**In scope:**

- Move the schema to `src/schemas/review.ts` and the prompts to `src/prompts/`
- `src/agent/model.ts` (OpenRouter) and `src/agent/reviewer.ts` (`ToolLoopAgent`, `reviewDiff`, limits, cost)
- `src/cli.ts` as the new entry point, `src/index.ts` as a barrel, `exports` in `package.json`, README

**Out of scope:**

- promptfoo and eval environment setup
- Tools for the agent
- Unit tests, changes to CI and the verdict gate
- Changes to the criteria or field names in the schema

## Architecture / Approach

`cli.ts` reads env and stdin, then calls `createOpenRouterModel` → `createReviewer` (`ToolLoopAgent`: `SYSTEM_PROMPT`, `Output.object(REVIEW_SCHEMA)`, `maxOutputTokens`, `stopWhen`) → `reviewDiff`. `reviewDiff` validates the diff before calling the model and returns `{ review, modelId, usage, costUsd }`, with the cost summed over steps. A future promptfoo provider will use the same three functions.

## Phases at a Glance

| Phase                                | What it delivers                                        | Key risk                                               |
| ------------------------------------ | ------------------------------------------------------- | ------------------------------------------------------ |
| 1. Extract the schema and prompts    | `schemas/` + `prompts/`, `review-schema.ts` removed     | Accidental change to the schema contract               |
| 2. Agent module on ToolLoopAgent     | `createReviewer`, `reviewDiff`, `createOpenRouterModel` | Cost taken from the last step only instead of the sum  |
| 3. CLI, public API and documentation | `cli.ts`, barrel `index.ts`, `exports`, README          | A stdout/stderr format change breaking the future gate |

**Prerequisites:** `OPENROUTER_API_KEY` in `packages/code-reviewer/.env` for smoke tests; Node 22+.
**Estimated effort:** ~1 session, 3 small phases.

## Open Risks & Assumptions

- We assume a `ToolLoopAgent` with `Output.object` and no tools finishes in a single step, just like `generateText`. A smoke test verifies this (cost and tokens comparable to today).
- Nothing outside the package imports `review-schema.ts` yet, so we remove it without an alias.

## Success Criteria (Summary)

- The CLI produces the same JSON verdict and cost log as before the change.
- `import { createReviewer, reviewDiff } from '@ai-pr-reviewer/code-reviewer'` works without side effects and without an API key.
- The diff, token and step limits apply to every `reviewDiff` call.
