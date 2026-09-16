# Changelog

Notable changes to `@d-id/client-sdk`, newest first. The project follows [semantic versioning](https://semver.org/spec/v2.0.0.html): a breaking change to anything exported from `src/index.ts` bumps the major version.

Changes land under an `## Unreleased` heading at the top of this file and are renamed to the version number when that version is published, so an entry is written in the pull request that makes the change rather than at release time.

## 3.0.0

A breaking release that narrows the package to the surface the SDK actually supports.

Around fifty implementation types no longer leak from the package root, the names that were left have been made consistent, the errors carry a literal `kind` that a `switch` can narrow on, and the shapes the SDK builds itself are camelCase throughout. `AgentManager` gained `getChatMode()`, `getConnectionState()` and `getSessionInfo()`, so the current mode, connection state and session ids no longer have to be mirrored from the callbacks. Every exported symbol is documented, and the reference is published at [sdk.d-id.com](https://sdk.d-id.com/) on each release.

Upgrading from 2.x is a read of [`MIGRATION.md`](./MIGRATION.md) — every removal, rename and behavior change is listed there, with the replacement for each one. It is also on the site as the [migration guide](https://sdk.d-id.com/documents/Migration_guide.html).

## 2.0.0

`manager.agent` became a minimized shape and `speak()` stopped requiring a `provider`. Both are covered by the v1 → v2 section of [`MIGRATION.md`](./MIGRATION.md), which is also on the site as the [migration guide](https://sdk.d-id.com/documents/Migration_guide.html).
