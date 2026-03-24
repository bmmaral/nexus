# External tools

Nexus can run **without** these programs; they extend what `scan`, `plan --external`, and `doctor` can see.

## `git`

Required for meaningful clone metadata (remotes, branches, commits). Install from your OS or [git-scm.com](https://git-scm.com/).

## `gh` (GitHub CLI)

Used to list repositories for a GitHub user/org when you pass `--github-owner` to `scan` (or set `github_owner` in config). Install: [cli.github.com](https://cli.github.com/). Run `gh auth login` so API calls succeed.

## `jscpd` (copy/paste detector)

Optional. When on `PATH` and you use `nexus plan --external`, Nexus may attach summary evidence from jscpd runs on the canonical clone in each cluster.

## `semgrep`

Optional static analysis CLI. Same pattern as jscpd under `plan --external`.

## `gitleaks`

Optional secret scanner. Same pattern under `plan --external`.

## `syft`

Optional SBOM generator. Same pattern under `plan --external`.

## Checking availability

Run:

```bash
nexus tools
```

This prints which of the optional scanners were found on `PATH`.
