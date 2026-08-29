'use strict';

const fs = require('node:fs');
const path = require('node:path');

if (process.platform !== 'win32' || process.arch !== 'x64') {
    throw new Error('The native driver package must be built on Windows x64.');
}

const projectRoot = path.join(__dirname, '..');
const sourceRoot = path.join(projectRoot, 'node_modules', 'msnodesqlv8');
const binaryPath = path.join(sourceRoot, 'build', 'Release', 'sqlserver.node');
const destinationRoot = path.join(projectRoot, 'dist', 'native', 'msnodesqlv8');

if (!fs.existsSync(binaryPath)) {
    throw new Error(`Missing native driver binary: ${binaryPath}`);
}

fs.rmSync(destinationRoot, { recursive: true, force: true });
fs.mkdirSync(path.join(destinationRoot, 'build', 'Release'), { recursive: true });
fs.cpSync(path.join(sourceRoot, 'lib'), path.join(destinationRoot, 'lib'), { recursive: true });
fs.copyFileSync(path.join(sourceRoot, 'LICENSE'), path.join(destinationRoot, 'LICENSE'));
fs.copyFileSync(path.join(sourceRoot, 'package.json'), path.join(destinationRoot, 'package.json'));
fs.copyFileSync(binaryPath, path.join(destinationRoot, 'build', 'Release', 'sqlserver.node'));
fs.mkdirSync(path.join(projectRoot, 'artifacts'), { recursive: true });
