import { escape } from './escape';
import { TableConfig, TableDetail } from './utils';

export const isInsertQuery = (rawQuery: string | undefined): boolean => {
    if (!rawQuery) {
        return false;
    }
    return rawQuery.startsWith('INSERT INTO');
};

export const makeInsertQuery = (
    table: TableConfig,
    tableDetail: TableDetail,
    values: any,
    dbType: 'postgres' | 'mssql' = 'postgres'
): string => {
    const columns = tableDetail.columns ?? [];
    const columnsStr = columns.map((c) => (dbType === 'postgres' ? `"${c}"` : `[${c}]`)).join(', ');

    // Handle different value escaping for different databases
    const valuesStr = columns
        .map((c) => {
            const value = values[c];
            if (value === null || value === undefined) {
                return 'NULL';
            } else if (typeof value === 'string') {
                return `'${value.replace(/'/g, "''")}'`;
            } else if (typeof value === 'object' && value instanceof Date) {
                return dbType === 'postgres' ? `'${value.toISOString()}'::timestamp` : `'${value.toISOString()}'`;
            } else if (typeof value === 'object') {
                return dbType === 'postgres' ? `'${JSON.stringify(value)}'::jsonb` : `'${JSON.stringify(value)}'`;
            }
            return value;
        })
        .join(', ');

    const tableIdentifier = table.schema
        ? dbType === 'postgres'
            ? `"${table.schema}"."${table.name}"`
            : `[${table.schema}].[${table.name}]`
        : dbType === 'postgres'
        ? `"${table.name}"`
        : `[${table.name}]`;

    return `INSERT INTO ${tableIdentifier} (${columnsStr}) VALUES (${valuesStr});`;
};

export const isUpdateQuery = (rawQuery: string | undefined): boolean => {
    if (!rawQuery) {
        return false;
    }
    return rawQuery.startsWith('UPDATE');
};

export const makeUpdateQuery = (
    table: TableConfig,
    tableDetail: TableDetail,
    values: any,
    dbType: 'postgres' | 'mssql' = 'postgres'
): string => {
    const columns = tableDetail.columns;
    const primaryKeys = tableDetail.primaryKeys;

    if (!Array.isArray(columns) || columns.length === 0) {
        throw new Error(`The table '${table.name}' does not have columns defined.`);
    }

    if (!primaryKeys || primaryKeys.length === 0) {
        throw new Error(`The table '${table.name}' does not have primary keys.`);
    }

    // Escape identifiers based on database type
    const escapeIdentifier = (id: string) => (dbType === 'postgres' ? `"${id}"` : `[${id}]`);

    // Create the SET clause
    const setClause = columns
        .filter((c) => !primaryKeys.includes(c))
        .map((c) => {
            const value = values[c];
            let valueStr = 'NULL';

            if (value !== null && value !== undefined) {
                if (typeof value === 'string') {
                    valueStr = `'${value.replace(/'/g, "''")}'`;
                } else if (typeof value === 'object' && value instanceof Date) {
                    valueStr =
                        dbType === 'postgres' ? `'${value.toISOString()}'::timestamp` : `'${value.toISOString()}'`;
                } else if (typeof value === 'object') {
                    valueStr =
                        dbType === 'postgres' ? `'${JSON.stringify(value)}'::jsonb` : `'${JSON.stringify(value)}'`;
                } else {
                    valueStr = `${value}`;
                }
            }

            return `${escapeIdentifier(c)} = ${valueStr}`;
        })
        .join(', ');

    // Create the WHERE clause for primary keys
    const whereClause = primaryKeys
        .map((pk) => {
            const value = values[pk];
            let valueStr = 'NULL';

            if (value === null || value === undefined) {
                return `${escapeIdentifier(pk)} IS NULL`;
            } else if (typeof value === 'string') {
                valueStr = `'${value.replace(/'/g, "''")}'`;
            } else if (typeof value === 'object' && value instanceof Date) {
                valueStr = dbType === 'postgres' ? `'${value.toISOString()}'::timestamp` : `'${value.toISOString()}'`;
            } else if (typeof value === 'object') {
                valueStr = dbType === 'postgres' ? `'${JSON.stringify(value)}'::jsonb` : `'${JSON.stringify(value)}'`;
            } else {
                valueStr = `${value}`;
            }

            return `${escapeIdentifier(pk)} = ${valueStr}`;
        })
        .join(' AND ');

    // Generate the table identifier with schema if provided
    const tableIdentifier = table.schema
        ? `${escapeIdentifier(table.schema)}.${escapeIdentifier(table.name)}`
        : escapeIdentifier(table.name);

    return `UPDATE ${tableIdentifier} SET ${setClause} WHERE ${whereClause};`;
};

export const isDeleteQuery = (rawQuery: string | undefined): boolean => {
    if (!rawQuery) {
        return false;
    }
    return rawQuery.startsWith('DELETE FROM');
};

export const makeDeleteQuery = (
    table: TableConfig,
    tableDetail: TableDetail,
    values: any,
    dbType: 'postgres' | 'mssql' = 'postgres'
): string => {
    const primaryKeys = tableDetail.primaryKeys;

    if (!primaryKeys || primaryKeys.length === 0) {
        throw new Error(`The table '${table.name}' does not have primary keys.`);
    }

    // Escape identifiers based on database type
    const escapeIdentifier = (id: string) => (dbType === 'postgres' ? `"${id}"` : `[${id}]`);

    // Create the WHERE clause for primary keys
    const whereClause = primaryKeys
        .map((pk) => {
            const value = values[pk];

            if (value === null || value === undefined) {
                return `${escapeIdentifier(pk)} IS NULL`;
            } else if (typeof value === 'string') {
                return `${escapeIdentifier(pk)} = '${value.replace(/'/g, "''")}'`;
            } else if (typeof value === 'object' && value instanceof Date) {
                return dbType === 'postgres'
                    ? `${escapeIdentifier(pk)} = '${value.toISOString()}'::timestamp`
                    : `${escapeIdentifier(pk)} = '${value.toISOString()}'`;
            } else if (typeof value === 'object') {
                return dbType === 'postgres'
                    ? `${escapeIdentifier(pk)} = '${JSON.stringify(value)}'::jsonb`
                    : `${escapeIdentifier(pk)} = '${JSON.stringify(value)}'`;
            } else {
                return `${escapeIdentifier(pk)} = ${value}`;
            }
        })
        .join(' AND ');

    // Generate the table identifier with schema if provided
    const tableIdentifier = table.schema
        ? `${escapeIdentifier(table.schema)}.${escapeIdentifier(table.name)}`
        : escapeIdentifier(table.name);

    return `DELETE FROM ${tableIdentifier} WHERE ${whereClause};`;
};
