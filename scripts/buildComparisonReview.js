const { build, context } = require('esbuild');
const { copyFileSync, mkdirSync, rmSync } = require('node:fs');
const { resolve } = require('node:path');

const minify = process.argv.includes('--minify');
const sourcemap = process.argv.includes('--sourcemap');
const watch = process.argv.includes('--watch');
const slimShikiPlugin = {
    name: 'slim-shiki',
    setup(buildApi) {
        buildApi.onResolve({ filter: /^shiki$/ }, () => ({ path: resolve(__dirname, 'shikiSlim.js') }));
        buildApi.onResolve({ filter: /^shiki\/wasm$/ }, () => ({ path: resolve(__dirname, 'shikiWasmStub.js') }));
    }
};

const options = {
    entryPoints: {
        index: './src/compare/comparisonReviewWebview.ts',
        pierre: './src/compare/pierreBridge.ts',
        'format-worker': './src/compare/formatWorker.ts'
    },
    bundle: true,
    outdir: './dist/compare-review',
    entryNames: '[name]',
    format: 'iife',
    platform: 'browser',
    target: 'chrome128',
    plugins: [slimShikiPlugin],
    minify,
    sourcemap,
    logLevel: 'info'
};

const outputDirectory = resolve(__dirname, '..', 'dist', 'compare-review');
rmSync(outputDirectory, { recursive: true, force: true });
mkdirSync(outputDirectory, { recursive: true });
copyFileSync(
    resolve(__dirname, '..', 'node_modules', '@pierre', 'diffs', 'LICENSE.md'),
    resolve(outputDirectory, 'PIERRE_DIFFS_LICENSE.md')
);
copyFileSync(
    resolve(__dirname, '..', 'node_modules', 'prettier', 'LICENSE'),
    resolve(outputDirectory, 'PRETTIER_LICENSE')
);
copyFileSync(
    resolve(__dirname, '..', 'node_modules', 'dompurify', 'LICENSE'),
    resolve(outputDirectory, 'DOMPURIFY_LICENSE')
);

if (watch) {
    context(options)
        .then((buildContext) => buildContext.watch())
        .catch(() => process.exit(1));
} else {
    build(options).catch(() => process.exit(1));
}
