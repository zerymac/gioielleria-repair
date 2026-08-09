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

# ── React app (LAN) ──────────────────────────────────────────
# Con l'app su Netlify NON è più necessario servirla dal Mac. Il print-server
# (sopra) ospita i consumer di stampa/WhatsApp. Questo agent resta DISATTIVATO
# per default; riabilitarlo solo come fallback LAN durante la transizione,
# impostando ENABLE_REACT_APP=1 prima di lanciare lo script.
if [ "${ENABLE_REACT_APP:-0}" = "1" ]; then
cat > ~/Library/LaunchAgents/com.zerrillo.reactapp.plist << PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>com.zerrillo.reactapp</string>
  <key>ProgramArguments</key>
  <array>
    <string>$NPM_PATH</string>
    <string>start</string>
  </array>
  <key>WorkingDirectory</key><string>$PROJECT</string>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin</string>
    <key>BROWSER</key><string>none</string>
    <key>PORT</key><string>3000</string>
  </dict>
  <key>StandardOutPath</key><string>/tmp/zerrillo-react.log</string>
  <key>StandardErrorPath</key><string>/tmp/zerrillo-react.log</string>
</dict></plist>
PLIST
  AGENTS="com.zerrillo.printserver com.zerrillo.reactapp"
else
  # Rimuove l'agent React se presente da un setup precedente
  launchctl unload ~/Library/LaunchAgents/com.zerrillo.reactapp.plist 2>/dev/null || true
  rm -f ~/Library/LaunchAgents/com.zerrillo.reactapp.plist
  AGENTS="com.zerrillo.printserver"
fi

# ── Carica gli agent ──────────────────────────────────────────
for plist in $AGENTS; do
  launchctl unload ~/Library/LaunchAgents/$plist.plist 2>/dev/null || true
  launchctl load   ~/Library/LaunchAgents/$plist.plist
  echo "✅ $plist caricato"
done

echo ""
echo "Verifica stato:"
echo "  Print server → curl http://localhost:3001/status"
echo "  App          → su Netlify (o http://localhost:3000 se ENABLE_REACT_APP=1)"
echo ""
echo "Log in tempo reale:"
echo "  tail -f /tmp/zerrillo-print.log"
