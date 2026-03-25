# Nexus TODO

Nexus is a **Rust-first, local-first repo fleet triage CLI**. The product should stay lightweight, deterministic, and useful without AI.

This TODO tracks the work needed to harden the CLI, formalize the scoring model, add an optional TUI, and ship broad binary distribution without drifting into a web-platform product.

## Product decisions

- [x] **Main branch is Rust-only.**
  - The Rust workspace under `crates/` is the product.
  - Python/TypeScript code is not maintained on `main`.

- [x] **Legacy v1 is archived, not co-developed.**
  - Tag `legacy-py-mvp` exists for the legacy era.
  - Archival branch: `legacy/v1-python-ts`.
  - `docs/LEGACY_V1.md` documents the migration.

- [x] **Nexus remains local-first and read-only by default.**
  - Stable direction: `scan`, `score`, `plan`, `report`, `doctor`, `tools`.
  - No destructive mutation in stable releases until explicitly designed.

- [x] **No web dashboard.**
  - The secondary interface, if needed, is a **minimal TUI**, not a browser app.

- [x] **AI is optional.**
  - Nexus must run correctly and usefully without AI.
  - AI may explain and suggest; it must not own the core scoring logic.

---

## P0 — Product boundary and command surface

### Freeze the v1 product shape
- [x] Confirm the stable core command set:
  - [x] `scan`
  - [x] `score`
  - [x] `plan`
  - [x] `report`
  - [x] `doctor`
  - [x] `tools`
- [x] Decide whether `apply --dry-run` remains as a preview command or is folded into `plan`/`report` (**stays** as the v1 preview; documented in `docs/CLI.md`)
- [x] Decide whether `serve` remains experimental only, moves behind a feature flag, or is removed entirely (**remains experimental**; may add a feature flag later—documented in `docs/CLI.md`)
- [x] Remove/avoid any docs language that makes Nexus sound like a web platform or long-running service (README, ARCHITECTURE, CLI, FAQ)

### Align docs with the chosen strategy
- [x] Add `docs/PRODUCT_STRATEGY.md` (present in repo)
- [x] Update `README.md` to reflect:
  - [x] repo fleet triage positioning
  - [x] no dashboard
  - [x] optional TUI
  - [x] optional AI
  - [x] default scoring model and optional profiles
- [x] Update `docs/CLI.md` to reflect the stable core and planned next-layer commands
- [x] Update `docs/ARCHITECTURE.md` to ensure any API/server components are clearly secondary or experimental
- [x] Replace “OSS compatibility/readiness” wording where appropriate with **Publish Readiness** and **Open Source Readiness** profiles (`docs/SCORING.md`)

---

## P1 — Scoring system hardening

### Finalize default scores
- [x] Lock the default score set (JSON: `canonical`, `usability`, `recoverability`, `oss_readiness` / publish readiness, `risk`):
  - [x] Canonical Confidence
  - [x] Repo Health
  - [x] Recoverability
  - [x] Maintenance Risk
- [x] Document each default score with:
  - [x] exact intent
  - [x] evidence signals
  - [x] weight rationale (see `crates/nexus-plan/src/scoring.rs` constants / comments + `docs/SCORING.md`)
  - [x] failure modes / blind spots (expand over time) — see `docs/SCORING.md` § *Failure modes and blind spots*

### Finalize optional profiles
- [x] Define **Publish Readiness** profile — `docs/SCORING_PROFILES.md` + `planner.scoring_profile = "publish"`
- [x] Define **Open Source Readiness** profile — `open_source` / `oss`
- [x] Define **Security / Supply-Chain Posture** profile — `security` (marker + docs; pair with `--external`)
- [x] Define **AI Handoff Readiness** profile — `ai_handoff`
- [x] Ensure optional profiles do not distort the default headline experience — profiles add evidence and adjust hygiene action thresholds only; default `ScoreBundle` axes unchanged

### Evidence quality
- [x] Add merge-base evidence as a first-class signal for canonical confidence (contributes to canonical score + evidence; see `merge_base` kind)
- [x] Add stronger duplicate-detection heuristics beyond name matching (shared `fingerprint` across clusters; same display name split across clusters)
- [x] Add explicit evidence for why a clone was **not** selected as canonical (`not_canonical_clone`)
- [x] Add protection against false canonical selection in ambiguous clusters (`ambiguous_cluster` evidence + report **Warnings**)
- [x] Make score explanations mandatory in report output (`### Score explanations` in markdown)
- [x] Version scoring rules separately from app version (`PlanDocument.scoring_rules_version`, `nexus_plan::SCORING_RULES_VERSION`)

---

## P2 — Planning engine and action quality

### Deterministic planning
- [x] Ensure every plan action includes:
  - [x] reason
  - [x] evidence summary (optional JSON field `evidence_summary`, populated for key actions)
  - [x] confidence (optional `confidence` on `PlanAction`)
  - [x] risk/trade-off note (optional `risk_note` on `PlanAction`)
- [x] Add explicit handling for:
  - [x] remote-only repos (`CloneLocalWorkspace` action + `remote_only_cluster` evidence)
  - [x] local-only repos (`CreateRemoteRepo` + `no_remote_linked` / `local_only_cluster` evidence)
  - [x] pivoted repos (heuristic: `duplicate_name_split_clusters` when same display name maps to different clusters / remotes)
  - [x] stale-but-important repos (`stale_but_artifacted` when old last commit but manifest+README present)
  - [x] ambiguous duplicate clusters (`name_bucket_duplicate_cluster` for multi-clone name-only buckets; cross-cluster hints above)
- [x] Decide whether plan priorities are global, profile-based, or both — **global** `Priority` enum in v1; profiles affect which actions fire, not priority semantics (`docs/PLAN_SCHEMA.md`)

### Overrides and user intent
- [x] Add manual cluster pinning / canonical overrides in config — `planner.canonical_pins` (clone ids)
- [x] Add ignore/archive hints without performing destructive actions — `ignored_cluster_keys` clears actions; `archive_hint_cluster_keys` adds evidence only
- [x] Decide how user overrides affect score computation and evidence display — pins add `user_pinned_canonical` + small canonical bump; ignore/archive are evidence + action suppression; see `docs/SCORING.md` / `docs/PLAN_SCHEMA.md`

---

## P3 — CLI and UX

### Core CLI polish
- [x] Ensure `scan -> score -> plan -> report` is the documented golden path (`README.md`, `docs/CLI.md`)
- [x] Add consistent machine-readable output options where needed (`doctor --format json`, `apply --dry-run --format json`; `score` / `report` / `export` already JSON-capable)
- [x] Improve `doctor` output with actionable remediation
- [x] Improve `report` readability for large inventories (score labels, explanations, action sub-bullets)
- [x] Add clear warning language for ambiguous plans and low-confidence scores (report **Warnings** section)

### New commands
- [x] Add `nexus explain` (`cluster` | `clone` | `remote`; text/json)
  - [x] deterministic explanation without AI
  - [x] optional AI-enhanced explanation when configured (`--ai` flag; `nexus-ai` crate)
- [x] Add `nexus export`
- [x] Add `nexus import` for saved inventory state / cross-machine comparison
- [x] Add `nexus ai-summary` for plan-wide AI summaries
- [ ] Decide whether `nexus suggest` ships in v1.x or later

### TUI
- [x] Design a minimal TUI over the same engine (`crates/nexus-tui`, `nexus tui`)
- [x] Scope the first TUI release to:
  - [x] cluster browsing
  - [x] score sorting/filtering
  - [x] canonical evidence inspection
  - [x] manual pinning/override (TOML snippet + `*` marker for configured pins)
  - [x] plan preview/export (`o` → `nexus-plan-tui-export.json`)
- [x] Ensure the TUI does not become a pseudo-dashboard (table + text panes only; `docs/CLI.md`)

---

## P4 — Adapter ecosystem

### External tools
- [x] Add timeouts and graceful degradation for external tools
- [x] Cache adapter outputs per run (`AdapterCache` keyed by tool+directory; reused across clusters)
- [x] Normalize adapter evidence into a shared schema (consistent `EvidenceItem` with `<tool>_<scan_type>` kind, zero delta, first-line summary)
- [x] Decide which adapters are officially supported vs best effort (gitleaks/semgrep/syft: Official; jscpd: Best effort; documented in `EXTERNAL_TOOLS.md`)

### Profile integration
- [x] Wire adapters cleanly into optional profiles, not the default happy path (`attach_filtered_evidence` with `AdapterCategory` filtering)
- [x] Ensure missing adapters never break `scan`, `score`, `plan`, or `report` (silently skipped; tested in `adapter_absence.rs`)
- [x] Document adapter installation and cost/benefit clearly (support tiers, cost/benefit table, caching, timeouts in `EXTERNAL_TOOLS.md`)

---

## P5 — AI integration

### Optional AI support
- [x] Add config for OpenAI-compatible endpoints (`[ai]` table in `nexus.toml`; `nexus-config` `AiConfig`)
- [x] Support user-supplied API key and base URL (`NEXUS_AI_API_KEY` / `OPENAI_API_KEY`; configurable `api_base`)
- [x] Define the grounding contract: AI consumes structured Nexus output, not arbitrary repo state by default (`nexus-ai` `build_grounding_context`)
- [x] Add safeguards so AI cannot silently change scores or canonical decisions (system prompt rules; read-only grounding; output labeled as model-generated)

### AI-assisted features
- [x] Ship AI-assisted explanation after deterministic `explain` exists (`nexus explain --ai`; `nexus ai-summary`)
- [ ] Evaluate AI-assisted `suggest` only after planning and scoring are stable
- [x] Add clear UX language indicating when output is deterministic vs model-generated (CLI banners: "model-generated, not deterministic")

---

## P6 — Testing and QA

### Rust tests
- [x] Add or expand planner rule tests for:
  - [x] canonical clone selection (`canonical_picks_freshest_clone_with_remote`, `canonical_prefers_clean_over_dirty`, `canonical_non_selected_gets_not_canonical_evidence`)
  - [x] remote-only projects (`remote_only_cluster_suggests_clone_workspace`, `remote_only_has_no_archive_duplicate_actions`)
  - [x] local-only projects (`local_only_clone_suggests_create_remote`, `local_only_bare_dir_has_lower_recoverability`)
  - [x] ambiguous duplicate clusters (`many_same_name_clones_get_name_bucket_duplicate_evidence`, `ambiguous_cluster_has_higher_risk`)
  - [x] stale-but-important repos (`stale_but_artifacted_gets_evidence_hint`, `very_stale_without_artifacts_has_elevated_risk`)
  - [x] override/pinning behavior (`pin_overrides_canonical_even_for_stale_clone`, `ignored_key_clears_actions_keeps_scores`, `archive_hint_adds_evidence_keeps_actions`)
- [x] Add snapshot tests for JSON plan/report stability (`plan_document_serializes_with_expected_fields`)
- [x] Add regression tests for scoring explanations and evidence rendering (markdown snapshot; `not_canonical_clone` planner test)
- [x] Add tests for adapter absence/failure cases across all optional profiles (`adapter_absence.rs`: 7 tests covering missing tools, nonexistent dirs, no canonical, cache dedup, category filtering, empty plans)

### CI/CD
- [x] Keep CI focused on the Rust product and supported packaging paths (`rust-ci.yml`: fmt, clippy, test, cargo-deny; no legacy workflows)
- [x] Verify:
  - [x] `cargo fmt --check`
  - [x] `cargo clippy -- -D warnings`
  - [x] `cargo test --workspace`
  - [x] docs/examples compile where applicable (workspace-level `cargo check` covers all)
- [x] Decide on Windows and macOS release support in addition to Linux (macOS: CI job added; Windows: deferred — no maintainer; Linux musl: cross-compile CI job added)
- [x] Add package-manager validation where practical for release workflows (`linux-musl` CI job cross-compiles static release binary)

---

## P7 — Packaging and distribution

### Distribution strategy
- [ ] Publish the first tagged release with release notes
- [ ] Provide install instructions for:
  - [ ] `cargo`
  - [ ] prebuilt binaries
- [ ] Prioritize package channels in this order:
  - [ ] Homebrew
  - [ ] Chocolatey
  - [ ] npm / npx / bunx wrapper
  - [ ] Scoop
  - [ ] AUR
  - [ ] Nix
- [ ] Keep npm/bun distribution as a thin binary wrapper, not a JS reimplementation

### CLI ergonomics
- [ ] Add shell completions
- [ ] Add man page / `--help` polish
- [ ] Add terminal demos or asciinema-style examples in docs

---

## P8 — Documentation and positioning

### Public-facing docs
- [x] Write a sharper 30-second pitch around repo fleet triage (`README.md`, `docs/PRODUCT_STRATEGY.md`)
- [x] Add a clear “Who this is for / not for” section to README
- [x] Add a “Why not a dashboard?” rationale briefly in docs/FAQ
- [x] Add examples for:
  - [x] duplicate resolution
  - [x] recoverability scoring
  - [x] publish-readiness profile
  - [x] AI optional flow
  (see `docs/EXAMPLES.md`)

### Internal clarity
- [x] Keep architecture docs honest about what is experimental (`docs/ARCHITECTURE.md`, `docs/CLI.md`)
- [x] Keep scoring docs aligned with real implementation (`docs/SCORING.md` ↔ `ScoreBundle` JSON fields)
- [ ] Keep package/distribution docs aligned with actual support policy

---

## Explicit non-goals for now

These are policies, not pending tasks:

- No web dashboard
- No automatic deletion/move/archive of repos
- No automatic commits or PR creation
- No revival of the legacy Python/TS app on `main`
- No AI dependency for core usefulness
- No opaque single score that cannot explain itself
- No enterprise portal ambitions before the CLI/TUI product is unquestionably strong
