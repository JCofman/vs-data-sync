import { DatabaseConfig } from './databaseProvider';

export const formatDatabaseInfo = (config: DatabaseConfig): string => {
    if (config.connectionString) {
        return `{${config.type}}://<connection-string>`;
    }

    const { type, user, host, port, database } = config;
    return `{${type}}://${user}@${host}:${port}/${database}`;
};
