---
type: wayfinder-ticket
label: wayfinder:grilling
status: open
parent: ../map.md
assignee:
blocked_by:
  - evaluate-streaming-comparison.md
  - evaluate-run-store.md
---

# Define the versioned comparison data contract

## Question

What is the smallest language-neutral contract between database comparison, local run storage, the row-review UI, review selection, and SQL generation? Decide stable identities, typed values, summaries, lazy payload references, progress events, fingerprints, compatibility rules, and which component owns each invariant.

## Blocked by

- [Determine the bounded-memory comparison strategy](./evaluate-streaming-comparison.md)
- [Evaluate local comparison run-store candidates](./evaluate-run-store.md)
