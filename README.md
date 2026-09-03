<p align="center">
  <img src="assets/logo.png" width="120" height="120" alt="ReconcileDB logo" />
</p>

# ReconcileDB for VS Code

Compare selected row data between two databases with the same schema, inspect the generated SQL, and choose when to apply it. ReconcileDB is local-first: database connections and generated files stay on your machine.

> **Thank you, Nguyen Ngoc Long.** ReconcileDB for VS Code is an independently maintained fork of [Data Sync](https://github.com/nguyenngoclongdev/vs-data-sync), originally created by Nguyen Ngoc Long. His work made this extension possible. The upstream copyright and MIT license are preserved in [LICENSE](LICENSE). This project is not affiliated with or endorsed by the original maintainer.

[![Visual Studio Marketplace](https://img.shields.io/visual-studio-marketplace/v/jcofman.reconciledb-vscode)](https://marketplace.visualstudio.com/items?itemName=jcofman.reconciledb-vscode)
[![Open VSX](https://img.shields.io/open-vsx/v/jcofman/reconciledb-vscode)](https://open-vsx.org/extension/jcofman/reconciledb-vscode)
[![MIT license](https://img.shields.io/badge/license-MIT-blue.svg?style=flat-square)](LICENSE)

## What it does

- Compares row data from PostgreSQL to PostgreSQL or SQL Server to SQL Server.
- Lets you select tables and columns, exclude volatile columns, filter rows, and define stable ordering or primary keys.
- Shows source and target snapshots alongside a generated migration plan before anything is applied.
- Generates inserts, updates, and deletes that can be individually disabled.
- Applies migrations in a transaction and reports suspicious row counts.
- Uses exact value comparison. ReconcileDB does not silently normalize text, timestamps, or numbers.

ReconcileDB `1.0.2` does not compare or migrate database schemas, perform cross-engine synchronization, or run as a VS Code web extension.

## Installation

Install **ReconcileDB for VS Code** from the [Visual Studio Marketplace](https://marketplace.visualstudio.com/items?itemName=jcofman.reconciledb-vscode) or [Open VSX Registry](https://open-vsx.org/extension/jcofman/reconciledb-vscode).

The universal desktop package supports PostgreSQL and SQL Server username/password authentication on Windows, macOS, and Linux.

## Quick start

1. Open the ReconcileDB activity-bar view.
2. Choose **Generate Configuration File**.
3. Configure a source and target of the same database engine.
4. Select the tables, keys, and columns to compare.
5. Run **Analyze Data**, review the diff and migration SQL, then explicitly choose whether to execute it.

The existing `data-sync.*` command IDs, settings, and `database.json` format remain compatible with the original extension so existing local configurations can be reused.

### PostgreSQL example

```jsonc
{
  "verbose": false,
  "patterns": {
    "staging-to-local": {
      "source": {
        "type": "postgres",
        "host": "staging.example.test",
        "port": 5432,
        "database": "app",
        "user": "reconciler",
        "password": "prompted-if-omitted"
      },
      "target": {
        "type": "postgres",
        "host": "localhost",
        "port": 5432,
        "database": "app",
        "user": "postgres",
        "password": "prompted-if-omitted"
      },
      "diff": {
        "tables": [
          {
            "schema": "public",
            "name": "customers",
            "primaryKeys": ["id"],
            "excludes": ["updated_at"],
            "orderBy": "id"
          }
        ]
      },
      "migrate": {
        "noInsert": false,
        "noUpdate": false,
        "noDelete": false,
        "noRowAffected": "warn",
        "multipleRowAffected": "throw"
      }
    }
  }
}
```

### SQL Server example

For SQL Server authentication, use the same structure with `"type": "mssql"`, normally on port `1433`. You can also provide a username/password connection string:

```jsonc
{
  "type": "mssql",
  "connectionString": "Server=localhost;Database=app;User Id=reconciler;Password=secret;Encrypt=true;TrustServerCertificate=true;"
}
```

## Might implement later

- Windows integrated authentication. This would require revisiting native-driver packaging; for now, use SQL Server username/password authentication.

## Safety notes

- Review generated migration SQL before execution, especially deletes.
- Use a least-privilege database account and test against disposable data first.
- Put secrets in a local configuration ignored by source control. If `password` is omitted, the extension can prompt for it.
- Define `primaryKeys` or a deterministic `orderBy` for tables without discoverable primary keys.
- Exclude columns such as generated timestamps, row versions, audit metadata, or environment-specific identifiers when they are intentionally different.

## Feedback

Please report bugs and feature requests in the [JCofman/vs-data-sync issue tracker](https://github.com/JCofman/vs-data-sync/issues).

## License

ReconcileDB for VS Code is distributed under the [MIT License](LICENSE).
