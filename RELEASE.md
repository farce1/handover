# Release playbook

## 1) Prepare a release

1. Run `npm run release:precheck` and confirm all checks pass.
2. Decide the next version (`patch`, `minor`, `major`, or an explicit semver value).
3. In GitHub Actions, run the `Release` workflow with the `version` input you chose.

## 2) First release checklist

1. Confirm `package.json` version and package metadata are correct.
2. Keep `CHANGELOG.md` current for the same release.
3. Verify `/docs/src/content/docs/contributor/development.md` no longer references outdated release tooling.

## 3) Required repository secrets

1. `NPM_TOKEN` must be set in repository secrets.
2. Token must have publish permission for package `handover-cli`.

## 4) Verification

1. Confirm the workflow log shows `npm run release:publish` completed.
2. Open the published package page on npm and verify docs links and entry points.
3. If needed, tag a Git commit after release with `v<version>`.
