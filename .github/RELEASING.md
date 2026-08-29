# Releasing ReconcileDB for VS Code

Releases are produced only from version tags. The workflow builds and tests a universal VSIX on Linux, builds the Windows x64 VSIX with `msnodesqlv8` on Windows, publishes both artifacts to the Visual Studio Marketplace and Open VSX, and then attaches them to a GitHub release.

## One-time setup

Create the protected GitHub environment `extension-release` and add both environment secrets:

- `VSCE_PAT`: Azure DevOps personal access token authorized to publish under the `jcofman` Visual Studio Marketplace publisher.
- `OPEN_VSX_TOKEN`: Open VSX access token authorized to publish the `jcofman.reconciledb-vscode` namespace.

Use environment protection rules to require approval before the publish job starts. The workflow verifies both secrets before writing to either registry, preventing a release from starting with only one registry configured.

## Release checklist

1. Merge a green pull request into `main`.
2. Confirm `package.json` and `CHANGELOG.md` contain the intended version.
3. Create and push the matching tag, for example `v1.0.0` for package version `1.0.0`.
4. Approve the `extension-release` environment deployment after both package jobs pass.
5. Verify the Marketplace, Open VSX, and GitHub release listings contain both VSIX variants.

Do not reuse or move a release tag. Increment the package version and create a new tag for a corrected release.
