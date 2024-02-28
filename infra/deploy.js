import { exec } from 'child_process';
import { program } from 'commander';
import fs from 'fs';
import path from 'path';
import packageJson from '../package.json' assert { type: 'json' };

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

program.option('-v, --version <string>').parse();
const options = program.opts();

const { version } = options;
const [major, minor, patch, beta] = packageJson.version.replace('-beta', '').split('.');

let finalVersion = '';
if (version === 'minor') {
    finalVersion = `${major}.${+minor + 1}.${patch}`;
} else if (version === 'major') {
    finalVersion = `${+major + 1}.${minor}.${patch}`;
} else if (version === 'patch') {
    finalVersion = `${major}.${minor}.${+patch + 1}`;
} else if (version === 'beta') {
    finalVersion = `${major}.${minor}.${patch}-beta.${+(beta ?? 0) + 1}`;
}
const copy = JSON.stringify(packageJson, null, 4);
packageJson.version = finalVersion;
console.log();
const root = path.resolve(import.meta.url, '../../').split(':')[1];
fs.writeFileSync(root + '/package.json', JSON.stringify(packageJson, null, 4));

try {
    console.log(`Building version ${finalVersion}`);
    await asyncExec('yarn build');

    console.log(`Publishing version ${finalVersion}`);
    await asyncExec('npm publish --access public --registry https://registry.npmjs.org/');
    console.log(`Succesful deploy`)
} catch (e) {
    console.error(e);
    fs.writeFileSync(root + '/package.json', copy);
}
