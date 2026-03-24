# Scoring model

## Canonical score (0–100)

A higher score means "this is most likely the source of truth for the project cluster."

### Evidence inputs
- normalized remote URL match
- default branch / active branch presence
- latest commit recency
- dirty working tree
- README presence
- manifest presence
- test/CI signals
- remote-only vs local-only state
- duplicate overlap evidence
- optional manual pin

### Suggested weights
- remote URL certainty: 25
- freshest commit timeline: 15
- branch/head quality: 10
- manifest/readme coherence: 10
- tests + CI presence: 10
- low ambiguity cluster membership: 10
- active local worktree evidence: 10
- release/license/changelog signals: 5
- manual override: 5

### Worked examples (canonical)

These are illustrative; exact `kind` strings and deltas come from the planner implementation.

1. **Strong GitHub match**  
   Two local clones share `origin` normalized to `https://github.com/acme/widget.git`, and a `gh` ingest row matches the same URL. Evidence might include `remote_url_match` with a large positive delta and detail naming the host and repo.

2. **Freshness tie-break**  
   Same remote, two clones: one pushed last week, one idle for a year. Expect `fresh_commit` (or similar) favoring the active clone, with detail citing commit timestamps.

3. **Ambiguous duplicates**  
   Two folders with similar names but no shared remote and fuzzy overlap only. Cluster `status` trends toward `Ambiguous` or `ManualReview`, risk score rises, and canonical confidence stays lower.

4. **Remote-only cluster**  
   A GitHub repo with no local clone still forms a cluster; canonical clone may be empty while canonical remote is set, and actions may suggest “add local checkout” style items (read-only plan text).

## Usability score (0–100)

A higher score means "this repo is easier to build, reason about, and continue."

Signals:
- README present and non-trivial
- manifest/lockfile present
- tests present
- CI present
- license present
- changelog/contributing present
- install/run commands inferable
- secret findings absent
- dependency inventory extractable

## OSS readiness score (0–100)

A higher score means "this repo can more safely be polished and published."

Signals:
- usability baseline
- license present
- security scan clean
- secret scan clean
- SBOM extractable
- docs quality
- contribution metadata

## Risk score (0–100)

A higher score means "touch this carefully."

Signals:
- ambiguous cluster
- many clones with similar freshness
- missing remote linkage
- dirty tree without branch hygiene
- missing docs/tests
- secrets or security findings
- stale dependencies
- large unexplained divergence

## Evidence discipline

Every score must include an evidence list:

```json
[
  {"kind": "remote_url_match", "delta": 25, "detail": "matched github.com:demo/example"},
  {"kind": "fresh_commit", "delta": 12, "detail": "newest commit in cluster"},
  {"kind": "ci_present", "delta": 5, "detail": ".github/workflows/ci.yml exists"}
]
```

Scores without evidence are invalid.
