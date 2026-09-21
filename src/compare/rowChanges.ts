import { Change, ParsedDiff, diffLines, diffWordsWithSpace } from 'diff';

import { TableDetail } from '../utils/utils';

export type RowChangeKind = 'insert' | 'update' | 'delete';

export type RowRecord = Record<string, unknown>;

export type FieldChange = {
    column: string;
    sourceValue?: unknown;
    targetValue?: unknown;
};

export type RowChange = {
    id: string;
    identity: string;
    kind: RowChangeKind;
    changedColumns: string[];
    fields: FieldChange[];
};

export type ValuePreview = {
    text: string;
    type: string;
    size: number;
    truncated: boolean;
};

export type TextDiffSegment = {
    kind: 'same' | 'insert' | 'delete';
    value: string;
};

type RowPair = {
    id: string;
    identity: string;
    source?: RowRecord;
    target?: RowRecord;
};

type JsonBuffer = { type: 'Buffer'; data: number[] };

const asJsonBuffer = (value: unknown): JsonBuffer | undefined => {
    if (
        value &&
        typeof value === 'object' &&
        (value as { type?: unknown }).type === 'Buffer' &&
        Array.isArray((value as { data?: unknown }).data)
    ) {
        return value as JsonBuffer;
    }
    return undefined;
};

const hasOwn = (value: RowRecord, key: string): boolean => Object.prototype.hasOwnProperty.call(value, key);

const stableValue = (value: unknown): unknown => {
    if (Array.isArray(value)) {
        return value.map(stableValue);
    }
    if (value && typeof value === 'object') {
        return Object.fromEntries(
            Object.entries(value as Record<string, unknown>)
                .sort(([left], [right]) => left.localeCompare(right))
                .map(([key, child]) => [key, stableValue(child)])
        );
    }
    return value;
};

export const valuesEqual = (source: unknown, target: unknown): boolean => {
    if (Object.is(source, target)) {
        return true;
    }
    if (typeof source !== typeof target || source === null || target === null) {
        return false;
    }
    if (typeof source !== 'object') {
        return false;
    }
    return JSON.stringify(stableValue(source)) === JSON.stringify(stableValue(target));
};

export const displayValue = (value: unknown): string => {
    if (value === null) {
        return 'NULL';
    }
    if (value === undefined) {
        return 'Not present';
    }
    if (typeof value === 'string') {
        return value;
    }
    const buffer = asJsonBuffer(value);
    if (buffer) {
        const previewBytes = buffer.data.slice(0, 256);
        const hex = previewBytes.map((byte) => byte.toString(16).padStart(2, '0')).join(' ');
        const suffix = previewBytes.length < buffer.data.length ? '\n…' : '';
        return `${hex}${suffix}`;
    }
    if (typeof value === 'object') {
        return JSON.stringify(value, null, 2);
    }
    return String(value);
};

const toTextDiffSegment = (change: Change): TextDiffSegment => ({
    kind: change.added ? 'insert' : change.removed ? 'delete' : 'same',
    value: change.value
});

export const createTextDiff = (targetValue: unknown, sourceValue: unknown): TextDiffSegment[] | undefined => {
    if (typeof targetValue !== 'string' || typeof sourceValue !== 'string') {
        return undefined;
    }

    const combinedLength = targetValue.length + sourceValue.length;
    const isMultiline = targetValue.includes('\n') || sourceValue.includes('\n');
    if ((!isMultiline && combinedLength > 20_000) || combinedLength > 2_000_000) {
        return undefined;
    }

    const changes = isMultiline
        ? diffLines(targetValue, sourceValue, { newlineIsToken: true })
        : diffWordsWithSpace(targetValue, sourceValue);
    return changes.map(toTextDiffSegment);
};

const valueType = (value: unknown): string => {
    if (value === null) {
        return 'null';
    }
    if (Array.isArray(value)) {
        return 'array';
    }
    if (asJsonBuffer(value)) {
        return 'binary';
    }
    return typeof value;
};

export const createValuePreview = (value: unknown, maxLength = 180): ValuePreview => {
    const fullText = displayValue(value);
    const truncated = fullText.length > maxLength;
    const buffer = asJsonBuffer(value);
    return {
        text: truncated ? `${fullText.slice(0, maxLength)}…` : fullText,
        type: valueType(value),
        size: buffer ? buffer.data.length : Buffer.byteLength(fullText, 'utf8'),
        truncated: truncated || Boolean(buffer && buffer.data.length > 256)
    };
};

export const createRowIdentity = (row: RowRecord, primaryKeys: string[]): string => {
    if (primaryKeys.length === 0) {
        throw new Error('A stable primary key is required to compare rows.');
    }
    const values = primaryKeys.map((primaryKey) => {
        if (!hasOwn(row, primaryKey) || row[primaryKey] === null || row[primaryKey] === undefined) {
            throw new Error(`Primary key '${primaryKey}' is missing or null.`);
        }
        return row[primaryKey];
    });
    return JSON.stringify(values.map(stableValue));
};

const createIdentityLabel = (row: RowRecord, primaryKeys: string[]): string =>
    primaryKeys.map((primaryKey) => `${primaryKey}=${createValuePreview(row[primaryKey], 80).text}`).join(', ');

const collectPairs = (patch: Pick<ParsedDiff, 'hunks'>, primaryKeys: string[]): Map<string, RowPair> => {
    const pairs = new Map<string, RowPair>();
    for (const hunk of patch.hunks ?? []) {
        for (const line of hunk.lines ?? []) {
            const operation = line[0];
            if (operation !== '+' && operation !== '-') {
                continue;
            }

            const row = JSON.parse(line.slice(1)) as RowRecord;
            const id = createRowIdentity(row, primaryKeys);
            const pair: RowPair = pairs.get(id) ?? { id, identity: createIdentityLabel(row, primaryKeys) };
            const side = operation === '+' ? 'source' : 'target';
            if (pair[side]) {
                throw new Error(`Duplicate ${side} row identity '${pair.identity}'.`);
            }
            pair[side] = row;
            pairs.set(id, pair);
        }
    }
    return pairs;
};

const getColumns = (pair: RowPair, configuredColumns: string[]): string[] => {
    if (configuredColumns.length > 0) {
        return configuredColumns;
    }
    return Array.from(new Set([...Object.keys(pair.target ?? {}), ...Object.keys(pair.source ?? {})]));
};

export const parseRowChanges = (
    patch: Pick<ParsedDiff, 'hunks'>,
    tableDetail: Pick<TableDetail, 'primaryKeys' | 'columns'>
): RowChange[] => {
    const pairs = collectPairs(patch, tableDetail.primaryKeys);
    return Array.from(pairs.values()).flatMap((pair): RowChange[] => {
        const columns = getColumns(pair, tableDetail.columns);
        const kind: RowChangeKind = pair.source ? (pair.target ? 'update' : 'insert') : 'delete';
        const fields = columns.flatMap((column): FieldChange[] => {
            const sourceValue = pair.source?.[column];
            const targetValue = pair.target?.[column];
            if (kind === 'update' && valuesEqual(sourceValue, targetValue)) {
                return [];
            }
            return [{ column, sourceValue, targetValue }];
        });

        if (kind === 'update' && fields.length === 0) {
            return [];
        }

        return [
            {
                id: pair.id,
                identity: pair.identity,
                kind,
                changedColumns: fields.map(({ column }) => column),
                fields
            }
        ];
    });
};
