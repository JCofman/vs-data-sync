---
type: wayfinder-ticket
label: wayfinder:prototype
status: open
parent: ../map.md
assignee:
blocked_by:
  - evaluate-pierre-integration.md
  - evaluate-streaming-comparison.md
  - evaluate-run-store.md
  - prototype-row-review.md
  - define-data-contract.md
---

# Prove the comparison performance envelope

## Question

Can an end-to-end candidate meet the agreed envelope of 100,000 changed rows per table, occasional 1 MB values, progressive useful output within one second, smooth review scrolling, and memory bounded by the active window? Build a disposable benchmark harness, compare it with the current full-file JSONL diff, and identify explicit pass, fallback, and stop criteria.

## Blocked by

- [Determine whether Pierre fits ReconcileDB value diffs](./evaluate-pierre-integration.md)
- [Determine the bounded-memory comparison strategy](./evaluate-streaming-comparison.md)
- [Evaluate local comparison run-store candidates](./evaluate-run-store.md)
- [Validate the row-first comparison interaction](./prototype-row-review.md)
- [Define the versioned comparison data contract](./define-data-contract.md)
