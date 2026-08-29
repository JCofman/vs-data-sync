const { spawnSync } = require('node:child_process');
const path = require('node:path');

const packageJson = require('../package.json');

const variant = process.argv[2];
if (variant !== 'universal') {
    throw new Error("Expected package variant 'universal'.");
}

const outputPath = path.join(
    'artifacts',
    `${packageJson.name}-${packageJson.version}-${variant}.vsix`
);
const vsceArgs = ['exec', '--', 'vsce', 'package', '--no-dependencies'];

vsceArgs.push('--out', outputPath);

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const result = spawnSync(npmCommand, vsceArgs, { stdio: 'inherit' });
if (result.error) {
    throw result.error;
}
if (result.status !== 0) {
    process.exit(result.status ?? 1);
}
