# Handoff — Zerrillo Gioielleria Repair App

## Goal
Mantenere e migliorare l'app React di gestione riparazioni gioielleria "Zerrillo Preziosi S.r.l." — un'app locale (localhost:3000) con backend Supabase, print server Node su porta 3001, e backup automatico su Google Drive.

## Current Progress

### Funzionalità aggiunte in questa sessione

- **Etichetta riparazione interna**: quando `riparazioneInterna = true`, la funzione `receiptHTML` non stampa l'etichetta RIPARATORE — solo CLIENTE e NEGOZIO.

- **Stato "Reso non riparato"**: aggiunto a `STATUSES` (rosso `#DC2626`). In `DDTReturn` e `RientroRapido` step 2, quando selezionato: campo prezzo finale nascosto, campo causale visibile, WAToast con messaggio precompilato per il cliente.

- **WAToast preventivo al cliente**: quando si salva il preventivo su una riparazione con `richiestaPreventivo = true` e preventivo non ancora accettato, appare automaticamente il WAToast con messaggio per il cliente che include il link di conferma.

- **Fix prezzoFinale nel WAToast "pronto"**: `handleRientroRapido` e `handleReturn` ora passano `{...rep, prezzoFinale: fin}` al toast invece del repair dallo stato vecchio.

- **WA bot automatico per riparatori** (`print-server/wa-bot.js`):
  - Estende il print server con whatsapp-web.js
  - Prima esecuzione: mostra QR code come immagine PNG (`/tmp/zerrillo-wa-qr.png`) aperta automaticamente
  - Sessione salvata in `print-server/.wwebjs_auth/` — non serve riscannerizzare a ogni riavvio
  - Ascolta Supabase Realtime su `repairs` — quando `preventivo_accettato` passa a `true`, invia automaticamente WA al riparatore (recupera telefono dal DDT)
  - Guard `realtimeStarted` evita crash su riautenticazione multipla di WhatsApp
  - Endpoint `GET /wa-status` per verificare connessione WhatsApp
  - Pre-carica all'avvio gli ID già accettati (`waSent` Set) per evitare reinvii al restart

- **Pagina conferma preventivo** (`supabase/functions/approve-quote/index.ts`):
  - Edge Function Supabase pubblica (JWT verification disabilitata)
  - GET `?token=xxx` → mostra pagina con dettagli riparazione e pulsante conferma
  - POST → segna token come usato (`accepted_at`) e imposta `preventivo_accettato = true` su Supabase
  - Usa solo entità HTML (nessun carattere UTF-8 nel markup) per evitare problemi encoding
  - URL: `https://rrkvbvkiuwpqevrfcliw.supabase.co/functions/v1/approve-quote?token=XXX`

- **Tabella `quote_tokens`** su Supabase:
  - Colonne: `token text PK`, `repair_id text`, `created_at timestamptz`, `accepted_at timestamptz`
  - RLS abilitato con policy "public access" per allow all
  - `repair_id` è `text` (non uuid) perché gli ID riparazioni sono stringhe tipo `og0802v2`
  - `api.createQuoteToken(repairId)` genera UUID, inserisce riga, ritorna token

- **Disdetta preventivo** (`supabase/functions/approve-quote/index.ts`):
  - Pagina mostra due pulsanti: "Confermo" (verde) e "Rifiuto" (outline rosso)
  - POST a `?token=xxx&azione=rifiuta` → marca `declined_at` in `quote_tokens`, imposta `preventivo_rifiutato = true` su repairs
  - Gestione stati già usati: se `accepted_at` o `declined_at` è già valorizzato mostra pagina di avviso appropriata
  - WA bot ascolta `preventivo_rifiutato = true` e invia notifica al numero mobile del negozio (`SHOP_WA_TEL`)

### Funzionalità aggiunte nelle sessioni precedenti
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

-- Colonne per disdetta preventivo (nuove)
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
- Branch `gestionale` → branch attivo per sviluppo futuro
- Backup fisico in `~/gioielleria-repair-BACKUP/` (non toccare)

## WA Bot — Note operative
- Il print server si avvia automaticamente come LaunchAgent (`com.zerrillo.printserver`)
- Log: `tail -f /tmp/zerrillo-print.log`
- Riavvio: `launchctl unload ~/Library/LaunchAgents/com.zerrillo.printserver.plist && launchctl load ~/Library/LaunchAgents/com.zerrillo.printserver.plist`
- Se WhatsApp si disconnette: riavviare il server, il QR si apre automaticamente come immagine
- Il bot invia WA al riparatore solo se la riparazione ha un DDT con telefono del riparatore
- Il bot invia WA al negozio (`SHOP_WA_TEL` nel `.env`) quando un cliente rifiuta il preventivo
- `SHOP_WA_TEL` deve essere il numero mobile del negozio (es. `3331234567`) — senza prefisso `+` o `39`
- `realtimeStarted` flag evita doppia subscription su riautenticazione WhatsApp

## Pagina conferma preventivo — Note operative
- **URL pubblico**: `https://zerymac.github.io/gioielleria-repair/approve-quote.html?token=XXX`
- **File**: `docs/approve-quote.html` — pagina statica HTML+JS, nessun server necessario
- **Hosting**: GitHub Pages, branch `gestionale`, cartella `/docs`
- **Come funziona**: legge `?token` da URL, chiama Supabase REST API direttamente con la anon key
- **Per aggiornare**: modificare `docs/approve-quote.html`, commit e push su `gestionale`
- L'Edge Function `approve-quote` su Supabase non viene più usata (il browser Mac mostrava HTML grezzo invece della pagina renderizzata)

## Gestionale — Pianificazione futura
- **Shopify**: integrazione bidirezionale via Admin API (GraphQL)
- **Supabase**: nuove tabelle `products`, `inventory_movements`, `sales`, `sale_items`, `suppliers`, `purchase_orders`, `metal_prices`
- **Quotazione metalli**: API esterna (GoldAPI.io); formula `peso × quotazione × titolo + manodopera + margine`
- **Stampa cartellini**: output ZPL dal print server; stampante consigliata Zebra ZD421 WiFi o TSC TE310
- **Migrazione dati da ProWeb**: export CSV → import script Node → Supabase
- **Strategia codice**: estrarre `shared.js` prima di aggiungere nuovi moduli

## What Worked
- **PGRST204 fallback**: `upsertRepair` riprova senza le colonne nuove se mancanti.
- **Sheet con footer prop**: flex layout con `flex:1; overflowY:auto` + `flexShrink:0` per footer fisso.
- **`useW()` hook + `BP=768`**: layout responsivo leggero.
- **`realtimeStarted` flag**: evita crash su doppia subscription Supabase Realtime.
- **`waSent` Set pre-popolato**: evita reinvii WA al riavvio del bot.
- **HTML entities**: unico modo affidabile per caratteri speciali nelle Edge Function Supabase.
- **`repair_id text`** in quote_tokens: gli ID riparazioni sono stringhe custom, non UUID.

## What Didn't Work
- **`position:sticky; bottom:0`**: non funziona se l'elemento è in cima al container scorrevole.
- **WAToast con repair dallo stato vecchio**: usare `{...rep, prezzoFinale: fin}`.
- **Foreign key join `repair:repair_id(*)`** in Edge Function: falliva silenziosamente; risolto con due query separate.
- **`Content-Type: text/html; charset=utf-8`** header in Edge Function: Supabase lo ignora; unica soluzione usare entità HTML.
- **`repair_id uuid`** in quote_tokens: gli ID riparazioni non sono UUID standard; cambiare in `text`.

## Next Steps
- Verificare il flusso completo: cliente clicca "Confermo" → `preventivo_accettato = true` → bot invia WA al riparatore
- Acquistare stampante Zebra ZD421 (o TSC TE310) WiFi
- Richiedere a DicoTec export CSV da ProWeb
- Iniziare sviluppo gestionale sul branch `gestionale`

## File principali
- `src/App.js` — tutta l'app (~4100 righe), unico file React
- `print-server/server.js` — server stampa + avvio WA bot (porta 3001)
- `print-server/wa-bot.js` — bot WhatsApp automatico per riparatori
- `supabase/functions/approve-quote/index.ts` — Edge Function conferma preventivo clienti
- `backup/backup.js` — backup notturno Supabase → Google Drive
- `.env` — credenziali Supabase (`REACT_APP_SUPABASE_URL`, `REACT_APP_SUPABASE_KEY`)

## Pattern chiave da rispettare
- Tutte le modifiche vanno in `src/App.js`
- `withSync(fn)` per operazioni DB
- `upsertRepair(repair)` per salvare una riparazione completa
- `api.updateRepairStatus(id, status)` per solo cambio stato
- Non aggiungere commenti esplicativi salvo casi strettamente necessari
- Non aggiungere emoji nei file salvo richiesta esplicita
