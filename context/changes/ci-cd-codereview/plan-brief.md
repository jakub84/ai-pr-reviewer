# CI/CD AI Code Review — Plan Brief

> Full plan: `context/changes/ci-cd-codereview/plan.md`
> Research: `context/changes/ci-cd-codereview/research.md`

## What & Why

The code-review agent from `packages/code-reviewer` runs on pull requests to `main`, not only on a laptop. Every new PR
gets a comment with six 1-10 scores, a verdict and a summary, plus a green `ai-cr:passed` or red `ai-cr:failed` label.
The team sees the AI review where it already works, and the review can be re-run on demand.

## Starting Point

The reviewer CLI takes a diff on stdin, prints the verdict JSON on stdout and the cost on stderr, and already enforces
per-run caps (3000 changed lines, $0.50). It knows nothing about the PR's title or description, and the repo has no
review workflow or composite action. The existing `ci.yml` only runs format, lint, typecheck, test and build.

## Desired End State

Opening a non-draft PR to `main` from this repo posts a review comment and sets one verdict label within minutes.
Adding `ai-cr:review` re-runs the review, posts a new comment and removes the retry label. When the review cannot run
(oversized diff, API error, missing key, only excluded files changed), the PR gets a "review skipped" comment with
the reason. The job never blocks the merge.

## Key Decisions Made

| Decision        | Choice                                                                             | Why (1 sentence)                                                                 | Source   |
| --------------- | ---------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | -------- |
| Target branch   | `main` (requirements say `master`)                                                 | The repo and its CI use `main`.                                                  | Research |
| Triggers        | `opened`, `reopened`, `ready_for_review` + `labeled` with `ai-cr:review`; no drafts | Matches "every new PR" at ~$0.05 per review; later pushes are reviewed on demand. | Plan     |
| Fork PRs        | Job skipped                                                                        | Forks get no secrets and a read-only token.                                      | Research |
| PR input        | Title + description capped at 4000 chars, treated as untrusted                     | Gives the agent the change's intent while bounding cost and injection.           | Plan     |
| Gate on `fail`  | Label only; job stays green                                                        | Informational first; a merge gate can come later.                                | Plan     |
| Review errors   | "Review skipped" comment, no verdict label, green job                              | Nothing fails silently, and large PRs don't block work.                          | Plan     |
| Comment         | A new comment on every run, with a score table, summary, model and cost            | Keeps the history of verdicts visible in the PR.                                 | Plan     |
| Diff scope      | Exclude `package-lock.json` (root and nested) and `context/**`                     | Reviews code, not lockfiles or plans; this branch drops from 1507 to 413 lines.  | Plan     |
| Logic placement | Pure TS report builder in the package with unit tests; the action is thin glue     | Testable and typed against the schema contract.                                  | Plan     |
| Schema          | Unchanged                                                                          | Hard rule: the schema is the contract.                                           | Research |

## Scope

**In scope:**

- PR title/description in the prompt, `PR_TITLE` / `PR_BODY` env in the CLI, vitest in the package
- `buildCiReport` + `ci-report` script (comment Markdown + outcome)
- `.github/actions/ai-code-review/action.yml`, `.github/workflows/ai-code-review.yml`, README "CI" section

**Out of scope:**

- Reviews on every push, draft and fork PRs, failing the job, required checks or branch protection
- One sticky comment, inline comments, agent tools with GitHub access
- Schema changes, promptfoo in CI, per-PR or monthly budgets, business or architecture criteria
- Moving the action to a separate repo or the Marketplace

## Architecture / Approach

Workflow (triggers, permissions, the `if` guard, per-PR concurrency) → checkout (`fetch-depth: 2`) → local composite
action. The action runs setup-node + `npm ci`, writes the diff to a file (`git diff HEAD^1 HEAD` minus the exclusions)
and runs `npm run review --silent` with captured stdout, stderr and exit code. `ci-report` then turns that output into
`comment.md` and an outcome (`passed`, `failed` or `error`), and `gh` sets the labels and posts the comment. PR text
reaches the CLI only via `env:`.

## Phases at a Glance

| Phase                              | What it delivers                                             | Key risk                                                   |
| ---------------------------------- | ------------------------------------------------------------ | ---------------------------------------------------------- |
| 1. PR title/description in prompt  | `buildReviewPrompt`/`reviewDiff` with PR context, vitest     | Prompt injection through the PR description                |
| 2. CI report builder               | `buildCiReport`, `ci-report` script, unit tests              | Comment drifting from the schema (mitigated by typed labels) |
| 3. Composite action and workflow   | `action.yml`, `ai-code-review.yml`, README                   | npm banner or stray output on stdout breaking the JSON parse |

**Prerequisites:** the `OPENROUTER_API_KEY` repository secret; Node 22; the branch pushed to GitHub to test on a real PR.
**Estimated effort:** ~1-2 sessions across 3 phases.

## Open Risks & Assumptions

- `npm run review --silent -w …` is assumed to print nothing on stdout but the JSON; Phase 1 checks this locally.
- `git diff HEAD^1 HEAD` on the merge commit is assumed to equal the PR's effect against the current base (inferred,
  not a documented recipe); a wrong diff shows up in the Phase 3 manual checks.
- A green job on `fail` means the label is the only signal until a merge gate is added.

## Success Criteria (Summary)

- A new PR to `main` gets a scored review comment and exactly one verdict label, with a green job.
- `ai-cr:review` re-runs the review on demand and removes itself.
- Review failures are explained in the PR, never silent, and never post a misleading verdict label.
