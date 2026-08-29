import path from 'node:path';

// The Windows release workflow stages the native package beside the bundle.
// The esbuild alias sends the adapter's bare import here; a computed require keeps
// the staged package out of the universal build.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const nativeDriver = require(path.join(__dirname, 'native', 'msnodesqlv8'));

export = nativeDriver;
