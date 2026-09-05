#!/bin/bash
set -e

NODE_PATH=$(which node)
NPM_PATH=$(which npm)
PROJECT="$HOME/gioielleria-repair"

echo "Node:  $NODE_PATH"
echo "npm:   $NPM_PATH"
echo "Dir:   $PROJECT"

# ── Print server ──────────────────────────────────────────────
cat > ~/Library/LaunchAgents/com.zerrillo.printserver.plist << PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>com.zerrillo.printserver</string>
  <key>ProgramArguments</key>
  <array>
    <string>$NODE_PATH</string>
    <string>$PROJECT/print-server/server.js</string>
  </array>
  <key>WorkingDirectory</key><string>$PROJECT/print-server</string>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>/tmp/zerrillo-print.log</string>
  <key>StandardErrorPath</key><string>/tmp/zerrillo-print.log</string>
</dict></plist>
PLIST

# ── React app ─────────────────────────────────────────────────
# NON più avviata in locale dal 05/09/2026: l'app riparazioni è online su
# Netlify (https://zerrillo-riparazioni.netlify.app). Il Mac mini fa solo
# stampa etichette + WhatsApp (print server) e backup notturno.
# Il vecchio plist è conservato in backup/launchagents-disattivati/.

# ── Carica il print server ─────────────────────────────────────
for plist in com.zerrillo.printserver; do
  launchctl unload ~/Library/LaunchAgents/$plist.plist 2>/dev/null || true
  launchctl load   ~/Library/LaunchAgents/$plist.plist
  echo "✅ $plist caricato"
done

echo ""
echo "Verifica stato:"
echo "  Print server → curl http://localhost:3001/status"
echo "  App          → https://zerrillo-riparazioni.netlify.app"
echo ""
echo "Log in tempo reale:"
echo "  tail -f /tmp/zerrillo-print.log"
