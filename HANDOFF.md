# Handoff — Zerrillo Gioielleria Repair App

## Goal
Mantenere e migliorare l'app React di gestione riparazioni gioielleria "Zerrillo Preziosi S.r.l." — un'app locale (localhost:3000) con backend Supabase, print server Node su porta 3001, e backup automatico su Google Drive.

## Current Progress

### Sessione 05/09/2026 — app riparazioni ONLINE (Netlify), Mac mini solo stampa+WhatsApp — branch `feature/online`, NON ancora deployato

Decisione del proprietario: spostare l'app completamente online e tenere il Mac mini solo per etichette e WhatsApp. Scelte confermate: hosting **Netlify**, AI mantenuta tramite **Netlify Function**, accesso con **login Supabase** (niente PIN).

- **Disaccoppiamento dal Mac mini (`src/App.js`)**: tolti i 3 `fetch` verso `http://<host>:3001`. Le etichette da iOS vanno in `print_jobs` (`tipo:'etichetta'`, 62×100 mm, stampante `Brother_QL_1110NWB`) con attesa dell'esito (toast/alert; `timeout` = Mac mini spento, il lavoro resta in coda). I WhatsApp automatici (rientro rapido, ordine arrivato per articolo e per ordine) vanno in `wa_jobs` (`tipo` 'rientro'/'ordine') via `enqueueWA`. Il print server consumava già entrambe le code: in `server.js` aggiunte solo le opzioni `lp` `fit-to-page`/`print-quality=5` per il tipo `etichetta` (stesse di POST /print). Su Mac desktop la stampa resta il dialogo del browser. Impostazioni → "Stampa e WhatsApp (Mac mini)" mostra lo stato delle code (pending >60s = Mac mini non consuma) + sezione Account con Esci.
- **Login Supabase** al posto di `PinScreen`: `LoginScreen` (email+password, `signInWithPassword`), `App` legge `getSession` + `onAuthStateChange`. Utente: quello già esistente in Auth (usato dal gestionale). `REACT_APP_PIN` non è più letto.
- **AI**: `server/aiCore.js` (chiave SOLO server-side, verifica del JWT Supabase dell'operatore via `auth.getUser`, modello `claude-opus-5`, SDK `@anthropic-ai/sdk`) usato da `netlify/functions/ai.js` in produzione e da `src/setupProxy.js` in `npm start`. Verificato dal vivo (risposta "ok"). **Lezione**: leggere `process.env.REACT_APP_X` con X NON definita nel `.env` fa inlinare a CRA l'intero `process.env` nel bundle (chiave Anthropic compresa!) — trovato col grep sul build, corretto (`aiEnabled=true`). Il bundle ora non contiene `sk-ant`.
- **`netlify.toml`** in root: build CRA, publish `build/`, functions `netlify/functions`, `CI=false` (warning eslint preesistenti), Node 22, SPA redirect. Env da impostare su Netlify: `REACT_APP_SUPABASE_URL`, `REACT_APP_SUPABASE_KEY`, `ANTHROPIC_API_KEY` (**senza** prefisso REACT_APP, altrimenti finisce nel bundle).
- **Sicurezza — `supabase/sql/fase2-lockdown-online.sql`** (+ rollback): il vecchio `fase2-anon-lockdown.sql` dropava `anon_all`, policy che nel DB live NON esiste. Quelle vere (verificate a DB) sono `"accesso completo"` (customers/repairs/ddts/repairers), `"Allow all"` (orders), `"public access"` (quote_tokens), tutte `TO public USING(true)`; su `storage.objects` `"Allow anon insert/update"` per `repair-photos`. Il nuovo script le rimuove, crea `authenticated_all`, revoca anon, sposta le policy storage ad authenticated. `backup/backup.js` SCHEMA_SQL ora ricrea `authenticated_all` (un restore non reintroduce anon).
- **Test**: `fakeSupabase` ha `auth` finta (password "test") e tabelle `print_jobs`/`wa_jobs`; `unlockAndLoad` fa il login; i test WA leggono `__fake.db.wa_jobs`. Suite: 31 passati, 1 skip, **6 falliti già su `main` prima di questo lavoro** (B4, M10, E4, H1, H2, C1/M8, Console — test disallineati dal codice, non regressioni).
- **Ordine di rilascio (nessun passo fatto oltre il commit locale)**: (1) push `feature/online` → (2) sito Netlify collegato al repo, branch `feature/online` (o `main` dopo il merge), env sopra → (3) test da telefono fuori LAN: login, stampa etichetta (esce dal Mac mini), WA rientro → (4) `fase2-lockdown-online.sql` su Supabase → verificare che l'app in LAN (ancora anon) smetta di funzionare e quella Netlify no → (5) `launchctl unload` + rimozione `com.zerrillo.reactapp.plist`; restano `com.zerrillo.printserver` (da riavviare per il fix `etichetta`) e `com.zerrillo.backup` → (6) merge in `main`. Rollback: `fase2-lockdown-online-rollback.sql` + ricaricare il LaunchAgent.
- **Da valutare**: ruotare la chiave Anthropic attuale (era nel bundle servito in LAN da mesi) e usare quella nuova solo su Netlify.


### Sessione 28/08/2026 — link preventivo/stato in 404: GitHub Pages disattivato

- **Sintomo**: il link di conferma preventivo inviato ai clienti via WhatsApp (`https://zerymac.github.io/gioielleria-repair/...`) rispondeva **404**. Verificato: 404 su `repair-status.html`, su `approve-quote.html` e sulla root del sito.
- **Causa**: Pages era configurato in modalita' "deploy from a branch" sul branch **`gestionale`**, cartella `/docs`. Con il passaggio a `main` quel branch non esiste piu' → GitHub ha **disattivato Pages** (`has_pages: false` sull'API) e ogni URL del sito da' 404. Nessun bug nel codice dell'app: i link generati in `src/App.js` sono corretti.
- **Fix**: aggiunto `.github/workflows/deploy-pages.yml` — pubblica `docs/` su Pages a ogni push su `main` (piu' `workflow_dispatch` manuale), con `actions/configure-pages@v5` + `enablement: true` per **riattivare Pages da solo** al primo run. Il sito non dipende piu' dal nome del branch.
- **In alternativa (senza workflow)**: Settings > Pages > Source = "Deploy from a branch" > `main` + `/docs`.
- **Secondo blocco trovato — RPC mancanti, ora RISOLTO**: `supabase/sql/fase1-public-rpc.sql` non era **mai** stato applicato su Supabase (le RPC rispondevano `PGRST202 / Could not find the function`). Le pagine `docs/*.html` sono gia' quelle riscritte "solo RPC", quindi anche a Pages riattivato avrebbero mostrato *"Link non valido o scaduto"*.
  - **Applicato su richiesta del proprietario** (progetto `rrkvbvkiuwpqevrfcliw`, migration `fase1_public_rpc`, 28/08/2026). Contenuto identico al file in repo: 3 funzioni `security definer` + `grant execute` ad `anon`/`authenticated`. Additivo — nessuna tabella, riga o policy modificata.
  - **Verificato** con la chiave publishable: `get_quote` → `[]` (HTTP 200), `get_repair_status` → `[]` (HTTP 200), `respond_quote` con token finto → `"invalid"` (nessuna scrittura). Smoke test su un `link_token` reale: `get_repair_status` ritorna `R2026-0466`. Stato DB: 236 riparazioni con `link_token`, 49 `quote_tokens` (24 pendenti).
- **Ultimo passo rimasto — richiede il proprietario (setup una tantum)**: `Settings > Pages > Source = "GitHub Actions"`, poi ri-lanciare il workflow da `Actions > Deploy pagine pubbliche (GitHub Pages) > Run workflow`.
  - **Perche' non e' automatizzabile**: provato `actions/configure-pages@v5` con `enablement: true`; il `GITHUB_TOKEN` di Actions risponde `Create Pages site failed — Resource not accessible by integration`. La **creazione** del sito Pages richiede i permessi di admin del repo, quindi la prima attivazione va fatta dall'interfaccia. Dopo di quella, i deploy successivi sono automatici.
  - **Alternativa equivalente senza workflow**: `Settings > Pages > Deploy from a branch > main + /docs` (e' come era configurato prima, con `gestionale` al posto di `main`). In quel caso il workflow va disattivato/eliminato, perche' `deploy-pages` funziona solo in modalita' "GitHub Actions".
- **Poi**: test end-to-end su un link vero (accetta/rifiuta, doppio tap → deve restare idempotente).

### Sessione 04/08/2026 — documentata e committata la coda cartellini `print_jobs` (era live ma non tracciata)

- **Scoperta**: `git status` mostrava `print-server/server.js` modificato (non committato) + un backup `server.js.bak-20260723-174608` non tracciato, **entrambi non documentati** in questo handoff (l'ultima entry era del 21/07). Il `.bak` era identico alla versione committata (HEAD): backup dell'originale preso alle 17:46 del 23/07, subito prima dell'edit delle 18:04.
- **Cosa era cambiato — feature `initPrintQueue()` in `print-server/server.js`**: una **coda di stampa cartellini per il gestionale/POS** (repo separato `zerrillo-gestionale`), che gira nel **print server condiviso** (un solo processo su porta 3001 serve sia riparazioni sia gestionale). Funziona così:
  - Si connette a Supabase con `SUPABASE_SECRET_KEY` → `SUPABASE_SERVICE_ROLE_KEY` → `REACT_APP_SUPABASE_KEY` (fallback a cascata; oggi gira su anon).
  - Ascolta la tabella `print_jobs` via Realtime (`INSERT`) **+ polling ogni 5s** come rete di sicurezza; su ogni job renderizza `job.html` in PDF con Puppeteer (`getBrowser()`, dimensioni `width_mm`×`height_mm`, margini 0) e stampa via `lp -d "<printer>" -n <copies> -o media=Custom.<w>x<h>mm`.
  - **Claim atomico** `pending → printing` con `.eq('stato','pending')` prima di stampare → niente doppioni anche con Realtime + polling concorrenti. A fine job aggiorna lo stato a `done` (`printed_at`) o `error` (`errore`). Cleanup del PDF temporaneo in ogni caso.
- **Stato: LIVE e funzionante.** Il processo del print server gira già con questo codice (PID osservato attivo da giorni); il log `/tmp/zerrillo-print.log` mostra `🏷️ Cartellino stampato (<uuid>)` con successo. La modifica era però **solo in working tree** — mai committata → un checkout/reset da git l'avrebbe persa. **Committata oggi** su `gestionale` insieme a questo handoff (commit locale, **non pushato** → non deploya: il server già gira con lo stesso codice su disco).
- **`print_jobs` Realtime `CHANNEL_ERROR`/`CLOSED`**: stesso churn di connessione già documentato per il Realtime dei preventivi — **non è un guasto**, il polling ogni 5s copre (i cartellini partono comunque). Vedi la diagnosi in fondo alla sezione 21/07.
- **Pulizia**: rimosso il file backup ridondante `print-server/server.js.bak-20260723-174608` (identico a HEAD; la storia git ora conserva l'originale).
- **Nota**: la feature vive fisicamente in **questo** repo perché il print server è condiviso, ma appartiene logicamente al gestionale. Tabella `print_jobs` e lato-client vivono nel repo `zerrillo-gestionale`.

### Sessione 21/07/2026 — separazione repo, pulizia, messaggi WA riparatore

- **Separazione dei due progetti in repo indipendenti** (vedi sezione POS sotto): il gestionale/POS è ora `zerymac/zerrillo-gestionale` (privato), estratto con `git filter-repo` dal branch `feature/gestionale-admin` (poi eliminato locale+remoto). Il worktree `~/gestionale-admin` è ora un clone standalone del nuovo repo (`.env.local` + `node_modules` preservati, `npm run build` verificato). Questo repo resta l'app riparazioni. Handoff sdoppiato: quello del POS vive in `~/gestionale-admin/HANDOFF.md`.
- **Regola confermata dal proprietario**: l'app riparazioni è **produzione intoccabile** — mai `push`/deploy/applicazione SQL/riavvio servizi senza conferma esplicita; commit in locale è sicuro (non deploya). GitHub Pages serve `docs/` tramite il workflow `deploy-pages.yml` a ogni push su `main`, quindi pushare pubblica subito.
- **Fase 1 sicurezza — COMMITTATA (non pushata/applicata)**: i 4 file Fase 1 finora non committati sono ora su `gestionale` in 3 commit (`1ac5ecf` SQL+runbook, `fee07b0` service_role fallback wa-bot/backup, `69dcb0a` pagine pubbliche via RPC) + `caea994` handoff. ⚠️ Non pushare finché `fase1-public-rpc.sql` non è applicato su Supabase (le pagine `docs/*.html` riscritte a RPC si romperebbero). Dettagli nella sezione "Sicurezza — Fase 1".
- **Correzione stato**: `src/App.js` è **pulito** (ultimo commit `5a0dd4a`). I "filtri preventivo" e "costi DDT fornitore" segnati come *NON committato* nelle sezioni sotto erano in realtà **già committati** in `5a0dd4a` — quelle note sono storiche.
- **Pulizia repo**: rimosso il worktree stantìo `~/gioielleria-audit` (sandbox audit di luglio, ~570 MB) ed eliminati i 3 branch già mergiati in `gestionale` (`fix/stato-ordine-wa`, `fix/perdite-dati`, `audit/verifica`; erano solo locali). La suite test `src/__audit__/` resta comunque nel repo principale.
- **`.gitignore` igiene** (`chore`, 2 commit): `/node_modules` → `node_modules/` (globale, prima ignorava solo la root) + aggiunti `.claude/`, `print-server/.wwebjs_auth/`, `print-server/.wwebjs_cache/`. Rimossi dall'indice ~4573 file `node_modules` tracciati per errore (in `backup/` e `print-server/`; file su disco intatti). `git status` ora pulito.
- **Messaggi WA al riparatore — tolto il prezzo al cliente** (`6563e44`, COMMITTATO e **LIVE**): in `print-server/wa-bot.js`, `buildAcceptMessage` e `buildDeclineRepairerMessage` **non** stampano più `Preventivo al pubblico: X €`. Il prezzo resta **solo** nei messaggi al negozio (`buildAcceptShopMessage`/`buildDeclineShopMessage`, `Preventivo: X €`). Print server **riavviato** (LaunchAgent) → verificato: WhatsApp riconnesso senza QR, stampante Brother_QL_1110NWB rilevata, `/status` ok, Realtime sottoscritto, 0 preventivi pendenti. **Nota**: il riavvio ha causato **1 WA doppione** per R2026-0318 (aveva `wa_accept_sent_at` NULL → re-inviato dalla riconciliazione, poi timestamp scritto → non si ripete). Osservato che `wa_accept_sent_at` a volte non si persiste al primo invio → possibili doppioni ai riavvii (nessun messaggio perso; la riconciliazione copre). Indagine futura possibile.
- **Realtime `CHANNEL_ERROR` — indagato, lasciato così per scelta**: non è un guasto (config publication OK, lib recente, RLS permissiva; 9 eventi consegnati). È **churn di connessione**: i log Realtime Supabase mostrano `Stop tenant … no connected users` → terminate → reinit (~4-5 volte in 7h) = il WebSocket del bot cade per >60s e si riconnette. Causa probabile: event-loop del processo Node bloccato da WhatsApp Web/Puppeteer → heartbeat Realtime saltato (concausa: timeout NAT rete negozio). Nessun messaggio perso (riconciliazione ogni 5 min). Proprietario: "non ho bisogno di messaggi immediati" → **non toccare**. Opzioni note se un giorno servisse: ridurre intervallo riconciliazione 5min→90s; re-subscribe esplicito su CHANNEL_ERROR; listener Realtime in processo separato senza Puppeteer.

### GESTIONALE / POS — spostato in repo separato (21/07/2026)

Il gestionale/POS è ora un **repo GitHub indipendente**: `zerymac/zerrillo-gestionale` (privato), cartella locale `~/gestionale-admin` (branch `main`). La storia (14 commit) è stata estratta dal branch `feature/gestionale-admin`, ora **eliminato** da questo repo. **Handoff, commit e push del POS vivono lì** (`~/gestionale-admin/HANDOFF.md`). Questo repo resta dedicato all'**app riparazioni**.

### Hotfix notifiche preventivi persi + filtri preventivo (14-15/07/2026) — branch `gestionale`

- **Hotfix wa-bot — riconciliazione periodica** (`5023d75`, COMMITTATO e LIVE). **Incidente**: 7 preventivi accettati dai clienti via link WA (R2026-0138/0246/0250/0264/0272/0289/0303) **non erano stati notificati** a negozio/riparatore (`wa_accept_sent_at IS NULL`). **Causa**: la subscription Supabase Realtime cade in silenzio senza riconnettersi (la callback `.subscribe` gestiva solo `SUBSCRIBED`) e `reconcilePending` girava **solo all'avvio**; col processo su da 10 giorni i buchi si sono accumulati (pattern intermittente confermato via `quote_tokens.accepted_at`). **Fix** in `print-server/wa-bot.js`: `setInterval` ogni 5 min che ri-esegue `reconcilePending` (rete di sicurezza, idempotente via Set `waSent` + `wa_*_sent_at` → niente doppioni) + log degli stati Realtime anomali. **Recupero**: riavviato il LaunchAgent → `reconcilePending` ha inviato tutti e 7 (verificato: conteggio DB pendenti sceso a 0; WhatsApp riconnesso senza QR). **Attenzione**: R2026-0289 al riparatore NON è partito (nessun telefono nello snapshot DDT né nel registro) — solo al negozio; se serve, avvisare a mano. **Diagnostica utile**: query REST `repairs?preventivo_accettato=eq.true&wa_accept_sent_at=is.null&eliminata=eq.false` (con chiave anon dal `.env`) elenca gli accettati non notificati. Il commit ha usato staging selettivo per **escludere** la modifica Fase 1 (service-role key) presente nello stesso file.

- **Filtri preventivo nella lista riparazioni** (`RepairsPage`, NON committato). Aggiunte 3 voci al menu filtro: **🧾 Con preventivo** (`richiestaPreventivo`), **✅ Prev. accettato** (`preventivoAccettato`), **❌ Prev. rifiutato** (`preventivoRifiutato`) — valori `__prev__`/`__prev_acc__`/`__prev_rif__` nella logica `matchF`. **Nota modello**: `preventivoRifiutato` non era letto da `toRepair` → aggiunto **solo in lettura** (`r.preventivo_rifiutato||false`); volutamente **NON** nel payload di `upsertRepair`, così un salvataggio dall'app non azzera un rifiuto impostato dalle pagine pubbliche (evita perdita dati; PostgREST upsert preserva le colonne non presenti nel payload). "Con preventivo" interpretato come *richiesto* (superset); da confermare se il proprietario vuole *solo in attesa*.

### Costi DDT fornitore + chiarezza date ordini (08-10/07/2026) — branch `gestionale` — NON committato, in attesa di test/commit

Lavoro su `src/App.js`, **tutto nel working tree, non ancora committato** (impilato sopra i commit già pushati e insieme ai file Fase 1 sicurezza, anch'essi non committati). Da testare in-app poi committare (separando: relabeling date ordini / feature costi DDT fornitore).

- **Chiarezza date negli ordini** (relabeling + icone, nessuna logica): tre date con terminologia sovrapposta creavano confusione. Ora icone dedicate **🧾 creazione ordine · 📦 ordine al fornitore · 🚚 arrivo previsto** ovunque (wizard step 5, riepilogo, `OrderDetail`, `OrderCard`). `dataOrdine` (ordine, default oggi) → "Data creazione ordine"; `dataOrdineFornitore` (prodotto) → "Ordinato al fornitore il"; `dataConsegnaPrevista` (prodotto, arrivo=consegna al cliente, deciso col proprietario) → "Arrivo previsto". Nel wizard il blocco fornitore raggruppa Ordinato a / Ordinato al fornitore il / Arrivo previsto. Testi rivolti al cliente (stampa, WA) restano "Consegna".

- **Costi DDT fornitore per verifica fatture** (feature nuova). **Contesto**: il fornitore/riparatore emette le SUE DDT (sua numerazione) al rientro, e in fattura elenca i numeri delle sue DDT con gli importi; il proprietario vuole tracciare il costo di ogni SUA DDT (= somma spese delle singole riparazioni, inserite a mano) per verificare l'importo in fattura. **Decisione col proprietario**: mappatura **mista** (una sua DDT può contenere pezzi di spedizioni diverse / una spedizione torna spezzata) → il n° DDT fornitore si traccia **per riparazione**, non sul DDT di spedizione. Inserimento in **entrambi** i punti (schermata dedicata + dettaglio riparazione).
  - **Migration APPLICATA** (15/07/2026): `alter table public.repairs add column if not exists ddt_fornitore text;` — verificata via REST (`select=id,ddt_fornitore` → colonna presente, `null` sui record esistenti). Il campo ora persiste; prima il fallback PGRST204 di `upsertRepair` lo strippava. Modello: `ddtFornitore` in `toRepair`/`upsertRepair`.
  - **Schermata `CostiDDTFornitore`** (Sheet): aperta dal bottone "🧾 Costi DDT fornitore — verifica fatture" in cima alla tab DDT (`DDTPage` prop `onCosti`). Raggruppa tutte le riparazioni con `ddtFornitore` per numero, con totale per gruppo (⚠️ se manca una spesa) + totale generale; ricerca per assegnare a una riparazione n° DDT + spesa (sezione "Da assegnare" quando cerchi). È lo strumento di spunta della fattura.
  - **`RepairDetail`**: nuova riga editabile "🧾 N° DDT fornitore (rientro)" accanto a "Costo riparazione" (salva via `onFieldChange`).
  - **`DDTDetail` riallineato al modello per-pezzo** (correzione dell'assunzione 1:1 fatta il 07/07): rimosso l'input "N° DDT fornitore" a livello di DDT di spedizione; la card "📥 RIENTRO DAL FORNITORE" gestisce solo **data rientro** (editabile in ogni momento, anche a DDT già rientrato, via `handleDDTRientroPatch` — patch del solo DDT, non tocca gli stati riparazioni) + totale spesa. Nella lista "Oggetti inviati" il bottone "💰 Costo" imposta **n° DDT fornitore + spesa** insieme (via `handleDDTRepairSpesa(id, patch)`).
  - Handler nuovi in `MainApp`: `handleDDTRientroPatch(ddtId, patch)` e `handleDDTRepairSpesa(id, patch)` — aggiornano anche lo stato locale (`setDdts`/`setRepairs`), non solo via Realtime.
  - **Follow-up possibile** (non fatto): n° DDT fornitore + spesa nella stampa DDT / export.

### Fix ordini + email fornitori + ricevute multi-oggetto (07-09/07/2026) — branch `gestionale` — MERGIATO e PUSHATO

Sessione di fix/piccole feature su richiesta del negozio, tutti su `src/App.js`, committati singolarmente e pushati su `origin/gestionale` (`c859bdb..79ccba9`). **Live in produzione.** I file della Fase 1 sicurezza sono rimasti fuori (non committati).

- **`c859bdb` — fix "Aggiungi altro articolo" in modifica ordine**: in modifica ordine il wizard parte allo step 6 (Riepilogo) senza articolo in compilazione; il bottone chiamava `buildCurrentProd()` → `null` (descrizione vuota) e usciva subito → non si riusciva ad aggiungere un nuovo articolo. Ora naviga allo step 2 anche senza articolo corrente. In più: il form `OrderForm` ora porta `numero` (prima perso in modifica) e `handleSaveOrder` aggiorna `orders[]` in locale (come `handleOrderStatus`/`handleOrderProductStatus`) → la modifica compare subito senza attendere il Realtime.
- **`8d66795` — campo email nel registro fornitori (riparatori)**: input Email nella scheda `RepairerEditForm`; `email` aggiunto al fallback PGRST204 di `upsertRepairer` (regge se la colonna manca). **Migration applicata**: `alter table public.repairers add column if not exists email text;`. Nota: il registro `repairers` è quello che il negozio chiama "fornitori/riparatori"; `getRepairers`/`upsertRepairer` fanno `select("*")`/upsert dell'oggetto intero, quindi l'email fluisce da sola.
- **`486f3ed` — stampa TUTTE le etichette per riparazioni multi-oggetto**: `handleSaveRepair` crea N record ma apriva `ReceiptModal` per un solo oggetto (`receiptHTML(savedRepairs[0])`); `multiReceiptHTML` (1 etichetta cliente/negozio di riepilogo + N riparatore) era **definita ma mai usata** (dead code, CSS già presente in `LABEL_CSS`). Ora il modal riceve `allRepairs=savedRepairs` e, se >1, stampa `multiReceiptHTML`; titolo/scheda/messaggio WA adattati. **Limite**: la stampa combinata funziona alla creazione; ristampando più tardi dal dettaglio ogni oggetto è un record a sé (nessun legame di gruppo) → si ristampa singolarmente.
- **`79ccba9` — fornitore/data ordine/arrivo per prodotto negli ordini**: nuovi dati per prodotto (JSONB, **nessuna migration**): `fornitore` ("Ordinato a", testo libero — riesumato l'input rimosso in passato) e `dataOrdineFornitore` ("Data ordine al fornitore"); l'**arrivo previsto = `dataConsegnaPrevista`** esistente (deciso col proprietario: stessa cosa della "consegna prevista", rietichettata "Arrivo / consegna previsto"). Inseribili nel **wizard** (step Date) per i nuovi ordini e **modificabili inline per prodotto nel dettaglio ordine** (nuovo handler `handleOrderProductPatch(orderId,prodId,patch)` — merge + ricalcolo `dataConsegnaPrevista` earliest + persistenza; matita ✏️ sulla riga "📦" di ogni articolo in `OrderDetail`). Visibili anche nel **riepilogo wizard** e nella **lista ordini** (`OrderCard`, riga dorata "📦 fornitore · ord. data · arrivo data") senza aprire la scheda. **Motivo dell'edit inline**: il wizard in modifica sa solo creare nuovi prodotti (richiede descrizione), quindi i prodotti già in ordine non erano raggiungibili → il proprietario non riusciva a impostare il fornitore su ordini esistenti.
- **Nota commit author**: i commit risultano firmati `Zerrillo preziosi <adrianapertusotti@Macmini.local>` (config git di default della macchina, mai impostata esplicitamente).

### Sicurezza — Fase 1 (fondamenta dati) preparata (07/07/2026) — branch `gestionale` — COMMITTATA 21/07/2026, NON pushata/applicata

Prima sessione del **piano sicurezza/migrazione Netlify** (Parte 3, Fase 1). Obiettivo: RLS a minimo privilegio + RPC pubbliche token-based + service-role a wa-bot/backup. **Committata su `gestionale` il 21/07/2026** in 3 commit (`1ac5ecf` artefatti SQL+runbook, `fee07b0` service_role fallback wa-bot/backup, `69dcb0a` pagine pubbliche via RPC) ma **NON ancora pushata né applicata** (né SQL su Supabase, né deploy GitHub Pages). ⚠️ **Il push di `gestionale` pubblica su GitHub Pages le pagine `docs/*.html` riscritte a RPC: si rompono se `fase1-public-rpc.sql` non è già applicato su Supabase.** Ordine corretto: 1) applicare l'SQL, 2) testare le pagine, 3) push. (Se serve pushare altro prima, valutare un `feature/fase1-sicurezza` per isolare i 3 commit.)

- **Censimento client→permessi** (in `supabase/sql/FASE1-RUNBOOK.md`): oggi tutte le tabelle hanno `anon_all … for all to anon using(true)` (`backup/backup.js:143-165`). **App, wa-bot e backup girano tutti come `anon`** — la stessa identità della chiave pubblica su GitHub. Le pagine pubbliche leggevano `repairs?…&select=*` (colonne interne esposte → C1/M8) e facevano PATCH diretti (doppia submit → M10).
- **Vincolo di sequenza (chiave):** riscrivere le pagine in RPC **non** riduce l'esposizione finché `anon` resta `using(true)` (un attaccante ignora l'HTML e colpisce la REST API con la chiave pubblica). Il vero interruttore di C1 è **restringere `anon`**, che però rompe l'app finché non è `authenticated` (**Fase 2**). Quindi **C1 si chiude con Fase 1 + Fase 2 insieme.**
- **Artefatti prodotti** (in `supabase/sql/`):
  - `fase1-public-rpc.sql` — 3 funzioni `security definer` token-based: `get_repair_status(link_token)` (solo le 12 colonne mostrate + token preventivo pendente), `get_quote(token)`, `respond_quote(token, decision)` **idempotente** (`FOR UPDATE` → chiude M10; rispecchia su `repairs` → il wa-bot invia il WA). Additivo: applicarlo non cambia il comportamento attuale.
  - `fase2-anon-lockdown.sql` — l'interruttore di C1, pronto per quando l'app sarà `authenticated`: rimuove `anon_all`, crea `authenticated_all`, revoca i privilegi di `anon`.
  - `*-rollback.sql` per entrambi; runbook con i passi manuali in `FASE1-RUNBOOK.md`.
- **Codice modificato** (non-breaking, non ancora deployato):
  - `docs/repair-status.html` e `docs/approve-quote.html` riscritte per usare **solo** le RPC (via `select=*` e PATCH diretti → chiude C1/M8 lato pagina). UI invariata. Da testare end-to-end **dopo** aver applicato l'SQL, poi push su GitHub Pages.
  - `print-server/wa-bot.js` e `backup/backup.js`: preferiscono `SUPABASE_SERVICE_ROLE_KEY` con **fallback ad anon** → funzionano identici finché la chiave non è nel `.env`.
- **Test audit da ribaltare**: `src/__audit__/public-pages.test.js` (test C1/M8 su `select=*` e M10 doppia submit) **fallirà di proposito** — documentava i bug ora chiusi. Va riscritto per asserire il comportamento corretto (uso RPC, niente `select=*`, idempotenza). **Non ancora fatto.**
- **Passi manuali residui** (nel runbook): 1) applicare `fase1-public-rpc.sql` nel SQL Editor; 2) mettere `SUPABASE_SERVICE_ROLE_KEY` nel root `.env` (già gitignored); 3) deploy pagine + test QR stato e link preventivo (doppio tap → idempotente); 4) ruotare/disabilitare le legacy JWT keys compromesse in git history; 5) Fase 2 (Auth) → applicare il lockdown → C1 chiuso.
- **Decisione aperta col proprietario**: applicare **solo Fase 1** ora (anon resta CRUD; C1 chiuso dopo con Fase 2) **oppure unire Fase 1 + Fase 2** (Auth ora → lockdown → C1 chiuso subito, niente finestra con chiave anon CRUD). Consiglio: unire, se c'è tempo per il login.
- **Nota coerenza**: `backup/backup.js` (SCHEMA_SQL) ricrea `anon_all` su restore → da aggiornare **dopo** la Fase 2 perché un ripristino non reintroduca le policy permissive.

### Repository — deliverable audit committati (04/07/2026)

I documenti dell'audit e lo script di merge, finora non tracciati, sono ora versionati su
`gestionale`: `AUDIT_REPORT.md`, `audit/FASE1-ANALISI.md`, `audit/FASE2-RISULTATI.md`,
`audit/SESSIONE2-RILASCIO.md`, `audit/CHECKLIST-COME-ESEGUIRE.md`,
`audit/HANDOFF-post-merge.md`, `audit/merge-sessione2.sh`, e il sorgente della edge
function `supabase/functions/approve-quote/index.ts` (dismessa, tenuta come backup).
`supabase/.temp/` escluso via `.gitignore`.

- **Follow-up igiene repo** (non ancora fatto): `print-server/node_modules/` **non** è in
  `.gitignore` ed è tracciato a metà (solo `.package-lock.json` versionato per errore →
  "sporca" `git status`). Pulizia consigliata: aggiungere a `.gitignore`
  `print-server/node_modules/`, `.claude/`, `print-server/.wwebjs_auth/`,
  `print-server/.wwebjs_cache/`, poi `git rm -r --cached print-server/node_modules`.

### Hotfix stato ordine (04/07/2026) — WA su "CAMBIA STATO ORDINE" — deployato

Segnalato in produzione subito dopo il go-live della Sessione 2: cambiando lo stato di
un ordine dal controllo **"CAMBIA STATO ORDINE"** non partiva il WhatsApp automatico.

- **Causa**: esistono due controlli distinti. La pillola **sul singolo articolo**
  (`handleOrderProductStatus`) aggiorna il prodotto e, su "arrivato", invia il WA. Il
  controllo **a livello ordine** (`handleOrderStatus`) invece aggiornava solo
  `orders.stato` (via `updateOrderStatus`), lasciando i prodotti disallineati e senza
  inviare nulla. Su ordini a 1 articolo questo rompeva anche il bottone "Consegna al
  cliente": il fix A9 consegna solo i prodotti `stato==="arrivato"`, ma il prodotto era
  rimasto "ordinato" → bottone inerte.
- **Fix** (`handleOrderStatus`): il cambio stato ordine ora **propaga lo stato scelto a
  tutti i prodotti** (coerenza ordine/prodotti) e, su "arrivato", invia **un** WhatsApp
  di riepilogo al cliente (numero E.164 via `waPhone`, fire-and-forget). **Decisione col
  proprietario**: propaga a tutti + 1 messaggio (vale sia per ordini a 1 articolo sia con
  più articoli; la pillola per-articolo resta invariata).
- **Test**: propagazione + 1 WA; consegna attiva su ordine a 1 articolo (38 test verdi).
- **Deploy**: branch `fix/stato-ordine-wa` → merge fast-forward in `gestionale` (`a6557ab`),
  riavvio della sola app React (print server/WhatsApp non toccati).

### Sessione audit — Fase 2 correzioni (04/07/2026) — branch `fix/perdite-dati` — MERGIATO e LIVE

Audit tecnico completo (`AUDIT_REPORT.md`, `audit/FASE1-ANALISI.md`, `audit/FASE2-RISULTATI.md`) seguito da **Sessione 2**: cinque fix "perdita silenziosa di dati", ognuno un commit con i suoi test, su branch `fix/perdite-dati` (base = codice reale di produzione). **Mergiato in `gestionale` il 04/07/2026** (merge commit `596c861`, dopo consolidamento del codice di produzione in `b8a3cc2`) e deployato con riavvio dei servizi; checklist pre-merge 1–3 superata (A4 verificato post-merge, C5 coperto dai test). Suite di verifica: 36 test (mock Supabase/WhatsApp/stampa, nessuna scrittura su produzione). Nota di rilascio per gli operatori in `audit/SESSIONE2-RILASCIO.md`.

Audit tecnico completo (`AUDIT_REPORT.md`, `audit/FASE1-ANALISI.md`, `audit/FASE2-RISULTATI.md`) seguito da **Sessione 2**: cinque fix "perdita silenziosa di dati", ognuno un commit con i suoi test, su branch `fix/perdite-dati` (base = codice reale di produzione). **Non ancora mergiato su `gestionale`** — merge deciso dal proprietario dopo la checklist in `audit/SESSIONE2-RILASCIO.md`. Suite di verifica: 36 test (mock Supabase/WhatsApp/stampa, nessuna scrittura su produzione).

- **C2 — wizard riparazioni salva marca/referenza/notaPreventivo** (`handleSaveRepair`): erano raccolti negli step 4/6 e mostrati nel riepilogo ma scartati al salvataggio. Aggiunti all'oggetto principale di `allItems` (gli item multi-oggetto già li portavano) e al record `n`; `notaPreventivo` è form-level, applicato a ogni oggetto.
- **A9 — consegna ordine solo dei prodotti arrivati** (`handleConsegnaOrder`): prima marcava consegnati **tutti** i prodotti. Ora consegna solo i `stato==="arrivato"`, ricalcola lo stato ordine dai prodotti (resta aperto se altri non arrivati), e il WA elenca solo il consegnato con dicitura "parziale". **Decisione col proprietario**: consegna parziale (non "tutto o niente").
- **A4 — prefissi internazionali nei WA automatici**: `formatPhone` (wa-bot) anteponeva '39' a qualsiasi numero. Ora `+`/`00` conservano il prefisso paese; solo il nazionale nudo diventa italiano. Lato app, i punti che inviano WA bulk/arrivato passano E.164 via il nuovo helper `waPhone(c)=prefisso+telefono`.
- **C5 — restore compatibile col backup notturno**: `handleRestore` normalizza le righe snake_case via i convertitori `toX` (prima `telefonoPrefisso`/`codiceFiscale` camelCase non venivano letti → prefisso azzerato a +39, CF perso). Aggiunto il restore/export di `orders` (prima omesso). In `backup.js`: `quote_tokens` in `TABLES` e `SCHEMA_SQL` rigenerato con tutte le colonne reali. **Rettifica**: il backup notturno raggiunge Google Drive (verificato per inode); il problema era la lettura in-app, non la scrittura.
- **C3 — errori DB visibili**: le `api.*` ignoravano `error`, `withSync` non catturava, le `getX` confondevano vuoto/errore. Ora: flag di errore condiviso (`_writeError`) segnalato da ogni scrittura e letto da `withSync` → **toast rosso "Salvataggio non riuscito — riprova"**; le 5 `getX` ritornano `{data,error}` e le `loadX` su errore **non svuotano** le liste + **banner "Connessione al database persa"**; indicatore sync onesto (rosso). Vedi la nota di rilascio per l'impatto sugli operatori.

**Follow-up rimandati**: C1 sicurezza RLS/chiave pubblica → **Fase 1 preparata il 07/07/2026** (vedi entry in cima, artefatti da applicare); C4 numerazione DDT/ordine/riparazione con contatore atomico (Sessione 3); A1/A3/A8 outbox WhatsApp con retry (Sessione 4); warning eslint preesistenti e estrazione moduli da `App.js`.

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
  - Hosted su GitHub Pages, workflow `.github/workflows/deploy-pages.yml` (pubblica `docs/` a ogni push su `main`)
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

-- Email registro fornitori/riparatori (sessione 08/07/2026)
alter table public.repairers add column if not exists email text;

-- N° DDT fornitore per riparazione — costi DDT fornitore (sessione 10/07/2026) — APPLICATA 15/07/2026
alter table public.repairs add column if not exists ddt_fornitore text;

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
- **Hosting**: GitHub Pages via GitHub Actions (`.github/workflows/deploy-pages.yml`), sorgente `docs/`
- **Per aggiornare**: modificare `docs/repair-status.html`, commit e push su `main` → il workflow ripubblica da solo
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
- **Sicurezza Fase 1**: decidere con il proprietario Fase 1-sola vs. Fase 1+2 unite; poi eseguire i passi del runbook (`supabase/sql/FASE1-RUNBOOK.md`) — applicare RPC, service_role nel `.env`, deploy+test pagine, rotazione chiavi legacy; ribaltare `src/__audit__/public-pages.test.js`.
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
- `supabase/sql/` — SQL Fase 1 sicurezza: `fase1-public-rpc.sql` (RPC token-based), `fase2-anon-lockdown.sql` (lockdown anon), rollback, `FASE1-RUNBOOK.md`
- `.env` — credenziali: `REACT_APP_SUPABASE_URL`, `REACT_APP_SUPABASE_KEY`, `SHOP_WA_TEL`; **da aggiungere** `SUPABASE_SERVICE_ROLE_KEY` (Fase 1, per wa-bot/backup)

## Pattern chiave da rispettare
- Tutte le modifiche vanno in `src/App.js`
- `withSync(fn)` per operazioni DB
- `upsertRepair(repair)` per salvare una riparazione completa
- `api.updateRepairStatus(id, status)` per solo cambio stato
- Non aggiungere commenti esplicativi salvo casi strettamente necessari
- Non aggiungere emoji nei file salvo richiesta esplicita
