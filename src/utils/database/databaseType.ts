export type SupportedDatabaseType = 'postgres' | 'mssql';

type PatternDatabaseTypes = {
    source?: { type?: SupportedDatabaseType };
    target?: { type?: SupportedDatabaseType };
};

const normalizeDatabaseType = (type: SupportedDatabaseType | undefined): SupportedDatabaseType => type ?? 'postgres';

export const resolvePatternDatabaseType = (pattern: PatternDatabaseTypes): SupportedDatabaseType => {
    const sourceType = normalizeDatabaseType(pattern.source?.type);
    const targetType = normalizeDatabaseType(pattern.target?.type);

    if (sourceType !== targetType) {
        throw new Error(
            `Cross-engine synchronization is not supported. The source uses '${sourceType}' and the target uses '${targetType}'. Choose PostgreSQL for both databases or SQL Server for both databases.`
        );
    }

    return sourceType;
};
