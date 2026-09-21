import assert from 'node:assert/strict';

import { ComparisonReviewModel } from '../../compare/comparisonReviewModel';
import { RowChange } from '../../compare/rowChanges';

suite('Comparison review model', () => {
    const changes: RowChange[] = [
        {
            id: '[1]',
            identity: 'id=1',
            kind: 'update',
            changedColumns: ['title', 'body'],
            fields: [
                { column: 'title', sourceValue: 'new title', targetValue: 'old title' },
                { column: 'body', sourceValue: 'new body', targetValue: 'old body' }
            ]
        },
        {
            id: '[2]',
            identity: 'id=2',
            kind: 'insert',
            changedColumns: ['id', 'title'],
            fields: [
                { column: 'id', sourceValue: 2 },
                { column: 'title', sourceValue: 'added' }
            ]
        },
        {
            id: '[3]',
            identity: 'id=3',
            kind: 'delete',
            changedColumns: ['id', 'title'],
            fields: [
                { column: 'id', targetValue: 3 },
                { column: 'title', targetValue: 'removed' }
            ]
        }
    ];

    test('counts each change kind', () => {
        assert.deepEqual(new ComparisonReviewModel(changes).getStats(), {
            total: 3,
            insert: 1,
            update: 1,
            delete: 1
        });
    });

    test('filters and pages summaries without returning full values', () => {
        const page = new ComparisonReviewModel(changes).getPage({ filter: 'update', query: 'body' });
        assert.deepEqual(page, {
            offset: 0,
            limit: 50,
            total: 1,
            rows: [
                {
                    id: '[1]',
                    identity: 'id=1',
                    kind: 'update',
                    changedColumns: ['title', 'body']
                }
            ]
        });
        assert.equal('source' in page.rows[0], false);
    });

    test('returns exact values and an inline text diff only for selected rows', () => {
        const detail = new ComparisonReviewModel(changes).getDetail('[1]');
        assert.equal(detail?.fields[0].target.value, 'old title');
        assert.equal(detail?.fields[0].source.value, 'new title');
        assert.ok(detail?.fields[0].textDiff?.some((segment) => segment.kind === 'delete'));
        assert.ok(detail?.fields[0].textDiff?.some((segment) => segment.kind === 'insert'));
    });

    test('caps page size to bound webview messages', () => {
        const page = new ComparisonReviewModel(changes).getPage({ limit: 10_000 });
        assert.equal(page.limit, 200);
    });
});
