#!/usr/bin/env bash
#
# merge-sessione2.sh — Merge sicuro di fix/perdite-dati in gestionale.
#
# Esegue: verifica preliminare → gestione collisioni file non tracciati →
# merge → risoluzione deterministica di HANDOFF.md → commit.
# Si FERMA (senza committare) su qualsiasi conflitto inatteso.
#
# NON riavvia l'app, NON fa push: quelli li fai tu dopo aver verificato.
# Da lanciare dalla cartella di produzione:  bash audit/merge-sessione2.sh
#
set -euo pipefail

BRANCH="fix/perdite-dati"
TARGET="gestionale"
HANDOFF_RESOLVED="audit/HANDOFF-post-merge.md"
BACKUP_DIR=".merge-sessione2-backup"

say(){ printf '\n\033[1m%s\033[0m\n' "$*"; }
die(){ printf '\n\033[31m✗ %s\033[0m\n' "$*" >&2; exit 1; }

# Deve girare dalla radice del repo di produzione
[ -d .git ] || die "Esegui dalla radice del repo (~/gioielleria-repair)."

# 1. Verifiche preliminari
say "1. Verifiche preliminari"
cur="$(git rev-parse --abbrev-ref HEAD)"
[ "$cur" = "$TARGET" ] || die "Sei su '$cur', non su '$TARGET'. Fai prima: git checkout $TARGET"
git rev-parse -q --verify "$BRANCH" >/dev/null || die "Branch '$BRANCH' inesistente."
[ -f "$HANDOFF_RESOLVED" ] || die "Manca $HANDOFF_RESOLVED (l'HANDOFF gia' risolto)."
git rev-parse -q --verify MERGE_HEAD >/dev/null 2>&1 && die "C'e' gia' un merge in corso. Risolvi o: git merge --abort"

# Working tree pulito sui file TRACCIATI (i non tracciati li gestiamo dopo)
if ! git diff --quiet || ! git diff --cached --quiet; then
  die "Ci sono modifiche non committate su file tracciati. Committa o stasha prima."
fi
echo "   OK: su $TARGET, branch presente, working tree tracciato pulito."

# 2. Sposta i file NON tracciati che il merge dovrebbe creare (altrimenti git aborta)
say "2. Gestione file non tracciati che collidono col merge"
COLLISIONS=()
while IFS= read -r line; do
  [ -n "$line" ] && COLLISIONS+=("$line")
done < <(
  comm -12 \
    <(git ls-files --others --exclude-standard | sort) \
    <(git ls-tree -r --name-only "$BRANCH" | sort)
)
if [ "${#COLLISIONS[@]}" -gt 0 ]; then
  mkdir -p "$BACKUP_DIR"
  for f in "${COLLISIONS[@]}"; do
    mkdir -p "$BACKUP_DIR/$(dirname "$f")"
    mv "$f" "$BACKUP_DIR/$f"
    echo "   spostato (backup): $f  →  $BACKUP_DIR/$f"
  done
else
  echo "   Nessuna collisione."
fi

restore_collisions(){
  [ "${#COLLISIONS[@]}" -gt 0 ] || return 0
  for f in "${COLLISIONS[@]}"; do
    [ -e "$BACKUP_DIR/$f" ] && { mkdir -p "$(dirname "$f")"; mv "$BACKUP_DIR/$f" "$f"; }
  done
}

# 3. Merge senza commit (applica il fondibile, marca i conflitti)
say "3. Merge di $BRANCH (senza commit automatico)"
git merge --no-ff --no-commit "$BRANCH" || true
if ! git rev-parse -q --verify MERGE_HEAD >/dev/null 2>&1; then
  restore_collisions
  die "Il merge non e' partito (vedi messaggio git sopra). Nulla e' stato modificato."
fi
echo "   Merge avviato."

# 4. Risoluzione deterministica di HANDOFF.md
say "4. Risoluzione HANDOFF.md dalla versione gia' fusa"
cp "$HANDOFF_RESOLVED" HANDOFF.md
git add HANDOFF.md
echo "   HANDOFF.md = $HANDOFF_RESOLVED"

# 5. Controllo conflitti residui inattesi
say "5. Controllo conflitti residui"
REMAINING="$(git diff --name-only --diff-filter=U || true)"
if [ -n "$REMAINING" ]; then
  printf '\033[31m   Conflitti NON gestiti su:\033[0m\n%s\n' "$REMAINING"
  echo "   Il merge NON viene committato. Opzioni:"
  echo "     - risolvi a mano quei file, poi:  git add <file> && git commit"
  echo "     - oppure annulla tutto:           git merge --abort"
  die "Intervento manuale necessario."
fi
echo "   Nessun conflitto residuo."

# 6. Commit del merge
say "6. Commit del merge"
git commit --no-edit
echo "   Merge committato."

# 7. Pulizia backup (i file collisi sono ora forniti dal branch, identici)
[ -d "$BACKUP_DIR" ] && rm -rf "$BACKUP_DIR"

say "✓ FATTO. fix/perdite-dati e' stato mergiato in $TARGET."
cat <<'NEXT'

Prossimi passi (manuali):
  1. Riavvia l'app e il print server:
       launchctl unload ~/Library/LaunchAgents/com.zerrillo.printserver.plist
       launchctl load   ~/Library/LaunchAgents/com.zerrillo.printserver.plist
     (e riavvia npm start se l'app gira a mano)
  2. Verifica veloce in app: una riparazione di prova con marca/referenza/lavori.
  3. Se vuoi, committa i deliverable audit residui:
       git add AUDIT_REPORT.md audit/ supabase/ && git commit -m "docs: audit + report"

Per annullare il merge (solo se NON hai ancora riavviato nulla e vuoi tornare indietro):
       git reset --hard ORIG_HEAD
NEXT
