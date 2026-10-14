---
date: 2026-10-14T12:51:58+02:00
researcher: Claude (Opus 5.5) for Qba
git_commit: 824574b255971481a68386fa2f0f7957ef43dcf7
branch: feature/add-codereviewer-module
repository: jakub84/ai-pr-reviewer
topic: "CI/CD AI code review: GHA workflow + composite action around packages/code-reviewer, per requirements.md"
tags: [research, ci, github-actions, composite-action, code-reviewer]
status: complete
last_updated: 2026-10-14
last_updated_by: Claude (Opus 5.5)
---

# Research: CI/CD AI code review workflow

**Date**: 2026-10-14T12:51:58+02:00
**Researcher**: Claude (Opus 5.5) for Qba
**Git Commit**: 824574b255971481a68386fa2f0f7957ef43dcf7
**Branch**: feature/add-codereviewer-module
**Repository**: jakub84/ai-pr-reviewer

## Research Question

What does the codebase (and GitHub Actions itself) give us, and what constrains us, when implementing
`context/changes/ci-cd-codereview/requirements.md`: a GHA workflow on every new PR, the review in a
composite action, PR title / description / diff as input, six 1-10 criteria, a PR comment with the summary,
`ai-cr:passed` / `ai-cr:failed` labels, and an on-demand retry via the `ai-cr:review` label.

## Summary

- The reviewer is ready to be wrapped as a CI step without changes to its contract: `cli.ts` reads the diff
  from stdin, writes the verdict JSON to stdout and `{ model, inputTokens, outputTokens, costUsd }` to stderr
  (`packages/code-reviewer/src/cli.ts:24-32`). It exits 0 whatever the verdict, so the gate must parse
  `verdict` itself. Hard caps already exist: 3000 changed lines, 4096 output tokens, 5 steps, $0.50 per run
  (`src/agent/reviewer.ts:10-13`, `src/agent/cost.ts:6`).
- **Gap 1 — PR title/description are not inputs yet.** `reviewDiff(reviewer, diff)` and
  `buildReviewPrompt(diff)` take only the diff (`src/agent/reviewer.ts:45`, `src/prompts/review-request.ts:3`).
  Adding them is a prompt change, not a schema change.
- **Gap 2 — the target branch is `main`, not `master`.** Requirements and lesson 02 say `master`; the repo,
  its CI (`.github/workflows/ci.yml:5,7`) and AGENTS.md use `main`.
- **Gap 3 — `npm run review` pollutes stdout.** `npm run` prints its `> script` banner to stdout; the package
  already works around it with `"start": "npm run review --silent"` (`packages/code-reviewer/package.json`).
  CI must use the silent form (or call `tsx` directly) or the JSON parse breaks.
- **Gap 4 — passing the diff.** The lesson's `echo "value=$(git diff ...)" >> $GITHUB_OUTPUT` (lesson 02:261)
  breaks on multiline values; GitHub docs say arbitrary values should go through a file. Pipe the diff from a
  file in `$RUNNER_TEMP` into the CLI.
- **Gap 5 — lockfiles eat the line budget.** On this branch `package-lock.json` is 663 of 1507 changed lines
  (44%); the initial commit is 3508 changed lines (over the 3000 cap), 1031 without the lockfile. Note that
  the pathspec `:(exclude)**/package-lock.json` alone did **not** exclude the root lockfile in this repo's git;
  `:(exclude)package-lock.json` is also needed.
- Fork PRs get no secrets and a read-only `GITHUB_TOKEN` under `pull_request`; the safe pattern is plain
  `pull_request` + a same-repo guard, never `pull_request_target` with a PR checkout.
- Label/comment writes need `pull-requests: write` (and `issues: write` as a safeguard). Label changes made with
  `GITHUB_TOKEN` do not trigger new runs, so removing `ai-cr:review` / adding `ai-cr:passed` cannot loop.

## Detailed Findings

### The reviewer package as a CI step

- CLI contract: `OPENROUTER_API_KEY` required (`src/cli.ts:7-10`), stdin must be piped (`:11-13`),
  `REVIEW_MODEL` optional (`:16`), cost JSON on stderr (`:24-31`), pretty verdict JSON on stdout (`:32`).
- Failure paths throw at top level, which makes Node exit non-zero with the stack on stderr: missing key
  (`src/cli.ts:9`), empty diff (`src/agent/reviewer.ts:47`), diff over `MAX_DIFF_LINES` (`:50-51`), and any
  model/API error from `reviewer.generate` (`:54`). In these cases nothing is written to stdout. The workflow
  needs an explicit policy for these (no label? a "skipped" comment? red job?).
- `verdict` is `z.enum(['pass','fail'])` and `summary` is "Markdown summary, ready to post as a PR comment"
  (`src/schemas/review.ts:51-54`) — the comment body and the label choice come straight from the schema.
  The six scores are numbers 1-10 (`src/schemas/review.ts:9-50`); a comment can render them as a table.
- `costUsd` is `undefined` (not `0`) when OpenRouter reports no cost (`src/agent/cost.ts:7-22`), so a
  cost line in the comment/log must handle a missing value.
- One local run logged 19,080 input tokens, 1,392 output tokens, $0.05208 (`packages/code-reviewer/cost.log`,
  gitignored, single sample) — order of magnitude per review on this repo.
- The criteria in `requirements.md` match the schema descriptions (`src/schemas/review.ts:9-50`) in meaning;
  wording differs slightly (e.g. requirements "security and safety" vs schema description "Security",
  system prompt "security" at `src/prompts/system.ts:6`). No schema change is required by the requirements.
- The package has no `test`/`lint`/`build` scripts, only `typecheck` (`packages/code-reviewer/package.json`);
  root CI runs workspace scripts with `--if-present`, so CI covers it by typecheck only.

### Existing CI conventions (`.github/workflows/ci.yml`)

- Triggers `pull_request` and `push` on `main` (`:3-8`), `permissions: contents: read` (`:10-11`),
  concurrency `ci-${{ github.ref }}` with cancel-in-progress (`:13-15`).
- Actions pinned to SHAs: `actions/checkout@3d3c42e…` v7.0.1 (`:22`), `actions/setup-node@949feb2…`
  v7.1.0 (`:25`), Node from `.nvmrc` (= `22`), npm cache, `npm ci` at the root.
- No `.github/actions/` directory exists yet.

### GitHub Actions mechanics (primary sources)

- **Triggers**: default `pull_request` types are `opened`, `synchronize`, `reopened`; `labeled` and
  `ready_for_review` must be listed explicitly. Every added label fires a `labeled` run, so gate the job with
  `github.event.action != 'labeled' || github.event.label.name == 'ai-cr:review'`. Workflows do not run on a
  PR with merge conflicts. Drafts are not excluded by default (add `draft == false` if wanted).
  ([events](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows))
- **Forks**: "secrets are not passed to the runner when a workflow is triggered from a forked repository" and
  the `GITHUB_TOKEN` is read-only there. Guard: `github.event.pull_request.head.repo.full_name == github.repository`.
  `pull_request_target` + checking out PR code is the documented "pwn request" anti-pattern.
  ([secure use](https://docs.github.com/en/actions/reference/security/secure-use))
- **Permissions**: workflow-syntax docs tie comments to `issues: write` and PR labels to `pull-requests: write`;
  the fine-grained table accepts either for label add/remove/create and comment create/edit. Recommended:
  `contents: read`, `pull-requests: write`, `issues: write`.
  ([workflow syntax](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax),
  [permissions table](https://docs.github.com/en/rest/authentication/permissions-required-for-fine-grained-personal-access-tokens))
- **Composite action**: `shell` is required on every `run` step; inputs come from the `inputs` context (no
  `INPUT_*` env); `github.action_path` / `$GITHUB_ACTION_PATH` point at the action dir; composite steps may
  `uses:` other actions (checkout/setup-node can live inside or outside the action); outputs map to step outputs.
  ([metadata syntax](https://docs.github.com/en/actions/reference/workflows-and-actions/metadata-syntax))
- **Outputs and size**: multiline outputs need the `name<<DELIM` form, and for arbitrary values docs say
  "Write the value to a file instead". Job outputs max 1 MB; `run` scripts max 21,000 chars; no documented
  limit for `with:`/`env:`, but a single env string is bounded by Linux `ARG_MAX` (~128 KB) — so the diff
  goes through a file, not `with:`. The branch diff measured here is 75,715 bytes.
  ([workflow commands](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-commands))
- **Script injection**: `${{ github.event.pull_request.title }}` / `.body` interpolated into `run:` is a shell
  injection vector; pass them via `env:` and read `"$PR_TITLE"`.
  ([script injections](https://docs.github.com/en/actions/concepts/security/script-injections))
- **Diff on the runner**: checkout is depth 1 by default; on `pull_request` HEAD is the merge commit
  `refs/pull/N/merge`. Two workable recipes (inference, not a documented recipe): (a) default merge checkout with
  `fetch-depth: 2` and `git diff HEAD^1 HEAD`; (b) check out `pull_request.head.sha` with `fetch-depth: 0` and
  `git diff origin/main...HEAD`. Exclude magic `:(exclude)` applies to the whole result set when no positive
  pathspec is given ([gitglossary](https://git-scm.com/docs/gitglossary)).
- **gh CLI** (needs `GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}` per step): `gh pr comment --edit-last
  --create-if-none` edits the last comment *of github-actions[bot]* — would clobber any other bot comment;
  a hidden `<!-- ai-cr -->` marker + `gh api` PATCH is more robust. `gh pr edit --add-label/--remove-label`;
  `gh label create --force --color` creates or updates a label idempotently.
  ([gh pr comment](https://cli.github.com/manual/gh_pr_comment), [gh label create](https://cli.github.com/manual/gh_label_create))
- **No recursion**: events caused by `GITHUB_TOKEN` (other than `workflow_dispatch`/`repository_dispatch`) do not
  create workflow runs, so label edits by the workflow cannot re-trigger it.
- **Concurrency**: documented pattern `${{ github.workflow }}-${{ github.head_ref || github.run_id }}` +
  `cancel-in-progress`. Caveat: a non-matching `labeled` run in the same group could cancel a real review unless
  the job-level `if:` filters it or the label name is part of the group.

## Code References

- `packages/code-reviewer/src/cli.ts:7-32` — env/TTY checks, stdout verdict, stderr cost
- `packages/code-reviewer/src/agent/reviewer.ts:10-13` — `MAX_DIFF_LINES` 3000, `MAX_OUTPUT_TOKENS` 4096, `MAX_STEPS` 5
- `packages/code-reviewer/src/agent/reviewer.ts:45-63` — `reviewDiff`: empty/oversize rejection, `generate`, cost sum
- `packages/code-reviewer/src/agent/cost.ts:6,26-28` — `MAX_COST_USD` 0.5, `isCostAtLeast` stop condition
- `packages/code-reviewer/src/prompts/review-request.ts:3-5` — `buildReviewPrompt(diff)`, the place to add title/description
- `packages/code-reviewer/src/prompts/system.ts:3-8` — system prompt naming the six criteria
- `packages/code-reviewer/src/schemas/review.ts:8-55` — the contract (six scores, `verdict`, `summary`)
- `packages/code-reviewer/package.json` — `start` = `npm run review --silent`; no test/lint/build scripts
- `.github/workflows/ci.yml:3-41` — existing CI conventions (main, SHA pins, `.nvmrc`, `npm ci`)

## Architecture Insights

- Keep side effects (comment, labels) in the composite action/workflow, not in the library: the package is
  explicitly side-effect free and config-injected (`src/index.ts:1`, README "Library API"), and evals will call
  the same API. Lesson 02:507,648 suggests a `postPrComment` agent tool as an alternative; that would give the
  CLI a `GH_TOKEN` dependency and conflict with the side-effect-free contract.
- The gate reads `verdict` from stdout JSON (e.g. `jq -r .verdict`) — the stdout/stderr split was designed for
  this (`src/cli.ts:22`, tool-loop-agent `plan-brief.md:54`).
- A local action at `.github/actions/<name>/` referenced as `uses: ./.github/actions/<name>` is the lesson's
  recommended start (lesson 02:96-98); it requires the repo to be checked out before the `uses:` step.

## Historical Context (from prior changes)

- `context/changes/tool-loop-agent/plan.md:32`, `plan-brief.md:41` — CI, the verdict gate and unit tests were
  explicitly deferred to this later change. Supported.
- `context/changes/tool-loop-agent/plan.md:24` — schema is the single contract for CLI, CI gate and evals. Supported.
- `context/changes/tool-loop-agent/plan.md:54,202` — "diff over 200,000 chars throws". **Contradicted (stale)**:
  commit 824574b replaced the char cap with `MAX_DIFF_LINES` = 3000 changed lines (`src/agent/reviewer.ts:10,50`).
  The part "throws before the model is called" still holds.
- `context/changes/tool-loop-agent/reviews/impl-review.md:27-43` (F1, skipped) — "no hard USD cap per run".
  **Contradicted (stale)**: commit 824574b added `MAX_COST_USD` + `isCostAtLeast` (`src/agent/cost.ts:6,26`).
  The CLAUDE.md rule "hard budget cap before the agent runs unattended" is therefore met per run; there is
  no per-PR or monthly cap (unchanged).
- Lesson 02 (`lessons/02 -code-review-…md`, local course material): `:46-76` minimal workflow, `:100-146`
  composite action anatomy, `:169` SHA pinning, `:252-271` passing title/body/diff (with the broken single-line
  `$GITHUB_OUTPUT` echo at `:261`), `:663-683` "always post a comment, even on a clean pass" (suggestion).

## Related Research

- None — first research document in `context/changes/`.

## Open Questions

Product decisions for `/10x-plan` (no missing evidence):

1. Triggers: only new PRs (`opened`/`reopened`/`ready_for_review`) + retry label, or also every push
   (`synchronize`) — cost vs freshness. Drafts in or out?
2. PR description: include it (the requirements mark a cost tradeoff) and with what length cap?
3. Gate: does `fail` only set the red label, or also fail the job (a required status check can then block merge)?
4. Error/oversize policy: what the PR shows when the CLI throws (diff over 3000 lines, API error, missing key).
5. Comment: one sticky comment updated in place (marker) or a new comment per run; render scores as a table?
6. Diff scope: which paths to exclude (lockfiles certainly; on this branch the three `context/changes/tool-loop-agent/*.md`
   files account for 419 of the 844 non-lock changed lines per `git diff --stat main...HEAD` — review them or skip them?).
7. Where the action's logic lives: bash + `gh`/`jq` in `action.yml` vs a small TS script in the package that
   formats the comment (testable).
8. Install scope: root `npm ci` (installs the web app too) vs a workspace-scoped install — not measured here.
