import { exec } from 'child_process';
import { program } from 'commander';
import fs from 'fs';
import path from 'path';

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

    const root = path.resolve(import.meta.url, '../../').split(':')[1];
    const dist = path.resolve(root, './dist');
    const embeddedSdk = path.resolve(root, '../embedded/node_modules/@d-id/client-sdk/dist');

    if (!fs.existsSync(embeddedSdk)) {
        throw new Error('dist does not exist');
    } else if (!fs.existsSync(embeddedSdk)) {
        throw new Error('package does not exist');
    }

    console.log('Removing old package');
    fs.rmSync(embeddedSdk, { recursive: true, force: true });

    console.log('Copying new package');
    fs.cpSync(dist, embeddedSdk, { recursive: true });
} catch (e) {
    console.error(e);
}
