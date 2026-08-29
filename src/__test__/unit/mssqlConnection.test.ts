import assert from 'node:assert/strict';

import {
    connectMssql,
    createIntegratedAuthenticationConfig,
    usesIntegratedAuthentication
} from '../../utils/database/mssqlConnection';

suite('SQL Server connection selection', () => {
    test('uses the portable driver for username and password authentication', () => {
        assert.equal(
            usesIntegratedAuthentication('Server=localhost;Database=test;User Id=sa;Password=secret'),
            false
        );
    });

    test('uses the native driver for integrated authentication', () => {
        assert.equal(
            usesIntegratedAuthentication('Server=localhost;Database=test;Trusted_Connection=Yes'),
            true
        );
    });

    test('preserves the ODBC 18 connection string for the native driver', () => {
        const connectionString =
            'Driver={ODBC Driver 18 for SQL Server};Server=localhost;Database=test;Trusted_Connection=Yes;TrustServerCertificate=Yes;';
        const config = createIntegratedAuthenticationConfig({
            type: 'mssql',
            host: 'localhost',
            port: 1433,
            database: 'test',
            user: '',
            password: '',
            connectionString
        });

        assert.equal(config.connectionString, connectionString);
        assert.equal(config.driver, 'msnodesqlv8');
        assert.equal(config.options.trustedConnection, true);
    });

    test('returns an actionable error outside Windows x64', async function () {
        if (process.platform === 'win32' && process.arch === 'x64') {
            this.skip();
        }

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
            /Windows x64 extension package, msnodesqlv8, and Microsoft ODBC Driver 18/
        );
    });
});
