import * as mssql from 'mssql';

import { DatabaseConfig } from './databaseProvider';

export interface MssqlConnection {
    pool: mssql.ConnectionPool;
}

const integratedAuthenticationError = (): Error => {
    return new Error(
        'SQL Server integrated authentication is not supported yet. Use a SQL Server username and password for both databases.'
    );
};

export const usesIntegratedAuthentication = (connectionString: string): boolean => {
    const parsed = mssql.ConnectionPool.parseConnectionString(connectionString);
    return !parsed.user || !parsed.password;
};

export const connectMssql = async (config: DatabaseConfig): Promise<MssqlConnection> => {
    if (config.connectionString) {
        if (usesIntegratedAuthentication(config.connectionString)) {
            throw integratedAuthenticationError();
        }

        return {
            pool: await new mssql.ConnectionPool(config.connectionString).connect()
        };
    }

    return {
        pool: await new mssql.ConnectionPool({
            server: config.host,
            port: config.port,
            user: config.user,
            password: config.password,
            database: config.database,
            domain: config.domain,
            options: {
                trustServerCertificate: config.mssqlOptions?.trustServerCertificate ?? true,
                encrypt: config.mssqlOptions?.encrypt ?? true
            }
        }).connect()
    };
};
