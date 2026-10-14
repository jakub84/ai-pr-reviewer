<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Modular ToolLoopAgent Reviewer

- **Plan**: context/changes/tool-loop-agent/plan.md
- **Scope**: Full plan
- **Reviewed phases**: 1, 2, 3
- **Date**: 2026-10-13
- **Verdict**: APPROVED
- **Findings**: 0 critical, 1 warning, 3 observations

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | PASS    |
| Scope Discipline    | PASS    |
| Safety & Quality    | WARNING |
| Architecture        | PASS    |
| Pattern Consistency | PASS    |
| Success Criteria    | PASS    |

Evidence: `git diff --name-status 6f33e16..HEAD` lists exactly the files named in the plan (no EXTRA, no MISSING). Re-run on 2026-10-13: typecheck PASS, format:check PASS, `review-schema` grep empty, library import without a key prints 11 runtime exports, CLI without a key fails with the `OPENROUTER_API_KEY` message. Manual rows 1.4, 2.3, 3.5 and 3.6 were confirmed by the user in the session. `reviewDiff` was also exercised offline with `MockLanguageModelV4` (cost read, both diff guards fire before the model call).

## Findings

### F1 — No hard USD budget cap on a run

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: packages/code-reviewer/src/agent/reviewer.ts:35
- **Detail**: CLAUDE.md requires "a hard budget cap before the agent runs unattended", and the M5L2 lesson (lines 476-485) notes that AI SDK 7 has no `maxCost`, so a custom `StopCondition` is needed. The plan capped cost only indirectly (`MAX_DIFF_CHARS`, `MAX_OUTPUT_TOKENS`, `isStepCount(5)`). With no tools this is one bounded step, so the risk is low today, but it grows when tools are added or the agent runs in CI (M5L3). This is a gap in the plan, not drift in the implementation.
- **Fix A ⭐ Recommended**: Add a `MAX_COST_USD` constant and a custom `StopCondition` that sums `steps[].providerMetadata.openrouter.usage.cost`, combined as `stopWhen: [isStepCount(MAX_STEPS), costAtLeast(MAX_COST_USD)]`, as a separate small change before M5L3.
  - Strength: Matches the lesson's prescribed approach and satisfies the CLAUDE.md rule; it reuses the cost-reading logic that already exists in `reviewDiff`.
  - Tradeoff: A stop condition only checks between steps, so it cannot cut a single in-flight step; `maxOutputTokens` still bounds that.
  - Confidence: MED — `StopCondition` is exported by ai@7.0.137, but its callback shape has not been verified yet.
  - Blind spot: The cost is only available when OpenRouter reports it; with another provider the condition would never trigger.
- **Fix B**: Record it as a deferred follow-up and leave the code as is until tools are added.
  - Strength: Keeps this change closed; one step plus the token cap already bounds today's cost.
  - Tradeoff: The CLAUDE.md rule stays unmet when CI integration starts.
  - Confidence: HIGH — the current cost profile was measured in the smoke test.
  - Blind spot: Easy to forget at M5L3 time.
- **Decision**: SKIPPED

### F2 — System prompt translated despite "content unchanged" contract

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: packages/code-reviewer/src/prompts/system.ts:3
- **Detail**: The Phase 1 contract said `SYSTEM_PROMPT` (content unchanged). The prompt, the user prompt and the schema descriptions were translated to English at the user's request. This is documented in a Phase 1 note, in the brief and in commit 4268ea9. Field names, `verdict` and the scale are unchanged; `summary` is now written in English.
- **Fix**: None needed. Treat the English prompt as the baseline for future evals.
- **Decision**: ACCEPTED — translation requested by the user; documented in the plan, the brief and commit 4268ea9

### F3 — Library error message still mentions stdin

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: packages/code-reviewer/src/agent/reviewer.ts:44
- **Detail**: `reviewDiff` throws `The diff on stdin is empty`, but the library never reads stdin. An eval caller passing an empty test case would get a misleading message. It was kept on purpose so that CLI messages stay identical.
- **Fix**: Change the message to `The diff is empty` (the CLI output changes slightly).
- **Decision**: FIXED

### F4 — Cost log reports the requested model id, not the served one

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: packages/code-reviewer/src/cli.ts:24
- **Detail**: The stderr `model` field uses `REVIEW_MODEL ?? DEFAULT_MODEL`, which preserves the old output. `reviewDiff` also returns `modelId` from `response.modelId`, the model OpenRouter actually served, which can differ under routing or fallback. For cost tracking the served id is the more accurate one.
- **Fix**: Log `modelId` from `ReviewResult` instead of the requested id.
- **Decision**: FIXED
