# Piano di migrazione su Netlify — Zerrillo Repair Manager

> Documento operativo. Descrive **come** spostare il frontend su Netlify mantenendo
> stampa e WhatsApp funzionanti, tramite il pattern a **coda su Supabase** (outbox).
> Pensato per essere eseguito in autonomia quando si decide di migrare.
>
> Stato decisioni prese:
> - **Trasporto stampa/WA**: coda su Supabase (`print_jobs` / `wa_jobs`) + consumer sul Mac. ✅
> - **Sicurezza al go-live**: protezione password a livello sito Netlify come tampone immediato;
>   Supabase Auth + RLS ristretto come lavoro successivo separato. ✅

---

## 0. Architettura target

```
STAMPA
  [Web app su Netlify] --insert--> [print_jobs @ Supabase] <--Realtime/polling-- [Consumer sul Mac] --lp--> [CUPS/Stampante]
        HTTPS                            HTTPS                                          (solo uscita)        locale

WHATSAPP (bulk rientro/consegna)
  [Web app su Netlify] --insert--> [wa_jobs @ Supabase]    <--Realtime/polling-- [wa-bot sul Mac]  --> [WhatsApp Web]
        HTTPS                            HTTPS                                          (solo uscita)

QUOTE PUBBLICHE (invariato)
  [Cliente] --> [docs/*.html su GitHub Pages] --> [Edge Function approve-quote] --> [Supabase]
```

Principio chiave: **il browser e il Mac non si parlano mai direttamente.** Entrambi parlano solo
con Supabase via HTTPS. Il Mac fa **esclusivamente connessioni in uscita** → nessuna porta esposta,
niente tunnel, niente mixed-content. Il pattern è già in uso in `wa-bot.js` (subscribe su `repairs`).

Cosa **non si sposta** e resta identico sul Mac Mini: `print-server` (Puppeteer→PDF), CUPS, la
stampante, la sessione WhatsApp. Cambia solo **come** questi ricevono il lavoro: da endpoint HTTP
a righe di tabella.

---

## 1. Fase A — Supabase (schema code)

### A.1 Tabella `print_jobs`
```sql
create table if not exists public.print_jobs (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  html        text not null,
  copies      int  not null default 1,
  width       text not null default '62mm',
  height      text not null default '100mm',
  status      text not null default 'pending',   -- pending | printing | done | error
  error       text,
  printed_at  timestamptz,
  origin      text                                -- opzionale: device/utente per debug
);
create index if not exists print_jobs_status_idx on public.print_jobs (status, created_at);
```

### A.2 Tabella `wa_jobs` (sostituisce POST /wa/send-bulk)
```sql
create table if not exists public.wa_jobs (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  telefono    text not null,
  messaggio   text not null,
  status      text not null default 'pending',   -- pending | sending | done | error
  error       text,
  sent_at     timestamptz
);
create index if not exists wa_jobs_status_idx on public.wa_jobs (status, created_at);
```

### A.3 Abilitare Realtime sulle due tabelle
```sql
alter publication supabase_realtime add table public.print_jobs;
alter publication supabase_realtime add table public.wa_jobs;
```

### A.4 RLS — due livelli
**Minimo (coerente con lo stato attuale, go-live rapido):** le tabelle ereditano le policy permissive
già presenti. Il consumer usa la chiave anon come fa oggi `wa-bot.js`. Nessun lavoro extra, ma la coda
è leggibile/scrivibile da chiunque abbia la chiave anon (già il caso oggi per tutte le tabelle).

**Consigliato (hardening, da fare con l'auth vera):**
```sql
alter table public.print_jobs enable row level security;
alter table public.wa_jobs    enable row level security;
-- il web (anon) può SOLO accodare
create policy "anon_insert_print" on public.print_jobs for insert to anon with check (true);
create policy "anon_insert_wa"    on public.wa_jobs    for insert to anon with check (true);
-- SELECT/UPDATE riservati al consumer che gira con service_role (bypassa RLS)
```
In questo scenario il consumer sul Mac deve usare la **service_role key** (variabile `SUPABASE_SERVICE_KEY`,
solo sul Mac, mai nel bundle frontend). Vedi §2.4.

> ⚠️ La coda cresce nel tempo. Aggiungere una pulizia periodica: `delete from print_jobs where status='done' and created_at < now() - interval '7 days';` (cron pg_cron o dallo stesso consumer).

---

## 2. Fase B — Consumer sul Mac (`print-server/`)

Il print-server resta il processo sempre-attivo sul Mac (già gestito da LaunchAgent). Gli si aggiunge
un **consumer di stampa**; il `wa-bot` esistente guadagna un secondo consumer per `wa_jobs`. Riusare
1:1 il pattern di `wa-bot.js`: **subscribe Realtime + reconcile all'avvio + reconcile periodico (5 min) + idempotenza via `status`.**

### 2.1 Nuovo modulo `print-server/print-consumer.js`
- `startPrintConsumer(supabase)`:
  - `supabase.channel('print').on('postgres_changes', {event:'INSERT', table:'print_jobs'}, cb)`
  - `cb`: se `status==='pending'` → **claim** (`update status='printing' where id=? and status='pending'`) → `renderAndPrint(job)` → `update status='done', printed_at=now()`; su errore `status='error', error=...`.
  - `reconcilePrint()`: `select * from print_jobs where status='pending'` all'avvio e ogni 5 min (rete di sicurezza se il WebSocket cade — stesso motivo documentato in `wa-bot.js:288`).
- `renderAndPrint(job)`: riusa **tale e quale** la logica esistente di `server.js:106-165` (Puppeteer→PDF→`lp -d <printer> -o media=Custom...`). Estrarre quel blocco in una funzione condivisa `printLabel({html,copies,width,height})` e chiamarla sia dal consumer sia (se lo si tiene) dall'endpoint HTTP legacy.

### 2.2 Consumer WA in `wa-bot.js`
- Aggiungere `startWaJobsConsumer(supabase)`: subscribe INSERT su `wa_jobs`, claim `pending→sending`, `sendBulkWA([{telefono,messaggio}])` (funzione già esistente, `wa-bot.js:390`), poi `done`/`error`. Reconcile identico.
- `sendBulkWA` e `formatPhone` restano invariati (già testati/patchati per prefissi esteri, FIX A4).

### 2.3 Avvio (`server.js`)
- Nel blocco `app.listen` (`server.js:183`) dopo `initWABot()` chiamare `startPrintConsumer(supabase)` e `startWaJobsConsumer(supabase)`.
- L'endpoint HTTP `POST /print` e `POST /wa/send-bulk` diventano **legacy**: si possono lasciare (utili per test in LAN) ma non sono più sul percorso di produzione. `GET /status` può restare per diagnostica locale.

### 2.4 Chiavi sul Mac
- `.env` del print-server (già letto da `server.js:11`): `REACT_APP_SUPABASE_URL`, e per lo scenario hardening `SUPABASE_SERVICE_KEY`. La service_role key **non deve mai** finire nel repo né nel frontend.

---

## 3. Fase C — Frontend (`src/App.js`)

### 3.1 Stampa → insert su `print_jobs`
Sostituire il corpo iOS di `smartPrint()` (`App.js:310-341`):
- Da: `fetch(\`${serverUrl}/print\`, {method:'POST', body: {html}})`
- A:  `await supabase.from('print_jobs').insert({ html, copies:1, width:'62mm', height:'100mm' })`
- Il ramo desktop (`printHTML`, dialogo nativo browser) **resta invariato** — su Mac funziona già.
- Toast: mostrare "🖨️ Etichetta in coda" all'insert riuscito. Opzionale (nice-to-have): iscriversi
  in Realtime allo `status` di quel job per confermare "stampato" / segnalare "errore".
- Gestione errore insert: se `error` non nullo → toast rosso (collegabile al fix C3 dell'audit sugli
  errori di scrittura silenziosi).

### 3.2 WhatsApp bulk → insert su `wa_jobs`
Sostituire i **3** `fetch(...\/wa/send-bulk...)` (`App.js:4422, 4482, 4517`) con:
`await supabase.from('wa_jobs').insert(messages.map(m => ({ telefono:m.telefono, messaggio:m.messaggio })))`.

### 3.3 Rimozioni/semplificazioni
- Eliminare `printServerBase()` (`App.js:302`) e la UI Impostazioni "URL server Mac Mini" + test connessione (`App.js:1933-1990`): non più necessari. Sostituire quella card con una nota "Stampa via coda Supabase — nessuna configurazione".
- Rimuovere l'uso di `localStorage.printServerUrl`.

### 3.4 Config/env frontend
- `supabase.js` resta invariato (legge `REACT_APP_SUPABASE_URL/KEY`).
- La chiave `REACT_APP_ANTHROPIC_KEY` (AI, `App.js:211`) finirebbe nel bundle pubblico: **al go-live impostarla vuota/placeholder** su Netlify (l'AI si auto-disabilita, `App.js:216`) e pianificarne lo spostamento dietro una Netlify Function come lavoro successivo.
- Il PIN (`REACT_APP_PIN`, `App.js:750`) resta ma è cosmetico: la protezione reale è la password Netlify (§4.3).

---

## 4. Fase D — Netlify

### 4.1 `netlify.toml` (root)
```toml
[build]
  command = "npm run build"
  publish = "build"
[build.environment]
  NODE_VERSION = "20"
  CI = "false"          # CRA tratta i warning come errori in CI; disattivare
```

### 4.2 SPA redirect — `public/_redirects`
```
/*  /index.html  200
```

### 4.3 Variabili d'ambiente (Netlify UI → Site settings → Environment)
- `REACT_APP_SUPABASE_URL`
- `REACT_APP_SUPABASE_KEY` (anon)
- `REACT_APP_PIN`
- `REACT_APP_ANTHROPIC_KEY` = `placeholder` (vedi §3.4)

### 4.4 Protezione password sito (tampone sicurezza)
- Netlify → Site settings → **Access control → Password protection** (Site protection).
- ✅ **Piano a pagamento già attivo** → la protezione password a livello sito è disponibile: si imposta
  una singola password condivisa per l'accesso all'URL. Nessuna gate function alternativa necessaria.
- Nota: è un tampone (una password per tutti), non un login per utente. L'auth reale resta il lavoro
  successivo (§10).

### 4.5 Collegamento repo e deploy
- Collegare il repo GitHub `zerymac/gioielleria-repair`.
- **Production branch**: `gestionale` (il branch in uso in negozio) → deploy automatico ad ogni push.
- Verificare il primo build dai log Netlify.

---

## 5. Fase E — Pagine pubbliche e Edge Function (invariato)

- `docs/repair-status.html` e `docs/approve-quote.html` **restano su GitHub Pages**. I QR delle riparazioni
  esistenti puntano a `zerymac.github.io/...` (`App.js:549, 4313`): non toccarli evita di rigenerare QR già stampati/consegnati.
- La Edge Function `supabase/functions/approve-quote` resta invariata.
- Nessun lavoro in questa fase. (Spostarle su Netlify sarebbe un progetto separato con re-mapping degli URL.)

---

## 6. Fase F — Autostart sul Mac (`setup-autostart.sh`)

- **Rimuovere** il LaunchAgent `com.zerrillo.reactapp` (l'app non è più servita dal Mac, è su Netlify).
- **Mantenere** `com.zerrillo.printserver` (ora esegue print-consumer + wa-bot consumer).
- Aggiornare lo script e ricaricare gli agent.

---

## 7. Fase G — Test (riusare l'harness `src/__audit__/mocks/fakeSupabase.js`)

Codice nuovo critico = va coperto:
1. **print-consumer**: job `pending` → claim → `printLabel` chiamato con i campi giusti → `done`; su errore `lp`/Puppeteer → `error`. Reconcile all'avvio recupera i `pending` creati mentre il Mac era spento (mockare `printLabel`).
2. **wa-consumer**: insert `wa_jobs` → `sendBulkWA` chiamato → `done`; reconcile.
3. **Frontend**: `smartPrint` iOS inserisce una riga in `print_jobs` (via fakeSupabase) con `html` corretto; i 3 percorsi WA inseriscono in `wa_jobs`.
4. **Idempotenza**: un secondo evento Realtime sullo stesso job già `printing/done` non ristampa.

Mantenere verde la suite esistente (`CI=true npx react-scripts test --watchAll=false`).

---

## 8. Checklist go-live (ordine di esecuzione)

1. [ ] Supabase: creare `print_jobs`, `wa_jobs`, indici, aggiungere a `supabase_realtime` (Fase A).
2. [ ] Mac: aggiornare `print-server` con i due consumer + estrarre `printLabel` (Fase B). Deploy sul Mac, `npm install`, riavvio LaunchAgent.
3. [ ] Verifica end-to-end in LAN: insert manuale in `print_jobs` → esce l'etichetta.
4. [ ] Frontend: patch `smartPrint` + 3 WA + rimozione UI printServerUrl (Fase C). Test suite verde.
5. [ ] Netlify: `netlify.toml`, `_redirects`, env vars, collega repo/branch `gestionale` (Fase D).
6. [ ] Attivare protezione password sito (o gate function) (§4.4).
7. [ ] Aggiornare `setup-autostart.sh` (Fase F).
8. [ ] Smoke test da URL Netlify: login PIN, crea riparazione, stampa (etichetta esce dal Mac), rientro con notifica WA.
9. [ ] Rollback pronto: fino a conferma, il Mac continua a servire l'app in LAN (non spegnere il vecchio LaunchAgent reactapp finché il nuovo flusso non è validato).

**Rollback**: se qualcosa non stampa, i job restano in `print_jobs` come `pending` e vengono ripresi appena il consumer torna su; nel frattempo si può riattivare l'app servita in LAN. Nessuna perdita di lavori.

---

## 9. Cosa serve da te al momento del "via"

- Accesso/credenziali **Netlify** (piano a pagamento già attivo → password sito disponibile, §4.4). Serve solo la **password** da impostare per l'accesso al sito.
- Conferma se attivare l'**hardening RLS + service_role** subito (§A.4/§2.4) o restare sul minimo.
- Eventuale **dominio personalizzato** (altrimenti si usa `*.netlify.app`).
- Finestra di intervento sul **Mac Mini** per aggiornare il print-server e ricaricare i LaunchAgent.

---

## 10. Fuori scope (lavori successivi consigliati)

- Supabase **Auth reale** + RLS ristretto (fix C1 audit) — sostituisce il PIN cosmetico e la password Netlify.
- Spostare la chiave **Anthropic** dietro una Netlify Function.
- Test del print-server/consumer (collegato all'analisi di copertura test).
