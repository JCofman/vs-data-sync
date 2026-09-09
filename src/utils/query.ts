import { TableConfig, TableDetail } from './utils';

type DatabaseType = 'postgres' | 'mssql';

const formatSqlLiteral = (value: any, dbType: DatabaseType): string => {
    if (value === null || value === undefined) {
        return 'NULL';
    }
    if (typeof value === 'boolean') {
        return dbType === 'mssql' ? (value ? '1' : '0') : `${value}`;
    }
    if (typeof value === 'string') {
        return `'${value.replace(/'/g, "''")}'`;
    }
    if (value instanceof Date) {
        return dbType === 'postgres' ? `'${value.toISOString()}'::timestamp` : `'${value.toISOString()}'`;
    }
    if (typeof value === 'object') {
        return dbType === 'postgres' ? `'${JSON.stringify(value)}'::jsonb` : `'${JSON.stringify(value)}'`;
    }
    return `${value}`;
};

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
    dbType: DatabaseType = 'postgres'
): string => {
    const columns = tableDetail.columns ?? [];
    const columnsStr = columns.map((c) => (dbType === 'postgres' ? `"${c}"` : `[${c}]`)).join(', ');

    const valuesStr = columns.map((c) => formatSqlLiteral(values[c], dbType)).join(', ');

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
    dbType: DatabaseType = 'postgres'
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
            return `${escapeIdentifier(c)} = ${formatSqlLiteral(values[c], dbType)}`;
        })
        .join(', ');

    // Create the WHERE clause for primary keys
    const whereClause = primaryKeys
        .map((pk) => {
            const value = values[pk];
            if (value === null || value === undefined) {
                return `${escapeIdentifier(pk)} IS NULL`;
            }
            return `${escapeIdentifier(pk)} = ${formatSqlLiteral(value, dbType)}`;
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
    dbType: DatabaseType = 'postgres'
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
            }
            return `${escapeIdentifier(pk)} = ${formatSqlLiteral(value, dbType)}`;
        })
        .join(' AND ');

    // Generate the table identifier with schema if provided
    const tableIdentifier = table.schema
        ? `${escapeIdentifier(table.schema)}.${escapeIdentifier(table.name)}`
        : escapeIdentifier(table.name);

    return `DELETE FROM ${tableIdentifier} WHERE ${whereClause};`;
};
