import fs from 'fs-extra';
import { EOL } from 'node:os';
import pg, { PoolConfig } from 'pg';
import * as mssql from 'mssql';
import * as mssqlV8 from 'mssql/msnodesqlv8';

import { ProgressLocation, QuickPickItem, window, workspace } from 'vscode';
import { ExtensionConfiguration } from '../extension';
import { ConfigManager } from '../utils/configManager';
import { APP_ID, APP_NAME, constants } from '../utils/constants';
import { FileManager } from '../utils/fileManager';
import { logger } from '../utils/logger';
import { showIsAnalyzingWarning, showNoConfigWarning, showNoPatternWarning } from '../utils/notification';
import { showProgressReport, showProgressSuccess, showProgressWarn } from '../utils/progress';
import { isDeleteQuery, isInsertQuery, isUpdateQuery } from '../utils/query';
import { store } from '../utils/store';
import { SystemInfo } from '../utils/systemInfo';
import {
    MigrateConfig,
    PatternSession,
    RowAffectedAction,
    getDatabaseInfo,
    getTabWidth,
    showErrorMessageWithDetail,
    showInputPassword
} from '../utils/utils';
import { tryConnectionAsync } from './actions/tryConnectionAsync';

const handleWarningQueries = (
    warnQueries: { rawQuery: string; affected: number }[],
    warnQueryConfig: RowAffectedAction,
    message: string
) => {
    const rawQueries = warnQueries.map((q) => `${EOL}- ${q.rawQuery}`).join('');
    const logMessage = message.concat(rawQueries);
    switch (warnQueryConfig) {
        case 'ignore':
            break;
        case 'log':
            logger.info(logMessage);
            break;
        case 'warn':
            logger.warn(logMessage);
            break;
        case 'throw':
            logger.error(logMessage);
            const error = new Error(logMessage);
            error.stack = rawQueries;
            throw error;
    }
};

// MSSQL helpers for IDENTITY_INSERT handling
const isMssqlIdentityInsertError = (err: unknown): boolean => {
    const anyErr = err as any;
    const number = anyErr?.number as number | undefined;
    const message = (anyErr?.message as string | undefined)?.toLowerCase() || '';
    return number === 544 || message.includes('identity_insert is set to off');
};

const extractInsertTargetTable = (sql: string): string | undefined => {
    // Captures object name after INSERT INTO up to first space or '('
    // Works with [dbo].[Table], dbo.Table, [Table], Table
    const m = /^\s*insert\s+into\s+([^\s(]+)\s*/i.exec(sql);
    return m?.[1];
};

// Normalize unquoted boolean literals to BIT (1/0) for SQL Server.
// Skips single-quoted strings, bracketed identifiers, line and block comments.
export const normalizeBooleanLiteralsForMssql = (sql: string): string => {
    let out = '';
    let i = 0;
    const n = sql.length;
    let inSingle = false;
    let inBracketIdent = false;
    let inLineComment = false;
    let inBlockComment = false;

    const isWordChar = (c: string) => /[A-Za-z0-9_]/.test(c);

    while (i < n) {
        const ch = sql[i];
        const next = i + 1 < n ? sql[i + 1] : '';

        // End line comment
        if (inLineComment) {
            out += ch;
            if (ch === '\n') inLineComment = false;
            i++;
            continue;
        }

        // End block comment
        if (inBlockComment) {
            out += ch;
            if (ch === '*' && next === '/') {
                out += next;
                i += 2;
                inBlockComment = false;
            } else {
                i++;
            }
            continue;
        }

        // Inside quoted string
        if (inSingle) {
            out += ch;
            if (ch === "'") {
                // Escaped '' stays in string
                if (next === "'") {
                    out += next;
                    i += 2;
                    continue;
                }
                inSingle = false;
            }
            i++;
            continue;
        }

        // Inside bracketed identifier
        if (inBracketIdent) {
            out += ch;
            if (ch === ']') inBracketIdent = false;
            i++;
            continue;
        }

        // Detect starts of comments/strings/identifiers
        if (ch === '-' && next === '-') {
            out += ch + next;
            i += 2;
            inLineComment = true;
            continue;
        }
        if (ch === '/' && next === '*') {
            out += ch + next;
            i += 2;
            inBlockComment = true;
            continue;
        }
        if (ch === "'") {
            out += ch;
            i++;
            inSingle = true;
            continue;
        }
        if (ch === '[') {
            out += ch;
            i++;
            inBracketIdent = true;
            continue;
        }

        // Replace standalone true/false
        if (/[A-Za-z_]/.test(ch)) {
            let j = i;
            while (j < n && isWordChar(sql[j])) j++;
            const word = sql.slice(i, j);
            const prev = i > 0 ? sql[i - 1] : '';
            const nextCh = j < n ? sql[j] : '';
            const isBoundaryLeft = !isWordChar(prev);
            const isBoundaryRight = !isWordChar(nextCh);
            if (isBoundaryLeft && isBoundaryRight) {
                const lw = word.toLowerCase();
                if (lw === 'true') {
                    out += '1';
                    i = j;
                    continue;
                }
                if (lw === 'false') {
                    out += '0';
                    i = j;
                    continue;
                }
            }
            // Not a boolean literal; copy as-is
            out += word;
            i = j;
            continue;
        }

        // Default: copy char
        out += ch;
        i++;
    }

    return out;
};

// Add a new executeMigrateMssql function
const executeMigrateMssql = async (options: {
    poolConfig: any;
    migrateConfig?: MigrateConfig;
    migrateUpLines: string[];
}): Promise<{ insert: number; update: number; delete: number; error?: unknown }> => {
    const { poolConfig, migrateConfig, migrateUpLines } = options;

    let driver: typeof mssql | typeof mssqlV8 = mssql;
    let pool: mssql.ConnectionPool | mssqlV8.ConnectionPool | undefined = undefined;
    let transaction: mssql.Transaction | mssqlV8.Transaction | undefined = undefined;

    let rowAffected = {
        insert: 0,
        update: 0,
        delete: 0
    };

    try {
        if (poolConfig.connectionString) {
            const parsed = mssql.ConnectionPool.parseConnectionString(poolConfig.connectionString);
            const hasUser = !!parsed.user;
            const hasPassword = !!parsed.password;

            if (!hasUser || !hasPassword) {
                parsed.driver = 'msnodesqlv8';
                parsed.options = {
                    ...parsed.options,
                    trustServerCertificate: true,
                    trustedConnection: true
                };
                pool = await new mssqlV8.ConnectionPool(parsed).connect();
                driver = mssqlV8;
            } else {
                pool = await new mssql.ConnectionPool(poolConfig.connectionString).connect();
                driver = mssql;
            }
        } else {
            pool = await new mssql.ConnectionPool({
                server: poolConfig.host,
                port: poolConfig.port,
                user: poolConfig.user,
                password: poolConfig.password,
                database: poolConfig.database,
                domain: poolConfig.domain,
                options: {
                    trustServerCertificate: poolConfig.mssqlOptions?.trustServerCertificate ?? true,
                    encrypt: poolConfig.mssqlOptions?.encrypt ?? true
                }
            }).connect();
            driver = mssql;
        }

        transaction = new driver.Transaction(pool);
        await transaction.begin();

        const request = new driver.Request(transaction);

        const noAffectedQueries: { rawQuery: string; affected: number }[] = [];
        const multiAffectedQueries: { rawQuery: string; affected: number }[] = [];

        // Group inserts by table for IDENTITY_INSERT optimization
        const tableInsertMap = new Map<string, number[]>();
        migrateUpLines.forEach((line, idx) => {
            const trimmed = line.trim();
            if (isInsertQuery(trimmed)) {
                const table = extractInsertTargetTable(trimmed);
                if (table) {
                    if (!tableInsertMap.has(table)) tableInsertMap.set(table, []);
                    tableInsertMap.get(table)!.push(idx);
                }
            }
        });

        // Track which tables have IDENTITY_INSERT ON
        const identityOnTables = new Set<string>();

        for (let i = 0; i < migrateUpLines.length; i++) {
            const rawQuery = migrateUpLines[i].trim();
            const isInsert = isInsertQuery(rawQuery);
            const isUpdate = isUpdateQuery(rawQuery);
            const isDelete = isDeleteQuery(rawQuery);

            const isBlankLine = rawQuery === '';
            const isCommentLine = rawQuery.startsWith('--');
            if (isBlankLine || isCommentLine) {
                continue;
            }

            const preparedQuery = normalizeBooleanLiteralsForMssql(rawQuery);

            let result: any;
            let table: string | undefined = undefined;

            try {
                logger.info(`Execute '${rawQuery}' to migrate...`);
                result = await request.query(preparedQuery);
            } catch (err) {
                if (isInsert && isMssqlIdentityInsertError(err)) {
                    table = extractInsertTargetTable(preparedQuery);
                    if (!table) throw err;

                    // Only enable IDENTITY_INSERT if not already ON for this table
                    if (!identityOnTables.has(table)) {
                        logger.info(`Enabling IDENTITY_INSERT ON for ${table}...`);
                        await request.query(`SET IDENTITY_INSERT ${table} ON;`);
                        identityOnTables.add(table);
                    }
                    result = await request.query(preparedQuery);
                } else {
                    throw err;
                }
            }

            const rowCount = Array.isArray(result.rowsAffected)
                ? result.rowsAffected[0]
                : (result.rowsAffected as number);

            if (isInsert) {
                rowAffected.insert++;
            }
            if (isUpdate) {
                rowAffected.update++;
            }
            if (isDelete) {
                rowAffected.delete++;
            }

            if ((rowCount ?? 0) <= 0) {
                noAffectedQueries.push({ rawQuery, affected: rowCount ?? 0 });
            }
            if ((rowCount ?? 0) >= 2) {
                multiAffectedQueries.push({ rawQuery, affected: rowCount ?? 0 });
            }

            logger.info(`The '${rawQuery}' was successful migrated!`);

            // If this is the last insert for the table, turn IDENTITY_INSERT OFF
            if (isInsert && table) {
                const insertIndexes = tableInsertMap.get(table);
                if (insertIndexes && insertIndexes[insertIndexes.length - 1] === i && identityOnTables.has(table)) {
                    logger.info(`Disabling IDENTITY_INSERT ON for ${table}...`);
                    await request.query(`SET IDENTITY_INSERT ${table} OFF;`);
                    identityOnTables.delete(table);
                }
            }
        }

        if (noAffectedQueries.length > 0) {
            const message = `The query was no affected to database:`;
            handleWarningQueries(noAffectedQueries, migrateConfig?.noRowAffected || 'throw', message);
        }
        if (multiAffectedQueries.length > 0) {
            const message = `The query was multiple affected to database:`;
            handleWarningQueries(multiAffectedQueries, migrateConfig?.multipleRowAffected || 'throw', message);
        }

        await transaction.commit();
        return rowAffected;
    } catch (error) {
        if (transaction) {
            logger.error(`Failed to migrate data. Starting rollback data...`, error);
            await transaction.rollback();
            logger.info(`The data was successful rollback!`);
        }
        return { ...rowAffected, error };
    } finally {
        if (pool) {
            await pool.close();
        }
    }
};

export const executeMigratePostgres = async (options: {
    poolConfig: PoolConfig;
    migrateConfig?: MigrateConfig;
    migrateUpLines: string[];
}): Promise<{ insert: number; update: number; delete: number; error?: unknown }> => {
    const { poolConfig, migrateConfig, migrateUpLines } = options;
    let pool: pg.Pool | undefined = undefined;
    let client: pg.PoolClient | undefined = undefined;
    let rowAffected = {
        insert: 0,
        update: 0,
        delete: 0
    };
    try {
        // Connect to database
        pool = new pg.Pool(poolConfig);
        client = await pool.connect();

        // Start transaction
        await client.query('BEGIN');

        // Start insert/update
        const noAffectedQueries: { rawQuery: string; affected: number }[] = [];
        const multiAffectedQueries: { rawQuery: string; affected: number }[] = [];
        for (let i = 0; i < migrateUpLines.length; i++) {
            const rawQuery = migrateUpLines[i].trim();
            const isInsert = isInsertQuery(rawQuery);
            const isUpdate = isUpdateQuery(rawQuery);
            const isDelete = isDeleteQuery(rawQuery);

            // Ignore if line is empty/comment
            const isBlankLine = rawQuery === '';
            const isCommentLine = rawQuery.startsWith('--');
            if (isBlankLine || isCommentLine) {
                continue;
            }

            // Run query
            logger.info(`Execute '${rawQuery}' to migrate...`);
            const { rowCount } = await client.query(rawQuery);

            // Count affected
            if (isInsert) {
                rowAffected.insert++;
            }
            if (isUpdate) {
                rowAffected.update++;
            }
            if (isDelete) {
                rowAffected.delete++;
            }

            // Throw error if not migrate to any rows
            if (rowCount <= 0) {
                noAffectedQueries.push({ rawQuery, affected: rowCount });
            }

            // Push to lines
            if (rowCount >= 2) {
                multiAffectedQueries.push({ rawQuery, affected: rowCount });
            }

            // Print migrate success
            logger.info(`The '${rawQuery}' was successful migrated!`);
        }

        // Validate no affected record before commit to database
        if (noAffectedQueries.length > 0) {
            const message = `The query was no affected to database:`;
            handleWarningQueries(noAffectedQueries, migrateConfig?.noRowAffected || 'throw', message);
        }

        // Validate multi affected record before commit to database
        if (multiAffectedQueries.length > 0) {
            const message = `The query was multiple affected to database:`;
            handleWarningQueries(noAffectedQueries, migrateConfig?.multipleRowAffected || 'throw', message);
        }

        // Commit transaction
        await client.query('COMMIT');
        return rowAffected;
    } catch (error) {
        if (client) {
            logger.error(`Failed to migrate data. Starting rollback data...`, error);
            await client.query('ROLLBACK');
            logger.info(`The data was successful rollback!`);
        }
        return { ...rowAffected, error };
    } finally {
        if (client) {
            client.release();
        }
    }
};

/**
 * Migrate all changes to target database
 * - migrations/<migrate-name>/session.json
 */
export const migrateDataAsync = async (migrateFilePath: string, systemInfo?: SystemInfo): Promise<void> => {
    try {
        // Check the process is analyzing
        if (store.isAnalyzing) {
            showIsAnalyzingWarning();
            return;
        }

        // Parse configuration
        const configManager = ConfigManager.getInstance();
        const configContent = configManager.getConfigContent();
        if (!configManager.isInit() || !configContent) {
            showNoConfigWarning();
            return;
        }

        // Init file manager
        const fileManager = FileManager.getInstance();
        if (!fileManager.isInit()) {
            showNoPatternWarning();
            return;
        }

        // Init configuration
        const pattern = configContent.patterns[store.currentPattern];

        // Get plan content
        logger.info(`Starting migrate file '${migrateFilePath}'`);
        const migrateUpContent = await fs.readFile(migrateFilePath, 'utf-8');
        if (!migrateUpContent) {
            window.showWarningMessage(`The migrate file ${migrateFilePath} is empty.`);
            return;
        }

        // Split plan content by break lines
        const migrateUpLines = migrateUpContent.split(EOL);
        if (migrateUpLines.length <= 0) {
            window.showWarningMessage(`The migrate file ${migrateFilePath} is not exist any line.`);
            return;
        }

        // Show question to confirm run migrate
        const quickPickItems = [constants.yes, constants.no].map((key): QuickPickItem => ({ label: key }));
        const quickPickItem = await window.showQuickPick(quickPickItems, {
            title: `Would you like to migrate the data changes?`,
            placeHolder: 'Choose `Yes` if you want to migrate...'
        });
        if (!quickPickItem || quickPickItem.label === constants.no) {
            return;
        }

        // Show output panel
        const config = workspace.getConfiguration(APP_ID) as ExtensionConfiguration;
        if (config.showOutputPanel) {
            logger.show();
        }

        // Restore password from store to config
        if (store.targetPassword !== undefined) {
            pattern.target.password = store.targetPassword;
        }

        // Show password input if not defined
        if (pattern.target.password === undefined) {
            const inputPassword = await showInputPassword('target', pattern.target);
            if (typeof inputPassword === 'undefined') {
                return;
            }
            pattern.target.password = inputPassword;
        }

        // Processing migrate data
        window.withProgress(
            {
                location: ProgressLocation.Notification,
                title: APP_NAME,
                cancellable: true
            },
            async (progress): Promise<boolean> => {
                // Check the target database connection config
                if (config.checkDatabaseConnection) {
                    showProgressReport(progress, 'Try connecting to the target database...');
                    const targetInfo = getDatabaseInfo(pattern.target);
                    const isTargetReady = await tryConnectionAsync(pattern.target);
                    if (!isTargetReady) {
                        showProgressWarn(`Failed to connect target database ${targetInfo}.`);
                        return false;
                    }
                    showProgressReport(progress, 'Connect to the target database was successfully!');
                }

                // Execute migrate
                showProgressReport(progress, `Starting migrate data...`);
                logger.info(`Migrate to target with db connection '${getDatabaseInfo(pattern.target)}'....`);
                const dbType = pattern.target.type;
                let rowAffected;
                if (dbType === 'mssql') {
                    rowAffected = await executeMigrateMssql({
                        migrateUpLines,
                        migrateConfig: pattern.migrate,
                        poolConfig: pattern.target
                    });
                } else {
                    rowAffected = await executeMigratePostgres({
                        migrateUpLines,
                        migrateConfig: pattern.migrate,
                        poolConfig: pattern.target
                    });
                }

                if (rowAffected.error) {
                    showErrorMessageWithDetail(
                        `Failed to migrate data. The data will be rollback successful!`,
                        rowAffected.error
                    );
                    return false;
                }

                showProgressReport(
                    progress,
                    `The data was successfully migrated with ${
                        rowAffected.insert + rowAffected.update + rowAffected.delete
                    } row(s) affected!`,
                    { noLog: true }
                );

                // Write session info to file
                showProgressReport(progress, `Saving migrate information...`);
                const sessionPath = fileManager.getSessionPath();
                const session: PatternSession = await fs.readJson(sessionPath);
                session.selectedPattern = store.currentPattern;
                session.system = systemInfo;
                session.migrate = {
                    status: 'Success',
                    affected: rowAffected
                };
                await fs.writeJson(sessionPath, session, { spaces: getTabWidth() });
                showProgressReport(progress, `The migrate information was successfully saved!`);

                // Show message
                showProgressSuccess(`The data has been migrated successfully.`);
                logger.info(`- Insert: ${rowAffected.insert} row(s) affected`);
                logger.info(`- Update: ${rowAffected.update} row(s) affected`);
                logger.info(`- Delete: ${rowAffected.delete} row(s) affected`);

                // Return a value when the task completes
                return true;
            }
        );
    } catch (error) {
        const message = `Failed to migrate data!`;
        logger.error(message, error);
        showErrorMessageWithDetail(message, error);
    }
};
