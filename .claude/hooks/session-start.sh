#!/bin/bash
# Installa le dipendenze così che test e linter funzionino nelle sessioni
# di Claude Code sul web (il container parte senza node_modules).
set -euo pipefail

# Solo in ambiente remoto (Claude Code on the web)
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "$CLAUDE_PROJECT_DIR"

# App React (necessaria per `react-scripts test`). Idempotente e cache-friendly.
npm install --no-audit --no-fund
