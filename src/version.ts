// Injected at build time by Vite (see vite.config.ts `define`).
declare const __SDK_VERSION__: string;

export const SDK_VERSION: string = typeof __SDK_VERSION__ === 'string' ? __SDK_VERSION__ : 'dev';
