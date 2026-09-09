import * as mssql from 'mssql';

import { DatabaseProvider, DatabaseConfig } from './databaseProvider';
import { TableConfig } from '../utils';
import { QueryResultRow } from '../types';
import { validateIdentifier } from './validateIdentifier';
import { connectMssql } from './mssqlConnection';
import { formatDatabaseInfo } from './databaseInfo';

export const queryMssqlIdentityColumns = async (request: mssql.Request, table: TableConfig): Promise<string[]> => {
    const tableSchema = table.schema || 'dbo';
    validateIdentifier(table.name);
    validateIdentifier(tableSchema);

    const sql = `
    SELECT identity_column.name AS columnName
    FROM sys.identity_columns AS identity_column
    INNER JOIN sys.tables AS table_info
        ON table_info.object_id = identity_column.object_id
    INNER JOIN sys.schemas AS schema_info
        ON schema_info.schema_id = table_info.schema_id
    WHERE table_info.name = @tableName
    AND schema_info.name = @tableSchema
    ORDER BY identity_column.column_id`;

    request.input('tableName', table.name);
    request.input('tableSchema', tableSchema);

    const result = await request.query(sql);
    return result.recordset.map((row) => row.columnName);
};

export async function* streamMssqlRequest(
    request: mssql.Request,
    sql: string
): AsyncIterable<QueryResultRow> {
    const rows: QueryResultRow[] = [];
    let complete = false;
    let failure: unknown;
    let wakeConsumer: (() => void) | undefined;

    const wake = () => {
        wakeConsumer?.();
        wakeConsumer = undefined;
    };
    const onRow = (row: QueryResultRow) => {
        rows.push(row);
        request.pause();
        wake();
    };
    const onError = (error: Error) => {
        failure = error;
        complete = true;
        wake();
    };
    const onDone = () => {
        complete = true;
        wake();
    };

    request.stream = true;
    request.on('row', onRow);
    request.on('error', onError);
    request.on('done', onDone);
    void request.query(sql).catch(onError);

    try {
        while (!complete || rows.length > 0) {
            if (failure) {
                throw failure;
            }
            if (rows.length === 0) {
                await new Promise<void>((resolve) => {
                    wakeConsumer = resolve;
                });
                continue;
            }

            yield rows.shift() as QueryResultRow;
            if (!complete) {
                request.resume();
            }
        }

        if (failure) {
            throw failure;
        }
    } finally {
        request.removeListener('row', onRow);
        request.removeListener('error', onError);
        request.removeListener('done', onDone);
        if (!complete) {
            request.cancel();
        }
    }
}

export class MssqlProvider implements DatabaseProvider {
    private pool: mssql.ConnectionPool | null = null;
    private transaction: mssql.Transaction | null = null;
    private config: DatabaseConfig;

    constructor(config: DatabaseConfig) {
        this.config = config;
    }

    async connect(): Promise<void> {
        const connection = await connectMssql(this.config);
        this.pool = connection.pool;
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
        this.transaction = new mssql.Transaction(this.pool);
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
            ? new mssql.Request(this.transaction)
            : new mssql.Request(this.pool);

        const result = await request.query(sql);
        return {
            rows: result.recordset,
            rowCount: result.rowsAffected.reduce((sum, count) => sum + count, 0)
        };
    }

    async *queryStream(sql: string): AsyncIterable<QueryResultRow> {
        if (!this.pool) throw new Error('Not connected');
        const request = this.transaction
            ? new mssql.Request(this.transaction)
            : new mssql.Request(this.pool);

        for await (const row of streamMssqlRequest(request, sql)) {
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
            ? new mssql.Request(this.transaction)
            : new mssql.Request(this.pool);

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
            ? new mssql.Request(this.transaction)
            : new mssql.Request(this.pool);

        request.input('tableName', table.name);
        request.input('tableSchema', tableSchema);

        const result = await request.query(sql);
        return result.recordset.map((row) => row.column_name);
    }

    async getIdentityColumns(table: TableConfig): Promise<string[]> {
        if (!this.pool) {
            throw new Error('Not connected');
        }
        const request = this.transaction
            ? new mssql.Request(this.transaction)
            : new mssql.Request(this.pool);
        return await queryMssqlIdentityColumns(request, table);
    }

    escapeIdentifier(identifier: string): string {
        return `[${identifier}]`;
    }

    getDatabaseInfo(): string {
        return formatDatabaseInfo(this.config);
    }
}
