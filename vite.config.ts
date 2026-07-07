// @ts-nocheck
import preact from '@preact/preset-vite';
import dns from 'dns';
import { readFileSync } from 'fs';
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
            copyPublicDir: false,
            lib: {
                entry: resolve(__dirname, './src/index.ts'),
                name: 'index',
                fileName: 'index',
            },
        },
        plugins: [preact(), dts({ include: [resolve(__dirname, './src/**/*.{ts,tsx}')] })],
        resolve: {
            alias: {
                '@sdk': resolve(__dirname, './src'),
                '%': resolve(__dirname, './types'),
            },
        },
    });
};
