#!/usr/bin/env bash
# On-demand drift check (no CI): prints each sibling repo's pinned
# @hexatech-dev/shared / @hexatech-dev/ui tag next to this repo's latest git
# tag. Run whenever you want to know who's behind — this only reads drift,
# it doesn't fix it. See README.md's "Consumer version matrix" for the
# maintained source of truth.
#
# Usage: ./scripts/check-consumer-pins.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HEXATECH_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

LATEST_TAG="$(git -C "$SCRIPT_DIR/.." tag --sort=-v:refname | head -n1)"
echo "hexatech-shared latest tag: ${LATEST_TAG:-<no tags found>}"
echo

CONSUMERS=(
  "credbox-monorepo/package.json"
  "jalkhata-monorepo/package.json"
  "jalkhata-monorepo/www/package.json"
  "janmat-monorepo/package.json"
  "sportik-monorepo/package.json"
  "sportik-monorepo/server/package.json"
  "sportik-monorepo/web/package.json"
  "hexatech-website/package.json"
)

printf "%-40s %-12s %-12s\n" "Consumer" "shared" "ui"
printf "%-40s %-12s %-12s\n" "--------" "------" "--"

for rel in "${CONSUMERS[@]}"; do
  file="$HEXATECH_ROOT/$rel"
  if [[ ! -f "$file" ]]; then
    printf "%-40s %-12s %-12s\n" "$rel" "(missing)" "(missing)"
    continue
  fi
  shared_pin=$(grep -o '"@hexatech-dev/shared": *"[^"]*"' "$file" | sed -E 's/.*#(v[0-9.]+)".*/\1/' || true)
  ui_pin=$(grep -o '"@hexatech-dev/ui": *"[^"]*"' "$file" | sed -E 's/.*#(v[0-9.]+)".*/\1/' || true)
  printf "%-40s %-12s %-12s\n" "$rel" "${shared_pin:--}" "${ui_pin:--}"
done
