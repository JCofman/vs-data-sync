import pg from 'pg';
import { QueryIterablePool } from 'pg-iterator';
import { DatabaseProvider, DatabaseConfig } from './database/databaseProvider';
import { TableConfig } from './utils';
import { QueryResultRow } from './types';

export class PostgresProvider implements DatabaseProvider {
    private pool: pg.Pool | null = null;
    private client: pg.PoolClient | null = null;
    private config: DatabaseConfig;

    constructor(config: DatabaseConfig) {
        this.config = config;
    }

    async connect(): Promise<void> {
        this.pool = new pg.Pool({
            host: this.config.host,
            port: this.config.port,
            user: this.config.user,
            password: this.config.password,
            database: this.config.database,
            connectionString: this.config.connectionString
        });
        this.client = await this.pool.connect();
    }

    async disconnect(): Promise<void> {
        if (this.client) {
            this.client.release();
            this.client = null;
        }
        if (this.pool) {
            await this.pool.end();
            this.pool = null;
        }
    }

    async beginTransaction(): Promise<void> {
        if (!this.client) throw new Error('Not connected');
        await this.client.query('BEGIN');
    }

    async commitTransaction(): Promise<void> {
        if (!this.client) throw new Error('Not connected');
        await this.client.query('COMMIT');
    }

    async rollbackTransaction(): Promise<void> {
        if (!this.client) throw new Error('Not connected');
        await this.client.query('ROLLBACK');
    }

    async query(sql: string): Promise<{ rows: QueryResultRow[]; rowCount: number }> {
        if (!this.client) throw new Error('Not connected');
        const result = await this.client.query(sql);
        return {
            rows: result.rows,
            rowCount: result.rowCount || 0
        };
    }

    async *queryStream(sql: string): AsyncIterable<QueryResultRow> {
        if (!this.pool) throw new Error('Not connected');
        const qs = new QueryIterablePool(this.pool);
        try {
            const rows = qs.query(sql);
            for await (const row of rows) {
                yield row as QueryResultRow;
            }
        } finally {
            qs.release();
        }
    }

    async getPrimaryKeys(table: TableConfig): Promise<string[]> {
        if (!this.pool) throw new Error('Not connected');
        const rawQuery = `
      SELECT c.column_name
      FROM information_schema.table_constraints t
        JOIN information_schema.constraint_column_usage c
        ON c.constraint_name = t.constraint_name
      WHERE t.constraint_type = 'PRIMARY KEY' AND c.table_name = '${table.name}'`;
        const result = await this.pool.query(rawQuery);
        return result.rows.map((row) => row.column_name);
    }

    async getColumnNames(table: TableConfig): Promise<string[]> {
        if (!this.pool) throw new Error('Not connected');
        const rawQuery = `
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = '${table.name}'
      ORDER BY ordinal_position`;
        const result = await this.pool.query(rawQuery);
        return result.rows.map((row) => row.column_name);
    }

    escapeIdentifier(identifier: string): string {
        return `"${identifier}"`;
    }

    getDatabaseInfo(): string {
        const { host, port, database, user } = this.config;
        return `postgres://${user}@${host}:${port}/${database}`;
    }
}
