import { DatabaseProvider, DatabaseConfig } from './databaseProvider';
import { PostgresProvider } from './postgresProvider';
import { MssqlProvider } from './mssqlProvider';

export function createDatabaseProvider(config: DatabaseConfig): DatabaseProvider {
    switch (config.type) {
        case 'postgres':
            return new PostgresProvider(config);
        case 'mssql':
            return new MssqlProvider(config);
        default:
            throw new Error(`Unsupported database type: ${config.type}`);
    }
}
