# Release checklist (packaging)

1. Tag `vX.Y.Z` and push; GitHub Actions **release** workflow uploads binaries + `.sha256` sidecars. macOS arm64 and x86_64 are built on one `macos-latest` runner (native + `x86_64-apple-darwin` cross-compile), so Intel macOS assets do not depend on deprecated `macos-13` hosts.
2. Update **source tarball** checksum anywhere it is pinned:
   - `packaging/homebrew/gittriage.rb` (`url` + `sha256`)
   - `packaging/aur/PKGBUILD` (`sha256sums`)
3. Set **Windows** checksums for template installers:
   - `packaging/chocolatey/tools/chocolateyinstall.ps1` → `checksum64` from `gittriage-vX.Y.Z-x86_64-pc-windows-msvc.exe.sha256`
   - `packaging/scoop/gittriage.json` → `architecture.64bit.hash` (or rely on `autoupdate` + `checkver`)
4. Bump **`packaging/npm/package.json`** `version` to match the tag (no leading `v`). Publishing **`@bmmaral/gittriage`** to GitHub Packages runs on **release published** via [`.github/workflows/npm-github-packages.yml`](../.github/workflows/npm-github-packages.yml). If **Packages** is still empty (e.g. the workflow was added after the release), open **Actions → npm-github-packages → Run workflow** once; `npm publish` uses `GITHUB_TOKEN` with `packages: write` (no extra secret).
5. **crates.io / Chocolatey community:** the workspace is not a single published crate on crates.io yet, and Chocolatey templates are not pushed to community.chocolatey.org by CI — README badges point at **install-from-Git** / **in-repo template** so Shields does not show red “not found”.
6. Optionally run `nix flake lock` after dependency changes, then commit `flake.lock`.

Quick checksums from a machine with `sha256sum`:

```bash
TAG=v0.1.0
for f in gittriage-${TAG}-*; do sha256sum "$f"; done
```
