# Handoff — Zerrillo Gioielleria Repair App

## Goal
Mantenere e migliorare l'app React di gestione riparazioni gioielleria "Zerrillo Preziosi S.r.l." — un'app locale (localhost:3000) con backend Supabase, print server Node su porta 3001, e backup automatico su Google Drive.

## Current Progress

### Funzionalità aggiunte in questa sessione
- **Operatore**: step 0 nel wizard riparazioni (4 opzioni: Adri, Massi, Jenny, Manu) con selezione a card colorate. Nome operatore visibile sull'etichetta NEGOZIO.
- **Layout responsivo**: breakpoint `BP=768`. Su iPad/Mac appare sidebar a sinistra (220px) e il contenuto principale a destra. Su mobile rimane la barra tab in basso. `FullScreen` diventa dialog centrato su MD+. `Sheet` ha un `footer` prop non scrollabile.
- **Consegna modal**: il pulsante conferma è ora fisso in basso (footer non scrollabile di Sheet), non richiede più scroll.
- **Spesa e prezzo finale inline**: modificabili direttamente nel dettaglio riparazione anche per riparazioni interne (non solo al ritorno dal riparatore).
- **Date tracciate automaticamente**:
  - `dataSpedita` → quando la riparazione va "presso_esterno" (via DDT o cambio stato)
  - `dataRientrata` → quando la riparazione rientra (handleReturn / handleRientroRapido)
  - `dataConsegnata` → quando viene consegnata al cliente (handleConsegna o status "consegnato")
- **Date visibili nel dettaglio**: righe condizionali 📤/📥/🤝 mostrate solo se il valore esiste.
- **Totali DDT corretti**: calcolati su tutte le riparazioni rientrate (non solo DDT con stato "rientrato"), escludendo quelle ancora "presso_esterno".
- **Messaggio WhatsApp "pronto"**: include il prezzo finale se presente.
- **Stampa automatica disabilitata**: su riparazioni multi-oggetto la stampa non parte più in automatico al salvataggio.

### Migrazioni Supabase da eseguire (se non già fatto)
```sql
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

## What Worked
- **PGRST204 fallback**: quando una colonna non esiste su Supabase, `upsertRepair` riprova senza le colonne nuove — evita crash durante il rollout graduale delle migrazioni.
- **Sheet con footer prop**: struttura flex `display:flex; flexDirection:column` con `flex:1; overflowY:auto` per il contenuto e `flexShrink:0` per il footer — il footer rimane sempre visibile senza scroll.
- **`useW()` hook + `BP=768`**: hook leggero con `resize` listener per layout responsivo, usato in tutti i componenti principali.
- **`today()` helper**: ritorna la data corrente come stringa ISO `YYYY-MM-DD`.

## What Didn't Work
- **`position:sticky; bottom:0`** nel ConsegnaModal: non funziona perché l'elemento era in cima al container scorrevole. Lo sticky bottom funziona solo quando un elemento sta per uscire dal basso.

## Next Steps / Idee future
- Nessun task pendente noto al termine della sessione.
- Le riparazioni vecchie non avranno le nuove date (comportamento atteso — i dati storici non esistono).
- Possibile futura feature: ricerca/filtro per operatore.
- Possibile futura feature: report mensile per operatore.

## File principali
- `src/App.js` — tutta l'app (~3950 righe), unico file React
- `backup/backup.js` — backup notturno Supabase → Google Drive
- `backup/restore.js` — ripristino da backup JSON
- `print-server/` — server Node per stampa etichette (porta 3001)
- `.env` — credenziali Supabase (`REACT_APP_SUPABASE_URL`, `REACT_APP_SUPABASE_KEY`)

## Pattern chiave da rispettare
- Tutte le modifiche vanno in `src/App.js`
- `withSync(fn)` per operazioni DB (gestisce stato sincronizzazione)
- `upsertRepair(repair)` per salvare una riparazione completa
- `api.updateRepairStatus(id, status)` per solo cambio stato (senza dati extra)
- Non aggiungere commenti esplicativi al codice salvo casi strettamente necessari
- Non aggiungere emoji nei file salvo richiesta esplicita
