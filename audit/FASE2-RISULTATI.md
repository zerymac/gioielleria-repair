# Audit — Fase 2: Test funzionale (risultati)

## Ambiente isolato e neutralizzazioni (dichiarazione)

- **Worktree separato**: `~/gioielleria-audit` su branch `audit/verifica`, con copia dei file di produzione **non committati** (`src/App.js`, `print-server/wa-bot.js`) allineati al working tree del negozio. La cartella di produzione `~/gioielleria-repair` (porta 3000) non è stata toccata.
- **DB di produzione mai contattato**: `src/supabase.js` e `@supabase/supabase-js` sostituiti via `jest.mock` / `moduleNameMapper` con un **finto client in memoria** (`src/__audit__/mocks/fakeSupabase.js`) che replica il query-builder usato da app e wa-bot. Zero rete verso Supabase.
- **WhatsApp disattivato**: `whatsapp-web.js` sostituito con un mock (`sendMessage` = `jest.fn`, nessuna sessione, nessun invio). `qrcode` stub (non apre immagini).
- **Stampa mockata**: `global.fetch` è un mock che registra le chiamate e le **rifiuta** (simula print server spento) — nessun payload raggiunge la Brother QL. `window.open`/`alert`/`confirm` stubbati.
- **Pagine pubbliche**: caricate da `docs/*.html` in jsdom con `fetch` interamente mockato — nessun PATCH verso il Supabase reale.
- **Backup**: `backup/backup.js` **non eseguito**; verifiche solo in lettura (path, log, contenuto file già esistenti prodotti dal cron notturno).

## Esito: 29 test superati, 1 skip (placeholder CRA). 8 suite.

Legenda: **PASS-OK** = funzionalità verificata corretta · **PASS-BUG** = il test *dimostra* un difetto (l'asserzione codifica il comportamento errato osservato).

| # | Area | Test | Esito |
|---|------|------|-------|
| A1/A3 | Riparazioni | intake wizard completo → numero progressivo, stato `ricevuto`, campi base salvati | PASS-OK |
| C2 | Riparazioni | **marca/referenza/nota preventivo raccolti dal wizard NON salvati** | PASS-BUG (CRITICO) |
| A3 | Riparazioni | secondo intake incrementa il numero (no duplicato in sequenza) | PASS-OK |
| A9 | Riparazioni | stato→`consegnato` imposta `data_consegnata` | PASS-OK |
| — | Resilienza | Supabase irraggiungibile all'avvio → app carica **vuota, nessun errore mostrato** | PASS-BUG (ALTO) |
| C1/C2 | Ordini | wizard ordine → stato derivato dai prodotti, prezzi/acconto/operatore salvati | PASS-OK |
| C3 | Ordini | prodotto→`arrivato`: stato derivato + WA automatico con importo/rimanenza corretti; **fetch fallito, nessun errore all'utente** | PASS-OK + BUG-A1 |
| A9 | Ordini | **"Consegna al cliente" marca consegnati anche i prodotti non arrivati** | PASS-BUG (ALTO) |
| D3 | Clienti | anti-doppione per nome (maiuscole/spazi) e per telefono | PASS-OK |
| D3-lim | Clienti | **accenti non normalizzati: "Jose Nunez" ≠ "José Núñez" → doppione creato** | PASS-BUG (MEDIO) |
| D4 | Clienti | merge duplicati → repairs+orders riassegnati al primario, anagrafica eliminata | PASS-OK |
| E1/E2 | DDT | creazione DDT → numero progressivo, snapshot riparatore, stato→`presso_esterno`, `data_spedita` | PASS-OK |
| C4 | DDT | **dopo eliminazione DDT, `ddtNum(length+1)` DUPLICA un numero esistente** | PASS-BUG (CRITICO) |
| E4 | DDT | rientro rapido singolo → costi/stato/data, DDT auto-chiuso, WAToast (no bulk) | PASS-OK |
| E4/G3 | DDT | rientro rapido multiplo → 1 WA bulk con un messaggio per cliente | PASS-OK |
| A8 | DDT | **consegna multipla: sopravvive un solo WAToast, gli altri clienti non notificati** | PASS-BUG (ALTO) |
| B4 | wa-bot | reconciliation all'avvio recupera l'accettato "perso" (riparatore+negozio) e marca `wa_accept_sent_at` | PASS-OK |
| B4 | wa-bot | dedup: già-notificato non reinviato; secondo evento Realtime ignorato | PASS-OK |
| A3 | wa-bot | **WA negozio fallito → al retry il riparatore riceve il messaggio 2 volte** | PASS-BUG (ALTO) |
| M13 | wa-bot | **disdetta su esterna → stato `reso_non_riparato` anche se oggetto ancora dal riparatore** | PASS-BUG (MEDIO) |
| A4 | wa-bot | **numero estero +44 → prefisso italiano 39 anteposto** | PASS-BUG (ALTO) |
| H1 | Pagine pub. | token assente/inesistente → messaggi corretti | PASS-OK |
| H1 | Pagine pub. | conferma preventivo → 2 PATCH attesi (token + flag) | PASS-OK |
| M10 | Pagine pub. | **PATCH non condizionato → doppia sottomissione confligge (accept+decline entrambi)** | PASS-BUG (MEDIO) |
| H2 | Pagine pub. | token già confermato → idempotente in lettura, nessun PATCH | PASS-OK |
| C1/M8 | Sicurezza | pagina pubblica usa `select=*` → colonne interne (spesa, note) escono al browser cliente | PASS-BUG (ALTO) |
| C5 | Backup | **restore in-app di backup notturno (snake_case) → prefisso→+39 e codice fiscale persi** | PASS-BUG (ALTO) |
| — | Layout | resize <768/≥768 commuta tab bar/sidebar live | PASS-OK |

## Accertamenti non automatizzati (solo lettura, no esecuzione)

- **C1 — DB pubblico**: confermato a codice. RLS `for all using(true)` (backup.js:110-121) + chiave publishable in `docs/repair-status.html:37-38` dentro repo GitHub pubblico. Non testato con chiamata reale (sarebbe scrittura su produzione) — verifica manuale supervisionata raccomandata.
- **C5 — destinazione backup**: **RETTIFICA rispetto alla Fase 1**. I backup **raggiungono Google Drive**: `~/Google Drive (…)/gioielleria-backups/2026-07-03/` e `~/Library/CloudStorage/GoogleDrive-…/Il mio Drive/gioielleria-backups/2026-07-03/` sono **lo stesso file** (inode 292512309 identico). Il path legacy è un mount valido dello stesso volume. Il JSON notturno **contiene** le colonne nuove (link_token, marca, nota_preventivo: 264+ record) perché usa `select *`. → **C5(a) ritirato.**
- **C5(b) confermato**: la tabella `quote_tokens` **non è in `TABLES`** → assente dal backup (grep vuoto sul file odierno); i token preventivo pendenti non sarebbero ripristinabili. Lo `SCHEMA_SQL` incorporato è obsoleto (~12 colonne + `quote_tokens` mancanti) → una ricostruzione del DB da quello schema perderebbe struttura. Impatto reale minore del previsto (il dato JSON è completo), ma il file `schema-*.sql` è fuorviante.
- **npm audit**: app 40 vuln (1 critical, 17 high, per lo più dev-deps di react-scripts 5); print-server 3 (qs/ws DoS, js-yaml) con fix disponibile. puppeteer 22→25, express 4→5 indietro di major.

## File dell'audit (non toccano i sorgenti di produzione)
- `src/__audit__/mocks/` — finto Supabase, mock wwebjs/qrcode/@supabase
- `src/__audit__/*.test.js` — 8 suite (repairs, orders, customers, ddt, wa-bot, public-pages, backup, layout)
- `src/setupTests.js`, `package.json` (jest.moduleNameMapper), `src/App.test.js` — adattati **solo nel worktree audit**
