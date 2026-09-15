// Injected at build time by Vite (see vite.config.ts `define`).
declare const __SDK_VERSION__: string;

/**
 * Version of `@d-id/client-sdk` this bundle was built from, such as `'3.0.0'`.
 *
 * The build replaces it with the `version` field of the package's `package.json`, so it is the
 * published version of the SDK rather than anything about the agent or the account. Running the
 * SDK straight from source, where no build step has substituted a value, leaves it as `'dev'`.
 *
 * The SDK attaches it to every analytics event it sends, and exports it so an application can log
 * it or quote it when reporting a problem to D-ID support.
 *
 * @category Agent Manager
 */
export const SDK_VERSION: string = typeof __SDK_VERSION__ === 'string' ? __SDK_VERSION__ : 'dev';
