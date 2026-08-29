import { logger } from '../../utils/logger';
import { DatabaseConfig } from '../../utils/database/databaseProvider';
import { createDatabaseProvider } from '../../utils/database/databaseProviderFactory';

export const tryConnectionAsync = async (dbConfig: DatabaseConfig): Promise<boolean> => {
    const dbProvider = createDatabaseProvider(dbConfig);
    try {
        await dbProvider.connect();
        logger.info(`Connecting to the '${dbProvider.getDatabaseInfo()}' successful.`);
        return true;
    } catch (err) {
        logger.info(`Could not connect to the '${dbProvider.getDatabaseInfo()}'.`, err);
        return false;
    } finally {
        await dbProvider.disconnect();
    }
};
