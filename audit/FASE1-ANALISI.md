# Audit Zerrillo Repair Manager — Fase 1: Ricognizione e analisi statica

Data: 03/07/2026 · Branch: `gestionale` · Analisi a codice fermo, nessuna esecuzione.
File analizzati: `src/App.js` (4478 righe), `print-server/server.js` (205), `print-server/wa-bot.js` (391), `docs/repair-status.html` (171), `docs/approve-quote.html` (134), `backup/backup.js` (236), `src/supabase.js`, `package.json` ×2, `.gitignore`, HANDOFF.md.

> Nota: nel working tree ci sono modifiche **non committate** a `src/App.js` (+405/-161), `wa-bot.js` (+63), `HANDOFF.md`. L'analisi riflette il working tree (ciò che gira in negozio).

---

## 1. Inventario funzionalità (checklist per la Fase 2)

### A. Riparazioni
- A1. Wizard intake 8 step (operatore → cliente → categoria → tipo lavoro → descrizione+foto+AI → problema → preventivo/toggle → riepilogo) — `RepairWizard` App.js:977
- A2. Multi-oggetto: "Aggiungi altro oggetto" → ogni item diventa riparazione separata — App.js:1023, 4286
- A3. Generazione numero `R<anno>-<progressivo>` — `getNextRepairNum` App.js:156
- A4. Link token UUID per pagina stato pubblica — App.js:4295
- A5. Foto: compressione client 800px + upload Supabase Storage `repair-photos` — App.js:211, 216
- A6. AI (opzionale): catalogazione oggetto e scansione documento — `aiCall` App.js:202
- A7. Dettaglio con inline edit (descrizione, materiali, marca/ref, problema, note, operatore, preventivo, acconto, spesa, prezzo finale, data consegna, nota preventivo) — `RepairDetail` App.js:2017
- A8. Toggle: preventivo accettato / richiesta preventivo / interna / garanzia
- A9. Cambio stato manuale (6 stati) + date automatiche (spedita/rientrata/consegnata) — `handleStatus` App.js:4040
- A10. Consegna al cliente (singola da dettaglio; multipla da `ConsegnaModal` lista/numero/QR con lock cliente) — App.js:1269, 4200
- A11. Soft delete + archivio eliminati + ripristino — SettingsPage
- A12. Scanner QR live (BarcodeDetector/jsQR) + fallback foto — `LiveQRScanner` App.js:3829
- A13. Ricerca/filtri (attive, in ritardo, per stato) — `RepairsPage`
- A14. Dashboard: stat card, rientro rapido, consegna, ultime riparazioni

### B. Preventivi (flusso pubblico)
- B1. Salvataggio preventivo → auto-flag richiestaPreventivo + creazione `quote_token` + WAToast con link — `handlePreventivoChange` App.js:4086
- B2. Pagina `repair-status.html` (GitHub Pages): stato + accetta/rifiuta se token valido
- B3. Pagina fallback `approve-quote.html` per vecchie riparazioni
- B4. WA bot: Realtime su `preventivo_accettato/rifiutato` → WA riparatore + negozio, cambio stato, `wa_accept_sent_at`/`wa_decline_sent_at`, reconciliation all'avvio — wa-bot.js:237-310

### C. Ordini
- C1. Wizard 7 step multi-prodotto (prodotti in JSONB) — `OrderForm` App.js:3384
- C2. Stato ordine derivato dagli stati prodotto (every/some) — App.js:3469, 4233
- C3. Cambio stato per-prodotto con WA automatico su "arrivato" (fire-and-forget) e WAToast su "consegnato" — `handleOrderProductStatus` App.js:4229
- C4. Cambio stato ordine manuale (pill in OrderDetail) — `handleOrderStatus` App.js:4258
- C5. Consegna ordine completa (card + dettaglio) — `handleConsegnaOrder` App.js:4264
- C6. `OrderReceiptModal` su creazione: stampa / stampa+WA / WA / email / SMS
- C7. Etichette ordine 62mm — `orderLabelHTML` App.js:590
- C8. Ricerca/filtri per stato, stats strip

### D. Clienti
- D1. CRUD + form standalone con scansione documento AI
- D2. Ricerca multi-parola (nome/cognome/telefono/email) — `matchCustomer` App.js:8
- D3. Anti-doppione all'inserimento in 3 punti (RepairWizard, OrderForm, CustomerForm) — `findDuplicateCustomer` App.js:20
- D4. Merge duplicati (gruppi per nome o telefono, scelta primario, riassegnazione repairs+orders) — `DuplicatesModal` App.js:2444, `api.mergeCustomers` App.js:175
- D5. Import vCard .vcf (QP decoding, priorità CELL, dedup per telefono) — `parseVCards` App.js:332
- D6. Export vCard singolo ("Salva in Rubrica") — App.js:40
- D7. Dettaglio con storico riparazioni, chiamata, WA
- D8. Eliminazione cliente (hard delete, riparazioni restano)

### E. DDT / Riparatori
- E1. Creazione DDT con snapshot riparatore + dati trasporto; stampa A4 — `DDTForm` App.js:2746, `ddtHTML` App.js:611
- E2. Numerazione `DDT<anno>-<n>` basata su `ddts.length+1` — App.js:4318
- E3. Modifica DDT (aggiunta/rimozione oggetti con ripristino stato) — App.js:4325
- E4. Rientro da DDT (`DDTReturn`) e Rientro Rapido cross-DDT con QR — App.js:2986, 3023
- E5. Auto-chiusura DDT quando tutti gli oggetti sono rientrati — App.js:4178
- E6. DDT fornitore al rientro (`ddt_rientro_numero`, data)
- E7. Registro riparatori CRUD (Settings) — `RepairerManager` App.js:3247
- E8. Riepilogo economico spesa/ricavi/margine per DDT e globale
- E9. Eliminazione DDT (hard) con ripristino stato riparazioni

### F. Stampa
- F1. Etichette 62×100mm Brother QL: cliente/negozio/riparatore (riparatore omessa se interna) — `receiptHTML` App.js:540
- F2. Etichetta multi-oggetto — `multiReceiptHTML` App.js:559
- F3. QR via api.qrserver.com (servizio esterno)
- F4. Mac: stampa via finestra browser (`printHTML` blob URL); iOS: POST al print server (`smartPrint`) — App.js:244, 302
- F5. Print server: Puppeteer → PDF → `lp` su Brother QL; risposta immediata "queued" — server.js:106
- F6. Configurazione URL print server + test connessione (Settings, solo iOS)

### G. WhatsApp
- G1. WAToast manuali (pronto, preventivo, consegna, reso, riparatore) → wa.me link
- G2. `/wa/send-bulk` con delay anti-ban 8–15s — server.js:172, wa-bot.js:368
- G3. WA automatici: rientro bulk (>1), ordine-prodotto arrivato
- G4. Bot preventivi (vedi B4): QR login, LocalAuth, reconciliation
- G5. WABtn ovunque (chat diretta cliente)

### H. Pagine pubbliche (GitHub Pages)
- H1. `repair-status.html?token=<link_token>` — stato + preventivo accetta/rifiuta
- H2. `approve-quote.html?token=<quote_token>` — fallback conferma/disdetta

### I. Backup e ripristino
- I1. Export JSON manuale da Settings (formato camelCase app)
- I2. Ripristino da JSON in-app — `handleRestore` App.js:4361
- I3. Backup notturno `backup/backup.js`: 5 tabelle → JSON + schema SQL + tar.gz sorgente su Google Drive, retention 30gg

### J. Infrastruttura / trasversale
- J1. PIN screen (`REACT_APP_PIN`, default 1234) — client-side only
- J2. Supabase Realtime su 5 tabelle → reload completo per tabella — App.js:4007
- J3. Reload su visibilitychange — App.js:4020
- J4. Layout responsive BP=768 (sidebar/tab bar), indicatore sync
- J5. LaunchAgent `com.zerrillo.printserver` (fuori repo)

---

## 2. Flussi di dati critici

```
React App (localhost:3000 / IP:3000)
 ├─ Supabase REST (anon key, RLS aperta) — CRUD customers/repairs/ddts/repairers/orders
 ├─ Supabase Realtime — 5 tabelle → loadX() completo (refetch, non merge)
 ├─ Supabase Storage — repair-photos
 ├─ api.anthropic.com — AI opzionale (chiave nel bundle)
 ├─ api.qrserver.com — QR immagini nelle etichette (dipendenza esterna per stampare)
 └─ Print server :3001 — /print (iOS), /wa/send-bulk (fire-and-forget), /status, /wa-status

Print server (Mac, 0.0.0.0:3001, CORS *)
 ├─ Puppeteer → PDF → lp (Brother QL)
 └─ wa-bot: whatsapp-web.js + Supabase (Realtime preventivi + reconciliation + UPDATE repairs)

GitHub Pages (docs/) — chiave publishable hardcoded
 ├─ repair-status.html — SELECT repairs by link_token; SELECT quote_tokens; PATCH quote_tokens + repairs
 └─ approve-quote.html — idem by quote_token

backup.js (cron/LaunchAgent) — SELECT * 5 tabelle → Google Drive
```

Scritture su `repairs.status`: app (handleStatus, DDT, rientri, consegne) **e** wa-bot (accettazione interna → lavorazione, rifiuto → reso_non_riparato) **e** pagine pubbliche (flag preventivo). Tre scrittori concorrenti sulla stessa riga, tutti in full-row-upsert (app) o update mirato (bot/pagine).

---

## 3. Punti deboli rilevati a codice fermo

### CRITICO
| # | Problema | Dove |
|---|---|---|
| C1 | **Database interamente aperto al pubblico**: RLS `for all using(true) with check(true)` su tutte le tabelle (vedi schema in backup.js:110-121 e HANDOFF) + chiave publishable hardcoded in `docs/*.html` **in repo GitHub pubblico** servito da GitHub Pages. Chiunque può leggere/modificare/cancellare clienti (nomi, telefoni, email, CF), riparazioni, ordini via REST. Esposizione dati personali (GDPR) + integrità dati. | docs/repair-status.html:37-38, approve-quote.html:30-31 |
| C2 | **Wizard riparazioni perde Marca, Referenza e "Lavori da eseguire"**: `handleSaveRepair` non include `marca`, `referenza`, `notaPreventivo` nel record salvato (né per l'oggetto principale né per gli items aggiuntivi), benché il wizard li raccolga (step 4 e 6) e li mostri nel riepilogo. Dati inseriti → persi silenziosamente. | App.js:4286-4296 |
| C3 | **Errori DB inghiottiti sistematicamente**: quasi tutte le `api.*` ignorano `error` (upsertCustomer:143, upsertDDT:162, updateRepairStatus:159, updateRepairReturn:160, softDeleteRepair:157, deleteDDT:164…). `withSync` (App.js:4030) non cattura né mostra errori. UI ottimista: stato locale aggiornato anche se la scrittura fallisce → l'operatore vede "Sincronizzato" e il dato non esiste. | App.js:129-199, 4030 |
| C4 | **Numerazione duplicabile**: (a) `getNextRepairNum` legge l'ultimo per `created_at` e fa +1 → race con 2 device o nel loop multi-oggetto; (b) `ddtNum(ddts.length+1)` → dopo un'eliminazione DDT (hard delete) il numero successivo **ripete** un numero esistente; (c) `getNextOrderNum` come (a). | App.js:156, 198, 4318 |
| C5 | **Backup notturno inaffidabile**: (a) `BACKUP_DIR` usa il vecchio path Google Drive `~/Google Drive (email)/…` — su macOS moderno è `~/Library/CloudStorage/GoogleDrive-…`; se il path non esiste `mkdirSync` crea una cartella locale e il log dichiara successo → backup mai su Drive; (b) `SCHEMA_SQL` obsoleto: mancano ~12 colonne (marca, referenza, nota_preventivo, in_garanzia, link_token, operatore, acconto, data_spedita/rientrata/consegnata, wa_*_sent_at, ddt_rientro_numero, riparazione_interna…) e la tabella `quote_tokens` non è né nello schema né in `TABLES`; (c) il JSON notturno è snake_case ma `handleRestore` in-app si aspetta camelCase → un ripristino dal backup notturno perderebbe silenziosamente telefonoPrefisso, codiceFiscale, ecc. | backup.js:15-17, 20-122; App.js:4361 |

### ALTO
| # | Problema | Dove |
|---|---|---|
| A1 | **WA "articolo arrivato" fire-and-forget senza traccia**: stessa classe del bug preventivi già corretto (wa_accept_sent_at), ma qui nessun flag DB, nessuna coda: se il print server è giù o WA disconnesso, la notifica è persa con solo `console.warn`. Idem WA bulk rientro (App.js:4189). | App.js:4248-4250 |
| A2 | **Full-row upsert = last-writer-wins**: tutti gli handler di RepairDetail partono dallo snapshot `repairs`/`viewRepair` in closure e riscrivono l'intera riga. Modifica concorrente da altro device (o dal wa-bot che cambia status) → sovrascritta. Es.: bot mette `status=lavorazione`, operatore con dettaglio aperto tocca un toggle → status torna indietro. | App.js:4040-4144 |
| A3 | **wa-bot: doppio invio al riparatore in caso di errore parziale**: in `handleAccepted`, se il WA riparatore va a buon fine ma quello al negozio fallisce, il catch fa `waSent.delete` senza `markAcceptSent` → al retry/riavvio reinvia anche al riparatore. | wa-bot.js:123-175 |
| A4 | **Prefissi telefonici esteri rotti nei WA automatici**: `formatPhone` antepone '39' a qualsiasi numero non iniziante per 39; l'app passa `telefono` senza `telefonoPrefisso` nei bulk (App.js:4165, 4248) → cliente estero riceve nulla o il WA va a un numero italiano errato. Inoltre un numero italiano che inizia per 39 (es. 39xxxxxxx) non riceve il prefisso. | wa-bot.js:24-29; App.js:4165 |
| A5 | **`smartPrint` iOS non usa `printServerBase()`**: richiede `localStorage.printServerUrl` configurato a mano, mentre le fetch WA usano il fallback hostname. Incoerenza con il fix multi-device del 26/06. | App.js:302-309 |
| A6 | **Print server: esito stampa mai riportato**: `/print` risponde `queued` prima di generare il PDF; ogni errore (Chrome, stampante) finisce solo nel log. iOS mostra "Etichetta inviata!" anche se non stamperà mai. | server.js:113-163 |
| A7 | **Print server esposto in LAN senza auth**: `0.0.0.0:3001`, CORS `*` → chiunque nella rete del negozio può stampare o **inviare WhatsApp** dal numero del negozio (`/wa/send-bulk`). | server.js:27-33, 183 |
| A8 | **Consegna multipla: WAToast sovrascritti**: `ConsegnaModal.doConsegna` e `handleReturn` chiamano in loop handler che fanno `setWaToast` → resta solo l'ultimo; i messaggi "pronto/consegnato/reso" degli altri clienti non vengono mai proposti. | App.js:1395, 4342-4353 |
| A9 | **`handleConsegnaOrder` marca consegnato tutto**: il bottone appare con stato ordine "arrivato" (basta *un* prodotto arrivato) ma marca *tutti* i prodotti consegnati, anche quelli ancora "ordinato/da_ordinare". | App.js:4264-4266, 3319 |
| A10 | **Etichette dipendono da api.qrserver.com**: senza internet (o se il servizio cade) i QR non si stampano; nessun fallback locale. | App.js:542 |

### MEDIO
| # | Problema | Dove |
|---|---|---|
| M1 | PGRST204 fallback: il retry scarta *in blocco* tutte le colonne nuove e non controlla l'errore del secondo tentativo → salvataggi parziali invisibili. | App.js:152, 168-171, 193 |
| M2 | `npm audit`: app 40 vulnerabilità (1 critical, 17 high — in gran parte dev-deps di react-scripts 5); print-server 3 (qs DoS, ws DoS, js-yaml) con fix disponibile. Puppeteer 22 vs 25, Express 4 vs 5. | package.json |
| M3 | Eliminazione cliente hard-delete orfana riparazioni/ordini (customerId dangling, "Cliente sconosciuto"). | App.js:174, 2367 |
| M4 | `mergeCustomers` non transazionale: fallimento a metà → riparazioni divise tra due anagrafiche; errori solo in console, UI dichiara successo. | App.js:175-186 |
| M5 | Totali DDTPage: `flatMap` conta due volte riparazioni presenti in più DDT (possibile con edit DDT). | App.js:1762 |
| M6 | Realtime: nessuna gestione riconnessione canale (mitigata da visibilitychange); ogni evento → refetch completo tabella (5 query, pesante con molti device). | App.js:4007-4018 |
| M7 | Chiave Anthropic nel bundle client (`dangerous-direct-browser-access`), PIN client-side default "1234": accettabili solo finché l'app resta in LAN. | App.js:202-208, 742 |
| M8 | `link_token` senza scadenza: chiunque abbia il QR dell'etichetta vede per sempre lo stato e i dettagli lavoro; `quote_tokens` mai scaduti/invalidati (solo consumati). | docs/repair-status.html |
| M9 | Nessun escaping HTML in `receiptHTML`/`ddtHTML`/`orderLabelHTML`: una descrizione con `<` o `&` corrompe l'etichetta stampata. | App.js:540-733 |
| M10 | Doppie sottomissioni pagine pubbliche: bottoni disabilitati solo client-side; il PATCH non è condizionato (`accepted_at=is.null`) → due tab aperte possono confermare e disdire lo stesso preventivo (ultimo vince, entrambi i flag true). | approve-quote.html:66-86 |
| M11 | `handleRientroRapido` legge `repairs` dalla closure per il fallback `preventivo` → se Realtime ha ricaricato nel frattempo lo stato è comunque quello al mount del modal. | App.js:4158 |
| M12 | `getNextRepairNum` a cavallo d'anno non riparte da 1 (R2027 continua dal progressivo 2026). Da confermare se voluto. | App.js:156 |
| M13 | wa-bot `handleDeclined` forza `status=reso_non_riparato` anche per riparazioni esterne ancora fisicamente dal riparatore (lo stato "presso_esterno" si perde; il rientro poi non le lista più in RientroRapido perché filtrate su presso_esterno). | wa-bot.js:192; App.js:3024 |
| M14 | `compressImage` senza onerror: file non-immagine → promise mai risolta, wizard bloccato. | App.js:211-213 |
| M15 | Import vCard: dedup solo per telefono esatto (no nome), contatti senza telefono importabili due volte. | App.js:2607-2616 |

### BASSO
- Dead code: campo `fornitore` nei prodotti ordine (mai input), `r.items` legacy in RepairCard (App.js:915), `hasFlags` con `extraItems>0`, `ddt_id` su repairs mai valorizzato, edge function `approve-quote` dismessa.
- `SettingsPage` "v8" hardcoded; `uid()` `Math.random` 8 char (collisione improbabile ma possibile su tabelle grandi).
- Monolite 4478 righe: nessun test, nessuna estrazione moduli (HANDOFF già pianifica `shared.js`).
- `getCustomers` pagina da 1000 in loop sequenziale a ogni evento Realtime.
- Doppia dichiarazione commento `absoluteUrl` (App.js:220-221); `PREF_LIST` duplicata rispetto a `PREFIXES`.
- `WAToast` label logic fragile (confronto stringa emoji "📄 Invia ricevuta").

## 4. Sicurezza — sintesi
1. **RLS aperta + chiave pubblica in repo pubblico = DB pubblico** (C1). Priorità assoluta.
2. Print server senza auth in LAN (A7).
3. Chiave Anthropic e PIN nel client (M7) — `.env` correttamente in `.gitignore`, `build/` non tracciato.
4. Pagine pubbliche: escaping presente (`esc()`), ma il PATCH repairs da anon è possibile su *qualunque* colonna/riga, non solo i flag preventivo (conseguenza di C1).
5. `repair-status.html` espone problema/lavori/preventivo a chiunque abbia il token — accettabile, ma il token non scade mai (M8).

## 5. Qualità — sintesi
- **Dipendenze**: react-scripts 5.0.1 (CRA, deprecato, 40 vulns per lo più dev); print-server 3 vulns fixabili; puppeteer/express indietro di major.
- **Test**: zero test presenti (testing-library installata ma inutilizzata).
- **Architettura**: monolite unico ben organizzato per sezioni ma con duplicazioni (wizard cliente in 3 posti, pattern inline-edit ripetuto 8 volte); handler generico `handleRepairFieldChange` già introdotto è la direzione giusta.
