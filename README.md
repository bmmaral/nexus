# Nexus

**Nexus** is a local-first **repository fleet intelligence** CLI: it scans directories for git repos, ingests GitHub metadata (via `gh`), groups clones and remotes into **clusters**, scores them, and writes a deterministic **plan**—without modifying your working trees.

**Before:** dozens of checkouts and remotes with unclear “source of truth,” risky for humans and agents. **After:** one SQLite-backed inventory, a reproducible `plan.json`, and human-readable reports you can diff and review.

See `docs/ARCHITECTURE.md`, `docs/SCORING.md`, `docs/CLI.md`, `docs/PLAN_SCHEMA.md`, `docs/CONFIG.md`, `docs/EXTERNAL_TOOLS.md`, and `TODO.md`.

## Install / build

- [Rust](https://rustup.rs/) stable (see `rust-toolchain.toml`)
- **C toolchain** for `rusqlite` (bundled SQLite): macOS Xcode CLT (`xcode-select --install`); Linux `build-essential` or equivalent
- `git` on `PATH`
- Optional: `gh` for `scan --github-owner` (see `docs/EXTERNAL_TOOLS.md`)

```bash
cargo build --release -p nexus-cli
# binary: target/release/nexus
```

Or debug: `cargo build -p nexus-cli` → `target/debug/nexus`.

Optional: [just](https://github.com/casey/just) recipes (`just test`, `just build`, …).

## Example workflow

```bash
cp nexus.toml.example nexus.toml   # edit db_path / default_roots / github_owner
nexus scan ~/Projects --github-owner your-login
nexus plan --write nexus-plan.json
nexus report --format md
nexus apply --dry-run
nexus doctor
nexus tools
```

**Sample `report` output shape (markdown):** title `Nexus Report`, generated metadata, then per cluster sections with scores, evidence bullets, and proposed actions (descriptive only in v0).

**`plan.json`:** includes `schema_version: 1`; full field list in `docs/PLAN_SCHEMA.md`.

## Commands (v0)

| Command | Role |
| --- | --- |
| `scan` | Discover local repos; optional GitHub ingest |
| `plan` | Resolve clusters, score, write JSON plan |
| `report` | Markdown or JSON from current inventory |
| `doctor` | Environment and DB sanity |
| `apply --dry-run` | Count proposed actions (no mutations) |
| `tools` | Which optional scanners are on `PATH` |
| `serve` | **Experimental** read-only JSON API (local use) |

## Crate layout

| Crate | Role |
| --- | --- |
| `nexus-core` | Domain types |
| `nexus-config` | Config loading |
| `nexus-db` | SQLite |
| `nexus-scan` | Filesystem scan |
| `nexus-git` | Git metadata |
| `nexus-github` | `gh` ingest |
| `nexus-plan` | Clustering & scoring |
| `nexus-report` | Markdown / JSON |
| `nexus-adapters` | Optional tool hooks |
| `nexus-api` | Axum API for `serve` |
| `nexus-cli` | CLI entrypoint |

## Limitations / non-goals (v0)

- No automatic delete/move/archive of repos; no commits or PRs from the tool.
- Scoring and clustering are heuristics—always review `plan` and `report` for high-stakes decisions.
- `serve` is experimental; do not rely on it as a stable public API yet.

## Legacy v1

Python/TypeScript prototypes are **not** on `main`. They are preserved on branch `legacy/v1-python-ts` and can be tagged with `scripts/tag-legacy-python.sh` (`legacy-py-mvp`). Details: `docs/LEGACY_V1.md`.

## License

MIT — see `LICENSE`.
