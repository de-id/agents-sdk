# SDK Staging/Prod Deployment

Simple setup for separate staging and production SDK packages.

## How it works

### Staging (automatic)
1. Push to `main` → triggers `publish-staging.yml`
2. Bumps version, builds, publishes `@d-id/client-sdk-staging`
3. Triggers E2E tests in agents-ui repo
4. E2E results get posted back as commit status

### Production (two options)

**Option A: Automated (via branch)**
1. Create PR from `main` → `prod` 
2. E2E validation blocks merge if tests haven't passed
3. Merge to `prod` → triggers `publish-prod-branch.yml`
4. Builds and publishes `@d-id/client-sdk`

**Option B: Manual**
1. Go to GitHub Actions → run `publish-prod.yml`
2. Choose version bump (patch/minor/major)
3. Builds and publishes `@d-id/client-sdk`

## Packages

- `@d-id/client-sdk-staging` - auto-published staging versions
- `@d-id/client-sdk` - manually released production versions

## Testing

agents-ui automatically tests new staging versions:
```bash
# E2E installs staging SDK like this:
yarn add @d-id/client-sdk@npm:@d-id/client-sdk-staging@1.2.3
```

This way production code keeps using the prod package, but tests can validate staging versions.

## Required secrets

**agents-sdk:**
- `NPM_TOKEN` - publish to npm
- `PAT_FOR_DISPATCH` - trigger cross-repo workflows

**agents-ui:**
- `PAT_FOR_DISPATCH` - update commit status
- `E2E_USER_APIKEY_STAGING`, `VITE_CLIENT_KEY_STAGING` - staging env vars
