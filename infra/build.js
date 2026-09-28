import { exec } from 'child_process';
import { program } from 'commander';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

function asyncExec(command) {
    return new Promise((resolve, reject) => {
        exec(command, { env: process.env }, (error, stdout, stderr) => {
            if (error) {
                reject(error);
                return;
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

    console.log(`Succesful build ${mode}`);
} catch (e) {
    // The publish workflow runs `npm publish` straight after this; a failed build must not exit 0.
    console.error(e);
    process.exit(1);
}

// Local convenience: refresh a sibling `agents-ui` checkout's copy of the SDK.
try {
    console.log('start copy');
    const root = fileURLToPath(new URL('../', import.meta.url));
    const dist = path.resolve(root, './dist');
    const packageJson = path.resolve(root, './package.json');
    const embeddedModules = path.resolve(root, '../agents-ui/node_modules');
    const embeddedSdk = path.resolve(embeddedModules, './@d-id/client-sdk/dist');
    const embeddedViteCache = path.resolve(embeddedModules, './.vite');

    if (!fs.existsSync(embeddedSdk)) {
        console.log('No sibling agents-ui checkout, skipping copy');
    } else {
        console.log('Removing old package');
        fs.rmSync(embeddedSdk, { recursive: true, force: true });
        fs.rmSync(embeddedViteCache, { recursive: true, force: true });

        console.log('Copying new package');
        fs.cpSync(dist, embeddedSdk, { recursive: true });
        fs.copyFileSync(packageJson, path.resolve(embeddedSdk, '../package.json'));
    }
} catch (e) {
    console.error('Copy failed', e);
}
