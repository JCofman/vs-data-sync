import type { FileContents } from '@pierre/diffs';

import { RowChangeDetail, ReviewPage, ReviewStats } from './comparisonReviewModel';

declare function acquireVsCodeApi(): {
    postMessage(message: unknown): void;
};

type DiffStyle = 'split' | 'unified';

type WebviewMessage =
    | { type: 'init'; stats: ReviewStats; page: ReviewPage }
    | { type: 'page'; page: ReviewPage }
    | { type: 'detail'; detail?: RowChangeDetail }
    | { type: 'error'; message: string };

const vscode = acquireVsCodeApi();
const state: {
    filter: string;
    query: string;
    offset: number;
    limit: number;
    total: number;
    selectedId?: string;
    detail?: RowChangeDetail;
    diffStyle: DiffStyle;
} = { filter: 'all', query: '', offset: 0, limit: 50, total: 0, diffStyle: 'split' };

const requireElement = <T extends HTMLElement>(id: string): T => {
    const value = document.getElementById(id);
    if (!value) {
        throw new Error(`Missing required comparison element '${id}'.`);
    }
    return value as T;
};

const rowsElement = requireElement<HTMLDivElement>('rows');
const detailElement = requireElement<HTMLElement>('detail');
const pageLabel = requireElement<HTMLSpanElement>('page-label');
const previousButton = requireElement<HTMLButtonElement>('previous');
const nextButton = requireElement<HTMLButtonElement>('next');
type DiffInstance = { cleanUp(): void };
type PierreModule = { fileDiff: typeof import('@pierre/diffs')['FileDiff'] };

const diffInstances: DiffInstance[] = [];
let detailGeneration = 0;
let pierreModule: Promise<PierreModule> | undefined;

const loadPierre = (): Promise<PierreModule> => {
    const pierreWindow = window as typeof window & { reconcileDbPierre?: PierreModule };
    pierreModule ??= new Promise((resolve, reject) => {
        if (pierreWindow.reconcileDbPierre) {
            resolve(pierreWindow.reconcileDbPierre);
            return;
        }
        const source = document.body.dataset.pierreSrc;
        if (!source) {
            reject(new Error('The Pierre renderer resource is unavailable.'));
            return;
        }
        const script = document.createElement('script');
        script.src = source;
        script.addEventListener('load', () => {
            if (pierreWindow.reconcileDbPierre) {
                resolve(pierreWindow.reconcileDbPierre);
            } else {
                reject(new Error('The Pierre renderer did not initialize.'));
            }
        });
        script.addEventListener('error', () => reject(new Error('The Pierre renderer could not be loaded.')));
        document.head.append(script);
    });
    return pierreModule;
};

const element = <K extends keyof HTMLElementTagNameMap>(
    tag: K,
    className?: string,
    text?: string
): HTMLElementTagNameMap[K] => {
    const node = document.createElement(tag);
    if (className) {
        node.className = className;
    }
    if (text !== undefined) {
        node.textContent = text;
    }
    return node;
};

const requestPage = (offset = 0): void => {
    state.offset = Math.max(0, offset);
    vscode.postMessage({
        type: 'page',
        offset: state.offset,
        limit: state.limit,
        filter: state.filter,
        query: state.query
    });
};

const addBadge = (parent: HTMLElement, kind: string): void => {
    parent.append(element('span', `badge ${kind}`, kind));
};

const renderStats = (stats: ReviewStats): void => {
    const container = requireElement<HTMLDivElement>('stats');
    container.replaceChildren();
    const items: Array<[keyof ReviewStats, string]> = [
        ['total', 'Changed'],
        ['update', 'Updates'],
        ['insert', 'Inserts'],
        ['delete', 'Deletes']
    ];
    for (const [key, label] of items) {
        const item = element('div', 'stat');
        item.append(element('strong', undefined, String(stats[key])), element('span', undefined, label));
        container.append(item);
    }
};

const selectRow = (id: string): void => {
    state.selectedId = id;
    rowsElement.querySelectorAll<HTMLElement>('.row').forEach((row) => {
        row.classList.toggle('selected', row.dataset.id === id);
    });
    vscode.postMessage({ type: 'detail', id });
};

const renderPage = (page: ReviewPage): void => {
    state.offset = page.offset;
    state.total = page.total;
    rowsElement.replaceChildren();
    if (page.rows.length === 0) {
        rowsElement.append(element('p', 'empty', 'No row changes match this filter.'));
    }
    for (const row of page.rows) {
        const button = element('button', `row${row.id === state.selectedId ? ' selected' : ''}`);
        button.type = 'button';
        button.dataset.id = row.id;
        const top = element('span', 'row-top');
        addBadge(top, row.kind);
        top.append(element('span', 'identity', row.identity));
        button.append(
            top,
            element('span', 'columns', `${row.changedColumns.length} changed · ${row.changedColumns.join(', ')}`)
        );
        button.addEventListener('click', () => selectRow(row.id));
        rowsElement.append(button);
    }
    const first = page.total === 0 ? 0 : page.offset + 1;
    const last = Math.min(page.offset + page.rows.length, page.total);
    pageLabel.textContent = `${first}–${last} of ${page.total}`;
    previousButton.disabled = page.offset === 0;
    nextButton.disabled = page.offset + page.limit >= page.total;
};

const renderSide = (label: string, value: RowChangeDetail['fields'][number]['source']): HTMLElement => {
    const side = element('div', 'value-side');
    const header = element('div', 'value-label');
    header.append(element('span', undefined, label), element('span', undefined, `${value.type} · ${value.size} B`));
    side.append(header, element('pre', 'value', value.value));
    return side;
};

const toFile = (
    column: string,
    side: 'target' | 'source',
    value: RowChangeDetail['fields'][number]['source']
): FileContents | null => {
    if (value.type === 'undefined') {
        return null;
    }
    return {
        name: `${column}.txt`,
        contents: value.value,
        lang: 'text',
        cacheKey: `${state.selectedId ?? 'row'}:${column}:${side}:${value.size}:${value.value.length}`
    };
};

const cleanUpDiffs = (): void => {
    for (const instance of diffInstances.splice(0)) {
        instance.cleanUp();
    }
};

const renderPierreDiff = async (
    field: RowChangeDetail['fields'][number],
    container: HTMLElement,
    generation: number
): Promise<void> => {
    const oldFile = toFile(field.column, 'target', field.target);
    const newFile = toFile(field.column, 'source', field.source);
    if (!oldFile && !newFile) {
        container.append(element('p', 'empty', 'No value is present on either side.'));
        return;
    }

    container.append(element('div', 'loading', 'Rendering field diff…'));
    try {
        const pierre = await loadPierre();
        if (generation !== detailGeneration || !container.isConnected) {
            return;
        }
        container.replaceChildren();
        const instance = new pierre.fileDiff({
            diffStyle: state.diffStyle,
            diffIndicators: 'bars',
            lineDiffType: 'word-alt',
            overflow: 'wrap',
            themeType: 'system',
            disableFileHeader: true,
            hunkSeparators: 'line-info-basic',
            maxLineDiffLength: 20_000,
            tokenizeMaxLineLength: 20_000,
            tokenizeMaxLength: 2_000_000,
            unsafeCSS: `
                :host { --diffs-font-family: var(--vscode-editor-font-family); }
                pre { font-family: var(--vscode-editor-font-family); font-size: var(--vscode-editor-font-size); }
            `
        });
        if (oldFile && newFile) {
            instance.render({ oldFile, newFile, containerWrapper: container });
        } else if (oldFile) {
            instance.render({ oldFile, newFile: null, containerWrapper: container });
        } else if (newFile) {
            instance.render({ oldFile: null, newFile, containerWrapper: container });
        }
        diffInstances.push(instance);
    } catch (error) {
        if (generation !== detailGeneration || !container.isConnected) {
            return;
        }
        container.replaceChildren();
        const message = error instanceof Error ? error.message : String(error);
        container.append(element('pre', 'pierre-error', `Unable to render this field: ${message}`));
    }
};

const renderDetail = (detail?: RowChangeDetail): void => {
    const generation = ++detailGeneration;
    cleanUpDiffs();
    state.detail = detail;
    detailElement.replaceChildren();
    if (!detail) {
        detailElement.append(element('p', 'empty', 'This row is no longer available.'));
        return;
    }

    const header = element('header', 'detail-header');
    const heading = element('div');
    const title = element('h2', 'detail-title');
    addBadge(title, detail.kind);
    title.append(element('span', undefined, detail.identity));
    heading.append(title, element('div', 'hint', `${detail.changedColumns.length} changed fields`));

    const viewControl = element('label', 'view-control');
    viewControl.append(element('span', undefined, 'Diff layout'));
    const layout = element('select');
    layout.setAttribute('aria-label', 'Diff layout');
    for (const value of ['split', 'unified'] as DiffStyle[]) {
        const option = element('option', undefined, value === 'split' ? 'Side by side' : 'Unified');
        option.value = value;
        option.selected = state.diffStyle === value;
        layout.append(option);
    }
    layout.addEventListener('change', () => {
        state.diffStyle = layout.value as DiffStyle;
        renderDetail(state.detail);
    });
    viewControl.append(layout);
    header.append(heading, viewControl);
    detailElement.append(header);

    for (const field of detail.fields) {
        const card = element('section', 'field');
        const fieldHead = element('div', 'field-head');
        fieldHead.append(
            element('span', 'field-name', field.column),
            element('span', 'types', `Target ${field.target.type} → Source ${field.source.type}`)
        );
        const diff = element('div', 'pierre-diff');
        card.append(fieldHead, diff);
        void renderPierreDiff(field, diff, generation);

        const disclosure = element('details');
        disclosure.append(element('summary', undefined, 'Exact source and target values'));
        const values = element('div', 'value-grid');
        values.append(renderSide('Target · before', field.target), renderSide('Source · after', field.source));
        disclosure.append(values);
        card.append(disclosure);
        detailElement.append(card);
    }
};

window.addEventListener('message', ({ data }: MessageEvent<WebviewMessage>) => {
    if (data.type === 'init') {
        renderStats(data.stats);
        renderPage(data.page);
    } else if (data.type === 'page') {
        renderPage(data.page);
    } else if (data.type === 'detail') {
        renderDetail(data.detail);
    } else if (data.type === 'error') {
        cleanUpDiffs();
        detailElement.replaceChildren(element('p', 'empty', data.message));
    }
});

requireElement<HTMLDivElement>('filters').addEventListener('click', (event) => {
    const button = (event.target as Element).closest<HTMLButtonElement>('[data-filter]');
    if (!button) {
        return;
    }
    document.querySelectorAll('.filter').forEach((item) => item.classList.toggle('active', item === button));
    state.filter = button.dataset.filter ?? 'all';
    requestPage(0);
});

let searchTimer: ReturnType<typeof setTimeout>;
requireElement<HTMLInputElement>('search').addEventListener('input', (event) => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
        state.query = (event.target as HTMLInputElement).value;
        requestPage(0);
    }, 180);
});

previousButton.addEventListener('click', () => requestPage(state.offset - state.limit));
nextButton.addEventListener('click', () => requestPage(state.offset + state.limit));
requireElement<HTMLButtonElement>('legacy').addEventListener('click', () => {
    vscode.postMessage({ type: 'legacyDiff' });
});
rowsElement.addEventListener('keydown', (event) => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') {
        return;
    }
    const rows = Array.from(rowsElement.querySelectorAll<HTMLButtonElement>('.row'));
    const index = rows.indexOf(document.activeElement as HTMLButtonElement);
    const next = rows[index + (event.key === 'ArrowDown' ? 1 : -1)];
    if (next) {
        event.preventDefault();
        next.focus();
    }
});
window.addEventListener('unload', cleanUpDiffs);
vscode.postMessage({ type: 'ready' });
