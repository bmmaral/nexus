# Release checklist (packaging)

1. Tag `vX.Y.Z` and push; GitHub Actions **release** workflow uploads binaries + `.sha256` sidecars.
2. Update **source tarball** checksum anywhere it is pinned:
   - `packaging/homebrew/nexus.rb` (`url` + `sha256`)
   - `packaging/aur/PKGBUILD` (`sha256sums`)
3. Set **Windows** checksums for template installers:
   - `packaging/chocolatey/tools/chocolateyinstall.ps1` → `checksum64` from `nexus-vX.Y.Z-x86_64-pc-windows-msvc.exe.sha256`
   - `packaging/scoop/nexus.json` → `architecture.64bit.hash` (or rely on `autoupdate` + `checkver`)
4. Bump **`packaging/npm/package.json`** `version` to match the tag (no leading `v`).
5. Optionally run `nix flake lock` after dependency changes, then commit `flake.lock`.

Quick checksums from a machine with `sha256sum`:

```bash
TAG=v0.1.0
for f in nexus-${TAG}-*; do sha256sum "$f"; done
```
