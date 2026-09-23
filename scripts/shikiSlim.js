export {
    codeToHtml,
    createCssVariablesTheme,
    getTokenStyleObject,
    stringifyTokenStyle
} from '@shikijs/core';
export { createJavaScriptRegexEngine } from '@shikijs/engine-javascript';

export { createHighlighterCore as createHighlighter } from '@shikijs/core';

export const bundledLanguages = {};

export const createOnigurumaEngine = () => {
    throw new Error('The slim ReconcileDB renderer supports the JavaScript regex engine only.');
};
