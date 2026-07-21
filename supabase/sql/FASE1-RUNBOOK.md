# Fase 1 — Fondamenta di sicurezza dati · Runbook

_Piano sicurezza/migrazione Zerrillo Preziosi — avviato 04/07/2026._

## Censimento client → permessi (stato attuale)

Oggi **tutte** le tabelle hanno una sola policy `anon_all … for all to anon using(true) with check(true)` (fonte: `backup/backup.js:143-165`). Chi consuma il DB e con quale identità:

| Consumatore | Dove | Chiave oggi | Accesso |
|---|---|---|---|
| App | browser LAN | `anon` | CRUD customers/repairs/ddts/repairers/orders; insert quote_tokens; storage upload |
| Pagine pubbliche `docs/*.html` | GitHub Pages (internet) | `anon` pubblico | ~~select* su repairs, GET/PATCH quote_tokens+repairs~~ → **ora solo RPC** |
| wa-bot | Mac | `anon` → **service_role** | Realtime repairs; update wa_*_sent_at/status; select ddts/repairers |
| backup.js | Mac | `anon` → **service_role** | select* su tutte le tabelle |
| edge fn `approve-quote` | Supabase | `service_role` (già ok) | quote_tokens + repairs |

**Vincolo di sequenza chiave:** app, wa-bot e backup girano tutti come `anon`. Restringere `anon` (il vero cuore di C1) rompe l'app finché non è `authenticated` (Fase 2). Quindi **C1 si chiude con Fase 1 + Fase 2 insieme**. La riscrittura delle pagine pubbliche in RPC è preparatoria: da sola non riduce l'esposizione finché `anon` resta `using(true)`.

## Cosa è già stato fatto in questa sessione (nel repo, non ancora applicato)

- **`fase1-public-rpc.sql`** — 3 funzioni `security definer` token-based:
  - `get_repair_status(link_token)` → sole colonne mostrate + token preventivo pendente (pagina stato).
  - `get_quote(token)` → dettaglio preventivo + stato accepted/declined (pagina conferma).
  - `respond_quote(token, decision)` → accetta/rifiuta **idempotente** (`FOR UPDATE`, chiude M10); rispecchia su `repairs` → il wa-bot invia il WA.
  - Additive: applicarle non cambia il comportamento attuale.
- **`docs/repair-status.html` e `docs/approve-quote.html`** riscritte per usare SOLO le RPC (niente più `select=*` né PATCH diretto → chiude C1/M8 lato pagina). UI invariata. **Non ancora deployate** su GitHub Pages.
- **`wa-bot.js` e `backup.js`**: preferiscono `SUPABASE_SERVICE_ROLE_KEY` se presente, fallback alla chiave anon → **non-breaking** finché non aggiungi la chiave.
- **`fase2-anon-lockdown.sql`** — pronto per quando l'app sarà `authenticated`: rimuove `anon_all`, crea `authenticated_all`, revoca i privilegi di `anon`. **È l'interruttore che chiude C1.**
- Rollback per entrambi gli SQL: `*-rollback.sql`.

## Passi da eseguire (in quest'ordine)

1. **Applica le RPC** — Supabase → SQL Editor → incolla `fase1-public-rpc.sql` → Run. (Additivo, nessun rischio.)
2. **Recupera la service_role key** — Supabase → Project Settings → API → `service_role` (secret). Aggiungi al **root `.env`**:
   ```
   SUPABASE_SERVICE_ROLE_KEY=eyJ... (secret)
   ```
   `.env` è già in `.gitignore` — **non committarla mai**. Riavvia il print-server e verifica che il wa-bot parta e che il backup notturno giri.
3. **Deploy pagine pubbliche** — push su GitHub Pages e test end-to-end: apri un QR di stato esistente e un link di preventivo, verifica visualizzazione + accetta/rifiuta (con doppio tap → deve restare idempotente).
4. **Rotazione chiave** — la chiave in `docs/*.html` (`sb_publishable_…`) è pubblica per costruzione; diventa innocua solo dopo il lockdown (Fase 2). Nel frattempo: in Supabase disabilita/ruota le **legacy JWT keys** (anon/service `eyJ…` del vecchio sistema, compromesse in git history) se ancora attive.
5. **Fase 2 (quando pronti)** — introdotta l'Auth operatori, applica `fase2-anon-lockdown.sql`. Solo allora `anon` non legge/scrive più l'anagrafica → **C1 chiuso**.

## Nota di coerenza

`backup/backup.js` (SCHEMA_SQL) ricrea `anon_all` su restore. **Dopo** la Fase 2 va aggiornato perché un ripristino non reintroduca le policy permissive. (TODO Fase 2.)

## Rollback

- Pagine pubbliche: ripristina la versione git precedente di `docs/*.html`, poi `fase1-public-rpc-rollback.sql`.
- wa-bot/backup: rimuovi `SUPABASE_SERVICE_ROLE_KEY` dal `.env` → tornano ad `anon`.
- Lockdown: `fase2-anon-lockdown-rollback.sql` ripristina `anon_all`.
