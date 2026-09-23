export type FieldView = 'raw' | 'json' | 'html' | 'preview';

export const suggestedFieldView = (values: Array<{ type: string; value: string }>): FieldView | undefined => {
    if (values.some(({ type }) => type === 'array' || type === 'object')) {
        return 'json';
    }
    for (const { type, value } of values) {
        if (type !== 'string') {
            continue;
        }
        const trimmed = value.trimStart();
        if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
            return 'json';
        }
        if (/^<(?:!doctype\s+html|html\b|[a-z][\w:-]*(?:\s|>|\/))/i.test(trimmed)) {
            return 'html';
        }
    }
    return undefined;
};

export const formatJsonValue = (value: string): string => JSON.stringify(JSON.parse(value), null, 2);
