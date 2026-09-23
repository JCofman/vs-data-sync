---
type: wayfinder-ticket
label: wayfinder:research
status: open
parent: ../map.md
assignee: research/streaming-comparison
blocked_by: []
---

# Determine the bounded-memory comparison strategy

## Question

Which streaming, key-based comparison strategy can produce exact inserted, modified, and deleted rows for PostgreSQL-to-PostgreSQL and SQL-Server-to-SQL-Server runs without loading complete snapshots into memory? Cover ordering, composite keys, duplicate or null identities, large values, cancellation, progress, per-database consistency, and interoperability with a future Rust engine.
