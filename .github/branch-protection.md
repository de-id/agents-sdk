# Branch Protection Setup

This document describes how to set up branch protection rules for the agents-sdk repository to ensure code quality and prevent direct pushes to main branches.

## Required Status Checks

The following status checks should be configured as **required** before merging pull requests:

### Main Branch Protection (`main`)

1. **Unit Tests** - `test` job from `.github/workflows/test.yml`
    - Ensures all unit tests pass
    - Includes TypeScript type checking
    - Validates test coverage requirements

2. **Code Formatting** - `lint` job from `.github/workflows/test.yml`
    - Ensures code follows Prettier formatting standards
    - Validates consistent code style across the codebase

3. **Build Verification** - `build` job from `.github/workflows/test.yml`
    - Ensures the project builds successfully
    - Validates that all TypeScript compilation passes
    - Confirms distribution files are generated correctly

4. **All Checks Passed** - `all-checks-passed` job from `.github/workflows/test.yml`
    - Meta-check that ensures all above jobs completed successfully
    - Single point of verification for branch protection

## GitHub Settings Configuration

To configure these branch protection rules:

1. Go to **Settings** → **Branches** in your GitHub repository
2. Click **Add rule** or edit existing rule for `main` branch
3. Configure the following settings:

### Basic Protection

- ✅ **Require a pull request before merging**
    - ✅ Require approvals: `1` (minimum)
    - ✅ Dismiss stale PR approvals when new commits are pushed
    - ✅ Require review from code owners (if CODEOWNERS file exists)

### Status Checks

- ✅ **Require status checks to pass before merging**
- ✅ **Require branches to be up to date before merging**
- **Required status checks:**
    - `test` (Unit Tests)
    - `lint` (Code Formatting)
    - `build` (Build Verification)
    - `all-checks-passed` (Meta Check)

### Additional Restrictions

- ✅ **Restrict pushes that create files that match a pattern** (optional)
- ✅ **Require signed commits** (recommended for security)
- ✅ **Include administrators** (apply rules to repository admins)

## Develop Branch Protection (`develop`)

If using a `develop` branch, apply similar rules but potentially with relaxed requirements:

- ✅ Require pull request reviews: `1`
- ✅ Require status checks: `test`, `lint`, `build`
- ✅ Require up-to-date branches
- ⚠️ May allow administrators to bypass for hotfixes

## Benefits

With these branch protection rules in place:

- ❌ **Block PRs with failing tests** - No code can be merged if tests fail
- ❌ **Block PRs with build errors** - Compilation issues prevent merging
- ❌ **Block PRs with formatting issues** - Maintains consistent code style
- ✅ **Allow PRs only when all checks pass** - Ensures code quality standards

## Troubleshooting

### Common Issues

1. **Status check not found**: Ensure the workflow job names match exactly
2. **Always failing checks**: Verify the workflow triggers on PR events
3. **Permissions errors**: Check that GitHub Actions has appropriate permissions

### Workflow Dependencies

The branch protection relies on the workflow defined in `.github/workflows/test.yml`. Ensure:

- Workflow triggers on `pull_request` events
- Job names match the required status check names
- All jobs complete successfully for the protection to pass

## Emergency Procedures

In case of critical hotfixes, repository administrators can:

1. Temporarily disable branch protection
2. Apply the hotfix directly
3. Re-enable branch protection
4. Create a follow-up PR to ensure the fix meets all standards

**Note**: This should be used sparingly and only for genuine emergencies.
