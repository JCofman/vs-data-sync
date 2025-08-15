import * as mssqlV8 from 'mssql/msnodesqlv8';
import * as mssql from 'mssql';

import { DatabaseProvider, DatabaseConfig } from './databaseProvider';
import { TableConfig } from '../utils';
import { QueryResultRow } from '../types';

export class MssqlProvider implements DatabaseProvider {
    private pool: mssql.ConnectionPool | null = null;
    private transaction: mssql.Transaction | null = null;
    private config: DatabaseConfig;
    private driver: typeof mssql | typeof mssqlV8 = mssql;

    constructor(config: DatabaseConfig) {
        this.config = config;
    }

    async connect(): Promise<void> {
        if (this.config.connectionString) {
            const parsed = mssql.ConnectionPool.parseConnectionString(this.config.connectionString);
            const hasUser = !!parsed.user;
            const hasPassword = !!parsed.password;
            // Windows Auth is only supported with 'msnodesqlv8' driver
            if (!hasUser || !hasPassword) {
                parsed.driver = 'msnodesqlv8';
                parsed.options = {
                    ...parsed.options,
                    trustServerCertificate: true,
                    trustedConnection: true
                };
                this.pool = await new mssqlV8.ConnectionPool(parsed).connect();
                this.driver = mssqlV8;
            } else {
                this.pool = await new mssql.ConnectionPool(this.config.connectionString).connect();
                this.driver = mssql;
            }
        } else {
            this.pool = await new mssql.ConnectionPool({
                server: this.config.host,
                port: this.config.port,
                user: this.config.user,
                password: this.config.password,
                database: this.config.database,
                domain: this.config.domain,
                options: {
                    trustServerCertificate: this.config.mssqlOptions?.trustServerCertificate ?? true,
                    encrypt: this.config.mssqlOptions?.encrypt ?? true
                }
            }).connect();
            this.driver = mssql;
        }
    }

    async disconnect(): Promise<void> {
        if (this.transaction) {
            await this.transaction.rollback();
            this.transaction = null;
        }
        if (this.pool) {
            await this.pool.close();
            this.pool = null;
        }
    }

    async beginTransaction(): Promise<void> {
        if (!this.pool) throw new Error('Not connected');
        this.transaction = new this.driver.Transaction(this.pool); //
        await this.transaction.begin();
    }

    async commitTransaction(): Promise<void> {
        if (!this.transaction) throw new Error('No active transaction');
        await this.transaction.commit();
        this.transaction = null;
    }

    async rollbackTransaction(): Promise<void> {
        if (!this.transaction) throw new Error('No active transaction');
        await this.transaction.rollback();
        this.transaction = null;
    }

    async query(sql: string): Promise<{ rows: QueryResultRow[]; rowCount: number }> {
        if (!this.pool) throw new Error('Not connected');
        const request = this.transaction
            ? new this.driver.Request(this.transaction)
            : new this.driver.Request(this.pool);

        const result = await request.query(sql);
        return {
            rows: result.recordset,
            rowCount: result.rowsAffected.reduce((sum, count) => sum + count, 0)
        };
    }

    async *queryStream(sql: string): AsyncIterable<QueryResultRow> {
        if (!this.pool) throw new Error('Not connected');
        const request = this.transaction
            ? new this.driver.Request(this.transaction)
            : new this.driver.Request(this.pool); //

        const result = await request.query(sql);
        for (const row of result.recordset) {
            yield row;
        }
    }

    async getPrimaryKeys(table: TableConfig): Promise<string[]> {
        if (!this.pool) throw new Error('Not connected');
        const tableSchema = table.schema || 'dbo'; // Default schema in SQL Server
        const sql = `
      SELECT column_name
      FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
      WHERE OBJECTPROPERTY(OBJECT_ID(constraint_name), 'IsPrimaryKey') = 1
      AND table_name = '${table.name}'
      AND table_schema = '${tableSchema}'`;

        const result = await this.query(sql);
        return result.rows.map((row) => row.column_name);
    }

    async getColumnNames(table: TableConfig): Promise<string[]> {
        if (!this.pool) throw new Error('Not connected');
        const tableSchema = table.schema || 'dbo'; // Default schema in SQL Server
        const sql = `
      SELECT column_name
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE table_name = '${table.name}'
      AND table_schema = '${tableSchema}'
      ORDER BY ordinal_position`;

        const result = await this.query(sql);
        return result.rows.map((row) => row.column_name);
    }

    escapeIdentifier(identifier: string): string {
        return `[${identifier}]`;
    }

    getDatabaseInfo(): string {
        if (this.config.connectionString) {
            return `mssql://${this.config.connectionString}`;
        }
        const { host, port, database, user } = this.config;
        return `mssql://${user}@${host}:${port}/${database}`;
    }
}
