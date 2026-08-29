import * as mssql from 'mssql';

import { DatabaseConfig } from './databaseProvider';

export type MssqlDriver = typeof mssql;

export interface MssqlConnection {
    driver: MssqlDriver;
    pool: mssql.ConnectionPool;
}

const integratedAuthenticationError = (cause?: unknown): Error => {
    const detail = cause instanceof Error ? ` ${cause.message}` : '';
    return new Error(
        'SQL Server integrated authentication requires the ReconcileDB Windows x64 extension package, msnodesqlv8, and Microsoft ODBC Driver 18 for SQL Server.' +
            detail
    );
};

const loadNativeDriver = (): MssqlDriver => {
    if (process.platform !== 'win32' || process.arch !== 'x64') {
        throw integratedAuthenticationError();
    }

    try {
        // Bundled by esbuild, while its native `msnodesqlv8` dependency stays external.
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        return require('mssql/msnodesqlv8') as MssqlDriver;
    } catch (error) {
        throw integratedAuthenticationError(error);
    }
};

export const usesIntegratedAuthentication = (connectionString: string): boolean => {
    const parsed = mssql.ConnectionPool.parseConnectionString(connectionString);
    return !parsed.user || !parsed.password;
};

export const connectMssql = async (config: DatabaseConfig): Promise<MssqlConnection> => {
    if (config.connectionString) {
        const parsed = mssql.ConnectionPool.parseConnectionString(config.connectionString);

        if (usesIntegratedAuthentication(config.connectionString)) {
            const driver = loadNativeDriver();
            parsed.driver = 'msnodesqlv8';
            parsed.options = {
                ...parsed.options,
                trustServerCertificate: config.mssqlOptions?.trustServerCertificate ?? true,
                trustedConnection: true
            };

            return {
                driver,
                pool: await new driver.ConnectionPool(parsed).connect()
            };
        }

        return {
            driver: mssql,
            pool: await new mssql.ConnectionPool(config.connectionString).connect()
        };
    }

    return {
        driver: mssql,
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
