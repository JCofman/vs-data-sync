import type { TableConfig, TableDetail } from './utils';

type DatabaseType = 'postgres' | 'mssql';

export type IdentityInsertPlan = {
    allStatements: string[];
    insertStatements: string[];
};

const escapeMssqlIdentifier = (identifier: string): string => `[${identifier.replace(/]/g, ']]')}]`;

const getMssqlTableIdentifier = (table: TableConfig): string => {
    const tableName = escapeMssqlIdentifier(table.name);
    return table.schema ? `${escapeMssqlIdentifier(table.schema)}.${tableName}` : tableName;
};

export const wrapIdentityInsertPlan = (options: {
    table: TableConfig;
    tableDetail: TableDetail;
    dbType: DatabaseType;
    allStatements: string[];
    insertStatements: string[];
}): IdentityInsertPlan => {
    const { table, tableDetail, dbType, allStatements, insertStatements } = options;
    const includesIdentityColumn = (tableDetail.identityColumns ?? []).some((column) =>
        tableDetail.columns.includes(column)
    );

    if (dbType !== 'mssql' || insertStatements.length === 0 || !includesIdentityColumn) {
        return { allStatements, insertStatements };
    }

    const tableIdentifier = getMssqlTableIdentifier(table);
    const enable = `SET IDENTITY_INSERT ${tableIdentifier} ON;`;
    const disable = `SET IDENTITY_INSERT ${tableIdentifier} OFF;`;

    return {
        allStatements: [enable, ...allStatements, disable],
        insertStatements: [enable, ...insertStatements, disable]
    };
};
