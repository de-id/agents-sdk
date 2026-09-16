// @ts-nocheck
import preact from '@preact/preset-vite';
import dns from 'dns';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { defineConfig, transformWithEsbuild } from 'vite';
import dts from 'vite-plugin-dts';

const sdkVersion = JSON.parse(readFileSync(resolve(__dirname, 'package.json'), 'utf-8')).version;

/**
 * Vite refuses to minify whitespace in an ES *library* build — `resolveEsbuildTranspileOptions`
 * forces `minifyWhitespace: false` for that case to preserve `/* @__PURE__ *\/` annotations — so
 * the published ESM chunks would ship with full indentation and every JSDoc comment intact, tens of
 * kilobytes of gzip on every bundler consumer. Minify them here instead, once Rollup has finished
 * and the annotations have already done their work for our own tree-shaking.
 */
const minifyEsChunks = () => ({
    name: 'minify-es-lib-chunks',
    apply: 'build',
    async renderChunk(code, _chunk, outputOptions) {
        if (outputOptions.format !== 'es') {
            return null;
        }

        const { code: minified } = await transformWithEsbuild(code, 'chunk.js', {
            minify: true,
            target: 'es2020',
            legalComments: 'none',
            sourcemap: false,
        });

        return { code: minified, map: null };
    },
});

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
            copyPublicDir: false,
            lib: {
                entry: resolve(__dirname, './src/index.ts'),
                name: 'index',
                fileName: 'index',
            },
        },
        plugins: [
            preact(),
            ...(mode === 'development' ? [] : [minifyEsChunks()]),
            dts({
                include: [resolve(__dirname, './src/**/*.{ts,tsx}')],
                // Test files and test factories are not part of the published surface.
                exclude: [resolve(__dirname, './src/**/*.test.ts'), resolve(__dirname, './src/test-utils/**')],
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
