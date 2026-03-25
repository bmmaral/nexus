# Distribution

Nexus ships **prebuilt binaries** on [GitHub Releases](https://github.com/bmmaral/nexus/releases) (Linux musl x86_64, macOS arm64/x86_64, Windows x86_64) plus `.sha256` sidecars. You can also **build from source** with Rust.

## Cargo (from crates.io)

When published:

```bash
cargo install nexus-cli
```

Until then, from a git checkout:

```bash
cargo install --path crates/nexus-cli
# or
cargo install --locked --git https://github.com/bmmaral/nexus --tag v0.1.0 --package nexus-cli
```

## Homebrew (formula in repo)

Builds from the release **source tarball** (Rust required):

```bash
brew install --formula ./packaging/homebrew/nexus.rb
```

After each upstream tag, update `url`, `sha256`, and `version` in `packaging/homebrew/nexus.rb` (tarball checksum: `curl -sL …/vX.Y.Z.tar.gz | shasum -a 256`).

To publish a **tap**, mirror `nexus.rb` into a `homebrew-*` repository’s `Formula/` directory and document `brew tap owner/repo`.

## Scoop (Windows)

Manifest: [`packaging/scoop/nexus.json`](../packaging/scoop/nexus.json).

1. Copy the manifest into a Scoop bucket (or install from a raw URL).
2. Set `"hash"` for the Windows `.exe` to the value from the matching `.sha256` file on the release, **or** use `checkver` / `autoupdate` to refresh from `$url.sha256`.

`pre_install` renames the downloaded executable to `nexus.exe`.

## Chocolatey (Windows)

Packaging lives under [`packaging/chocolatey/`](../packaging/chocolatey/). Set `checksum64` in `tools/chocolateyinstall.ps1` from the release `.sha256` file for that version, then:

```powershell
choco pack packaging/chocolatey/nexus-cli.nuspec
choco install nexus-cli -s . -y
```

For a one-off install before the checksum is wired, Chocolatey supports `--ignore-checksums` (not recommended for automation).

## npm / npx / bunx (thin binary wrapper)

Package: [`packaging/npm/`](../packaging/npm/). It downloads the GitHub Release binary for the current platform into `~/.cache/nexus-cli/<version>/`.

```bash
cd packaging/npm && npm pack && npm install -g ./nexus-cli-*.tgz
nexus --version
```

Keep `package.json` `version` in sync with a GitHub tag (`v0.1.0` → assets `nexus-v0.1.0-…`).

```bash
bunx --bun ./packaging/npm/bin/nexus.js -- --version   # after local pack/install
```

## AUR (Arch Linux)

Reference [`packaging/aur/PKGBUILD`](../packaging/aur/PKGBUILD): copy into an AUR package, add a `Maintainer:` line, and submit. It builds the `nexus-cli` crate from the tagged source tarball.

## Nix

A [`flake.nix`](../flake.nix) at the repo root builds `nexus-cli` from this workspace.

```bash
nix run .#nexus -- --version
nix build .#nexus-cli
```

First time in a fresh clone, generate a lockfile:

```bash
nix flake lock
```

## Support policy

| Channel    | Status |
| ---------- | ------ |
| GitHub Releases | Primary |
| Cargo / source | Primary |
| Homebrew formula (in-repo) | Supported template |
| Nix flake | Supported template |
| AUR PKGBUILD | Upstream reference (maintainer submits to AUR) |
| npm wrapper | Supported template |
| Scoop / Chocolatey | Supported templates (checksums per release) |

Windows binaries exist **from the first release that includes the `windows` job** in `.github/workflows/release.yml`; update Scoop/Chocolatey hashes from the published `.sha256` files.
