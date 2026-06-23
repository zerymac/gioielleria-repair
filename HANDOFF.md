# Handoff — Zerrillo Gioielleria Repair App

## Goal
Mantenere e migliorare l'app React di gestione riparazioni gioielleria "Zerrillo Preziosi S.r.l." — un'app locale (localhost:3000) con backend Supabase, print server Node su porta 3001, e backup automatico su Google Drive.

## Current Progress

### Funzionalità aggiunte in questa sessione

- **Disdetta preventivo** (`docs/approve-quote.html`):
  - Pagina mostra due pulsanti: "Confermo il preventivo" (verde) e "Rifiuto il preventivo" (outline rosso)
  - Conferma → segna `accepted_at` in `quote_tokens`, imposta `preventivo_accettato = true`
  - Disdetta → segna `declined_at` in `quote_tokens`, imposta `preventivo_rifiutato = true`
  - Se il link è già stato usato (in entrambi i sensi) mostra pagina di avviso appropriata
  - WA bot ascolta `preventivo_rifiutato = true` e invia WA di notifica al numero mobile del negozio (`SHOP_WA_TEL`)

- **Pagina conferma preventivo su GitHub Pages** (`docs/approve-quote.html`):
  - Pagina statica HTML+JS, nessun server necessario
  - Legge `?token` da URL, chiama Supabase REST API direttamente con la anon key
  - Hosted su: `https://zerymac.github.io/gioielleria-repair/approve-quote.html`
  - Branch `gestionale`, cartella `/docs`
  - Sostituisce l'Edge Function Supabase (il browser Mac mostrava l'HTML come testo grezzo)

- **WA bot — logica preventivi** (`print-server/wa-bot.js`):
  - Regola unica: **riparazione esterna → WA al riparatore, interna → WA al negozio** (sia accettazione che disdetta)
  - Accettato + esterna: WA riparatore "può procedere", stato invariato (`presso_esterno`)
  - Accettato + interna: stato → `lavorazione`, WA negozio "cliente ha accettato"
  - Rifiutato + esterna: stato → `reso_non_riparato`, WA riparatore "non procedere, restituire"
  - Rifiutato + interna: stato → `reso_non_riparato`, WA negozio "cliente ha rifiutato"
  - `waSent` e `waDeclineSent` Set pre-popolati al riavvio per evitare reinvii
  - Variabile `SHOP_WA_TEL=3441583658` nel `.env`

- **GitHub remote configurato**:
  - Repo pubblico: `https://github.com/zerymac/gioielleria-repair`
  - Branch `gestionale` pushato e tracciato

### Funzionalità aggiunte nelle sessioni precedenti

- **Etichetta riparazione interna**: quando `riparazioneInterna = true`, la funzione `receiptHTML` non stampa l'etichetta RIPARATORE — solo CLIENTE e NEGOZIO.
- **Stato "Reso non riparato"**: aggiunto a `STATUSES` (rosso `#DC2626`). In `DDTReturn` e `RientroRapido` step 2, quando selezionato: campo prezzo finale nascosto, campo causale visibile, WAToast con messaggio precompilato per il cliente.
- **WAToast preventivo al cliente**: quando si salva il preventivo su una riparazione con `richiestaPreventivo = true` e preventivo non ancora accettato, appare automaticamente il WAToast con messaggio per il cliente che include il link di conferma.
- **Fix prezzoFinale nel WAToast "pronto"**: `handleRientroRapido` e `handleReturn` ora passano `{...rep, prezzoFinale: fin}` al toast invece del repair dallo stato vecchio.
- **WA bot automatico per riparatori** (`print-server/wa-bot.js`): ascolta `preventivo_accettato = true`, invia WA al riparatore con telefono preso dal DDT.
- **Tabella `quote_tokens`**: token UUID per conferma preventivo cliente; `repair_id` è `text` (non uuid).
- **Ricerca in RientroRapido**: campo di ricerca per numero o cliente nello step 1.
- **Operatore**: step 0 wizard (Adri, Massi, Jenny, Manu). Visibile sull'etichetta NEGOZIO.
- **Layout responsivo**: breakpoint `BP=768`. Sidebar su iPad/Mac, tab bar su mobile.
- **Consegna modal**: pulsante conferma fisso in basso (footer non scrollabile).
- **Spesa e prezzo finale inline**: modificabili nel dettaglio anche per riparazioni interne.
- **Date tracciate**: `dataSpedita`, `dataRientrata`, `dataConsegnata` automatiche.
- **Totali DDT corretti**: escludono riparazioni ancora "presso_esterno".
- **Stampa automatica disabilitata**: su riparazioni multi-oggetto.

### Migrazioni Supabase eseguite
```sql
-- Tabella quote_tokens (già presente)
create table public.quote_tokens (
  token       text primary key,
  repair_id   text not null,
  created_at  timestamptz default now(),
  accepted_at timestamptz
);
alter table public.quote_tokens enable row level security;
create policy "public access" on public.quote_tokens for all using (true) with check (true);

-- Colonne per disdetta preventivo (DA ESEGUIRE se non ancora fatto)
alter table public.quote_tokens add column if not exists declined_at timestamptz;
alter table public.repairs add column if not exists preventivo_rifiutato boolean default false;

-- Colonne repairs (eseguire se non già presenti)
alter table public.repairs add column if not exists operatore text;
alter table public.repairs add column if not exists acconto numeric;
alter table public.repairs add column if not exists riparazione_interna boolean default false;
alter table public.repairs add column if not exists data_spedita date;
alter table public.repairs add column if not exists data_rientrata date;
alter table public.repairs add column if not exists data_consegnata date;
alter table public.repairers add column if not exists citta text;
alter table public.repairers add column if not exists provincia text;
alter table public.repairers add column if not exists cap text;
```

## Git
- Branch `main` → stato stabile app riparazioni
- Branch `gestionale` → branch attivo per sviluppo, traccia `origin/gestionale`
- Remote: `https://github.com/zerymac/gioielleria-repair`
- Backup fisico in `~/gioielleria-repair-BACKUP/` (non toccare)

## WA Bot — Note operative
- Il print server si avvia automaticamente come LaunchAgent (`com.zerrillo.printserver`)
- Log: `tail -f /tmp/zerrillo-print.log`
- Riavvio: `launchctl unload ~/Library/LaunchAgents/com.zerrillo.printserver.plist && launchctl load ~/Library/LaunchAgents/com.zerrillo.printserver.plist`
- Se WhatsApp si disconnette: riavviare il server, il QR si apre automaticamente come immagine
- Esterna → WA al riparatore (solo se DDT ha telefono), interna → WA al negozio (`SHOP_WA_TEL=3441583658`)
- `realtimeStarted` flag evita doppia subscription su riautenticazione WhatsApp

## Pagina conferma preventivo — Note operative
- **URL pubblico**: `https://zerymac.github.io/gioielleria-repair/approve-quote.html?token=XXX`
- **File**: `docs/approve-quote.html` — pagina statica, nessun server necessario
- **Hosting**: GitHub Pages, branch `gestionale`, cartella `/docs`
- **Per aggiornare**: modificare `docs/approve-quote.html`, commit e push su `gestionale`
- L'Edge Function `supabase/functions/approve-quote/index.ts` esiste ancora ma non è più usata

## Gestionale — Pianificazione futura
- **Shopify**: integrazione bidirezionale via Admin API (GraphQL)
- **Supabase**: nuove tabelle `products`, `inventory_movements`, `sales`, `sale_items`, `suppliers`, `purchase_orders`, `metal_prices`
- **Quotazione metalli**: API esterna (GoldAPI.io); formula `peso × quotazione × titolo + manodopera + margine`
- **Stampa cartellini**: output ZPL dal print server; stampante consigliata Zebra ZD421 WiFi o TSC TE310
- **Migrazione dati da ProWeb**: export CSV → import script Node → Supabase
- **Strategia codice**: estrarre `shared.js` prima di aggiungere nuovi moduli

## What Worked
- **GitHub Pages per pagine pubbliche**: pagina HTML+JS statica che chiama Supabase REST API direttamente — funziona in qualsiasi browser, zero server.
- **PGRST204 fallback**: `upsertRepair` riprova senza le colonne nuove se mancanti.
- **Sheet con footer prop**: flex layout con `flex:1; overflowY:auto` + `flexShrink:0` per footer fisso.
- **`useW()` hook + `BP=768`**: layout responsivo leggero.
- **`realtimeStarted` flag**: evita crash su doppia subscription Supabase Realtime.
- **`waSent` Set pre-popolato**: evita reinvii WA al riavvio del bot.
- **`repair_id text`** in quote_tokens: gli ID riparazioni sono stringhe custom, non UUID.

## What Didn't Work
- **Edge Function Supabase per pagine HTML**: il browser Mac mostra l'HTML come testo grezzo nonostante `Content-Type: text/html` — soluzione: GitHub Pages statico.
- **`position:sticky; bottom:0`**: non funziona se l'elemento è in cima al container scorrevole.
- **WAToast con repair dallo stato vecchio**: usare `{...rep, prezzoFinale: fin}`.
- **Foreign key join `repair:repair_id(*)`** in Edge Function: falliva silenziosamente; risolto con due query separate.
- **`repair_id uuid`** in quote_tokens: gli ID riparazioni non sono UUID standard; cambiare in `text`.

## Next Steps
- Eseguire le migrazioni SQL per `declined_at` e `preventivo_rifiutato` se non ancora fatto
- Verificare il flusso completo accettazione (esterna: WA riparatore; interna: stato lavorazione + WA negozio)
- Verificare il flusso disdetta (esterna: stato reso_non_riparato + WA riparatore; interna: stato reso_non_riparato + WA negozio)
- Acquistare stampante Zebra ZD421 (o TSC TE310) WiFi
- Richiedere a DicoTec export CSV da ProWeb
- Iniziare sviluppo gestionale sul branch `gestionale`

## File principali
- `src/App.js` — tutta l'app (~4100 righe), unico file React
- `docs/approve-quote.html` — pagina statica conferma/disdetta preventivo (GitHub Pages)
- `print-server/server.js` — server stampa + avvio WA bot (porta 3001)
- `print-server/wa-bot.js` — bot WhatsApp: notifica riparatore (accettazione) e negozio (disdetta)
- `supabase/functions/approve-quote/index.ts` — Edge Function (non più in uso, mantenuta come backup)
- `backup/backup.js` — backup notturno Supabase → Google Drive
- `.env` — credenziali: `REACT_APP_SUPABASE_URL`, `REACT_APP_SUPABASE_KEY`, `SHOP_WA_TEL`

## Pattern chiave da rispettare
- Tutte le modifiche vanno in `src/App.js`
- `withSync(fn)` per operazioni DB
- `upsertRepair(repair)` per salvare una riparazione completa
- `api.updateRepairStatus(id, status)` per solo cambio stato
- Non aggiungere commenti esplicativi salvo casi strettamente necessari
- Non aggiungere emoji nei file salvo richiesta esplicita
