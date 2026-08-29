import assert from 'node:assert/strict';

import { connectMssql, usesIntegratedAuthentication } from '../../utils/database/mssqlConnection';

suite('SQL Server connection selection', () => {
    test('uses the portable driver for username and password authentication', () => {
        assert.equal(
            usesIntegratedAuthentication('Server=localhost;Database=test;User Id=sa;Password=secret'),
            false
        );
    });

    test('detects integrated authentication connection strings', () => {
        assert.equal(
            usesIntegratedAuthentication('Server=localhost;Database=test;Trusted_Connection=Yes'),
            true
        );
    });

    test('rejects integrated authentication with an actionable portable error', async () => {
        await assert.rejects(
            connectMssql({
                type: 'mssql',
                host: 'localhost',
                port: 1433,
                database: 'test',
                user: '',
                password: '',
                connectionString: 'Server=localhost;Database=test;Trusted_Connection=Yes'
            }),
            /Integrated authentication is not supported yet.*username and password/i
        );
    });
});
