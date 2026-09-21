import {
    RowChange,
    RowChangeKind,
    TextDiffSegment,
    ValuePreview,
    createTextDiff,
    createValuePreview,
    displayValue
} from './rowChanges';

export type ReviewFilter = RowChangeKind | 'all';

export type RowChangeSummary = {
    id: string;
    identity: string;
    kind: RowChangeKind;
    changedColumns: string[];
};

export type FieldChangeDetail = {
    column: string;
    source: ValuePreview & { value: string };
    target: ValuePreview & { value: string };
    textDiff?: TextDiffSegment[];
};

export type RowChangeDetail = RowChangeSummary & {
    fields: FieldChangeDetail[];
};

export type ReviewStats = {
    total: number;
    insert: number;
    update: number;
    delete: number;
};

export type ReviewPage = {
    offset: number;
    limit: number;
    total: number;
    rows: RowChangeSummary[];
};

const normalizeSearch = (value?: string): string => value?.trim().toLocaleLowerCase() ?? '';

const toSummary = ({ id, identity, kind, changedColumns }: RowChange): RowChangeSummary => ({
    id,
    identity,
    kind,
    changedColumns
});

const toDetailedValue = (value: unknown): ValuePreview & { value: string } => ({
    ...createValuePreview(value),
    value: displayValue(value)
});

export class ComparisonReviewModel {
    private readonly byId: Map<string, RowChange>;
    private readonly byKind: Record<RowChangeKind, RowChange[]>;

    constructor(private readonly changes: RowChange[]) {
        this.byId = new Map(changes.map((change) => [change.id, change]));
        this.byKind = { insert: [], update: [], delete: [] };
        changes.forEach((change) => this.byKind[change.kind].push(change));
    }

    getStats(): ReviewStats {
        const stats: ReviewStats = { total: this.changes.length, insert: 0, update: 0, delete: 0 };
        for (const change of this.changes) {
            stats[change.kind]++;
        }
        return stats;
    }

    getPage(options: { offset?: number; limit?: number; filter?: ReviewFilter; query?: string }): ReviewPage {
        const offset = Math.max(0, options.offset ?? 0);
        const limit = Math.min(200, Math.max(1, options.limit ?? 50));
        const filter = options.filter ?? 'all';
        const query = normalizeSearch(options.query);
        const candidates = filter === 'all' ? this.changes : this.byKind[filter];
        const filtered = candidates.filter((change) => {
            if (!query) {
                return true;
            }
            return (
                change.identity.toLocaleLowerCase().includes(query) ||
                change.changedColumns.some((column) => column.toLocaleLowerCase().includes(query))
            );
        });

        return {
            offset,
            limit,
            total: filtered.length,
            rows: filtered.slice(offset, offset + limit).map(toSummary)
        };
    }

    getDetail(id: string): RowChangeDetail | undefined {
        const change = this.byId.get(id);
        if (!change) {
            return undefined;
        }
        return {
            ...toSummary(change),
            fields: change.fields.map((field) => ({
                column: field.column,
                source: toDetailedValue(field.sourceValue),
                target: toDetailedValue(field.targetValue),
                textDiff: createTextDiff(field.targetValue, field.sourceValue)
            }))
        };
    }
}
