import * as prettier from 'prettier/standalone';
import * as htmlPlugin from 'prettier/plugins/html';

import { formatJsonValue } from './fieldPresentation';

type FormatRequest = {
    id: number;
    format: 'json' | 'html';
    target: string | null;
    source: string | null;
};

type FormatResponse =
    | { id: number; target: string | null; source: string | null }
    | { id: number; error: string };

const formatValue = async (value: string | null, format: FormatRequest['format']): Promise<string | null> => {
    if (value === null) {
        return null;
    }
    if (format === 'json') {
        return formatJsonValue(value);
    }
    return prettier.format(value, {
        parser: 'html',
        plugins: [htmlPlugin],
        embeddedLanguageFormatting: 'off',
        htmlWhitespaceSensitivity: 'css',
        printWidth: 100
    });
};

self.addEventListener('message', async ({ data }: MessageEvent<FormatRequest>) => {
    let response: FormatResponse;
    try {
        const [target, source] = await Promise.all([
            formatValue(data.target, data.format),
            formatValue(data.source, data.format)
        ]);
        response = { id: data.id, target, source };
    } catch (error) {
        response = { id: data.id, error: error instanceof Error ? error.message : String(error) };
    }
    self.postMessage(response);
});
