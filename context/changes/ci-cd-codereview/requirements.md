## Overall concept

- GHA workflow run for every new pull request to master
- composite action for the review itself so that main workflow is easy to reason about

## Input parameters

- pull request title
- pull request description (?? cost tradeoff)
- git diff

## Code Review Criteria

Each criterion is scored on a 1-10 scale (1 = worst, 10 = best).

1) **implementation correctness**: does the change do what the PR claims, including in edge cases and when something fails?
   - 1: the logic is wrong, misses obvious edge cases or silently breaks existing behavior.
   - 10: correct on the happy path, in edge cases and in error handling, with no regressions.
2) **idiomaticity**: does the code follow the conventions of the language, framework and this repository?
   - 1: fights the idioms of the stack and ignores the patterns already used in the repository.
   - 10: reads exactly like the well-written code around it.
3) **complexity**: is the design as simple as the problem allows, without extra layers or tangled control flow?
   - 1: over-engineered or tangled; accidental complexity hides what the code is for.
   - 10: the simplest design that fully solves the problem.
4) **test / risk coverage**: are the risky parts of the change covered by tests that would actually catch a regression?
   - 1: risky logic has no tests, or the tests don't check anything meaningful.
   - 10: the riskiest paths are tested on purpose and well; trivial code isn't over-tested.
5) **documentation**: can a reader understand why the code is the way it is without reverse-engineering it?
   - 1: no comments or docs where they are needed; the intent has to be worked out from the code.
   - 10: just enough documentation to explain the "why", without restating the obvious.
6) **security and safety**: does the change avoid vulnerabilities, leaked secrets and unsafe handling of external input?
   - 1: introduces a vulnerability, leaks secrets or trusts external input without checking it.
   - 10: input is validated, secrets are handled correctly, and no new attack surface is added.

## Parked for later

- business alignment (require broader context)
- architectural fit (require broader context)

## Expected side-effects

- PR comment with summary
- labels: `ai-cr:failed` (red) OR `ai-cr:passed` (green)

## Expected behavior

- on-demand retry when label `ai-cr:review` is added