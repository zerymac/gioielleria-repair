# AUDIT_REPORT — Zerrillo Gioielleria Repair Manager

Audit tecnico completo · 03/07/2026 · branch `gestionale` (working tree in uso in negozio)
Metodo: analisi statica di tutto il codice + 29 test automatici in ambiente isolato (worktree `audit/verifica`, Supabase finto in memoria, WhatsApp e stampa mockati, DB di produzione mai contattato).

> **Come leggere i livelli.** `[TEST]` = difetto **dimostrato** con un test eseguito. `[COD]` = valutazione da revisione del codice (non eseguito). `CRITICO` = perdita dati / notifiche perse / dati clienti esposti. `ALTO` = malfunzionamento visibile o rischio concreto. `MEDIO` = casi limite / debito. `BASSO` = pulizia.

---

## 1. Sintesi esecutiva

L'applicazione è **funzionante e completa**: nei test i flussi principali (intake riparazioni, ordini, DDT, rientri, merge clienti, preventivi, notifiche) fanno ciò che devono. La qualità del lavoro recente è buona — il fix "notifiche WhatsApp perse" del 03/07 è ben progettato e nei test la reconciliation recupera davvero gli eventi persi.

Restano però **cinque problemi importanti**, di cui alcuni comportano **perdita silenziosa di dati** — il tipo di errore più insidioso perché nessuno se ne accorge sul momento:

1. **Il database è di fatto aperto a chiunque su internet.** Le regole di accesso sono completamente permissive e la chiave di accesso è pubblicata in chiaro nel sito pubblico (repository GitHub pubblico). Chiunque la trovi può leggere, modificare o cancellare l'intera anagrafica clienti (nomi, telefoni, email, codici fiscali), riparazioni e ordini. È il rischio più grave: riservatezza dei dati dei clienti e integrità dell'archivio.

2. **Quando si registra una nuova riparazione, "Marca", "Referenza" e "Lavori da eseguire" vengono persi.** L'operatore li scrive nel wizard, li vede nel riepilogo, ma non finiscono nel salvataggio. (Dimostrato dal test.)

3. **Gli errori di salvataggio sono invisibili.** Se una scrittura sul database fallisce, l'app mostra comunque "Sincronizzato" e va avanti. In caso di rete assente all'avvio, l'app si presenta con l'archivio **vuoto** senza alcun avviso — un operatore potrebbe pensare che i dati siano spariti.

4. **I numeri di DDT possono duplicarsi.** Dopo aver eliminato un DDT, il documento successivo riceve un numero **già usato**. (Dimostrato dal test.) Stesso schema di rischio, più raro, su numeri di riparazione/ordine con due dispositivi simultanei.

5. **Alcune notifiche WhatsApp automatiche possono perdersi o partire doppie.** Il messaggio "articolo arrivato", il bulk di rientro e le consegne multiple non hanno la stessa rete di sicurezza introdotta per i preventivi; inoltre i numeri esteri ricevono per errore il prefisso italiano.

**Cosa fare per primo (in ordine):** (1) chiudere l'accesso al database con regole di sicurezza adeguate; (2) correggere la perdita di Marca/Referenza/Lavori nel wizard (una riga di codice, dati che si stanno perdendo ogni giorno); (3) rendere visibili gli errori di salvataggio. Sono tre interventi indipendenti, il primo è di sicurezza, gli altri due piccoli e ad alto beneficio.

---

## 2. Inventario funzionalità e matrice di test

29 test superati (1 skip tecnico), 8 aree. Elenco completo con esito in `audit/FASE2-RISULTATI.md`. Sintesi:

| Area | Copertura test | Corretti | Difetti dimostrati |
|------|----------------|----------|--------------------|
| Riparazioni | intake, numerazione, stato, date, resilienza offline | 4 | C2 (campi persi), resilienza silenziosa |
| Ordini | wizard, stato derivato, WA arrivato, consegna | 3 | A9 (consegna marca tutto), A1 (WA silenzioso) |
| Clienti | anti-doppione, merge, casi limite | 3 | D3-accenti |
| DDT / rientri | creazione, numerazione, rientro singolo/multiplo, consegna multipla | 4 | C4 (numero duplicato), A8 (WAToast persi) |
| WA bot | reconciliation, dedup, invii parziali, prefissi | 2 | A3 (doppio invio), A4 (prefisso estero), M13 (stato esterna) |
| Pagine pubbliche | token, conferma/disdetta, idempotenza, esposizione | 3 | M10 (doppia submit), C1/M8 (select \*) |
| Backup | restore in-app vs formato notturno | — | C5 (campi persi al restore) |
| Layout | breakpoint mobile/desktop | 1 | — |

Aree verificate **solo staticamente** (non automatizzate, vedi §6): stampa fisica Brother QL, scanner QR con fotocamera reale, esecuzione `backup.js`, connessione REST reale con RLS.

---

## 3. Problemi riscontrati (per gravità)

### 🔴 CRITICO

#### C1 — Database accessibile pubblicamente in lettura e scrittura `[COD]`
**Dove:** RLS `for all using(true) with check(true)` su tutte le tabelle (schema in `backup/backup.js:110-121`); chiave publishable Supabase hardcoded in `docs/repair-status.html:37-38` e `docs/approve-quote.html:30-31`, file serviti da **GitHub Pages su repository pubblico** `github.com/zerymac/gioielleria-repair`.
**Riproduzione:** con la chiave presa dal sorgente pubblico, una singola chiamata REST `GET …/rest/v1/customers?select=*` restituisce l'intera anagrafica; una `DELETE`/`PATCH` la modifica. (Non eseguito in audit: sarebbe scrittura su produzione.)
**Impatto:** esposizione dati personali di tutti i clienti (GDPR: nome, telefono, email, codice fiscale, indirizzo) e integrità dell'intero archivio a rischio.
**Correzione proposta:** separare le due esigenze. (a) L'app in negozio: se resta in LAN, spostare le chiavi in `.env` (già ignorato da git) e valutare una chiave con permessi; comunque **restringere le policy RLS** in modo che l'anon non possa fare `select *` / `delete` libero. (b) Le pagine pubbliche di preventivo: esporre **solo** i campi necessari tramite una `VIEW` dedicata o una Edge Function con service-role lato server, così il browser del cliente non riceve mai la tabella `repairs` completa né una chiave che scrive ovunque. Rimuovere la chiave dai file in repo pubblico. **Sforzo: L. Rischio correzione: medio** (va testato che app e pagine pubbliche continuino a funzionare con le nuove policy).

#### C2 — Il wizard riparazioni perde Marca, Referenza e "Lavori da eseguire" `[TEST]`
**Dove:** `src/App.js:4286-4296` (`handleSaveRepair`): costruisce il record senza `marca`, `referenza`, `notaPreventivo`, benché il wizard li raccolga (step 4 e 6, `App.js:1189-1192, 1218`) e li mostri nel riepilogo.
**Riproduzione:** nuova riparazione → compilare Marca "Bulgari", Referenza "AB123", Lavori "Saldatura" → salvare → il record in DB ha `marca=null, referenza=null, nota_preventivo=null`. (Test: *"BUG C2 — marca, referenza e nota preventivo … NON vengono salvati"*.)
**Impatto:** perdita quotidiana e silenziosa di dati inseriti dall'operatore; la nota preventivo mancante si riflette anche nei messaggi WA e nella pagina pubblica.
**Correzione proposta:** aggiungere i tre campi (e per gli item aggiuntivi, che già li portano) al record in `handleSaveRepair`. **Sforzo: S. Rischio: basso.**

#### C3 — Errori di salvataggio inghiottiti; degrado offline silenzioso `[TEST]`
**Dove:** le funzioni `api.*` ignorano `error` (`upsertCustomer:143`, `updateRepairStatus:159`, `upsertDDT:162`, `softDeleteRepair:157`, `updateRepairReturn:160`, …); `withSync` (`App.js:4030`) non cattura nulla; le `getX` fanno `(data||[])` senza distinguere "vuoto" da "errore".
**Riproduzione:** con il database irraggiungibile all'avvio, l'app si sblocca e mostra dashboard **vuota**, indicatore "Sincronizzato", nessun avviso. (Test: *"Resilienza — Supabase irraggiungibile all'avvio…"*.) Con scrittura fallita, la UI aggiorna lo stato locale e dichiara successo.
**Impatto:** un operatore può credere che l'archivio sia stato azzerato e iniziare a reinserire dati; oppure credere di aver salvato una modifica che non è stata scritta.
**Correzione proposta:** far propagare l'errore da `api.*` (return dell'`error`), gestirlo in `withSync` con un toast rosso, e distinguere in `loadX` il caso errore (non svuotare la lista già in memoria; mostrare banner "connessione persa"). **Sforzo: M. Rischio: basso-medio.**

#### C4 — Numerazione DDT duplicabile dopo eliminazione `[TEST]`
**Dove:** `src/App.js:4318` — `ddtNum(ddts.length+1)`. Analoghi più rari: `getNextRepairNum`/`getNextOrderNum` (App.js:156, 198) su ultimo `created_at` +1 → race con due dispositivi o nel loop multi-oggetto.
**Riproduzione:** creare DDT-0001 e DDT-0002 → eliminare DDT-0001 → creare un nuovo DDT → riceve **DDT-0002**, già esistente. (Test: *"BUG C4 — numerazione DDT … DUPLICA uno esistente"*.)
**Impatto:** due DDT con lo stesso numero (documento di trasporto fiscale) — problema amministrativo e di tracciabilità.
**Correzione proposta:** derivare il numero dal massimo progressivo esistente (`max(numero)+1`), non dal conteggio; idealmente un contatore atomico lato DB (sequence/RPC) per eliminare anche la race multi-device. **Sforzo: S-M. Rischio: basso.**

#### C5 — Ripristino in-app incompatibile con il formato del backup notturno `[TEST]`
**Dove:** `backup/backup.js` salva righe grezze **snake_case**; `handleRestore`→`api.upsertCustomer` (`App.js:4361, 143`) legge `telefonoPrefisso`/`codiceFiscale` **camelCase**.
**Riproduzione:** in Impostazioni → "Ripristina da backup" caricando il `database-YYYY-MM-DD.json` notturno: cliente con prefisso +49 e codice fiscale → dopo il restore prefisso forzato a **+39**, codice fiscale **perso**. (Test: *"BUG C5 — ripristino in-app di un backup NOTTURNO…"*.)
**Impatto:** in uno scenario di disastro (l'uso previsto del backup) il ripristino corrompe i dati anagrafici invece di salvarli.
**Nota — rettifica rispetto all'analisi iniziale:** ho verificato che **il backup notturno funziona e raggiunge Google Drive** (stesso file/inode su path legacy e CloudStorage; il JSON contiene tutte le colonne nuove). Il problema **non** è la scrittura del backup, ma **la lettura in-app** e due lacune minori: la tabella `quote_tokens` **non è inclusa** nel backup e lo `schema-*.sql` incorporato è obsoleto (~12 colonne mancanti) → una ricostruzione del DB da quello schema sarebbe incompleta.
**Correzione proposta:** in `handleRestore` mappare snake_case→camelCase (o far accettare a `upsertCustomer`/`upsertRepair` entrambe le forme); aggiungere `quote_tokens` a `TABLES` e rigenerare `SCHEMA_SQL` dallo schema reale. **Sforzo: S-M. Rischio: basso.**

### 🟠 ALTO

- **A1 — WA "articolo arrivato" / bulk rientro fire-and-forget senza traccia `[TEST]`** (`App.js:4248-4250, 4189`). Stessa classe del bug preventivi già risolto, ma qui nessun flag DB né coda: server giù o WA disconnesso → notifica persa con solo `console.warn`; l'utente non vede nulla. *Correzione:* estendere il pattern outbox/`*_sent_at` o almeno un feedback visibile in caso di fallimento. **Sforzo: M.**
- **A3 — wa-bot: doppio invio al riparatore su errore parziale `[TEST]`** (`wa-bot.js:123-175`). Se il WA al negozio fallisce dopo quello al riparatore, il `catch` fa `waSent.delete` senza `markAcceptSent` → al retry il riparatore riceve **due volte**. *Correzione:* tracciare l'invio per-destinatario, o marcare `wa_accept_sent_at` dopo il primo invio riuscito e rendere idempotenti i singoli step. **Sforzo: M.**
- **A4 — prefissi esteri rotti nei WA automatici `[TEST]`** (`wa-bot.js:24-29`; l'app passa `telefono` senza `telefonoPrefisso`, `App.js:4165, 4248`). `formatPhone` antepone '39' a qualsiasi numero → un +44 UK diventa `3944…`. *Correzione:* passare e usare il prefisso completo (`fullPhone`) nei messaggi bulk e in `formatPhone`. **Sforzo: S-M.**
- **A8 — consegna multipla: WAToast sovrascritti `[TEST]`** (`App.js:1395, 4342-4353`). In `ConsegnaModal`/`handleReturn` il loop chiama più `setWaToast`: sopravvive solo l'ultimo, gli altri clienti non vengono mai notificati. *Correzione:* accodare i toast o usare il canale bulk `/wa/send-bulk` anche qui. **Sforzo: M.**
- **A9 — "Consegna al cliente" ordine marca consegnato anche il non-arrivato `[TEST]`** (`App.js:4264-4266`; bottone visibile con `stato==="arrivato"`, cioè *un* prodotto arrivato, ma marca *tutti* i prodotti). *Correzione:* consegnare solo i prodotti `arrivato`, o richiedere che tutti lo siano. **Sforzo: S.**
- **A6 — print server non riporta l'esito stampa `[COD]`** (`server.js:113-163`): risponde `queued` prima di generare il PDF; iOS mostra "Etichetta inviata!" anche se la stampa poi fallisce. *Correzione:* endpoint di stato job o risposta dopo l'esito. **Sforzo: M.**
- **A7 — print server esposto in LAN senza autenticazione `[COD]`** (`server.js:27-33, 183`): `0.0.0.0:3001`, CORS `*`. Chiunque in rete può stampare o **inviare WhatsApp** dal numero del negozio via `/wa/send-bulk`. *Correzione:* bind su interfaccia locale o token condiviso app↔server. **Sforzo: S-M.**
- **C1/M8 — pagine pubbliche espongono colonne interne `[TEST]`** (`repair-status.html:152`, `select=*`): il browser del cliente riceve anche `spesa`, `note` interne, `prezzo_finale`. *Correzione:* `select` esplicito dei soli campi mostrati (o VIEW dedicata, vedi C1). **Sforzo: S.**
- **A10 — etichette dipendono da `api.qrserver.com` `[COD]`** (`App.js:542`): senza internet i QR non si stampano, nessun fallback locale. *Correzione:* generare il QR localmente (libreria già presente lato print-server). **Sforzo: M.**

### 🟡 MEDIO

- **M3 — eliminazione cliente hard-delete orfana riparazioni/ordini** (`App.js:174`): restano `customerId` pendenti ("Cliente sconosciuto"). Valutare blocco se esistono record collegati, o soft-delete.
- **M4 — `mergeCustomers` non transazionale** (`App.js:175-186`): fallimento a metà → riparazioni divise tra due anagrafiche; errori solo in console.
- **M10 — doppia sottomissione pagine pubbliche `[TEST]`** (`approve-quote.html:66-86`): il PATCH non è condizionato (`accepted_at=is.null`) → due schede possono confermare **e** disdire lo stesso preventivo. *Correzione:* PATCH condizionato lato server o guardia in DB.
- **M13 — disdetta su riparazione esterna forza `reso_non_riparato` `[TEST]`** (`wa-bot.js:192`): l'oggetto è ancora fisicamente dal riparatore ma sparisce da Rientro Rapido (filtra `presso_esterno`). *Correzione:* non cambiare stato per le esterne finché non rientrate, o stato intermedio.
- **D3-accenti — anti-doppione non normalizza gli accenti `[TEST]`** (`App.js:18`): "José Núñez" e "Jose Nunez" non matchano → doppione. *Correzione:* `normalize('NFD')` + rimozione diacritici in `normName`.
- **M1 — PGRST204 fallback non verifica il secondo tentativo** (`App.js:152`): scarta in blocco tutte le colonne nuove e non controlla l'errore del retry.
- **M5 — totali DDTPage doppio conteggio** (`App.js:1762`): `flatMap` conta due volte una riparazione presente in più DDT.
- **M6 — Realtime: refetch completo per evento, nessuna riconnessione esplicita** (`App.js:4007`) — pesante con molti dispositivi (mitigato da `visibilitychange`).
- **M9 — nessun escaping HTML nelle etichette** (`App.js:540-733`): una descrizione con `<` o `&` corrompe l'etichetta stampata.
- **M14 — `compressImage` senza `onerror`** (`App.js:211`): un file non-immagine blocca il wizard (promise mai risolta).
- **M12 — numerazione non riparte a inizio anno** (`App.js:156`): confermare se voluto.

### ⚪ BASSO
Dead code (`fornitore` prodotti ordine, `r.items` legacy, `ddt_id` mai valorizzato, edge function dismessa); "v8" hardcoded in Impostazioni; `uid()` a 8 char; monolite 4478 righe senza moduli né test; `getCustomers` pagina 1000 in loop a ogni evento Realtime; commento `absoluteUrl` duplicato; `PREF_LIST`/`PREFIXES` duplicati; PIN client-side default "1234" e chiave Anthropic nel bundle (accettabili solo in LAN).

---

## 4. Migliorie suggerite (non-bug)

| Miglioria | Beneficio | Sforzo |
|-----------|-----------|--------|
| **Outbox WhatsApp** (tabella `wa_outbox` + worker con retry) al posto dei fire-and-forget | affidabilità: nessuna notifica persa, retry automatico, storico invii | M-L |
| **Contatore numeri lato DB** (sequence/RPC atomica) per repair/ordine/DDT | elimina alla radice duplicati e race multi-device (C4) | M |
| **VIEW pubblica minimale** per le pagine preventivo + service-role lato server | riduce drasticamente la superficie di C1/M8 | M |
| **Estrazione moduli** da `App.js` (`shared.js`, poi per-dominio) come già pianificato | manutenibilità, apre la strada ai test unitari | L |
| **Suite di test di regressione** (i 29 test dell'audit sono un punto di partenza già pronto) | previene regressioni sui flussi critici | M |
| **Banner "connessione persa"** e indicatore sync onesto | l'operatore sa sempre se sta lavorando online | S-M |
| **QR generato localmente** nelle etichette | stampa funziona anche senza internet | M |
| Aggiornare dipendenze (`npm audit fix` su print-server; pianificare uscita da react-scripts 5) | sicurezza e manutenibilità | S / L |

---

## 5. Piano consigliato (sessioni applicabili una alla volta)

**Sessione 1 — Sicurezza dati (priorità assoluta).** C1: restringere RLS, togliere la chiave dai file pubblici, VIEW/Edge Function per le pagine preventivo, `select` esplicito (chiude anche M8). Da fare per prima e con verifica manuale che app + pagine pubbliche funzionino ancora.

**Sessione 2 — Perdite dati silenziose (piccole, alto beneficio).** C2 (campi wizard), C3 (errori visibili + no-svuotamento offline), C5 (mappatura restore + `quote_tokens` nel backup). Interventi indipendenti, rischio basso.

**Sessione 3 — Numerazione.** C4: numero da `max+1`, poi contatore atomico lato DB (copre repair/ordine/DDT).

**Sessione 4 — Affidabilità WhatsApp.** A1/A3/A4/A8 insieme, idealmente introducendo l'outbox; A4 e A9 sono correzioni rapide che si possono anticipare.

**Sessione 5 — Robustezza minore e pulizia.** A6/A7 (print server), M3/M4/M9/M10/M13/M14, D3-accenti; poi dead code e dipendenze.

**Trasversale:** far girare i test dell'audit come regressione dopo ogni sessione.

---

## 6. Cosa NON è stato testato e perché

| Ambito | Perché | Come verificarlo in sicurezza |
|--------|--------|-------------------------------|
| **Stampa fisica Brother QL** | mockata per non stampare in negozio | test manuale supervisionato: una riparazione fittizia, stampare, poi eliminarla |
| **Scanner QR con fotocamera** | jsdom non ha fotocamera; vincoli HTTPS/`getUserMedia` documentati staticamente | su iPhone via IP: verificare che il fallback "Scatta foto del QR" decodifichi (già l'unico percorso possibile senza HTTPS) |
| **Connessione REST reale con RLS** | avrebbe scritto su produzione | su un progetto Supabase di staging: riprodurre C1 con la chiave pubblica e verificare le nuove policy |
| **Esecuzione `backup.js`** | avrebbe letto il DB di produzione e scritto su Drive | verificato in sola lettura (file esistenti, log, inode Drive); per la parte restore, eseguire su un file di prova in ambiente separato |
| **WhatsApp reale (invii, ban, QR login)** | vietato dal mandato | osservare in produzione i log `/tmp/zerrillo-print.log` durante un invio reale già previsto |
| **AI (Anthropic)** | chiave reale, chiamata a pagamento | opzionale; non critico per i flussi core |

---

### Allegati
- `audit/FASE1-ANALISI.md` — inventario completo, flussi dati, elenco esteso dei punti deboli.
- `audit/FASE2-RISULTATI.md` — matrice test dettagliata e dichiarazione delle neutralizzazioni.
- Worktree `audit/verifica` (`~/gioielleria-audit`) — 8 suite di test riproducibili con `CI=true npx react-scripts test --watchAll=false`. Nessun sorgente di produzione è stato modificato.
