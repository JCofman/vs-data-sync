---
type: wayfinder-map
label: wayfinder:map
status: open
---

# Redesign the row comparison review experience

## Destination

Reach an implementation-ready design for a fast, database-aware row comparison view, backed by a validated Pierre integration prototype, measurable performance gates, and a staged replacement path for the current JSONL/VS Code diff.

## Notes

- Domain: row-data comparison only; PostgreSQL to PostgreSQL and SQL Server to SQL Server.
- Comparison direction is source to target. Bidirectional merging is not part of this effort.
- Use the project language in [CONTEXT.md](../../../CONTEXT.md); exact typed equality remains authoritative and display formatting is presentation-only.
- The review is row-first: table summary, virtualized changed-row list, and resizable field detail.
- Pierre is the preferred candidate for on-demand value-level diffs, not the owner of row identity, filtering, review state, or migration semantics.
- The UI must support persisted row approval, bulk selection, undo/redo, progressive results, keyboard navigation, theme accessibility, run history, and explicit stale-run handling.
- Comparison scope is chosen visually and can be saved as JSON. Exclusion and sensitivity heuristics are suggestions only.
- Target envelope: 100,000 changed rows per table, occasional 1 MB values, useful progressive output within one second, smooth scrolling, and memory bounded by the active window rather than the full result.
- Every Wayfinder session should consult the `wayfinder`, `grilling`, and `domain-modeling` skills; use `research` or `prototype` when the ticket type requires it.
- GitHub Issues are disabled, so this map uses local Markdown tickets and body-declared blocking relationships.

## Decisions so far

<!-- Empty at charting time. Closed ticket resolutions are indexed here. -->

## Not yet specified

- The exact visual density, responsive behavior, and field-diff controls may split into new decisions after the row-first prototype is reviewed.
- The precise stale-target revalidation mechanism and conflict display depend on the comparison algorithm and data contract findings.
- Storage migration and compatibility questions may emerge once a run-store format is selected.
- Benchmark fixtures, thresholds, and fallback behavior will sharpen after the renderer, engine, and storage investigations.

## Out of scope

- Production implementation during this Wayfinder map; the map ends at an implementation-ready design.
- Schema comparison or schema migration.
- PostgreSQL-to-SQL Server or other cross-engine synchronization.
- Cloud storage, accounts, collaboration, or telemetry.
- Bidirectional merge or conflict resolution that edits both databases.
- Editing source or target field values inside the comparison view.
- Automatically excluding or masking columns solely because of a heuristic.

