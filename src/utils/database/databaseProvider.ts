import { TableConfig } from '../utils';
import { QueryResultRow } from '../types';
import { PoolConfig } from 'pg';

export interface DatabaseConfig extends PoolConfig {
    type: 'postgres' | 'mssql';
    host: string;
    port: number;
    user: string;
    password: string;
    database: string;
    connectionString?: string;
    domain?: string;
    mssqlOptions?: {
        trustServerCertificate?: boolean;
        encrypt?: boolean;
    };
}

export interface DatabaseProvider {
    connect(): Promise<void>;
    disconnect(): Promise<void>;
    beginTransaction(): Promise<void>;
    commitTransaction(): Promise<void>;
    rollbackTransaction(): Promise<void>;
    query(sql: string): Promise<{ rows: QueryResultRow[]; rowCount: number }>;
    queryStream(sql: string): AsyncIterable<QueryResultRow>;
    getPrimaryKeys(table: TableConfig): Promise<string[]>;
    getColumnNames(table: TableConfig): Promise<string[]>;
    escapeIdentifier(identifier: string): string;
    getDatabaseInfo(): string;
}
