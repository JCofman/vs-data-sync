import fs from 'fs-extra';
import { EOL } from 'node:os';
import { PoolConfig } from 'pg';
import { Event, EventEmitter, ThemeIcon, TreeDataProvider, TreeItem, TreeItemCollapsibleState } from 'vscode';
import { ConfigManager } from '../utils/configManager';
import { store } from '../utils/store';
import { DataSyncConfig, TableConfig } from '../utils/utils';

export type InfoTreeItem = TreeItem & {
    type?: 'pattern' | 'database' | 'table';
    patternName?: string; // for pattern level
    databaseName?: string; // for database level
    tableName?: string; // for table level
    configFilePath?: string;
    parent?: InfoTreeItem;
};

export class InfoProvider implements TreeDataProvider<InfoTreeItem> {
    private _onDidChangeTreeData: EventEmitter<InfoTreeItem | undefined | void> = new EventEmitter<
        TreeItem | undefined | void
    >();
    readonly onDidChangeTreeData: Event<InfoTreeItem | undefined | void> = this._onDidChangeTreeData.event;

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: InfoTreeItem): InfoTreeItem {
        return element;
    }

    async getChildren(element?: InfoTreeItem): Promise<InfoTreeItem[]> {
        // Parse configuration
        const configManager = ConfigManager.getInstance();
        let configFilePath: string | undefined = undefined;
        let configContent: DataSyncConfig | undefined = undefined;
        if (store.isImportSession) {
            configFilePath = configManager.getConfigFilePath();
            configContent = configManager.getConfigContent();
        } else {
            configFilePath = configManager.getDefaultConfigFilePath();
            if (await fs.exists(configFilePath)) {
                configContent = await fs.readJson(configFilePath);
            }
        }
        if (!configContent) {
            return [];
        }

        // Generate parent items if no element is passed.
        if (!element) {
            const parentItems = this.generateParent(configFilePath, configContent);
            if (!parentItems || parentItems.length <= 0) {
                return [];
            }
            return parentItems;
        }

        // Generate child items if parent element is passed.
        const childItems = this.generateChildren(configContent, element);
        if (!childItems || childItems.length <= 0) {
            return [];
        }
        return childItems;
    }

    private generateParent = (configFilePath: string | undefined, configuration: DataSyncConfig): InfoTreeItem[] => {
        const migrateName = store.migrateName || 'none';
        return Object.keys(configuration.patterns).map((pattern): InfoTreeItem => {
            return {
                // Built-in field
                id: pattern,
                label: pattern,
                description: store.currentPattern === pattern ? `👈 ${migrateName}` : '',
                tooltip: `Session: ${migrateName}\nPattern: ${pattern}`,
                contextValue: store.isImportSession ? 'import-pattern-context' : 'pattern-context',
                iconPath: new ThemeIcon('briefcase'),
                configFilePath,
                collapsibleState: TreeItemCollapsibleState.Collapsed,

                // Custom field
                type: 'pattern',
                patternName: pattern,
                parent: undefined
            };
        });
    };

    private createDatabaseTreeItem = (
        from: 'source' | 'target',
        parent: InfoTreeItem,
        db: PoolConfig,
        tables: TableConfig[]
    ): InfoTreeItem => {
        const parsedConnectionString = db?.connectionString
            ? Object.fromEntries(
                  db.connectionString
                      .split(';')
                      .filter(Boolean)
                      .map((pair) => {
                          const [key, ...rest] = pair.split('=');
                          return [key.trim(), rest.join('=').trim()];
                      })
              )
            : {};

        const database = db.database || parsedConnectionString.Database;
        const host = db.host || parsedConnectionString.Server;
        const port = db.port || parsedConnectionString.Port;
        const user =
            db.user ||
            parsedConnectionString.User ||
            parsedConnectionString['User Id'] ||
            parsedConnectionString['UserID'];
        return {
            // Built-in field
            id: `${parent.id}/${from}/${database || 'unknown'}`,
            label: database || 'Unknown Database',
            description: `from ${from}, ${tables.length} table(s) defined`,
            tooltip: [
                `Database: ${database || ''}`,
                `Host: ${host || ''}`,
                `Port: ${port || ''}`,
                `User: ${user || ''}`
            ].join(EOL),
            contextValue: 'database-context',
            iconPath: new ThemeIcon('database'),
            collapsibleState: tables.length > 0 ? TreeItemCollapsibleState.Collapsed : undefined,

            // Addition
            type: 'database',
            databaseName: database,
            parent
        };
    };

    private createTableTreeItem = (parent: InfoTreeItem, table: TableConfig): InfoTreeItem => {
        return {
            // Built-in field
            id: `${parent.id}/${table.name}`,
            label: table.name,
            tooltip: [
                `Schema: ${table.schema}`,
                `Table: ${table.name}`,
                `Excludes: ${table.excludes}`,
                `Where: ${table.where}`,
                `OrderBy: ${table.orderBy}`
            ].join(EOL),
            contextValue: 'table-context',
            iconPath: new ThemeIcon('table'),

            // Addition
            type: 'table',
            tableName: table.name,
            parent
        };
    };

    private generateChildren = (configuration: DataSyncConfig, parentItem: InfoTreeItem): InfoTreeItem[] => {
        // If type is pattern => generate the database child items
        const treeItems: InfoTreeItem[] = [];
        if (parentItem.type === 'pattern' && parentItem.patternName) {
            const currentPattern = configuration.patterns[parentItem.patternName];
            const tables = currentPattern?.diff?.tables || [];
            treeItems.push(this.createDatabaseTreeItem('source', parentItem, currentPattern.source, tables));
            treeItems.push(this.createDatabaseTreeItem('target', parentItem, currentPattern.target, tables));
        }

        // If type is database => generate the table child items
        if (parentItem.type === 'database' && parentItem.parent?.patternName) {
            const patternCode = parentItem.parent.patternName; // Get pattern from database parent (pattern)
            const currentPattern = configuration.patterns[patternCode];
            const tables = currentPattern?.diff?.tables || [];
            tables.forEach((table) => {
                treeItems.push(this.createTableTreeItem(parentItem, table));
            });
        }
        return treeItems;
    };
}
