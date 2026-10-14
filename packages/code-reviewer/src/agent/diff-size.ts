// agent/diff-size.ts — counts the changed lines of a unified diff for the per-run size cap.

// Counts added and removed lines (+/-), skipping file headers and context lines.
// File headers (`--- a/x`, `+++ b/x`) only appear before the first `@@` hunk of each file,
// so tracking hunk state keeps a removed line like `-- comment` from being taken for a header.
export function countChangedLines(diff: string): number {
  let changed = 0
  let inHunk = false
  for (const line of diff.split('\n')) {
    if (line.startsWith('diff --git ')) {
      inHunk = false
    } else if (line.startsWith('@@')) {
      inHunk = true
    } else if (inHunk && (line.startsWith('+') || line.startsWith('-'))) {
      changed++
    }
  }
  return changed
}
