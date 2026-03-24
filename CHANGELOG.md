# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html) for the Rust CLI and workspace crates.

## [0.1.0] - 2026-03-24

### Added

- Rust workspace: `nexus` CLI with `scan`, `plan`, `report`, `doctor`, `apply --dry-run`, `tools`, and experimental `serve`.
- SQLite-backed inventory, cluster resolution, scoring, and markdown/JSON reporting.
- Optional adapter hooks for `gh`, `jscpd`, `semgrep`, `gitleaks`, and `syft` when installed.
- `plan.json` format version field `schema_version` (currently `1`).

### Changed

- `main` is **Rust-only**; legacy Python/TypeScript sources are removed from this branch and preserved on archival branch `legacy/v1-python-ts` (tag `legacy-py-mvp` on the last snapshot commit).
