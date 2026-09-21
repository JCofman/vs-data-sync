import { randomBytes } from 'node:crypto';

import { ParsedDiff } from 'diff';
import { readJson } from 'fs-extra';
import { ViewColumn, WebviewPanel, commands, window } from 'vscode';

import { extCommands } from '../utils/constants';
import { FileManager } from '../utils/fileManager';
import { PatternSession } from '../utils/utils';
import { ComparisonReviewModel, ReviewFilter } from './comparisonReviewModel';
import { parseRowChanges } from './rowChanges';

type ReviewMessage =
    | { type: 'ready' }
    | { type: 'page'; offset?: number; limit?: number; filter?: ReviewFilter; query?: string }
    | { type: 'detail'; id?: string }
    | { type: 'legacyDiff' };

const getNonce = (): string => randomBytes(16).toString('base64');

export const createComparisonReviewHtml = (tableName: string): string => {
    const nonce = getNonce();
    const escapedTitle = tableName.replace(/[&<>"']/g, (character) => {
        switch (character) {
            case '&':
                return '&amp;';
            case '<':
                return '&lt;';
            case '>':
                return '&gt;';
            case '"':
                return '&quot;';
            default:
                return '&#39;';
        }
    });

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';">
    <title>Compare ${escapedTitle}</title>
    <style nonce="${nonce}">
        :root { color-scheme: light dark; }
        * { box-sizing: border-box; }
        body { margin: 0; color: var(--vscode-foreground); background: var(--vscode-editor-background); font: var(--vscode-font-size)/1.45 var(--vscode-font-family); }
        button, input { font: inherit; }
        button { color: var(--vscode-button-foreground); background: var(--vscode-button-background); border: 1px solid transparent; border-radius: 3px; padding: 5px 10px; cursor: pointer; }
        button:hover { background: var(--vscode-button-hoverBackground); }
        button:focus-visible, input:focus-visible { outline: 1px solid var(--vscode-focusBorder); outline-offset: 1px; }
        button:disabled { opacity: .45; cursor: default; }
        .shell { display: grid; grid-template-rows: auto auto minmax(0, 1fr); height: 100vh; min-width: 680px; }
        .header { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 14px 18px 10px; border-bottom: 1px solid var(--vscode-panel-border); }
        .eyebrow { color: var(--vscode-descriptionForeground); font-size: 11px; letter-spacing: .08em; text-transform: uppercase; }
        h1 { margin: 2px 0 0; font-size: 19px; font-weight: 600; }
        .stats { display: flex; gap: 8px; flex-wrap: wrap; justify-content: flex-end; }
        .stat { min-width: 68px; padding: 6px 9px; border: 1px solid var(--vscode-panel-border); border-radius: 5px; background: var(--vscode-sideBar-background); }
        .stat strong { display: block; font-size: 15px; }
        .stat span { color: var(--vscode-descriptionForeground); font-size: 11px; }
        .toolbar { display: flex; align-items: center; gap: 8px; padding: 9px 18px; border-bottom: 1px solid var(--vscode-panel-border); background: var(--vscode-sideBar-background); }
        .search { flex: 1; min-width: 160px; color: var(--vscode-input-foreground); background: var(--vscode-input-background); border: 1px solid var(--vscode-input-border, transparent); padding: 6px 8px; }
        .filters { display: flex; gap: 2px; }
        .filter { color: var(--vscode-foreground); background: transparent; }
        .filter.active { color: var(--vscode-button-foreground); background: var(--vscode-button-background); }
        .secondary { color: var(--vscode-foreground); background: var(--vscode-button-secondaryBackground); }
        .workspace { display: grid; grid-template-columns: minmax(280px, 38%) minmax(360px, 1fr); min-height: 0; }
        .rows-pane { display: grid; grid-template-rows: minmax(0, 1fr) auto; min-height: 0; border-right: 1px solid var(--vscode-panel-border); }
        .rows { overflow: auto; padding: 6px; }
        .row { display: block; width: 100%; margin: 0 0 4px; padding: 9px 10px; text-align: left; color: var(--vscode-foreground); background: transparent; border: 1px solid transparent; border-radius: 4px; }
        .row:hover { background: var(--vscode-list-hoverBackground); }
        .row.selected { background: var(--vscode-list-activeSelectionBackground); color: var(--vscode-list-activeSelectionForeground); border-color: var(--vscode-focusBorder); }
        .row-top { display: flex; align-items: center; gap: 8px; }
        .identity { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-family: var(--vscode-editor-font-family); }
        .columns { margin-top: 5px; color: var(--vscode-descriptionForeground); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12px; }
        .badge { display: inline-flex; align-items: center; flex: none; border-radius: 999px; padding: 1px 7px; font-size: 10px; font-weight: 700; letter-spacing: .04em; text-transform: uppercase; }
        .badge.update { color: var(--vscode-charts-yellow); background: color-mix(in srgb, var(--vscode-charts-yellow) 15%, transparent); }
        .badge.insert { color: var(--vscode-charts-green); background: color-mix(in srgb, var(--vscode-charts-green) 15%, transparent); }
        .badge.delete { color: var(--vscode-charts-red); background: color-mix(in srgb, var(--vscode-charts-red) 15%, transparent); }
        .pager { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 8px; border-top: 1px solid var(--vscode-panel-border); }
        .page-label, .empty, .hint { color: var(--vscode-descriptionForeground); font-size: 12px; }
        .detail { overflow: auto; padding: 18px; }
        .detail-header { position: sticky; top: -18px; z-index: 2; margin: -18px -18px 14px; padding: 14px 18px; background: var(--vscode-editor-background); border-bottom: 1px solid var(--vscode-panel-border); }
        .detail-title { display: flex; align-items: center; gap: 8px; margin: 0 0 4px; font-family: var(--vscode-editor-font-family); font-size: 15px; }
        .field { margin: 0 0 14px; border: 1px solid var(--vscode-panel-border); border-radius: 5px; overflow: hidden; }
        .field-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 7px 10px; background: var(--vscode-sideBar-background); border-bottom: 1px solid var(--vscode-panel-border); }
        .field-name { font-family: var(--vscode-editor-font-family); font-weight: 600; }
        .types { color: var(--vscode-descriptionForeground); font-size: 11px; }
        .value-grid { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); }
        .value-side + .value-side { border-left: 1px solid var(--vscode-panel-border); }
        .value-label { display: flex; justify-content: space-between; padding: 5px 9px; color: var(--vscode-descriptionForeground); background: var(--vscode-editorWidget-background); font-size: 11px; }
        pre { margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; font: var(--vscode-editor-font-size)/1.45 var(--vscode-editor-font-family); tab-size: 4; }
        .value { min-height: 42px; max-height: 310px; overflow: auto; padding: 9px; }
        details { border-top: 1px solid var(--vscode-panel-border); }
        summary { padding: 6px 9px; cursor: pointer; color: var(--vscode-descriptionForeground); font-size: 12px; }
        .inline-diff { max-height: 360px; overflow: auto; padding: 10px; background: var(--vscode-textCodeBlock-background); }
        .segment.insert { background: var(--vscode-diffEditor-insertedTextBackground); }
        .segment.delete { background: var(--vscode-diffEditor-removedTextBackground); text-decoration: line-through; }
        .loading { padding: 18px; color: var(--vscode-descriptionForeground); }
        @media (max-width: 900px) { .workspace { grid-template-columns: minmax(250px, 44%) minmax(330px, 1fr); } .stats { display: none; } }
    </style>
</head>
<body>
    <main class="shell">
        <header class="header">
            <div><div class="eyebrow">Make target match source</div><h1>${escapedTitle}</h1></div>
            <div class="stats" id="stats" aria-label="Change counts"></div>
        </header>
        <div class="toolbar">
            <input id="search" class="search" type="search" placeholder="Search primary key or changed column" aria-label="Search changed rows">
            <div class="filters" id="filters" role="group" aria-label="Filter by change type">
                <button class="filter active" data-filter="all">All</button>
                <button class="filter" data-filter="update">Updates</button>
                <button class="filter" data-filter="insert">Inserts</button>
                <button class="filter" data-filter="delete">Deletes</button>
            </div>
            <button id="legacy" class="secondary" title="Open the original JSONL side-by-side diff">JSONL diff</button>
        </div>
        <section class="workspace">
            <aside class="rows-pane" aria-label="Changed rows">
                <div class="rows" id="rows"><div class="loading">Loading row changes…</div></div>
                <div class="pager">
                    <button id="previous" class="secondary">Previous</button>
                    <span id="page-label" class="page-label"></span>
                    <button id="next" class="secondary">Next</button>
                </div>
            </aside>
            <article class="detail" id="detail" aria-live="polite">
                <p class="hint">Select a changed row to inspect its fields. Large values are loaded only for the selected row.</p>
            </article>
        </section>
    </main>
    <script nonce="${nonce}">
        const vscode = acquireVsCodeApi();
        const state = { filter: 'all', query: '', offset: 0, limit: 50, total: 0, selectedId: undefined };
        const rowsElement = document.getElementById('rows');
        const detailElement = document.getElementById('detail');
        const pageLabel = document.getElementById('page-label');
        const previousButton = document.getElementById('previous');
        const nextButton = document.getElementById('next');

        const element = (tag, className, text) => {
            const node = document.createElement(tag);
            if (className) node.className = className;
            if (text !== undefined) node.textContent = text;
            return node;
        };

        const requestPage = (offset = 0) => {
            state.offset = Math.max(0, offset);
            vscode.postMessage({ type: 'page', offset: state.offset, limit: state.limit, filter: state.filter, query: state.query });
        };

        const addBadge = (parent, kind) => parent.append(element('span', 'badge ' + kind, kind));

        const renderStats = (stats) => {
            const container = document.getElementById('stats');
            container.replaceChildren();
            [['total', 'Changed'], ['update', 'Updates'], ['insert', 'Inserts'], ['delete', 'Deletes']].forEach(([key, label]) => {
                const item = element('div', 'stat');
                item.append(element('strong', '', String(stats[key])), element('span', '', label));
                container.append(item);
            });
        };

        const selectRow = (id) => {
            state.selectedId = id;
            rowsElement.querySelectorAll('.row').forEach((row) => row.classList.toggle('selected', row.dataset.id === id));
            vscode.postMessage({ type: 'detail', id });
        };

        const renderPage = (page) => {
            state.offset = page.offset;
            state.total = page.total;
            rowsElement.replaceChildren();
            if (page.rows.length === 0) {
                rowsElement.append(element('p', 'empty', 'No row changes match this filter.'));
            }
            page.rows.forEach((row) => {
                const button = element('button', 'row' + (row.id === state.selectedId ? ' selected' : ''));
                button.type = 'button';
                button.dataset.id = row.id;
                const top = element('span', 'row-top');
                addBadge(top, row.kind);
                top.append(element('span', 'identity', row.identity));
                button.append(top, element('span', 'columns', row.changedColumns.length + ' changed · ' + row.changedColumns.join(', ')));
                button.addEventListener('click', () => selectRow(row.id));
                rowsElement.append(button);
            });
            const first = page.total === 0 ? 0 : page.offset + 1;
            const last = Math.min(page.offset + page.rows.length, page.total);
            pageLabel.textContent = first + '–' + last + ' of ' + page.total;
            previousButton.disabled = page.offset === 0;
            nextButton.disabled = page.offset + page.limit >= page.total;
        };

        const renderSide = (label, value) => {
            const side = element('div', 'value-side');
            const header = element('div', 'value-label');
            header.append(element('span', '', label), element('span', '', value.type + ' · ' + value.size + ' B'));
            side.append(header, element('pre', 'value', value.value));
            return side;
        };

        const renderDetail = (detail) => {
            detailElement.replaceChildren();
            if (!detail) {
                detailElement.append(element('p', 'empty', 'This row is no longer available.'));
                return;
            }
            const header = element('header', 'detail-header');
            const title = element('h2', 'detail-title');
            addBadge(title, detail.kind);
            title.append(element('span', '', detail.identity));
            header.append(title, element('div', 'hint', detail.changedColumns.length + ' changed fields'));
            detailElement.append(header);

            detail.fields.forEach((field) => {
                const card = element('section', 'field');
                const fieldHead = element('div', 'field-head');
                fieldHead.append(element('span', 'field-name', field.column), element('span', 'types', 'Target ' + field.target.type + ' → Source ' + field.source.type));
                const values = element('div', 'value-grid');
                values.append(renderSide('Target · before', field.target), renderSide('Source · after', field.source));
                card.append(fieldHead, values);
                if (field.textDiff && field.textDiff.length > 1) {
                    const disclosure = document.createElement('details');
                    disclosure.open = field.source.size + field.target.size < 4000;
                    disclosure.append(element('summary', '', 'Inline text changes'));
                    const diff = element('pre', 'inline-diff');
                    field.textDiff.forEach((segment) => diff.append(element('span', 'segment ' + segment.kind, segment.value)));
                    disclosure.append(diff);
                    card.append(disclosure);
                }
                detailElement.append(card);
            });
        };

        window.addEventListener('message', ({ data }) => {
            if (data.type === 'init') {
                renderStats(data.stats);
                renderPage(data.page);
            } else if (data.type === 'page') {
                renderPage(data.page);
            } else if (data.type === 'detail') {
                renderDetail(data.detail);
            } else if (data.type === 'error') {
                detailElement.replaceChildren(element('p', 'empty', data.message));
            }
        });

        document.getElementById('filters').addEventListener('click', (event) => {
            const button = event.target.closest('[data-filter]');
            if (!button) return;
            document.querySelectorAll('.filter').forEach((item) => item.classList.toggle('active', item === button));
            state.filter = button.dataset.filter;
            requestPage(0);
        });
        let searchTimer;
        document.getElementById('search').addEventListener('input', (event) => {
            clearTimeout(searchTimer);
            searchTimer = setTimeout(() => { state.query = event.target.value; requestPage(0); }, 180);
        });
        previousButton.addEventListener('click', () => requestPage(state.offset - state.limit));
        nextButton.addEventListener('click', () => requestPage(state.offset + state.limit));
        document.getElementById('legacy').addEventListener('click', () => vscode.postMessage({ type: 'legacyDiff' }));
        rowsElement.addEventListener('keydown', (event) => {
            if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
            const rows = Array.from(rowsElement.querySelectorAll('.row'));
            const index = rows.indexOf(document.activeElement);
            const next = rows[index + (event.key === 'ArrowDown' ? 1 : -1)];
            if (next) { event.preventDefault(); next.focus(); }
        });
        vscode.postMessage({ type: 'ready' });
    </script>
</body>
</html>`;
};

export class ComparisonReviewPanel {
    private static readonly panels = new Map<string, ComparisonReviewPanel>();

    static async open(tableName: string): Promise<void> {
        const fileManager = FileManager.getInstance();
        if (!fileManager.isInit()) {
            window.showErrorMessage('Run an analysis before opening the comparison review.');
            return;
        }

        const panelKey = `${fileManager.getSessionPath()}\u0000${tableName}`;

        const existing = this.panels.get(panelKey);
        if (existing) {
            existing.panel.reveal(ViewColumn.Active);
            return;
        }

        try {
            const [session, patch] = await Promise.all([
                readJson(fileManager.getSessionPath()) as Promise<PatternSession>,
                readJson(fileManager.getStructuredOutputPath(tableName)) as Promise<ParsedDiff>
            ]);
            const tableDetail = session.plan[tableName];
            if (!tableDetail) {
                throw new Error(`No comparison metadata exists for table '${tableName}'.`);
            }
            const model = new ComparisonReviewModel(parseRowChanges(patch, tableDetail));
            const panel = window.createWebviewPanel(
                'reconciledb.comparisonReview',
                `Compare • ${tableName}`,
                ViewColumn.Active,
                { enableScripts: true, retainContextWhenHidden: true }
            );
            const reviewPanel = new ComparisonReviewPanel(panel, panelKey, tableName, model);
            this.panels.set(panelKey, reviewPanel);
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            window.showErrorMessage(`Unable to open the comparison review: ${message}`);
        }
    }

    private constructor(
        private readonly panel: WebviewPanel,
        panelKey: string,
        private readonly tableName: string,
        private readonly model: ComparisonReviewModel
    ) {
        panel.webview.html = createComparisonReviewHtml(tableName);
        panel.onDidDispose(() => ComparisonReviewPanel.panels.delete(panelKey));
        panel.webview.onDidReceiveMessage((message: ReviewMessage) => this.handleMessage(message));
    }

    private async handleMessage(message: ReviewMessage): Promise<void> {
        switch (message.type) {
            case 'ready':
                await this.panel.webview.postMessage({
                    type: 'init',
                    stats: this.model.getStats(),
                    page: this.model.getPage({})
                });
                break;
            case 'page':
                await this.panel.webview.postMessage({ type: 'page', page: this.model.getPage(message) });
                break;
            case 'detail':
                await this.panel.webview.postMessage({
                    type: 'detail',
                    detail: message.id ? this.model.getDetail(message.id) : undefined
                });
                break;
            case 'legacyDiff':
                await commands.executeCommand(extCommands.sideBySideDiff, { tableName: this.tableName });
                break;
        }
    }
}
