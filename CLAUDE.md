# CLAUDE.md

Project rules for Claude Code in `@d-id/client-sdk`.

## Public API and documentation

`src/index.ts` is the package's public surface. Everything exported there is rendered at https://sdk.d-id.com/ on each prod release; nothing else is.

- **Adding an export is an API change.** Give the symbol a JSDoc block (one-sentence summary, blank line, details, `@param`/`@returns`, an `@example` where it helps) and an `@category` tag from: `Agent Manager`, `Authentication`, `Callbacks & Events`, `Streaming Options`, `Speak & Scripts`, `Chat`, `Voice`, `Errors`. State avatar applicability where it differs (Talks (V2) / Clips (V3) / Expressive (V4)). `yarn docs:check` fails on undocumented symbols, unexported referenced types and broken `{@link}`s; CI runs it on every PR.
- **Removing or renaming an export is a breaking change.** Bump the major version, add a section to `MIGRATION.md`, and update `src/public-api.test.ts` in the same commit.
- **Never `export *` from the root.** Implementation types stay under `src/types/*`, tagged `@internal`, so a mistaken re-export cannot reach the reference.
- **Doc comments must be true to the code.** Verify a behaviour claim at its call site before writing it; do not restate the README.
- Preview locally with `yarn docs:build` and open `docs-site/index.html`.

## Before committing

`yarn lint:fix`, then `yarn type-check && yarn test:ci && yarn docs:check`.
