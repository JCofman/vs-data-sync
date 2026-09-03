# Releasing ReconcileDB for VS Code

Releases are produced only from version tags. The workflow builds and tests one universal VSIX, publishes it to the Visual Studio Marketplace and Open VSX, and then attaches it to a GitHub release.

## One-time setup

Create the protected GitHub environment `extension-release` and add both environment secrets:

- `VSCE_PAT`: Azure DevOps personal access token authorized to publish under the `jcofman` Visual Studio Marketplace publisher.
- `OPEN_VSX_TOKEN`: Open VSX access token authorized to publish the `jcofman.reconciledb-vscode` namespace.

Use environment protection rules to require approval before the publish job starts. The workflow verifies both secrets before writing to either registry, preventing a release from starting with only one registry configured.

## Release checklist

1. Merge a green pull request into `main`.
2. Confirm `package.json` and `CHANGELOG.md` contain the intended version.
3. Create and push the matching tag, for example `v1.0.2` for package version `1.0.2`.
4. Approve the `extension-release` environment deployment after the package job passes.
5. Verify the Marketplace, Open VSX, and GitHub release listings contain the universal VSIX.

Do not reuse or move a release tag. Increment the package version and create a new tag for a corrected release.

The workflow verifies access to the `jcofman` Open VSX namespace before publishing. On the first release, it creates the namespace with the configured token. Both registry commands skip an already-published version, so rerunning a partially completed release is safe.
