import assert from 'node:assert/strict';

import { formatDatabaseInfo } from '../../utils/database/databaseInfo';

suite('Database connection display', () => {
    test('never exposes credentials from a connection string', () => {
        const info = formatDatabaseInfo({
            type: 'mssql',
            host: '',
            port: 1433,
            database: '',
            user: '',
            password: '',
            connectionString: 'Server=localhost;Database=test;User Id=sa;Password=super-secret'
        });

        assert.equal(info, '{mssql}://<connection-string>');
        assert.equal(info.includes('super-secret'), false);
    });
});
