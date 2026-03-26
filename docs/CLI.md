# CLI

## Stable core

These commands are the **stable surface** for repo fleet triage (names and primary flags remain compatible in v1.x):

| Command | Purpose |
| --- | --- |
| `scan` | Inventory local repos (and optional GitHub ingest) into SQLite |
| `score` | Compute **scores and evidence** per cluster (stdout only; does not persist a plan) |
| `plan` | Build clusters, scores, evidence, and **prioritized actions**; write `plan.json`; persist plan to SQLite |
| `report` | Render markdown or JSON from the current inventory (plan recomputed in-process) |
| `doctor` | Environment, toolchain, and DB checks (`--format json` for scripts) |
| `tools` | Optional external adapters on `PATH` (`--format json` for scripts) |
| `export` | JSON envelope with `inventory` (optional `--with-plan`) for backup or transfer |
| `import` | Replace DB inventory from export JSON (clears persisted plan); requires `--force` |
| `explain` | One cluster’s scores, evidence, and actions (by cluster query or clone/remote id); optional `--ai` narrative |

**Secondary (shipped, real)**

| Command | Purpose |
| --- | --- |
| `tui` | Interactive terminal table over the current plan (sort/filter, evidence, pin hint, export JSON); read-only |

**Experimental**

| Command | Purpose |
| --- | --- |
| `ai-summary` | AI-generated executive summary of the full plan (requires `ai.enabled = true` + API key) |
| `apply --dry-run` | Read-only preview: counts clusters and proposed actions (`--format json` supported). Mutating apply is not implemented. |
| `serve` | Read-only JSON over local SQLite for scripting. Not a dashboard, not multi-user, unstable API until release notes say otherwise. |

New subcommands may be added alongside the core without removing these in v1.x.

See `docs/PRODUCT_STRATEGY.md` for roadmap and non-goals.

## Configuration

Precedence (first match wins):

1. `--config /path/to/gittriage.toml`
2. `GITTRIAGE_CONFIG` environment variable
3. `./gittriage.toml` in the current working directory
4. XDG config: `gittriage.toml` under the OS config dir (`ProjectDirs`, qualifier `org.gittriage.gittriage`)
5. Built-in defaults (no file)

Relative `db_path` values are resolved against the **config file's parent directory** when a config file is found, or the current working directory when using built-in defaults. Tilde (`~`) is expanded. See `gittriage.toml.example`.

The **`[scan]`** table controls scanning behavior: `scan_mode` (`git_only` default, `project_roots`), `max_depth` (optional traversal limit), `respect_gitignore`, `max_readme_bytes`, and `max_hash_files`. Place a `.gittriageignore` file in any scan root with glob patterns to exclude directories.

The **`[planner]`** table drives planning: ambiguity cutoff (`ambiguous_cluster_threshold`), when to suggest archiving duplicates vs canonical strength (`archive_duplicate_threshold`), publish-hygiene actions vs `oss_readiness` (`oss_candidate_threshold`), optional **`canonical_pins`** (clone ids), **`ignored_cluster_keys`** / **`archive_hint_cluster_keys`** (exact `cluster_key` from JSON output), and optional **`scoring_profile`** (`docs/SCORING_PROFILES.md`). The `--profile` flag on `score`, `plan`, `report`, and `explain` overrides the config value. `serve` loads config once at startup.

## Commands

### `gittriage scan`

Discover local repositories and persist scan output.

Example:

```bash
gittriage scan ~/Projects ~/code --github-owner your-github-login
```

### `gittriage score`

Compute cluster **scores** and **evidence** from the latest inventory. Does **not** write a plan file and does **not** call `persist_plan` (use `gittriage plan` to refresh the persisted plan and `plan.json`).

- `--format text` (default) — human-readable lines per cluster (canonical, repo health, recoverability, publish readiness, risk).
- `--format json` — JSON with `kind: "gittriage_scores"`, `schema_version`, and a `clusters` array of `ClusterRecord` objects (same `scores` shape as `plan.json`, without per-cluster actions).
- `--no-merge-base` — skip pairwise `git merge-base` evidence between git clones in the same cluster.
- `--external` — when **gitleaks**, **semgrep**, **jscpd**, or **syft** are on `PATH`, run them on canonical clones and attach evidence (can be slow).
- `--profile <NAME>` — override `planner.scoring_profile` from config. Accepts: `default`, `publish`, `open_source`, `security`, `ai_handoff`.

Example:

```bash
gittriage score
gittriage score --format json --no-merge-base
```

### `gittriage plan`

Resolve clusters, score them, optionally attach external evidence, write a deterministic plan file, and **persist** the plan to SQLite (for `serve` and future consumers). Plan JSON includes `scoring_rules_version` (rule-set revision; see `docs/SCORING.md`).

- `--no-merge-base` — skip pairwise `git merge-base` evidence between git clones in the same cluster.
- `--external` — optional scanners on canonical clones (see above).
- `--profile <NAME>` — override `planner.scoring_profile` from config.

Example:

```bash
gittriage plan --write gittriage-plan.json
gittriage plan --write plan.json --external
```

### `gittriage report`

Render markdown or JSON reports from the current inventory (plan is rebuilt in memory; does not require a prior `plan --write`).

**Stable markdown sections (in order):** top-level title `GitTriage Report`, run metadata bullets, optional `## Warnings` (ambiguous / low-confidence clusters), then per cluster: `## {label}`, cluster metadata bullets, `### Scores`, `### Score explanations`, `### Evidence`, `### Actions`. Tools that parse reports should key off these headings.

Example:

```bash
gittriage report --format md
gittriage report --format json
```

### `gittriage doctor`

Validate environment and dependencies.

- `--format text` (default) — human-readable lines and tips.
- `--format json` — machine-readable document with `kind: "gittriage_doctor"`, config paths, DB open/sqlite status, `path_tools` (`git`, `gh`, `cc`), optional scanner map, and `rustc_version` when available.

Example:

```bash
gittriage doctor
gittriage doctor --format json
```

### `gittriage apply --dry-run`

Lists how many clusters/actions would be considered. v1 does not mutate repos; omitting `--dry-run` exits with an error.

- `--format text` (default) — one-line summary.
- `--format json` — `kind: "gittriage_apply_dry_run"` with `cluster_count`, `action_count`, and `scoring_rules_version` (only with `--dry-run`).

Example:

```bash
gittriage apply --dry-run
gittriage apply --dry-run --format json
```

### `gittriage serve` (experimental)

Read-only HTTP JSON API (requires a configured/openable SQLite DB). Intended for **local** inspection only; not a web product. Treat URLs and JSON shapes as **unstable** until promoted in release notes. Config is loaded once at startup (not per-request).

- `--port <PORT>` — listen port (default: 3030).
- `--listen <IP>` — bind address (default: `127.0.0.1`; use `0.0.0.0` for network access).
- `GET /health`
- `GET /v1/plan` — current plan JSON (recomputed from inventory using startup config)
- `GET /v1/inventory` — clone / remote / link counts

Example:

```bash
gittriage serve --port 3030
gittriage serve --port 8080 --listen 0.0.0.0
```

### `gittriage tools`

Print whether optional external scanners are on `PATH`.

- `--format text` (default) — two-column list.
- `--format json` — `kind: "gittriage_tools"` and a `tools` object (binary name → bool).

```bash
gittriage tools
gittriage tools --format json
```

### `gittriage export`

Writes JSON to stdout or `-o`/`--output`:

- `schema_version`, `kind: "gittriage_inventory_export_v1"`, `exported_at`, `generated_by`
- `inventory` — same shape as the in-memory snapshot (`clones`, `remotes`, `links`, and `run` when a row exists in SQLite — latest scan by `started_at`)
- optional `plan` when `--with-plan` — fresh plan (same flags as `plan` for merge-base and external scanners; not written to disk or persisted)

```bash
gittriage export -o backup.json
gittriage export --with-plan --external -o snapshot.json
```

### `gittriage import`

Replaces **all** runs, clones, remotes, links, and **clears** persisted plan tables (`clusters`, `evidence`, `actions`, …). Expects either the export envelope (`inventory` key) or a raw `InventorySnapshot` JSON object. Requires `--force`.

```bash
gittriage import backup.json --force
```

### `gittriage explain`

Subcommands: `cluster <ID_OR_LABEL>`, `clone <CLONE_ID>`, `remote <REMOTE_ID>`. Resolves a cluster (exact id, case-insensitive label, or unique substring for `cluster`), then prints text or `--format json`. Uses the same `--no-merge-base` and `--external` switches as `score`/`plan`.

- `--ai` — Append an AI-generated narrative explanation after the deterministic output. Requires `ai.enabled = true` in `gittriage.toml` and `GITTRIAGE_AI_API_KEY` or `OPENAI_API_KEY`. The AI output is clearly labeled as model-generated.
- `--profile <NAME>` — override `planner.scoring_profile` from config.

```bash
gittriage explain cluster my-repo
gittriage explain clone clone-abc --format json
gittriage explain cluster my-repo --ai
```

### `gittriage ai-summary`

Generate an AI-powered executive summary of the full plan. Requires `ai.enabled = true` in `gittriage.toml` and an API key (`GITTRIAGE_AI_API_KEY` or `OPENAI_API_KEY`). The output is clearly labeled as model-generated and never modifies deterministic scores or actions.

```bash
gittriage ai-summary
gittriage ai-summary --no-merge-base --external
```

### `gittriage tui`

Rebuilds the plan in-process (same `gittriage.toml` `[planner]` fields and `--no-merge-base` / `--external` as `score`/`plan`). **Read-only:** no charts, no background services, no mutation of repos.

| Key | Action |
| --- | --- |
| `j` / `↓`, `k` / `↑` | Move selection |
| `g` / `G` | Jump to top / bottom |
| `PgUp` / `PgDn` | Page up / down |
| `s` | Cycle sort: label, canonical↓, health↓, risk↓, ambiguous-first |
| `/` | Edit filter substring (label + `cluster_key`); Enter apply, Esc cancel |
| `f` | Clear filter |
| `Tab` | Toggle bottom panel: Detail ↔ Actions |
| `a` | Switch to Actions panel |
| `e` | Full evidence overlay for selected cluster (Esc back) |
| `p` | Show `canonical_pins` TOML snippet for the canonical clone |
| `o` | Write full plan JSON to `./gittriage-plan-tui-export.json` |
| `?` | Help overlay (Esc or `q` closes) |
| `q` / `Esc` / `Ctrl-c` | Quit |

Requires a TTY; exits with an error if stdout is not interactive.

```bash
gittriage tui
gittriage tui --no-merge-base --external
```

## AI integration

GitTriage can optionally use an OpenAI-compatible LLM to generate narrative explanations grounded in deterministic plan data. AI never modifies scores, canonical selections, or actions.

**Configuration** (`gittriage.toml`):

```toml
[ai]
enabled = true
api_base = "https://api.openai.com/v1"   # or any compatible endpoint
model = "gpt-4o-mini"
max_tokens = 1024
temperature = 0.2
```

**Environment:** Set `GITTRIAGE_AI_API_KEY` or `OPENAI_API_KEY`.

**Commands:** `gittriage explain --ai` (per-cluster narrative), `gittriage ai-summary` (plan-wide summary).

All AI output is clearly labeled as model-generated. When AI is disabled or misconfigured, commands exit with a clear error message.

## Planned next-layer commands

(Not necessarily in the first tagged v1 release.)

- `gittriage suggest` — AI-assisted suggestions grounded in GitTriage output (optional)
