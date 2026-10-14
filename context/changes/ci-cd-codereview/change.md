---
change_id: ci-cd-codereview
title: Ci cd codereview
status: implementing
created: 2026-10-14
updated: 2026-10-14
archived_at: null
---

## Notes

<!-- Free-form notes for this change: links, ad-hoc context, decisions that don't belong in research/frame/plan. -->

Phase 3 addendum (agreed 2026-10-14): in `packages/code-reviewer/src/cli.ts` change
`process.env.REVIEW_MODEL ?? DEFAULT_MODEL` to `||`, because the composite action's optional `model`
input passes `REVIEW_MODEL=""` when unset and `??` would send an empty model id to OpenRouter.

Phase 3 addendum 2 (agreed 2026-10-14): the workflow passes the optional repo variable `vars.REVIEW_MODEL`
to the action's `model` input; when it is unset, the CLI falls back to `DEFAULT_MODEL`. It is a variable, not
a secret, because GitHub masks secret values in logs and the model id showed up as `***` in the cost line.
