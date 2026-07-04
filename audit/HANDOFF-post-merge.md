# Handoff — Zerrillo Gioielleria Repair App

## Goal
Mantenere e migliorare l'app React di gestione riparazioni gioielleria "Zerrillo Preziosi S.r.l." — un'app locale (localhost:3000) con backend Supabase, print server Node su porta 3001, e backup automatico su Google Drive.

## Current Progress

### Sessione audit — Fase 2 correzioni (04/07/2026) — branch `fix/perdite-dati`

Audit tecnico completo (`AUDIT_REPORT.md`, `audit/FASE1-ANALISI.md`, `audit/FASE2-RISULTATI.md`) seguito da **Sessione 2**: cinque fix "perdita silenziosa di dati", ognuno un commit con i suoi test, su branch `fix/perdite-dati` (base = codice reale di produzione). **Non ancora mergiato su `gestionale`** — merge deciso dal proprietario dopo la checklist in `audit/SESSIONE2-RILASCIO.md`. Suite di verifica: 36 test (mock Supabase/WhatsApp/stampa, nessuna scrittura su produzione).

- **C2 — wizard riparazioni salva marca/referenza/notaPreventivo** (`handleSaveRepair`): erano raccolti negli step 4/6 e mostrati nel riepilogo ma scartati al salvataggio. Aggiunti all'oggetto principale di `allItems` (gli item multi-oggetto già li portavano) e al record `n`; `notaPreventivo` è form-level, applicato a ogni oggetto.
- **A9 — consegna ordine solo dei prodotti arrivati** (`handleConsegnaOrder`): prima marcava consegnati **tutti** i prodotti. Ora consegna solo i `stato==="arrivato"`, ricalcola lo stato ordine dai prodotti (resta aperto se altri non arrivati), e il WA elenca solo il consegnato con dicitura "parziale". **Decisione col proprietario**: consegna parziale (non "tutto o niente").
- **A4 — prefissi internazionali nei WA automatici**: `formatPhone` (wa-bot) anteponeva '39' a qualsiasi numero. Ora `+`/`00` conservano il prefisso paese; solo il nazionale nudo diventa italiano. Lato app, i punti che inviano WA bulk/arrivato passano E.164 via il nuovo helper `waPhone(c)=prefisso+telefono`.
- **C5 — restore compatibile col backup notturno**: `handleRestore` normalizza le righe snake_case via i convertitori `toX` (prima `telefonoPrefisso`/`codiceFiscale` camelCase non venivano letti → prefisso azzerato a +39, CF perso). Aggiunto il restore/export di `orders` (prima omesso). In `backup.js`: `quote_tokens` in `TABLES` e `SCHEMA_SQL` rigenerato con tutte le colonne reali. **Rettifica**: il backup notturno raggiunge Google Drive (verificato per inode); il problema era la lettura in-app, non la scrittura.
- **C3 — errori DB visibili**: le `api.*` ignoravano `error`, `withSync` non catturava, le `getX` confondevano vuoto/errore. Ora: flag di errore condiviso (`_writeError`) segnalato da ogni scrittura e letto da `withSync` → **toast rosso "Salvataggio non riuscito — riprova"**; le 5 `getX` ritornano `{data,error}` e le `loadX` su errore **non svuotano** le liste + **banner "Connessione al database persa"**; indicatore sync onesto (rosso). Vedi la nota di rilascio per l'impatto sugli operatori.

**Follow-up rimandati**: C1 sicurezza RLS/chiave pubblica (Sessione 1, prioritario); C4 numerazione DDT/ordine/riparazione con contatore atomico (Sessione 3); A1/A3/A8 outbox WhatsApp con retry (Sessione 4); warning eslint preesistenti e estrazione moduli da `App.js`.

### Funzionalità aggiunte in questa sessione (03/07/2026) — fix perdita WA su preventivo accettato mentre bot down

- **Problema riscontrato**: R2026-0215 accettato via GitHub Pages il 01/07/2026 10:18 UTC, ma nessun WA a riparatore/negozio. Il `console.log` `🔔 Preventivo accettato: R2026-0215` non appare in `/tmp/zerrillo-print.log`.
- **Causa**: `wa-bot.js:startRealtimeSubscription` pre-popolava `waSent` con **tutti** i `preventivo_accettato=true` all'avvio (per evitare replay). Se il bot era down/scollegato al momento dell'evento Realtime → evento perso → al riavvio il repair finisce in `waSent` come "già processato" senza esserlo mai stato.
- **Fix strutturale**:
  - Nuove colonne `repairs.wa_accept_sent_at timestamptz` e `wa_decline_sent_at timestamptz` — vera source of truth di "abbiamo notificato?"
  - `startRealtimeSubscription` pre-popola i set **solo** dove `wa_accept_sent_at IS NOT NULL` (analogo per declined)
  - Nuova funzione `reconcilePending(supabase)` chiamata all'avvio: query `preventivo_accettato=true AND wa_accept_sent_at IS NULL AND eliminata=false` → chiama `handleAccepted` per ognuno → recupero automatico degli eventi persi
  - `handleAccepted` / `handleDeclined` chiamano `markAcceptSent` / `markDeclineSent` alla fine del percorso di successo → aggiorna il timestamp in DB
  - `markAcceptSent` / `markDeclineSent`: `UPDATE repairs SET wa_accept_sent_at = now()` con fallback su errore `PGRST204` (colonna mancante — log warning ma non crasha)
- **Backfill anti-spam**: nella migration, `UPDATE ... SET wa_accept_sent_at = now() WHERE preventivo_accettato=true AND id != 'u5bmyofy'` — così solo R2026-0215 rimane pending e viene recuperato dalla reconciliation; tutti gli altri già notificati sono "protetti" dal reinvio.
- **Log invariati per Realtime**: la subscription rimane identica, solo la logica del pre-popolamento cambia. I nuovi log al riavvio sono:
  - `📋 N accettati, M disdettati — già notificati` (rimpiazza "ignorati al riavvio")
  - `🔁 K preventivi accettati in sospeso — invio ora` (solo se `reconcilePending` trova pending)
  - `🔔 Recupero accettazione: Rxxxx-xxxx` per ogni recupero
- **Verifica in produzione (03/07/2026)**: migration applicata via Supabase Studio, backfill esclude `u5bmyofy`, LaunchAgent riavviato con `launchctl unload/load`. Log post-riavvio conferma:
  ```
  📋 13 accettati, 1 disdettati — già notificati
  🔁 1 preventivi accettati in sospeso — invio ora
  🔔 Recupero accettazione: R2026-0215
  ✅ WA accettazione inviato a AVERLA LAVORAZIONI ORAFE… per R2026-0215
  ✅ WA accettazione inviato al negozio per R2026-0215 (esterna)
  ```
  Entrambi i WA (riparatore + negozio) partiti correttamente dalla reconciliation. Riparatore era AVERLA (telefono presente nello snapshot DDT, quindi no fallback su registro `repairers`).

### Funzionalità aggiunte in questa sessione (03/07/2026) — inline edit riparazioni + parità UX ordini/riparazioni

- **Inline edit completo in `RepairDetail`**:
  - Nuovi campi editabili con ✏️: **descrizione oggetto** (via pencil nell'header, textarea con Salva/Annulla), **materiali**, **problema** (textarea), **note interne** (nuova card in fondo), **operatore** (pill selector Adri/Massi/Jenny/Manu + "Nessuno")
  - Handler generico `handleRepairFieldChange(id, patch)` — sostituisce la necessità di 1 handler per campo; accetta oggetto patch e fa merge + `upsertRepair`
  - Prop `onFieldChange` in `RepairDetail`
  - Categoria / tipo lavoro / mano / dito / foto **non** editabili di proposito — sono "identitari" dell'oggetto

- **`OPERATORS` estratto a scope modulo** (era duplicato in `RepairWizard` e `OrderForm`):
  - Adesso a livello top del file accanto a `WORK_TYPES`
  - Rimosse le 2 definizioni locali
  - Riutilizzato in `RepairDetail` (pill selector) e `RepairCard` (badge colorato)

- **Badge operatore in `RepairCard`**: chip colorato `👷 Nome` nella metadata row della lista riparazioni, con background/color della palette operatore (`op.bg`/`op.color`) — a colpo d'occhio distingui chi ha preso la riparazione. Appare solo se `r.operatore` è valorizzato.

- **Disabilitata stampa automatica ordini**:
  - Rimosso `smartPrint(orderLabelHTML(...))` da `handleSaveOrder` (partiva a ogni salvataggio nuovo/edit)
  - Label bottone wizard: "✓ Crea ordine e stampa" → "✓ Crea ordine"

- **Disabilitato auto-invio WA su creazione ordine + `OrderReceiptModal` automatico**:
  - `handleSaveOrder` non chiama più `fetch /wa/send-bulk` automaticamente
  - Su ordine nuovo → apre `OrderReceiptModal` (esattamente come `ReceiptModal` per riparazioni)
  - Utente sceglie manualmente: 🖨️ solo stampa, 📤 stampa + WA, oppure WA/Email/SMS separati
  - Messaggio WA nel modal aggiornato con marca, prezzo, acconto, rimanenza da pagare, data consegna per prodotto (rich come quello che partiva automaticamente prima)

- **`OrderDetail` riscritto con layout di `RepairDetail`**:
  - Wrapper cambiato da modal custom (`position:fixed` + sticky header) a `Sheet` (bottom-sheet mobile, centered desktop)
  - Header card: icona 📦 con background colorato secondo `ORDER_STATUSES[order.stato].bg`, `OrderStatusBadge`, pill operatore colorato inline, titolo con "N articolo/i" + preview primo prodotto, ✏️ per apertura wizard modifica
  - Card cliente: nome + telefono + `WABtn` inline (stesso layout della card cliente in `RepairDetail`), data ordine, consegna prevista (earliest dei prodotti), numero
  - Card articoli: identica alla precedente (foto, prezzo/acconto/scadenza, pill stato espandibile per cambio stato per-prodotto) + riga "Acconto totale" aggiunta ai totali
  - Card note interne (se presenti)
  - "CAMBIA STATO ORDINE" — pill selector orizzontale (stesso pattern di `RepairDetail`)
  - Bottone "🤝 Consegna al cliente" (solo se `stato==="arrivato"`) — gradient verde, apre `WAToast` con messaggio consegna precompilato
  - "🧾 Etichette" → apre `OrderReceiptModal`
  - "🗑️ Elimina ordine" con conferma inline (pattern identico a `RepairDetail`)

- **Rimosso `handleOrderWhatsApp` dead code**: era passato come prop `onWhatsApp` a `OrderDetail` ma il body non lo usava; dopo il refactor la prop non serve più

### Funzionalità aggiunte in questa sessione (26/06/2026) — fix multi-device + UX consegna

- **`printServerBase()` helper — fix WA da iPhone**:
  - Le 3 fetch a `/wa/send-bulk` erano hardcoded `http://localhost:3001` → da iPhone via IP del Mac, `localhost` puntava all'iPhone stesso, la fetch falliva silenziosamente nel `.catch`
  - Helper deriva URL da `window.location.hostname` (override esplicito via `localStorage.printServerUrl`)
  - Applicato a `handleRientroRapido`, `handleReturn`, e altro flusso bulk
  - **Impatto storico**: la sessione 26/06/2026 ha recuperato 18 WA "riparazione pronta" non partiti durante il rientro pomeridiano (inviati via script one-shot a `/wa/send-bulk`)

- **WA bot — fallback registro `repairers` per snapshot DDT senza telefono** (`print-server/wa-bot.js`):
  - `fetchRiparatore` ora: se lo snapshot DDT ha `telefono:""`, prova a recuperare dal registro `repairers` cercando per `nome`
  - Causa: il DDT congela i dati riparatore al momento della creazione; se il telefono è stato aggiunto nel registro DOPO, lo snapshot resta vuoto e nessun WA va al riparatore (R2026-0166 e R2026-0188 nella sessione 26/06/2026 — recuperati a mano dall'utente)

- **`ConsegnaModal` — mostra più riparazioni**:
  - Filtro cambiato da `r.status==="pronto"` a `r.status!=="consegnato"&&r.status!=="presso_esterno"` — adesso include ricevute, in lavorazione, pronte, reso non riparato
  - Badge stato colorato (`STATUSES[r.status]`) per ogni riga: a colpo d'occhio si distingue pronta vs in lavorazione
  - Variabile `pronte` rinominata a `daConsegnare` per coerenza semantica
  - QR scanner stessa logica (`r.status!=="consegnato"&&r.status!=="presso_esterno"`); messaggio "non trovata o non pronta" → "non disponibile alla consegna"

- **QR scanner — fallback foto per iPhone**:
  - Su iPhone via IP, Safari blocca `getUserMedia` (richiede HTTPS o localhost)
  - Aggiunto bottone "📸 Scatta foto del QR" che usa `<input type="file" capture="environment">` — apre fotocamera nativa iOS, jsQR decodifica con `inversionAttempts:"attemptBoth"` (tolerante con foto sgranate)
  - Bottone sempre visibile come alternativa anche su Mac

### Funzionalità aggiunte in questa sessione (26/06/2026) — gestione duplicati clienti

- **Merge duplicati clienti (sostituisce il delete-only)**:
  - `DuplicatesModal` ora **unisce** invece di cancellare: tap sul cliente da tenere → diventa primario, gli altri vengono uniti su di lui (riparazioni + ordini spostati, anagrafiche duplicate eliminate)
  - Primario di default = cliente con più riparazioni+ordini del gruppo
  - Bottone "Salta gruppo" per escludere un gruppo dall'unione
  - Badge `PRIMARIO` verde + conteggi `N rip.` / `N ord.` per ogni cliente
  - Riapre `loadCustomers/loadRepairs/loadOrders` alla chiusura per refresh esplicito

- **`api.mergeCustomers(primaryId, duplicateIds)`**:
  - `UPDATE repairs SET customer_id=primary WHERE customer_id=duplicate`
  - `UPDATE orders  SET customer_id=primary WHERE customer_id=duplicate`
  - `DELETE FROM customers WHERE id=duplicate`
  - Sequenziale per ogni duplicate; loggato `console.error` su singolo fallimento

- **Anti-doppione in inserimento (blocco bloccante)**:
  - Componente riutilizzabile `DuplicateWarning` (popup ⚠️ con cliente esistente + bottoni "Usa questo cliente" / "Annulla")
  - Helper `findDuplicateCustomer(customers, c, excludeId)` — match per nome+cognome OPPURE telefono normalizzati; `excludeId` evita di matchare se stesso in edit mode
  - Integrato in 3 punti d'inserimento:
    - **`RepairWizard`** step 1 → al click "Aggiungi" nuovo cliente
    - **`OrderForm`** step 1 → al click "Aggiungi" nuovo cliente
    - **`CustomerForm`** standalone → al click "Salva" (sia nuovo sia edit, edit usa `excludeId=f.id`)
  - Dal `CustomerForm` "Usa questo cliente" apre direttamente `CustomerDetail` del cliente esistente (`onSelectExisting`); dai wizard seleziona l'esistente e prosegue allo step successivo

- **Rimosso `handleBulkDeleteCustomer`** (dead code dopo refactor merge)

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

-- Timestamps WA notification (sessione 03/07/2026) — fix perdita eventi Realtime
alter table public.repairs add column if not exists wa_accept_sent_at  timestamptz;
alter table public.repairs add column if not exists wa_decline_sent_at timestamptz;
-- Backfill: marca "già notificati" tutti gli accettati/rifiutati esistenti
-- ECCETTO R2026-0215 (u5bmyofy) che era rimasto pending → sarà recuperato al riavvio del bot
update public.repairs set wa_accept_sent_at = coalesce(wa_accept_sent_at, now())
  where preventivo_accettato = true and eliminata = false and id != 'u5bmyofy';
update public.repairs set wa_decline_sent_at = coalesce(wa_decline_sent_at, now())
  where preventivo_rifiutato = true and eliminata = false;

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

### Strategia git per sviluppo gestionale (decisa 25/06/2026, affinata 26/06/2026)
- **`gestionale`** rimane il branch in produzione che il negozio usa ogni giorno — deve sempre funzionare
- **Funzionalità grandi** (catalogo prodotti, vendite, Shopify, metalli) → branch separato `feature/<nome>` → merge su `gestionale` solo quando stabile
- **Piccole modifiche/fix** → commit diretto su `gestionale`
- **`main`** → backup ultra-stabile, merge da `gestionale` ogni tanto

### Worktree per sviluppo parallelo (26/06/2026 — da configurare)
Problema: l'app gira da `npm start` su `localhost:3000` e Adriana la usa quotidianamente. Cambiare branch nella cartella principale modifica i file sotto i piedi all'app in uso.

Soluzione: **git worktree** — due cartelle parallele, due branch, due porte:
```
~/gioielleria-repair/    → branch gestionale, porta 3000 (negozio)
~/gestionale-dev/        → branch feature/gestionale, porta 3001 (sviluppo)
```

Comandi setup:
```bash
cd ~/gioielleria-repair
git worktree add ../gestionale-dev -b feature/gestionale
cd ../gestionale-dev
npm install
PORT=3001 npm start
```

Vantaggi:
- Il negozio non viene mai impattato da errori di sviluppo
- Entrambe le app girano contemporaneamente su porte diverse
- Merge sicuro solo quando la feature è stabile e testata
- Nessun branch switching necessario

### Roadmap gestionale per fasi
- **Fase 1** — Fondamenta dati: tabelle Supabase + tab "Prodotti" sola lista, senza toccare riparazioni
- **Fase 2** — Carico prodotti: form inserimento + import CSV da ProWeb
- **Fase 3** — Vendite: carrello → ricevuta → aggiornamento giacenza
- **Fase 4** — Quotazione metalli: API GoldAPI.io + calcolatrice peso/titolo

## What Worked (aggiornato 03/07/2026 — fix perdita WA)
- **Colonna `wa_*_sent_at` come source of truth**: prima il "già notificato" era derivato da `preventivo_accettato=true`, che è lo *stato del preventivo*, non lo stato dell'invio WA. Se il bot era down all'evento Realtime, la logica non aveva modo di distinguere "accettato e già notificato" da "accettato ma mai processato". Aggiungere un timestamp dedicato separa i due concetti e rende il sistema recovery-friendly.
- **Reconciliation on-startup vs solo Realtime**: Realtime è "at-most-once" — se sei down, l'evento è perso senza replay. Ogni volta che il bot parte, `reconcilePending` scansiona `preventivo_accettato=true AND wa_accept_sent_at IS NULL` e riprocessa il gap. Non serve retry policy sul Realtime — basta usarlo come "fast path" e la reconciliation come "slow path safety net".
- **Backfill selettivo nella migration**: `UPDATE ... WHERE id != 'u5bmyofy'` — un solo comando SQL protegge tutti i 13 già-notificati dal reinvio e lascia il pending esposto al recovery automatico. Alternativa più fragile (backfilltutto + inviare a mano R2026-0215) sarebbe stata error-prone.
- **`markAcceptSent` con fallback su `PGRST204`**: se qualcuno riavvia il bot prima di aver applicato la migration, `handleAccepted` non crasha — logga warning e prosegue. Grazia in caso di ordine di operazioni sbagliato dell'operatore umano.
- **Verificare con Monitor+grep+log**: `tail -F | grep --line-buffered "Recupero|WA accettazione|Realtime attivo"` sul log LaunchAgent — pattern replicabile per confermare qualsiasi restart del wa-bot.

## What Worked (aggiornato 03/07/2026 — inline edit + parità ordini/riparazioni)
- **Handler generico `handleRepairFieldChange(id, patch)`**: sostituisce N handler-per-campo con uno solo che accetta un patch object e fa merge. Meno codice, stesso comportamento di `withSync(()=>api.upsertRepair(updated))` + `setViewRepair` se aperto.
- **Pill selector inline per l'operatore**: invece di un dropdown, quattro chip colorate (Adri/Massi/Jenny/Manu) + "Nessuno" per rimuovere — un tap solo, no aprire/chiudere menu.
- **Estrarre `OPERATORS` a scope modulo**: prima duplicato in `RepairWizard` e `OrderForm`, ora anche `RepairDetail` e `RepairCard` lo usano per i colori del badge. Se serve aggiungere un operatore basta modificare 1 posto.
- **Badge operatore colorato in `RepairCard`**: `op.bg` come background + `op.color` come testo — riconoscibilità istantanea a colpo d'occhio in una lista lunga (Massi=blu, Jenny=rosa, ecc.), meglio di un `👷 Nome` monocromatico.
- **Rimuovere auto-print e auto-WA su creazione ordine**: portare la UX ordini alla parità di quella riparazioni (il modal `OrderReceiptModal` aveva già tutte le opzioni, bastava aprirlo dopo `setOrderForm(null)`) — utente mantiene controllo esplicito su cosa fare.
- **Riscrivere `OrderDetail` con lo stesso layout di `RepairDetail`**: sostituire il modal custom con `Sheet` + card `IOSCard`/`IOSRow` — coerenza tra le due schede, meno cognitive load per l'utente, meno codice duplicato per lo styling.
- **`onEdit` come pencil nell'header card**: invece di un bottone separato in fondo, ✏️ visibile subito nell'header (come per marca/ref, spesa, ecc. in `RepairDetail`). Su ordini apre il wizard `OrderForm` in edit mode allo step 6.
- **`sh.bg` (bg dello stato) come background dell'icona 📦**: la card header cambia colore in base allo stato — feedback visivo immediato su "questo ordine è ordinato/arrivato/consegnato".

## What Worked (aggiornato 26/06/2026 — fix multi-device)
- **`window.location.hostname` per derivare l'URL del server di stampa/WA**: meglio di un override fisso da Impostazioni — l'app "funziona e basta" sia su localhost (Mac) sia via IP (iPhone). L'override `localStorage.printServerUrl` resta per casi particolari (es. tunnel).
- **Fallback registro `repairers` quando lo snapshot DDT è vuoto**: cercare per `nome` con `.maybeSingle()` (no error se non trovato) — pattern semplice che salva i WA quando il telefono viene aggiunto al riparatore DOPO la creazione del DDT.
- **`<input type="file" capture="environment">` per QR su iPhone via IP**: getUserMedia richiede HTTPS, ma la capture nativa iOS no. Pattern affidabile per qualsiasi feature camera quando non si vuole gestire SSL.
- **Mostrare badge stato nella ConsegnaModal**: ampliare il filtro (mostrare anche le non-pronte) sarebbe stato confuso senza il badge — con il colore dello stato l'utente sa subito cosa stanno prendendo.
- **Recupero one-shot via script Node + `/wa/send-bulk`**: per riparazioni già rientrate ma con WA persi, query Supabase → costruisci messaggi → POST batch. Pattern riusabile per altre emergenze.

## What Worked (aggiornato 26/06/2026 — duplicati clienti)
- **Merge invece di delete per i duplicati**: cancellare e basta orfanava le riparazioni; trasformare la modal in tap-per-scegliere-il-primario + UPDATE customer_id ha eliminato il problema senza forzare l'utente a scegliere "chi cancellare".
- **Default primario su chi ha più rip.+ord.**: heuristic giusta perché di solito il duplicato "buono" è quello effettivamente usato per anni.
- **`DuplicateWarning` come componente unico**: stesso popup riusato in 3 punti (`RepairWizard`, `OrderForm`, `CustomerForm`) — evita di duplicare la UX e mantiene il flow coerente.
- **`excludeId` in `findDuplicateCustomer`**: necessario in `CustomerForm` edit mode, altrimenti il check matcha il cliente che stai modificando con se stesso.
- **`onSelectExisting` solo da `CustomerForm`**: dal form standalone "Usa questo cliente" apre il dettaglio (più utile per consultare/modificare); dai wizard invece seleziona e prosegue al prossimo step.
- **Match nome+cognome OPPURE telefono normalizzato**: copre i 2 casi reali — stesso cliente reinserito perché non lo trovi nella ricerca, oppure stesso numero con scrittura nome leggermente diversa (Sig. → Sig.ra, Maria Antonietta → M. Antonietta).

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
- **`http://localhost:3001` hardcoded nelle fetch dal client**: da iPhone via IP del Mac `localhost` è l'iPhone stesso, le fetch fallivano nel `.catch` senza messaggio visibile. Usare sempre `printServerBase()` (derivato da `window.location.hostname`).
- **`getUserMedia` da iPhone via IP**: Safari blocca camera senza HTTPS — implementare fallback `<input type="file" capture>`.
- **Snapshot DDT congelato**: il `riparatore` dentro `ddts` è una copia, non un FK al registro. Telefoni aggiunti al registro `repairers` dopo la creazione DDT non risalgono → fallback per nome nel bot WA.

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
