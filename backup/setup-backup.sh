#!/bin/bash
set -e

NODE_PATH=$(which node)
BACKUP_SCRIPT="$HOME/gioielleria-repair/backup/backup.js"
PLIST="$HOME/Library/LaunchAgents/com.zerrillo.backup.plist"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo " Zerrillo — Setup backup automatico"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Node: $NODE_PATH"
echo "Script: $BACKUP_SCRIPT"

# Installa le dipendenze
echo ""
echo "Installazione dipendenze npm…"
cd "$HOME/gioielleria-repair/backup"
npm install --silent
echo "✅ Dipendenze installate"

# Crea la cartella dei backup
mkdir -p "$HOME/gioielleria-backups"
echo "✅ Cartella backup: $HOME/gioielleria-backups"

# Crea il LaunchAgent (esecuzione ogni giorno alle 03:00)
cat > "$PLIST" << PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>com.zerrillo.backup</string>
  <key>ProgramArguments</key>
  <array>
    <string>$NODE_PATH</string>
    <string>$BACKUP_SCRIPT</string>
  </array>
  <key>WorkingDirectory</key><string>$HOME/gioielleria-repair/backup</string>
  <key>StartCalendarInterval</key>
  <dict>
    <key>Hour</key><integer>3</integer>
    <key>Minute</key><integer>0</integer>
  </dict>
  <key>StandardOutPath</key><string>/tmp/zerrillo-backup.log</string>
  <key>StandardErrorPath</key><string>/tmp/zerrillo-backup.log</string>
  <key>RunAtLoad</key><false/>
</dict></plist>
PLIST

# Ricarica il LaunchAgent
launchctl unload "$PLIST" 2>/dev/null || true
launchctl load "$PLIST"
echo "✅ LaunchAgent installato (esecuzione ogni giorno alle 03:00)"

# Esegue subito un backup di prova
echo ""
echo "Esecuzione backup di prova…"
node "$BACKUP_SCRIPT"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Setup completato!"
echo ""
echo "Backup salvati in: $HOME/gioielleria-backups/"
echo "Log:               tail -f /tmp/zerrillo-backup.log"
echo "Forza backup ora:  node ~/gioielleria-repair/backup/backup.js"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
