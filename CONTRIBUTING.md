# Contributing

Thanks for helping improve GitTriage. This repository is the **Rust** workspace under `crates/`; the historical Python/TypeScript prototype is archived (see `docs/LEGACY_V1.md`).

## Before you open a PR

- Run `cargo fmt --all`
- Run `cargo clippy --workspace --all-targets -- -D warnings`
- Run `cargo test --workspace`
- Optional: `cargo deny check` (same as CI) if you change dependencies

## Scope and safety

GitTriage v2 is **read-only by default**: it inventories repos, clusters them, scores them, and emits plans. It must not delete, move, or rewrite user repositories without an explicit, separately reviewed design.

## Questions

Open a discussion or issue describing your use case; point to concrete paths, configs, or `plan.json` snippets when reporting planner or scoring bugs.
