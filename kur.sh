#!/usr/bin/env bash
# Eski giriş noktası: işi platformdan bağımsız kur.mjs yapar. Bayraklar aynen geçer.
#   ./kur.sh [--kuru] [--sessiz] [--kaldir]
set -euo pipefail
command -v node >/dev/null 2>&1 || { echo "node bulunamadı; Node 20+ kur." >&2; exit 1; }
exec node "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)/kur.mjs" "$@"
