# Handoff — Zerrillo Gioielleria Repair App

## Goal
Mantenere e migliorare l'app React di gestione riparazioni gioielleria "Zerrillo Preziosi S.r.l." — un'app locale (localhost:3000) con backend Supabase, print server Node su porta 3001, e backup automatico su Google Drive.

## Current Progress

### Funzionalità aggiunte in questa sessione (25/06/2026) — terza parte

- **WA automatico su cambio stato prodotto → arrivato**:
  - Quando un prodotto passa ad "arrivato", il WA al cliente viene inviato automaticamente via `/wa/send-bulk` (fire-and-forget, no WAToast)
  - Il messaggio include: nome articolo + marca (se valorizzata), importo, acconto, rimanenza da pagare (solo se presenti)

- **WA automatico alla creazione ordine**:
  - Sostituito il WAToast manuale con invio automatico via `/wa/send-bulk`
  - Il messaggio lista ogni prodotto con: descrizione, marca, prezzo, acconto, da saldare, data consegna prevista

- **Marca nei messaggi WA ordini**:
  - Aggiunta in tutti i testi: `"Descrizione (Marca)"` per prodotto singolo, `• Descrizione (Marca) — prezzo €` per lista ordine

- **Prezzo e rimanenza nei messaggi WA ordini**:
  - Tutti i messaggi ordine (creazione, arrivato, consegnato, WA manuale) includono importo, acconto versato, rimanenza da pagare — solo se valorizzati

- **Dashboard ordini — lista articoli**:
  - `OrderCard` mostra descrizione e marca di ogni prodotto (max 3, poi "+N altri") invece del solo conteggio
  - Pulsante "Consegna al cliente" appare sulla card quando stato = "arrivato"
  - Click consegna: segna tutti i prodotti + ordine come "consegnato", aggiorna stato locale, apre WAToast conferma

- **Stato ordine derivato dai prodotti**:
  - `handleOrderProductStatus` ricalcola automaticamente `stato` ordine dai prodotti dopo ogni cambio (stesso algoritmo di `handleSave`)
  - Rimosso pulsante "→ Avanza stato" da `OrderDetail` — era causa di disallineamento ordine/prodotti
  - Rimossa sezione "CAMBIA STATO ORDINE" con pill da `OrderDetail`
  - `handleOrderStatus` ora aggiorna anche `orders[]` oltre a `viewOrder` per evitare race condition con Realtime
  - `handleOrderProductStatus` legge da `viewOrder` (se ordine aperto) invece di `orders[]` per evitare stato stantio

- **`handleConsegnaOrder`** — nuovo handler: segna tutti i prodotti "consegnato", salva, aggiorna `orders` + `viewOrder`, apre WAToast

### Funzionalità aggiunte in questa sessione (25/06/2026) — seconda parte

- **Garanzia sulle riparazioni**:
  - Step 6 wizard: toggle "🛡️ In garanzia" tra "Riparazione interna" e "Note interne"
  - Step 7 riepilogo: riga garanzia appare solo se attiva
  - `RepairDetail`: toggle sempre visibile con handler `handleToggleGaranzia`
  - `toRepair` + payload `upsertRepair` + fallback PGRST204 aggiornati
  - Migrazione: `alter table public.repairs add column if not exists in_garanzia boolean default false;`

- **Wizard ordini rifatto (stile wizard riparazioni)**:
  - `OrderForm` ora ha **7 step** invece di 4, identici nella UX al wizard riparazioni:
    - **Step 0** Operatore — card colorate (Adri/Massi/Jenny/Manu)
    - **Step 1** Cliente — ricerca + nuovo (identico al wizard riparazioni)
    - **Step 2** Categoria — griglia CATS (Gioiello/Orologio/Bigiotteria/Altro)
    - **Step 3** Articolo — descrizione (textarea), marca, codice prodotto (fornitore rimosso)
    - **Step 4** Prezzi — quantità, prezzo vendita, prezzo acquisto, acconto
    - **Step 5** Date — data ordine, consegna prevista, stato articolo, note articolo, note interne, foto
    - **Step 6** Riepilogo — articoli già aggiunti + articolo corrente (bordo dorato); "Aggiungi altro articolo" salva il corrente e torna allo step 2; stato ordine calcolato automaticamente dai prodotti
  - In edit mode (`isEdit=true`) il wizard parte direttamente allo step 6
  - `buildCurrentProd()` costruisce il prodotto corrente dalle campi form; `addCurrentProduct()` lo commette e resetta
  - `handleSave` include il prodotto corrente nei `prodotti` finali + calcola `stato` ordine e `dataConsegnaPrevista` (earliest tra i prodotti)
  - `OrderDetail` rinnovato: header sticky, bottone avanza-stato colorato, IOSCards, sezione stato con pill button, WABtn, marca/referenza visibili per articolo
  - `operatore` aggiunto a `toOrder` e `upsertOrder` (payload + fallback PGRST204)
  - Migrazione: `alter table public.orders add column if not exists operatore text;`

### Funzionalità aggiunte in questa sessione (25/06/2026) — prima parte

- **Materiali nelle DDT stampate**: colonna "Materiali" aggiunta alla tabella DDT; colonna "Referenza" appare solo se almeno un oggetto nel DDT ha la referenza valorizzata (condizionale per non sprecare spazio).

- **Marca e referenza sulle riparazioni**:
  - Step 4 wizard: due campi affiancati "Marca" e "Referenza" sotto Materiali
  - Step 7 riepilogo: riga "Marca / Ref." se almeno uno valorizzato
  - `RepairDetail`: riga sempre visibile con ✏️ per modifica inline (anche se vuota → "Non specificata")
  - Handler `handleMarcaRefChange` + prop `onMarcaRefChange`
  - Migrazioni: `marca text`, `referenza text` su `repairs`

- **Campo "Lavori da eseguire" (nota preventivo)**:
  - Step 6 wizard: textarea `notaPreventivo` sotto l'importo preventivo
  - `RepairDetail`: riga sempre visibile con ✏️ per modifica inline
  - **Auto-spunta richiestaPreventivo**: quando si salva un preventivo nel dettaglio, `richiestaPreventivo` diventa `true` automaticamente
  - **WAToast cliente**: include `Lavori: ...` se `notaPreventivo` è valorizzato
  - **wa-bot.js**: `nota_preventivo` incluso in tutti e 4 i builder di messaggi (riparatore accettazione/disdetta, negozio accettazione/disdetta)
  - **`docs/repair-status.html`**: riga "Lavori da eseguire" nella scheda dettagli + nel box preventivo in attesa (il cliente vede i lavori prima di confermare/rifiutare)
  - Handler `handleNotaPreventivoChange` + prop `onNotaPreventivoChange`
  - Migrazione: `nota_preventivo text` su `repairs`

### Funzionalità aggiunte in questa sessione

- **Link stato riparazione + QR code** (`docs/repair-status.html`):
  - Ogni nuova riparazione genera un `link_token` UUID salvato in `repairs.link_token`
  - QR code sulle etichette punta a `repair-status.html?token=XXX&n=NUMERO` (scanner interni funzionano ancora: trovano `R\d{4}-\d{4}` nell'URL)
  - Pagina mostra stato con badge colorato + dettagli riparazione
  - Se preventivo in attesa e `quote_token` valido → mostra pulsanti accetta/rifiuta
  - Hosted su GitHub Pages, branch `gestionale`, cartella `/docs`
  - Migrazione eseguita: `alter table public.repairs add column if not exists link_token text;`
  - `crypto.randomUUID()` usato con try/catch per compatibilità localhost e iPhone via IP

- **Pagina stato riparazione su GitHub Pages** (`docs/repair-status.html`):
  - Sostituisce `approve-quote.html` come link principale al cliente (ma `approve-quote.html` resta per le vecchie riparazioni senza `link_token`)
  - Stesso accetta/rifiuta preventivo integrato nella stessa pagina
  - Hosted: `https://zerymac.github.io/gioielleria-repair/repair-status.html?token=XXX`

- **WA bot — logica preventivi aggiornata** (`print-server/wa-bot.js`):
  - **Esterna**: WA al riparatore (se ha telefono) + WA al negozio — sempre entrambi
  - **Interna**: WA al negozio — sia accettazione che disdetta
  - Accettato + esterna: WA riparatore "può procedere" + WA negozio, stato invariato (`presso_esterno`)
  - Accettato + interna: stato → `lavorazione`, WA negozio "cliente ha accettato"
  - Rifiutato + esterna: stato → `reso_non_riparato`, WA riparatore "non procedere" + WA negozio
  - Rifiutato + interna: stato → `reso_non_riparato`, WA negozio "cliente ha rifiutato"
  - WA riparatore specifica "Preventivo al pubblico: X €"
  - **Delay anti-ban**: 8–15s casuale tra ogni messaggio WA (`waDelay`)
  - `waSent` e `waDeclineSent` Set pre-popolati al riavvio per evitare reinvii
  - **Attenzione**: per ritestare un WA non inviato → resetta DB, riavvia server, poi ri-accetta
  - Variabile `SHOP_WA_TEL=3441583658` nel `.env`

- **Invio massivo WA al rientro riparazioni** (`/wa/send-bulk`):
  - Se si selezionano più riparazioni in RientroRapido, i messaggi WA ai clienti vengono inviati in bulk automaticamente (no WAToast)
  - Se si seleziona una sola riparazione, appare il WAToast come prima
  - Endpoint `POST /wa/send-bulk` sul print server, fire-and-forget
  - Delay 8–15s tra ogni messaggio anche nel bulk

- **DDT rientro fornitore** (`ddt_rientro_numero`, `ddtRientroData`):
  - In DDTReturn e RientroRapido: due campi aggiuntivi — N° DDT fornitore e data DDT rientro
  - Salvati in `ddts.ddt_rientro_numero` e `ddts.data_rientro` (data rientro già esistente)
  - Migrazione eseguita: `alter table public.ddts add column if not exists ddt_rientro_numero text;`
  - Visibile nel dettaglio DDT come riga "DDT fornitore"

- **Toggle "Richiesta preventivo"** (rinominato da "Richiesta preventivo al fornitore"):
  - Non più mutuamente esclusivo con "Riparazione interna"
  - Sottotitolo si adatta: interna → "prima di procedere internamente", esterna → "dal riparatore esterno"
  - Badge lista e etichetta stampata aggiornati

- **Messaggio WA cliente preventivo**:
  - Testo: "Per confermare o rifiutare il preventivo clicchi sul link:\n{link}"
  - Se riparazione ha `linkToken` → link a `repair-status.html`; altrimenti link a `approve-quote.html`

- **Disdetta preventivo** (`docs/approve-quote.html` e `docs/repair-status.html`):
  - Pagina mostra due pulsanti: "Confermo il preventivo" (verde) e "Rifiuto il preventivo" (outline rosso)
  - Conferma → segna `accepted_at` in `quote_tokens`, imposta `preventivo_accettato = true`
  - Disdetta → segna `declined_at` in `quote_tokens`, imposta `preventivo_rifiutato = true`
  - WA bot ascolta entrambi via Supabase Realtime

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

-- Colonne per disdetta preventivo
alter table public.quote_tokens add column if not exists declined_at timestamptz;
alter table public.repairs add column if not exists preventivo_rifiutato boolean default false;

-- Link token per pagina stato riparazione
alter table public.repairs add column if not exists link_token text;

-- Marca, referenza, nota preventivo (sessione 25/06/2026)
alter table public.repairs add column if not exists marca text;
alter table public.repairs add column if not exists referenza text;
alter table public.repairs add column if not exists nota_preventivo text;

-- Garanzia e operatore ordini (sessione 25/06/2026)
alter table public.repairs add column if not exists in_garanzia boolean default false;
alter table public.orders add column if not exists operatore text;

-- DDT rientro fornitore
alter table public.ddts add column if not exists ddt_rientro_numero text;

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
- Esterna → WA al riparatore (solo se DDT ha telefono) + WA al negozio; interna → WA al negozio (`SHOP_WA_TEL=3441583658`)
- `realtimeStarted` flag evita doppia subscription su riautenticazione WhatsApp
- **Resilienza riavvio dopo caduta di corrente**: timeout Puppeteer impostato a 120s (default 30s troppo basso su reboot freddo); plist ha `ThrottleInterval: 30s` per evitare loop rapidi di riavvio
- **Per ritestare WA**: SQL reset `preventivo_accettato=false` → riavvia server → ri-accetta (ordine importante: `waSent` si popola all'avvio)

## Pagina stato riparazione — Note operative
- **URL pubblico**: `https://zerymac.github.io/gioielleria-repair/repair-status.html?token=XXX`
- **File**: `docs/repair-status.html` — pagina statica, nessun server necessario
- **Hosting**: GitHub Pages, branch `gestionale`, cartella `/docs`
- **Per aggiornare**: modificare `docs/repair-status.html`, commit e push su `gestionale`
- `approve-quote.html` resta come fallback per riparazioni vecchie senza `link_token`

## Gestionale — Pianificazione futura
- **OrderForm refactor** ✅ completato (25/06/2026): wizard 7 step stile RepairWizard
- **Shopify**: integrazione bidirezionale via Admin API (GraphQL)
- **Supabase**: nuove tabelle `products`, `inventory_movements`, `sales`, `sale_items`, `suppliers`, `purchase_orders`, `metal_prices`
- **Quotazione metalli**: API esterna (GoldAPI.io); formula `peso × quotazione × titolo + manodopera + margine`
- **Stampa cartellini**: output ZPL dal print server; stampante consigliata Zebra ZD421 WiFi o TSC TE310
- **Migrazione dati da ProWeb**: export CSV → import script Node → Supabase
- **Strategia codice**: estrarre `shared.js` prima di aggiungere nuovi moduli

## What Worked (aggiornato 25/06/2026 — terza parte)
- **Stato ordine sempre derivato dai prodotti**: rimuovere il pulsante "Avanza stato" ordine-level ed usare solo il pill per-prodotto elimina l'incoerenza — il `nuovoStato` si calcola con `every/some` sui `prodotti` aggiornati prima di `upsertOrder`.
- **`viewOrder` come fonte primaria in `handleOrderProductStatus`**: `(viewOrder?.id===orderId ? viewOrder : orders.find(...))` evita di leggere dallo stato Realtime stantio e sovrascrivere il nuovo stato con il vecchio.
- **Bottone consegna solo su stato "arrivato"**: `order.stato==="arrivato"&&onConsegna&&(...)` — la card diventa azione diretta senza aprire il dettaglio.
- **Area click separata dal bottone**: wrappare le info della card in un `div onClick={onView}` e il bottone in un `div` separato con `e.stopPropagation()` evita il conflitto click.

## What Worked (aggiornato 25/06/2026 — seconda parte)
- **Wizard ordini con stato calcolato**: invece di far scegliere lo stato ordine all'utente, calcolarlo da `allProdotti` in `handleSave` (`every consegnato → consegnato`, `some arrivato → arrivato`, ecc.) — meno attrito, più corretto.
- **`buildCurrentProd()` helper**: centralizzare la costruzione del prodotto corrente evita duplicazione tra `addCurrentProduct` e `handleSave`.
- **Edit mode a step 6**: `useState(isEdit?6:0)` fa partire il wizard direttamente al riepilogo per le modifiche — non occorre navigare tutti gli step.
- **`prodotti` come JSONB Supabase**: aggiungere `marca` e `referenza` ai prodotti ordine non richiede migrazione — il campo è già JSON.
- **PGRST204 fallback per `operatore`**: stessa strategia degli altri campi nuovi — destructure `operatore:_op` nel fallback.

## What Worked (aggiornato 25/06/2026)
- **Colonna DDT condizionale**: `const hasRef=items.some(r=>r.referenza)` — la colonna "Referenza" appare nel DDT stampato solo se almeno un item ce l'ha; evita colonne vuote per niente.
- **Auto-enable toggle da handler**: in `handlePreventivoChange`, impostare `richiestaPreventivo:true` direttamente nell'`updated` prima di `upsertRepair` — più affidabile che chiamare il toggle separatamente.
- **Python per replace UTF-8 in App.js**: `Edit` tool fallisce su righe con "Sì" (U+00EC) se il contesto non matcha esattamente; usare `python3` con `open(..., encoding='utf-8')` per rimpiazzi sicuri.
- **Inline edit testo sempre visibile**: mostrare la riga anche quando il campo è vuoto ("Non specificata") con ✏️ — così l'utente sa che può aggiungere il valore in un secondo momento senza cercare dove farlo.

## What Worked
- **GitHub Pages per pagine pubbliche**: pagina HTML+JS statica che chiama Supabase REST API direttamente — funziona in qualsiasi browser, zero server.
- **PGRST204 fallback**: `upsertRepair` riprova senza le colonne nuove se mancanti.
- **Sheet con footer prop**: flex layout con `flex:1; overflowY:auto` + `flexShrink:0` per footer fisso.
- **`useW()` hook + `BP=768`**: layout responsivo leggero.
- **`realtimeStarted` flag**: evita crash su doppia subscription Supabase Realtime.
- **`waSent` Set pre-popolato**: evita reinvii WA al riavvio del bot.
- **`repair_id text`** in quote_tokens: gli ID riparazioni sono stringhe custom, non UUID.
- **LaunchAgent plist `ThrottleInterval`**: non è in repo (sta in `~/Library/LaunchAgents/`), va riapplicato manualmente su un nuovo Mac. Valore attuale: 30s su `com.zerrillo.printserver.plist`.
- **`crypto.randomUUID()` try/catch**: usare `try{return crypto.randomUUID()}catch(e){...}` invece di `??` operator che perde il binding `this`.
- **QR scanner compatibilità**: URL `?token=XXX&n=R2026-0042` — il regex `R\d{4}-\d{4}` trova ancora il numero nel full URL.
- **Bulk WA soglia**: `selectedIds.length > 1` per decidere bulk vs WAToast.

## What Didn't Work
- **Edge Function Supabase per pagine HTML**: il browser Mac mostra l'HTML come testo grezzo nonostante `Content-Type: text/html` — soluzione: GitHub Pages statico.
- **`position:sticky; bottom:0`**: non funziona se l'elemento è in cima al container scorrevole.
- **WAToast con repair dallo stato vecchio**: usare `{...rep, prezzoFinale: fin}`.
- **Foreign key join `repair:repair_id(*)`** in Edge Function: falliva silenziosamente; risolto con due query separate.
- **`repair_id uuid`** in quote_tokens: gli ID riparazioni non sono UUID standard; cambiare in `text`.
- **`(crypto.randomUUID??fallback)()`**: perde il binding `this` — usare try/catch IIFE.
- **WA al negozio bloccato da early return**: ristrutturare `handleAccepted` per non fare `return` dopo il blocco riparatore, continuare sempre verso il WA negozio.

## Next Steps
- Acquistare stampante Zebra ZD421 (o TSC TE310) WiFi
- Richiedere a DicoTec export CSV da ProWeb
- Iniziare sviluppo gestionale sul branch `gestionale`

## File principali
- `src/App.js` — tutta l'app (~4100 righe), unico file React
- `docs/repair-status.html` — pagina stato riparazione + accetta/rifiuta preventivo (GitHub Pages)
- `docs/approve-quote.html` — pagina fallback accetta/rifiuta per vecchie riparazioni (GitHub Pages)
- `print-server/server.js` — server stampa + avvio WA bot (porta 3001)
- `print-server/wa-bot.js` — bot WhatsApp: notifica riparatore e negozio su accettazione/disdetta preventivo
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
