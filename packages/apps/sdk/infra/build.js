import { exec } from 'child_process';
import { program } from 'commander';
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
    console.log(`Succesful build ${mode}`)
} catch (e) {
    console.error(e);
}
