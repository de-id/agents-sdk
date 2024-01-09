// @ts-nocheck
import preact from '@preact/preset-vite';
import dns from 'dns';
import { resolve } from 'path';
import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';
import VitePluginHtmlEnv from 'vite-plugin-html-env';

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
                entry: resolve(__dirname, './lib/index.ts'),
                name: 'index',
                fileName: 'index',
            },
        },
        plugins: [
            preact(),
            VitePluginHtmlEnv({ compiler: false }),
            dts({ include: [resolve(__dirname, './lib/**/*.{ts,tsx}'), '../../common/types/src'] }),
        ],
        resolve: {
            alias: {
                '@': resolve(__dirname, './src'),
                $: resolve(__dirname, './lib'),
                '%': resolve(__dirname, '../../common/types/src'),
            },
        },
    });
};
