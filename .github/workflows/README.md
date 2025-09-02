# CI/CD Workflows

This directory contains GitHub Actions workflows for automated testing, building, and deployment.

## 🧪 Test Workflow (`test.yml`)

**Triggers**: Pull requests and pushes to `main`/`develop`

### Jobs:

1. **`test`** - Unit Tests
    - Runs all Jest unit tests
    - Ensures all tests pass

2. **`lint`** - Code Quality
    - Checks TypeScript compilation
    - Validates code formatting (Prettier)

3. **`build`** - Build Verification
    - Ensures project builds successfully
    - Uploads build artifacts

4. **`all-checks-passed`** - Gate Keeper
    - Only passes if ALL other jobs succeed
    - **This is the required status check for branch protection**

### Test Requirements:

- All unit tests must pass
- No failing test cases

## 🚀 E2E Workflows

- `pr-main-e2e.yml` - E2E tests against production
- `pr-prod-e2e.yml` - Production E2E validation
- `manual-e2e.yml` - Manual E2E trigger
- `publish-on-merge.yml` - Package publishing

## 🔧 Local Development

```bash
# Run tests
yarn test

# Run tests in watch mode
yarn test:watch

# Run tests in CI mode
yarn test:ci

# Type checking
yarn type-check

# Code formatting
yarn lint
yarn lint:fix

# Full CI simulation
yarn ci:test
```

## 🛡️ Branch Protection

See `.github/branch-protection.md` for setting up required status checks that will:

- ❌ Block PRs with failing tests
- ❌ Block PRs with build errors
- ✅ Allow PRs only when all checks pass

## 📊 Artifacts

Each workflow run produces:

- **Build Artifacts** (3 days retention)
- **Test Results** (30 days retention for E2E)

## 🔍 Monitoring

- Test results visible in workflow logs
- Failed runs block PR merging automatically
