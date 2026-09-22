const { spawn } = require('node:child_process');

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const children = [
    spawn(npm, ['run', 'esbuild:extension', '--', '--sourcemap', '--watch'], { stdio: 'inherit' }),
    spawn(npm, ['run', 'esbuild:webview', '--', '--sourcemap', '--watch'], { stdio: 'inherit' })
];

const stop = () => children.forEach((child) => child.kill());
process.on('SIGINT', stop);
process.on('SIGTERM', stop);

children.forEach((child) => {
    child.on('exit', (code) => {
        if (code && code !== 0) {
            stop();
            process.exitCode = code;
        }
    });
});
