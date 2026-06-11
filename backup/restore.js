#!/usr/bin/env node
/**
 * Zerrillo — Restore da backup
 * Reimporta tutti i dati da un file JSON di backup in Supabase.
 *
 * Uso:
 *   node restore.js                          → cerca automaticamente l'ultimo backup
 *   node restore.js /percorso/database.json  → usa il file specificato
 *
 * Prima di eseguire:
 *   1. Ricrea le tabelle eseguendo schema-YYYY-MM-DD.sql nel SQL Editor di Supabase
 *   2. Assicurati che il file .env sia presente con REACT_APP_SUPABASE_URL e REACT_APP_SUPABASE_KEY
 */

const { createClient } = require("@supabase/supabase-js");
const fs   = require("fs");
const path = require("path");
const os   = require("os");

const PROJECT_ROOT = path.resolve(__dirname, "..");
const BACKUP_DIR   = path.join(os.homedir(), "Google Drive (zerrillopreziosi@gmail.com)", "gioielleria-backups");
const TABLES       = ["customers", "repairs", "ddts", "repairers", "orders"];
const BATCH        = 100; // record per chiamata upsert

/* ── Logger ── */
function log(msg) {
  console.log(`[${new Date().toLocaleString("it-IT")}] ${msg}`);
}

/* ── Legge .env ── */
function loadEnv() {
  const envPath = path.join(PROJECT_ROOT, ".env");
  if (!fs.existsSync(envPath)) throw new Error(".env non trovato in " + PROJECT_ROOT);
  const lines = fs.readFileSync(envPath, "utf8").split("\n");
  const env = {};
  for (const line of lines) {
    const m = line.match(/^([^#=\s]+)\s*=\s*(.*)$/);
    if (m) env[m[1].trim()] = m[2].trim();
  }
  return env;
}

/* ── Trova il backup più recente in automatico ── */
function findLatestBackup() {
  if (!fs.existsSync(BACKUP_DIR)) {
    throw new Error("Cartella backup non trovata: " + BACKUP_DIR);
  }
  const dirs = fs.readdirSync(BACKUP_DIR)
    .filter(n => /^\d{4}-\d{2}-\d{2}$/.test(n))
    .sort()
    .reverse();
  if (!dirs.length) throw new Error("Nessun backup trovato in " + BACKUP_DIR);
  const latest = dirs[0];
  const jsonFile = path.join(BACKUP_DIR, latest, `database-${latest}.json`);
  if (!fs.existsSync(jsonFile)) throw new Error("File JSON non trovato: " + jsonFile);
  return jsonFile;
}

/* ── Upsert a batch ── */
async function upsertBatch(supabase, table, records) {
  const { error } = await supabase.from(table).upsert(records, { onConflict: "id" });
  if (error) throw new Error(`Errore upsert ${table}: ${error.message}`);
}

async function main() {
  log("═══════════════════════════════════════");
  log("Zerrillo — Restore da backup");

  /* Individua file di backup */
  let backupFile = process.argv[2];
  if (backupFile) {
    if (!fs.existsSync(backupFile)) throw new Error("File non trovato: " + backupFile);
  } else {
    log("Nessun file specificato — ricerca dell'ultimo backup…");
    backupFile = findLatestBackup();
  }
  log("File: " + backupFile);

  /* Legge backup */
  const backup = JSON.parse(fs.readFileSync(backupFile, "utf8"));
  log(`Backup del: ${backup.date} (versione ${backup.version})`);

  /* Connessione Supabase */
  const env = loadEnv();
  const url = env.REACT_APP_SUPABASE_URL;
  const key = env.REACT_APP_SUPABASE_KEY;
  if (!url || !key) throw new Error("REACT_APP_SUPABASE_URL o REACT_APP_SUPABASE_KEY mancanti nel .env");
  const supabase = createClient(url, key);
  log("Connessione a Supabase: " + url);

  let totaleRecord = 0;
  let totaleErrori = 0;

  /* Ripristina tabella per tabella */
  for (const table of TABLES) {
    const records = backup[table];
    if (!records) {
      log(`  ⚠️  ${table}: non presente nel backup, saltata.`);
      continue;
    }
    if (!records.length) {
      log(`  ℹ️  ${table}: 0 record, saltata.`);
      continue;
    }

    log(`  📥 ${table}: ${records.length} record…`);
    let ripristinati = 0;

    for (let i = 0; i < records.length; i += BATCH) {
      const batch = records.slice(i, i + BATCH);
      try {
        await upsertBatch(supabase, table, batch);
        ripristinati += batch.length;
        process.stdout.write(`\r     ${ripristinati}/${records.length} record`);
      } catch (e) {
        totaleErrori++;
        log(`\n    ❌ Errore batch [${i}–${i + batch.length}]: ${e.message}`);
      }
    }

    process.stdout.write("\n");
    log(`     ✅ ${ripristinati}/${records.length} ripristinati`);
    totaleRecord += ripristinati;
  }

  log("═══════════════════════════════════════");
  if (totaleErrori === 0) {
    log(`✅ Restore completato! ${totaleRecord} record totali importati.`);
  } else {
    log(`⚠️  Restore completato con ${totaleErrori} errori. Controlla i log sopra.`);
    log(`   Record importati: ${totaleRecord}`);
    process.exit(1);
  }
  log("═══════════════════════════════════════");
}

main().catch(err => {
  log("ERRORE FATALE: " + err.message);
  process.exit(1);
});
