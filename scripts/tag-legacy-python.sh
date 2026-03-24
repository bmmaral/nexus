#!/usr/bin/env bash
# Tag the current commit as the last pre–v2-Rust snapshot (run manually once).
# Prefer pointing this at the tip of branch legacy/v1-python-ts after you push it:
#   git checkout legacy/v1-python-ts && ./scripts/tag-legacy-python.sh
set -euo pipefail
TAG="${1:-legacy-py-mvp}"
HEAD_SHA="$(git rev-parse HEAD)"
if git rev-parse "$TAG" >/dev/null 2>&1; then
  TAG_SHA="$(git rev-parse "$TAG^{commit}")"
  if [[ "$TAG_SHA" == "$HEAD_SHA" ]]; then
    echo "Tag $TAG already points at HEAD ($HEAD_SHA); nothing to do."
    echo "Push (if needed): git push origin $TAG"
    exit 0
  fi
  echo "error: tag $TAG exists at $TAG_SHA but HEAD is $HEAD_SHA" >&2
  echo "  delete the tag or pass a different name: $0 my-other-tag" >&2
  exit 1
fi
git tag -a "$TAG" -m "Legacy Python/TS project-memory MVP before Nexus v2 (Rust)"
echo "Created tag $TAG (push with: git push origin $TAG)"
echo "Archival branch: legacy/v1-python-ts — see docs/LEGACY_V1.md"
