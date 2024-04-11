// @ts-nocheck
import preact from '@preact/preset-vite';
import dns from 'dns';
import { resolve } from 'path';
import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';

// https://vitejs.dev/config/
export default ({ mode }) => {
    if (mode === 'development') {
        dns.setDefaultResultOrder('verbatim');
    }

    return defineConfig({
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
                $: resolve(__dirname, './src'),
                '%': resolve(__dirname, './types'),
            },
        },
    });
};
