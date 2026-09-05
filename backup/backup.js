#!/usr/bin/env node
/**
 * Zerrillo — Backup automatico giornaliero
 * Esegue backup del database Supabase e del codice sorgente dell'app.
 * Conserva gli ultimi 30 giorni, elimina i più vecchi.
 */

const { createClient } = require("@supabase/supabase-js");
const fs   = require("fs");
const path = require("path");
const { execSync } = require("child_process");

/* ── Configurazione ─────────────────────────────────────── */
const PROJECT_ROOT = path.resolve(__dirname, "..");
const BACKUP_DIR   = path.join(require("os").homedir(), "Google Drive (zerrillopreziosi@gmail.com)", "gioielleria-backups");
const KEEP_DAYS    = 30;
const TABLES       = ["customers", "repairs", "ddts", "repairers", "orders", "quote_tokens"];

/* ── Schema SQL da salvare nel backup ───────────────────────────── */
const SCHEMA_SQL = `-- Schema Zerrillo Preziosi S.r.l. — generato automaticamente dal backup
-- Esegui questo file nel SQL Editor di Supabase per ricreare le tabelle.

create table if not exists public.customers (
  id                 text primary key,
  nome               text,
  cognome            text,
  telefono           text,
  telefono_prefisso  text,
  email              text,
  indirizzo          text,
  codice_fiscale     text,
  note               text,
  created_at         timestamptz default now()
);

create table if not exists public.repairs (
  id                                text primary key,
  numero                            text,
  customer_id                       text,
  categoria                         text,
  tipo_lavoro                       text,
  descrizione                       text,
  materiali                         text,
  marca                             text,
  referenza                         text,
  nota_preventivo                   text,
  problema                          text,
  status                            text default 'ricevuto',
  preventivo                        numeric,
  prezzo_finale                     numeric,
  preventivo_accettato              boolean default false,
  preventivo_rifiutato              boolean default false,
  richiesta_preventivo_fornitore    boolean default false,
  riparazione_interna               boolean default false,
  in_garanzia                       boolean default false,
  spesa                             numeric,
  acconto                           numeric,
  data_ricevuta                     date,
  data_consegna                     date,
  data_spedita                      date,
  data_rientrata                    date,
  data_consegnata                   date,
  ddt_id                            text,
  note                              text,
  foto_url                          text,
  eliminata                         boolean default false,
  items                             jsonb,
  mano                              text,
  dito                              text,
  operatore                         text,
  link_token                        text,
  wa_accept_sent_at                 timestamptz,
  wa_decline_sent_at                timestamptz,
  created_at                        timestamptz default now()
);

create table if not exists public.ddts (
  id                 text primary key,
  numero             text,
  data               date,
  riparatore         jsonb,
  riparazioni_ids    jsonb,
  stato              text,
  data_rientro       date,
  ddt_rientro_numero text,
  note               text,
  created_at         timestamptz default now()
);

create table if not exists public.repairers (
  id         text primary key,
  nome       text,
  indirizzo  text,
  piva       text,
  telefono   text,
  citta      text,
  provincia  text,
  cap        text,
  created_at timestamptz default now()
);

create table if not exists public.orders (
  id                     text primary key,
  numero                 text,
  customer_id            text,
  data_ordine            date,
  data_consegna_prevista date,
  stato                  text default 'ordinato',
  prodotti               jsonb default '[]',
  acconto                numeric,
  note                   text,
  foto_url               text,
  operatore              text,
  created_at             timestamptz default now()
);

create table if not exists public.quote_tokens (
  token       text primary key,
  repair_id   text not null,
  created_at  timestamptz default now(),
  accepted_at timestamptz,
  declined_at timestamptz
);

-- Colonne aggiuntive difensive (per DB creati da versioni precedenti dello schema)
alter table public.customers add column if not exists note text;
alter table public.repairs   add column if not exists marca text;
alter table public.repairs   add column if not exists referenza text;
alter table public.repairs   add column if not exists nota_preventivo text;
alter table public.repairs   add column if not exists preventivo_rifiutato boolean default false;
alter table public.repairs   add column if not exists in_garanzia boolean default false;
alter table public.repairs   add column if not exists operatore text;
alter table public.repairs   add column if not exists link_token text;
alter table public.repairs   add column if not exists data_spedita date;
alter table public.repairs   add column if not exists data_rientrata date;
alter table public.repairs   add column if not exists data_consegnata date;
alter table public.repairs   add column if not exists wa_accept_sent_at timestamptz;
alter table public.repairs   add column if not exists wa_decline_sent_at timestamptz;
alter table public.ddts      add column if not exists ddt_rientro_numero text;
alter table public.orders    add column if not exists operatore text;

-- Abilita RLS su tutte le tabelle
alter table public.customers    enable row level security;
alter table public.repairs      enable row level security;
alter table public.ddts         enable row level security;
alter table public.repairers    enable row level security;
alter table public.orders       enable row level security;
alter table public.quote_tokens enable row level security;

-- Policy: solo operatori loggati (authenticated). L'app è online: anon NON deve
-- leggere/scrivere l'anagrafica (vedi supabase/sql/fase2-lockdown-online.sql).
do $$ begin
  if not exists (select 1 from pg_policies where tablename='customers'    and policyname='authenticated_all') then
    create policy authenticated_all on public.customers    for all to authenticated using (true) with check (true); end if;
  if not exists (select 1 from pg_policies where tablename='repairs'      and policyname='authenticated_all') then
    create policy authenticated_all on public.repairs      for all to authenticated using (true) with check (true); end if;
  if not exists (select 1 from pg_policies where tablename='ddts'         and policyname='authenticated_all') then
    create policy authenticated_all on public.ddts         for all to authenticated using (true) with check (true); end if;
  if not exists (select 1 from pg_policies where tablename='repairers'    and policyname='authenticated_all') then
    create policy authenticated_all on public.repairers    for all to authenticated using (true) with check (true); end if;
  if not exists (select 1 from pg_policies where tablename='orders'       and policyname='authenticated_all') then
    create policy authenticated_all on public.orders       for all to authenticated using (true) with check (true); end if;
  if not exists (select 1 from pg_policies where tablename='quote_tokens' and policyname='authenticated_all') then
    create policy authenticated_all on public.quote_tokens for all to authenticated using (true) with check (true); end if;
end $$;
`;

/* ── Legge .env ─────────────────────────────────────────── */
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

/* ── Logger ─────────────────────────────────────────────── */
function log(msg) {
  const ts = new Date().toLocaleString("it-IT");
  const line = `[${ts}] ${msg}`;
  console.log(line);
  try {
    fs.appendFileSync("/tmp/zerrillo-backup.log", line + "\n");
  } catch (_) {}
}

/* ── Data corrente YYYY-MM-DD ───────────────────────────── */
const dateStr = new Date().toISOString().split("T")[0];

async function main() {
  log("═══════════════════════════════════════");
  log("Avvio backup Zerrillo — " + dateStr);

  /* Crea cartella di destinazione */
  const destDir = path.join(BACKUP_DIR, dateStr);
  fs.mkdirSync(destDir, { recursive: true });
  log("Cartella backup: " + destDir);

  /* ── 1. Backup database Supabase ── */
  log("Connessione a Supabase…");
  const env = loadEnv();
  const url = env.REACT_APP_SUPABASE_URL;
  // Fase 1: preferisci la service_role (bypassa RLS, resiste al lockdown anon
  // della Fase 2); fallback alla chiave anon finché la service non è nel .env.
  const key = env.SUPABASE_SERVICE_ROLE_KEY || env.REACT_APP_SUPABASE_KEY;
  if (!url || !key) throw new Error("REACT_APP_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY mancanti nel .env");

  const supabase = createClient(url, key);
  const dbBackup = { version: 2, date: new Date().toISOString() };

  const PAGE = 1000;
  for (const table of TABLES) {
    log(`  Esportazione tabella: ${table}…`);
    let all = [], from = 0, done = false;
    while (!done) {
      const { data, error } = await supabase.from(table).select("*").range(from, from + PAGE - 1);
      if (error) throw new Error(`Errore lettura ${table} (offset ${from}): ${error.message}`);
      all = all.concat(data);
      done = data.length < PAGE;
      from += PAGE;
    }
    dbBackup[table] = all;
    log(`    → ${all.length} record`);
  }

  const dbFile = path.join(destDir, `database-${dateStr}.json`);
  fs.writeFileSync(dbFile, JSON.stringify(dbBackup, null, 2), "utf8");
  const dbSizeKB = Math.round(fs.statSync(dbFile).size / 1024);
  log(`Database salvato: ${dbFile} (${dbSizeKB} KB)`);

  /* ── Schema SQL ── */
  const sqlFile = path.join(destDir, `schema-${dateStr}.sql`);
  fs.writeFileSync(sqlFile, SCHEMA_SQL, "utf8");
  log(`Schema SQL salvato: ${sqlFile}`);

  /* ── 2. Backup sorgente app ── */
  log("Creazione archivio sorgente app…");
  const srcFile = path.join(destDir, `app-source-${dateStr}.tar.gz`);
  execSync(
    `tar -czf "${srcFile}" \
      --exclude="node_modules" \
      --exclude="build" \
      --exclude=".git" \
      --exclude="backup/node_modules" \
      -C "${path.dirname(PROJECT_ROOT)}" \
      "${path.basename(PROJECT_ROOT)}"`,
    { stdio: "pipe" }
  );
  const srcSizeKB = Math.round(fs.statSync(srcFile).size / 1024);
  log(`Sorgente app salvata: ${srcFile} (${srcSizeKB} KB)`);

  /* ── 3. Rotazione: elimina backup più vecchi di KEEP_DAYS ── */
  log(`Rotazione backup (conservo ultimi ${KEEP_DAYS} giorni)…`);
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - KEEP_DAYS);
  const entries = fs.readdirSync(BACKUP_DIR, { withFileTypes: true });
  let deleted = 0;
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const d = new Date(entry.name);
    if (!isNaN(d) && d < cutoff) {
      fs.rmSync(path.join(BACKUP_DIR, entry.name), { recursive: true, force: true });
      log(`  Eliminato backup obsoleto: ${entry.name}`);
      deleted++;
    }
  }
  if (deleted === 0) log("  Nessun backup da eliminare.");

  /* ── Riepilogo ── */
  const remaining = fs.readdirSync(BACKUP_DIR).filter(n => /^\d{4}-\d{2}-\d{2}$/.test(n)).length;
  log(`Backup completato con successo. Backup totali conservati: ${remaining}`);
  log("═══════════════════════════════════════");
}

main().catch(err => {
  log("ERRORE: " + err.message);
  process.exit(1);
});
