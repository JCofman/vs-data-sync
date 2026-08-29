import * as mssql from 'mssql';

import { DatabaseProvider, DatabaseConfig } from './databaseProvider';
import { TableConfig } from '../utils';
import { QueryResultRow } from '../types';
import { validateIdentifier } from './validateIdentifier';
import { connectMssql, MssqlDriver } from './mssqlConnection';

export class MssqlProvider implements DatabaseProvider {
    private pool: mssql.ConnectionPool | null = null;
    private transaction: mssql.Transaction | null = null;
    private config: DatabaseConfig;
    private driver: MssqlDriver = mssql;

    constructor(config: DatabaseConfig) {
        this.config = config;
    }

    async connect(): Promise<void> {
        const connection = await connectMssql(this.config);
        this.pool = connection.pool;
        this.driver = connection.driver;
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
        this.transaction = new this.driver.Transaction(this.pool);
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
            : new this.driver.Request(this.pool);

        const result = await request.query(sql);
        for (const row of result.recordset) {
            yield row;
        }
    }

    async getPrimaryKeys(table: TableConfig): Promise<string[]> {
        if (!this.pool) {
            throw new Error('Not connected');
        }
        const tableSchema = table.schema || 'dbo'; // Default schema in SQL Server

        // Validate identifiers to prevent injection
        validateIdentifier(table.name);
        validateIdentifier(tableSchema);

        const sql = `
        SELECT column_name
        FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
        WHERE OBJECTPROPERTY(OBJECT_ID(constraint_name), 'IsPrimaryKey') = 1
        AND table_name = @tableName
        AND table_schema = @tableSchema`;
        const request = this.transaction
            ? new this.driver.Request(this.transaction)
            : new this.driver.Request(this.pool);

        request.input('tableName', table.name);
        request.input('tableSchema', tableSchema);

        const result = await request.query(sql);
        return result.recordset.map((row) => row.column_name);
    }

    async getColumnNames(table: TableConfig): Promise<string[]> {
        if (!this.pool) {
            throw new Error('Not connected');
        }
        const tableSchema = table.schema || 'dbo';
        validateIdentifier(table.name);
        validateIdentifier(tableSchema);

        const sql = `
        SELECT column_name
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE table_name = @tableName
        AND table_schema = @tableSchema
        ORDER BY ordinal_position`;

        const request = this.transaction
            ? new this.driver.Request(this.transaction)
            : new this.driver.Request(this.pool);

        request.input('tableName', table.name);
        request.input('tableSchema', tableSchema);

        const result = await request.query(sql);
        return result.recordset.map((row) => row.column_name);
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
