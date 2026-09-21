---
type: wayfinder-ticket
label: wayfinder:research
status: open
parent: ../map.md
assignee: research/run-store
blocked_by: []
---

# Evaluate local comparison run-store candidates

## Question

Which versioned local storage approach best supports progressive writes, indexed filtering, persisted review selections, immutable history, lazy loading of occasional 1 MB values, JSON export, crash recovery, and a shared TypeScript/Rust contract at 100,000 changed rows per table? Compare realistic candidates and define decision criteria rather than choosing by familiarity.
