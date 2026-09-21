# ReconcileDB

ReconcileDB compares selected row data between same-engine databases and prepares a reviewable plan for reconciling the target with the source.

## Language

**Source**:
The database state considered authoritative for a comparison run.
_Avoid_: Modified, left side

**Target**:
The database state a reconciliation plan would change to match the source.
_Avoid_: Original, right side

**Comparison run**:
A local analysis of configured source and target tables that produces row changes for review.
_Avoid_: File diff, schema comparison

**Comparison scope**:
The tables, included columns, excluded columns, keys, and filters selected for one comparison run.
_Avoid_: Diff options

**Row identity**:
The configured or discovered primary-key values that correlate one source row with one target row.
_Avoid_: Line number, diff position

**Row change**:
An inserted, deleted, or modified row identified by its row identity. A modified row contains at least one exact unequal value among the included columns.
_Avoid_: Hunk, changed line

**Field change**:
The source and target values for one included column within a modified row.
_Avoid_: Line change

**Value equality**:
Exact, type-aware equality used to decide whether an included field changed. Text uses exact Unicode scalar equality; display formatting never changes comparison results.
_Avoid_: Visual equality, fuzzy match

**Review selection**:
The subset of row changes approved for a reconciliation plan.
_Avoid_: Patch selection

**Run fingerprint**:
A stable identity for the source state, target state, and comparison scope used by a comparison run. Review selections belong only to the fingerprint under which they were made.
_Avoid_: Cache key

**Value preview**:
A bounded, non-authoritative excerpt shown while browsing field changes. The exact source and target values remain available on demand.
_Avoid_: Truncated value
