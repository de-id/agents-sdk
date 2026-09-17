// Injected at build time by Vite (see vite.config.ts `define`).
declare const __SDK_VERSION__: string;

/**
 * Published version of the SDK this bundle was built from, `'dev'` when it runs from source.
 * Attached to every analytics event.
 *
 * @internal
 */
export const SDK_VERSION: string = typeof __SDK_VERSION__ === 'string' ? __SDK_VERSION__ : 'dev';
