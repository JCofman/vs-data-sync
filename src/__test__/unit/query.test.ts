import assert from 'node:assert/strict';

import { makeDeleteQuery, makeInsertQuery, makeUpdateQuery } from '../../utils/query';
import { TableConfig, TableDetail } from '../../utils/utils';

suite('Database-specific query literals', () => {
    const table: TableConfig = { name: 'gen_timerjobs' };
    const tableDetail: TableDetail = {
        columns: ['id', 'active', 'deleted'],
        primaryKeys: ['id'],
        insert: 0,
        update: 0,
        delete: 0
    };

    test('uses bit literals for SQL Server booleans', () => {
        const values = { id: 137, active: false, deleted: true };

        assert.equal(
            makeInsertQuery(table, tableDetail, values, 'mssql'),
            'INSERT INTO [gen_timerjobs] ([id], [active], [deleted]) VALUES (137, 0, 1);'
        );
        assert.equal(
            makeUpdateQuery(table, tableDetail, values, 'mssql'),
            'UPDATE [gen_timerjobs] SET [active] = 0, [deleted] = 1 WHERE [id] = 137;'
        );
    });

    test('keeps PostgreSQL boolean literals', () => {
        const values = { id: 137, active: false, deleted: true };

        assert.equal(
            makeUpdateQuery(table, tableDetail, values, 'postgres'),
            'UPDATE "gen_timerjobs" SET "active" = false, "deleted" = true WHERE "id" = 137;'
        );
    });

    test('uses bit literals for boolean SQL Server keys', () => {
        const booleanKeyDetail: TableDetail = {
            ...tableDetail,
            columns: ['active'],
            primaryKeys: ['active']
        };

        assert.equal(
            makeDeleteQuery(table, booleanKeyDetail, { active: false }, 'mssql'),
            'DELETE FROM [gen_timerjobs] WHERE [active] = 0;'
        );
    });
});
