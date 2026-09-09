import assert from 'node:assert/strict';

import { wrapIdentityInsertPlan } from '../../utils/identityInsert';
import { TableConfig, TableDetail } from '../../utils/utils';

suite('SQL Server identity insert plans', () => {
    const table: TableConfig = { schema: 'dbo', name: 'orders' };
    const insert = 'INSERT INTO [dbo].[orders] ([id], [label]) VALUES (42, \'test\');';
    const update = 'UPDATE [dbo].[orders] SET [label] = \'updated\' WHERE [id] = 42;';
    const tableDetail: TableDetail = {
        columns: ['id', 'label'],
        primaryKeys: ['id'],
        identityColumns: ['id'],
        insert: 1,
        update: 1,
        delete: 0
    };

    test('wraps MSSQL inserts once per table', () => {
        assert.deepEqual(
            wrapIdentityInsertPlan({
                table,
                tableDetail,
                dbType: 'mssql',
                allStatements: [insert, update],
                insertStatements: [insert]
            }),
            {
                allStatements: [
                    'SET IDENTITY_INSERT [dbo].[orders] ON;',
                    insert,
                    update,
                    'SET IDENTITY_INSERT [dbo].[orders] OFF;'
                ],
                insertStatements: [
                    'SET IDENTITY_INSERT [dbo].[orders] ON;',
                    insert,
                    'SET IDENTITY_INSERT [dbo].[orders] OFF;'
                ]
            }
        );
    });

    test('leaves PostgreSQL plans unchanged', () => {
        const statements = { allStatements: [insert], insertStatements: [insert] };

        assert.deepEqual(
            wrapIdentityInsertPlan({ table, tableDetail, dbType: 'postgres', ...statements }),
            statements
        );
    });

    test('leaves MSSQL plans unchanged when the identity column is not selected', () => {
        const statements = { allStatements: [insert], insertStatements: [insert] };

        assert.deepEqual(
            wrapIdentityInsertPlan({
                table,
                tableDetail: { ...tableDetail, columns: ['label'] },
                dbType: 'mssql',
                ...statements
            }),
            statements
        );
    });
});
