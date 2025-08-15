import fs from 'fs-extra';
import { EOL } from 'node:os';
import { FileManager, SnapshotType } from '../../utils/fileManager';
import { logger } from '../../utils/logger';
import { PatternConfig, PatternSession, TableConfig, getTabWidth } from '../../utils/utils';
import { createDatabaseProvider } from '../../utils/database/databaseProviderFactory';
import { DatabaseProvider } from '../../utils/database/databaseProvider';

export type GenerateSnapshotOptions = {
    dbProvider: DatabaseProvider;
    fileManager: FileManager;
    snapshotType: SnapshotType;
    formatLine?: boolean;
    tables: TableConfig[];
    session: PatternSession;
};

export const createSnapshotFiles = async (options: GenerateSnapshotOptions): Promise<void> => {
    const { dbProvider, fileManager, tables, snapshotType, session, formatLine = false } = options;
    const tab = getTabWidth();

    try {
        await dbProvider.connect();

        for (let i = 0; i < tables.length; i++) {
            const table = tables[i];

            // Init detail table
            session.plan[table.name] = {
                primaryKeys: [],
                columns: [],
                insert: 0,
                update: 0,
                delete: 0
            };

            // Get primary key
            let primaryKeys = table.primaryKeys;
            if (!primaryKeys || primaryKeys.length <= 0) {
                primaryKeys = await dbProvider.getPrimaryKeys(table);
            }
            session.plan[table.name].primaryKeys = primaryKeys;

            // Get columns for table
            let tableColumns = table.columns;
            if (!tableColumns || tableColumns.length <= 0) {
                tableColumns = await dbProvider.getColumnNames(table);
            }
            session.plan[table.name].columns = tableColumns;

            // Remove column in exclude columns
            const excludeColumns = table.excludes || [];
            if (excludeColumns.length > 0) {
                tableColumns = tableColumns.filter((columnName) => !excludeColumns.includes(columnName));
            }

            // Generate select query
            const selectColumns =
                tableColumns.length > 0 ? tableColumns.map((tc) => dbProvider.escapeIdentifier(tc)).join(', ') : '*';

            const tableIdentifier = table.schema
                ? `${dbProvider.escapeIdentifier(table.schema)}.${dbProvider.escapeIdentifier(table.name)}`
                : dbProvider.escapeIdentifier(table.name);

            const selectQuery = `SELECT ${selectColumns} FROM ${tableIdentifier}`;
            const where = table.where ? `WHERE ${table.where}` : '';
            const orderBy = table.orderBy ? `ORDER BY ${table.orderBy}` : '';
            const rawQuery = [selectQuery, where, orderBy].filter(Boolean).join(' ');

            // If existed the snapshot file, remove old file and create new empty file
            const snapshotPath = fileManager.getSnapshotFilePath(table.name, snapshotType);
            await fs.remove(snapshotPath);
            await fs.ensureFile(snapshotPath);

            // Stream data from table to file
            logger.info(`Execute '${rawQuery}' at '${table.name}' table to create snapshot.`);

            for await (const row of dbProvider.queryStream(rawQuery)) {
                const rowContent = JSON.stringify(row);
                fs.appendFileSync(snapshotPath, rowContent.concat(EOL), { encoding: 'utf-8' });
            }

            logger.info(`The ${table.name} data was successfully streamed.`);
        }

        // Save table detail
        const sessionPath = fileManager.getSessionPath();
        await fs.outputJSON(sessionPath, session, { spaces: tab });
        logger.info(`The ${sessionPath} was successfully created.`);
    } finally {
        await dbProvider.disconnect();
    }
};

export const generateSnapshotAsync = async (options: {
    fileManager: FileManager;
    selectedPattern: string;
    pattern: PatternConfig;
}): Promise<boolean> => {
    const { fileManager, selectedPattern, pattern } = options;

    // Init configuration
    const { source, target, diff } = pattern;
    const { format: formatLine = false, tables = [] } = diff || {};

    // Init session
    const session: PatternSession = {
        selectedPattern,
        plan: {}
    };

    // Generate snapshot for original database (target apply)
    const targetProvider = createDatabaseProvider(target);
    logger.info(`Generating target snapshot with db connection '${targetProvider.getDatabaseInfo()}'....`);
    await createSnapshotFiles({
        fileManager,
        dbProvider: targetProvider,
        snapshotType: SnapshotType.original,
        formatLine,
        session,
        tables
    });
    logger.info('The target snapshot files was successfully generated');

    // Generate snapshot for modified database (source changed)
    const sourceProvider = createDatabaseProvider(source);
    logger.info(`Generating source snapshot with db connection '${sourceProvider.getDatabaseInfo()}'....`);
    await createSnapshotFiles({
        fileManager,
        dbProvider: sourceProvider,
        snapshotType: SnapshotType.modified,
        formatLine,
        session,
        tables
    });
    logger.info('The source snapshot files was successfully generated');
    return true;
};
