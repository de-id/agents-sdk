// @ts-nocheck
import preact from '@preact/preset-vite';
import dns from 'dns';
import { copyFileSync, readFileSync } from 'fs';
import { resolve } from 'path';
import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';

const sdkVersion = JSON.parse(readFileSync(resolve(__dirname, 'package.json'), 'utf-8')).version;

// https://vitejs.dev/config/
export default ({ mode }) => {
    if (mode === 'development') {
        dns.setDefaultResultOrder('verbatim');
    }

    return defineConfig({
        define: {
            __SDK_VERSION__: JSON.stringify(sdkVersion || 'dev'),
        },
        server: { port: 3000 },
        build: {
            minify: mode !== 'development',
            // Published alongside the bundles: a minified SDK frame in a consumer's stack
            // trace or debugger is otherwise unreadable, and the maps are only fetched when
            // devtools are open.
            sourcemap: true,
            copyPublicDir: false,
            lib: {
                entry: resolve(__dirname, './src/index.ts'),
                name: 'index',
                fileName: 'index',
            },
        },
        plugins: [
            preact(),
            dts({
                include: [resolve(__dirname, './src/**/*.{ts,tsx}')],
                // Test files and test factories are not part of the published surface.
                exclude: [resolve(__dirname, './src/**/*.test.ts'), resolve(__dirname, './src/test-utils/**')],
                // One bundled `dist/index.d.ts`: the per-file tree's extensionless re-exports are
                // rejected by `moduleResolution: node16` — silently, under `skipLibCheck`.
                rollupTypes: true,
                // `moduleResolution: node16`/`nodenext` picks the declaration file by the
                // condition it resolved the code through. The package is `"type": "module"`,
                // so `dist/index.d.ts` is an ES module declaration and a `require()` consumer
                // is told it cannot be used that way. The same declarations under a `.d.cts`
                // extension are read as CommonJS; the bundled file has no imports of its own,
                // so a copy is all it takes.
                afterBuild: () => {
                    copyFileSync(resolve(__dirname, './dist/index.d.ts'), resolve(__dirname, './dist/index.d.cts'));
                },
            }),
        ],
        resolve: {
            alias: {
                '@sdk': resolve(__dirname, './src'),
                '%': resolve(__dirname, './types'),
            },
        },
    });
};
