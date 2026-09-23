---
type: wayfinder-ticket
label: wayfinder:grilling
status: open
parent: ../map.md
assignee:
blocked_by:
  - evaluate-streaming-comparison.md
  - define-data-contract.md
---

# Decide stale-run and execution safety

## Question

What exact run states, fingerprints, revalidation checks, and user-visible transitions ensure that preserved review selections are never executed silently against changed target rows? Decide when execution is blocked, when row-level revalidation is sufficient, what constitutes a conflict, and how the view explains recovery.

## Blocked by

- [Determine the bounded-memory comparison strategy](./evaluate-streaming-comparison.md)
- [Define the versioned comparison data contract](./define-data-contract.md)
