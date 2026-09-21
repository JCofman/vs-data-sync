import assert from 'node:assert/strict';

import {
    createRowIdentity,
    createValuePreview,
    parseRowChanges,
    valuesEqual
} from '../../compare/rowChanges';

suite('Row comparison model', () => {
    test('groups diff lines into inserts, updates, and deletes by primary key', () => {
        const changes = parseRowChanges(
            {
                hunks: [
                    {
                        oldStart: 1,
                        oldLines: 2,
                        newStart: 1,
                        newLines: 2,
                        lines: [
                            '-{"id":1,"name":"before","notes":"same"}',
                            '+{"id":1,"name":"after","notes":"same"}',
                            '-{"id":2,"name":"removed","notes":null}',
                            '+{"id":3,"name":"added","notes":null}'
                        ]
                    }
                ]
            },
            { primaryKeys: ['id'], columns: ['id', 'name', 'notes'] }
        );

        assert.deepEqual(
            changes.map(({ id, identity, kind, changedColumns }) => ({ id, identity, kind, changedColumns })),
            [
                { id: '[1]', identity: 'id=1', kind: 'update', changedColumns: ['name'] },
                {
                    id: '[2]',
                    identity: 'id=2',
                    kind: 'delete',
                    changedColumns: ['id', 'name', 'notes']
                },
                {
                    id: '[3]',
                    identity: 'id=3',
                    kind: 'insert',
                    changedColumns: ['id', 'name', 'notes']
                }
            ]
        );
        assert.equal(changes[0].fields[0].targetValue, 'before');
        assert.equal(changes[0].fields[0].sourceValue, 'after');
    });

    test('uses collision-safe composite identities', () => {
        assert.notEqual(
            createRowIdentity({ first: 1, second: '2_3' }, ['first', 'second']),
            createRowIdentity({ first: '1_2', second: 3 }, ['first', 'second'])
        );
    });

    test('rejects rows without a stable identity', () => {
        assert.throws(() => createRowIdentity({ id: null }, ['id']), /missing or null/);
        assert.throws(() => createRowIdentity({ id: 1 }, []), /stable primary key/);
    });

    test('compares typed values exactly while ignoring object key order', () => {
        assert.equal(valuesEqual('1', 1), false);
        assert.equal(valuesEqual('é', 'é'), false);
        assert.equal(valuesEqual({ first: 1, second: 2 }, { second: 2, first: 1 }), true);
    });

    test('creates bounded previews without losing exact size metadata', () => {
        const preview = createValuePreview('abcdefghij', 5);
        assert.deepEqual(preview, { text: 'abcde…', type: 'string', size: 10, truncated: true });
    });

    test('keeps binary values compact and reports their byte size', () => {
        const preview = createValuePreview({ type: 'Buffer', data: Array.from({ length: 300 }, (_, i) => i % 256) });
        assert.equal(preview.type, 'binary');
        assert.equal(preview.size, 300);
        assert.equal(preview.truncated, true);
        assert.equal(preview.text.includes('"data"'), false);
    });
});
