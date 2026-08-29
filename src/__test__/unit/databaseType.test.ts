import assert from 'node:assert/strict';

import { resolvePatternDatabaseType } from '../../utils/database/databaseType';

suite('Database type boundary', () => {
    test('defaults legacy PostgreSQL configurations consistently', () => {
        assert.equal(resolvePatternDatabaseType({ source: {}, target: {} }), 'postgres');
    });

    test('accepts same-engine SQL Server synchronization', () => {
        assert.equal(
            resolvePatternDatabaseType({ source: { type: 'mssql' }, target: { type: 'mssql' } }),
            'mssql'
        );
    });

    test('rejects cross-engine synchronization', () => {
        assert.throws(
            () => resolvePatternDatabaseType({ source: { type: 'postgres' }, target: { type: 'mssql' } }),
            /Cross-engine synchronization is not supported/
        );
    });
});
