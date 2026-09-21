---
type: wayfinder-ticket
label: wayfinder:grilling
status: open
parent: ../map.md
assignee:
blocked_by:
  - prototype-row-review.md
  - define-data-contract.md
  - prove-performance-envelope.md
  - decide-stale-run-safety.md
---

# Choose the staged migration and release plan

## Question

Given the validated interaction, renderer, data contract, safety model, and performance evidence, what sequence replaces the current full-file JSONL diff without regressing SQL generation or existing users? Decide compatibility boundaries, feature flags or fallback behavior, test gates, release slices, and the handoff boundary to the future Rust standalone application.

## Blocked by

- [Validate the row-first comparison interaction](./prototype-row-review.md)
- [Define the versioned comparison data contract](./define-data-contract.md)
- [Prove the comparison performance envelope](./prove-performance-envelope.md)
- [Decide stale-run and execution safety](./decide-stale-run-safety.md)
