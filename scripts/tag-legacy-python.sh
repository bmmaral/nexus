#!/usr/bin/env bash
# Tag the current commit as the last pre–v2-Rust snapshot (run manually once).
# Prefer pointing this at the tip of branch legacy/v1-python-ts after you push it:
#   git checkout legacy/v1-python-ts && ./scripts/tag-legacy-python.sh
set -euo pipefail
TAG="${1:-legacy-py-mvp}"
git tag -a "$TAG" -m "Legacy Python/TS project-memory MVP before Nexus v2 (Rust)"
echo "Created tag $TAG (push with: git push origin $TAG)"
echo "Archival branch: legacy/v1-python-ts — see docs/LEGACY_V1.md"
