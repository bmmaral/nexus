# External tools

Nexus can run **without** these programs; they extend what the engine can see. The `--external` flag is supported on: `score`, `plan`, `report`, `explain`, `export --with-plan`, `tui`, and `ai-summary`. The `doctor` command checks for their presence on `PATH`.

## Support tiers

| Tool | Category | Support | Cost | Benefit |
| --- | --- | --- | --- | --- |
| `gitleaks` | Security | **Official** | Fast (seconds per repo) | Secret leak detection evidence |
| `semgrep` | Security | **Official** | Moderate (10–60s per repo) | Static analysis findings |
| `syft` | Supply chain | **Official** | Moderate (5–30s per repo) | SBOM / dependency inventory |
| `jscpd` | Quality | Best effort | Moderate (10–60s per repo) | Copy/paste duplication evidence |

**Official** adapters are tested in CI, documented, and breakage is treated as a bug. **Best effort** adapters work when available but are not guaranteed across tool versions.

Missing adapters **never** break `scan`, `score`, `plan`, `report`, or any other command. They are silently skipped and produce no evidence.

## `git`

Required for meaningful clone metadata (remotes, branches, commits). Install from your OS or [git-scm.com](https://git-scm.com/).

## `gh` (GitHub CLI)

Used to list repositories for a GitHub user/org when you pass `--github-owner` to `scan` (or set `github_owner` in config). Install: [cli.github.com](https://cli.github.com/). Run `gh auth login` so API calls succeed.

## `gitleaks`

Secret scanner. When on `PATH` and you use `--external`, Nexus runs gitleaks on each cluster's canonical clone and attaches `gitleaks_detect` evidence.

Install: [gitleaks.io](https://gitleaks.io/) or `brew install gitleaks`.

## `semgrep`

Static analysis CLI. Same pattern under `--external`; produces `semgrep_scan` evidence.

Install: [semgrep.dev](https://semgrep.dev/) or `pip install semgrep`.

## `syft`

SBOM generator. Same pattern under `--external`; produces `syft_sbom` evidence.

Install: [anchore/syft](https://github.com/anchore/syft) or `brew install syft`.

## `jscpd`

Copy/paste detector. Best-effort adapter; produces `jscpd_scan` evidence.

Install: `npm install -g jscpd`.

## Evidence schema

All adapter evidence uses a consistent schema:

```json
{
  "id": "ext-<uuid>",
  "subject_kind": "Clone",
  "subject_id": "<canonical_clone_id>",
  "kind": "<tool>_<scan_type>",
  "score_delta": 0.0,
  "detail": "<tool>: <first line of output>"
}
```

Adapter evidence has `score_delta: 0.0` — it is informational only, not a score driver. Reports and the TUI display adapter findings for human review.

## Checking availability

```bash
nexus tools
nexus tools --format json
```

This prints which of the optional scanners were found on `PATH`.

## Caching

Within a single `--external` invocation, each adapter is run at most once per directory path. If two clusters share a canonical clone path (unusual but possible), the second invocation uses the cached result.

## Timeouts

Each adapter subprocess is limited to **180 seconds** by default. If a tool hangs, Nexus kills it and records evidence such as `timed out after 180s` instead of blocking the pipeline.

Override with `NEXUS_ADAPTER_TIMEOUT_SECS` (integer seconds, 1–86400):

```bash
NEXUS_ADAPTER_TIMEOUT_SECS=300 nexus plan --write plan.json --external
```

## Profile integration

Adapters are available to all scoring profiles by default when `--external` is used. The `security` and `supply_chain` profiles are natural companions for `--external`; they produce marker evidence that encourages reviewing adapter output.

Missing adapters never affect score computation or profile behavior. Profiles adjust action thresholds, not adapter availability.
