# CLI

**v0 command surface (frozen names/flags):** `scan`, `plan`, `report`, `doctor`, `apply --dry-run`, `tools`, `serve` (experimental). New subcommands may appear alongside these without removing them in v0.x.

## Configuration

Precedence (first match wins):

1. `--config /path/to/nexus.toml`
2. `NEXUS_CONFIG` environment variable
3. `./nexus.toml` in the current working directory
4. XDG config: `nexus.toml` under the OS config dir (`ProjectDirs`, qualifier `org.nexus.nexus`)
5. Built-in defaults (no file)

Relative `db_path` values are resolved against the **current working directory**. See `nexus.toml.example`.

## Commands

### `nexus scan`
Discover local repositories and persist scan output.

Example:
```bash
nexus scan ~/Projects ~/code --github-owner your-github-login
```

### `nexus plan`
Resolve clusters, score them, and write a deterministic plan.

- `--no-merge-base` — skip pairwise `git merge-base` evidence between git clones in the same cluster.
- `--external` — when **gitleaks**, **semgrep**, **jscpd**, or **syft** are on `PATH`, run them on each cluster’s canonical clone and attach summary evidence (can be slow).

Example:
```bash
nexus plan --write nexus-plan.json
nexus plan --write plan.json --external
```

### `nexus report`
Render markdown or JSON reports from the persisted state.

**Stable markdown sections (in order):** top-level title `Nexus Report`, run metadata bullets, then per cluster: `## {label}`, cluster metadata bullets, `### Scores`, `### Evidence`, `### Actions`. Tools that parse reports should key off these headings.

Example:
```bash
nexus report --format md
nexus report --format json
```

### `nexus doctor`
Validate environment and dependencies.

Example:
```bash
nexus doctor
```

### `nexus apply --dry-run`
Lists how many clusters/actions would be considered. v1 does not mutate repos; omitting `--dry-run` exits with an error.

Example:
```bash
nexus apply --dry-run
```

### `nexus serve` (experimental)
Read-only HTTP JSON API (requires a configured/openable SQLite DB). Intended for local inspection only; treat URLs and JSON shapes as **unstable** until promoted in release notes.

- `GET /health`
- `GET /v1/plan` — current plan JSON (recomputed from inventory)
- `GET /v1/inventory` — clone / remote / link counts

Example:
```bash
nexus serve --port 3030
```

### `nexus tools`
Print whether optional external scanners are on `PATH`.

## Future commands
- `nexus explain cluster <id>`
- `nexus export`
