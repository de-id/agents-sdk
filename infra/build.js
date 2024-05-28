import { exec } from 'child_process';
import { program } from 'commander';
import path from 'path';
import fs from 'fs';

function asyncExec(command) {
    return new Promise((resolve, reject) => {
        exec(command, { env: process.env }, (error, stdout, stderr) => {
            if (error) {
                reject(error);
            }

            resolve(stdout || stderr);
        });
    });
}

try {
    program.option('-m, --mode <string>').parse();
    const options = program.opts();

    const { mode = 'production' } = options;

    console.log(`tsc`);
    await asyncExec('yarn tsc');

    console.log(`Building ${mode}`);
    await asyncExec(`yarn vite build --mode ${mode}`);

    console.log(`Succesful build ${mode}`)
} catch (e) {
    console.error(e);
}

try {
    console.log('start copy');
    const root = path.resolve(import.meta.url, '../../').split(':')[1];
    const dist = path.resolve(root, './dist');
    const packageJson = path.resolve(root, './package.json');
    const embeddedModules = path.resolve(root, '../agents-ui/node_modules');
    const embeddedSdk = path.resolve(embeddedModules, './@d-id/client-sdk/dist');
    const embeddedViteCache = path.resolve(embeddedModules, './.vite');

    if (!fs.existsSync(dist)) {
        throw new Error('dist does not exist');
    } else if (!fs.existsSync(embeddedSdk)) {
        throw new Error('package does not exist');
    }

    console.log('Removing old package');
    fs.rmSync(embeddedSdk, { recursive: true, force: true });
    fs.rmSync(embeddedViteCache, { recursive: true, force: true });

    console.log('Copying new package');
    fs.cpSync(dist, embeddedSdk, { recursive: true });
    fs.copyFileSync(packageJson, path.resolve(embeddedSdk, '../package.json'));
} catch (e) {
    console.error('Copy failed', e);
}