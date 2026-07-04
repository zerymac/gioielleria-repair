# Come eseguire la checklist pre-merge (Sessione 2)

I 5 fix sono su `fix/perdite-dati`, non ancora nel negozio. Per provarli si fa girare
il codice del branch **in parallelo** all'app in uso, senza toccarla.

- Porta **3000** = app del negozio (non si tocca)
- Porta **3001** = print server (non si tocca)
- Porta **3005** = app di PROVA (branch) ← la useremo

⚠️ **Attenzione database condiviso**: l'app di prova usa lo *stesso* Supabase del
negozio. Ogni riparazione/ordine/cliente di prova comparirà anche in negozio.
→ Usa nomi riconoscibili (es. cognome **ZZTEST**) e **cancella** i record di prova a fine test.

---

## Setup dell'app di prova (una volta sola)

```bash
# copia le credenziali nel worktree del branch
cp ~/gioielleria-repair/.env ~/gioielleria-audit/.env

# avvia l'app di prova sulla porta 3005 (lascia questo terminale aperto)
cd ~/gioielleria-audit
PORT=3005 npm start
```

Apri **http://localhost:3005** (PIN come al solito). Il negozio su 3000 resta intatto.
Per fermarla: Ctrl-C in quel terminale.

---

## 1. C2 — Marca / Referenza / Lavori  ✅ già dal vivo, provalo nel NEGOZIO (porta 3000)

1. Nuova riparazione → cliente qualsiasi (o ZZTEST).
2. Allo step "Descrizione" compila **Marca** = `TEST`, **Referenza** = `TEST-REF`.
3. Allo step "Preventivo" compila **Lavori da eseguire** = `prova lavori`.
4. Salva → apri il dettaglio della riparazione.
5. **Atteso**: vedi Marca/Referenza (`TEST · TEST-REF`) e "Lavori da eseguire: prova lavori".
6. Pulizia: elimina la riparazione di prova (finisce nell'archivio eliminati).

## 2. A9 — Consegna parziale ordine  → app di PROVA (3005)

1. Nuovo ordine, cliente ZZTEST, **2 articoli** (es. "Anello ZZTEST" e "Bracciale ZZTEST").
2. Apri l'ordine → porta **solo il primo** articolo a stato **Arrivato** (l'altro resta "Da ordinare/Ordinato").
3. Premi **"Consegna al cliente"**.
4. **Atteso**:
   - solo l'Anello diventa **Consegnato**; il Bracciale **resta** com'era;
   - lo stato dell'ordine **non** è "Consegnato" (resta aperto);
   - compare il messaggio WhatsApp di conferma (nel riquadro): cita **solo l'Anello** e dice **"consegna parziale"**. *Non serve inviarlo* — basta leggerlo.
5. Pulizia: elimina l'ordine di prova.

## 3. C3 — Errori visibili  → app di PROVA (3005), isolando SOLO la prova

Per simulare il database irraggiungibile senza toccare il negozio, si dà all'app di
prova un indirizzo Supabase sbagliato (solo nel worktree del branch).

**ROMPI** (copia-incolla tutto il blocco):
```bash
cd ~/gioielleria-audit
[ -f .env ] || cp ~/gioielleria-repair/.env .env          # se non l'avevi ancora copiato
cp .env .env.bak                                            # backup dell'originale
sed -i '' 's|^REACT_APP_SUPABASE_URL=.*|REACT_APP_SUPABASE_URL=https://nonesiste.supabase.co|' .env
echo "URL ora:" && grep '^REACT_APP_SUPABASE_URL=' .env
```

Poi **riavvia** l'app di prova (Ctrl-C nel terminale dove gira, quindi `PORT=3005 npm start`)
e apri http://localhost:3005:
- **Atteso all'avvio**: banda rossa in alto **"Connessione al database persa — i dati
  mostrati potrebbero non essere aggiornati"**, e l'indicatore in alto è rosso.
- Prova a cambiare uno stato / salvare qualcosa → **atteso**: avviso rosso in basso
  **"Salvataggio non riuscito — riprova"**.

**RIPRISTINA** (copia-incolla):
```bash
cd ~/gioielleria-audit && mv .env.bak .env
echo "URL ripristinato:" && grep '^REACT_APP_SUPABASE_URL=' .env
```
Riavvia di nuovo l'app di prova: la banda rossa sparisce. Fine del test C3.

## 4. A4 — Numero estero su WhatsApp  → DOPO il merge (serve il print server aggiornato)

Il fix WhatsApp lato server entra in funzione solo quando il print server gira col
nuovo `wa-bot.js`, cioè **dopo il merge e il riavvio**. Perciò questa prova si fa
**subito dopo** aver eseguito `merge-sessione2.sh` e riavviato il print server:

1. Cliente di prova ZZTEST con **il tuo numero** scritto in formato estero, es.
   prefisso `+39` ma prova anche un `+44`/`+49` verso un numero che controlli.
2. Fai scattare un WhatsApp automatico (es. ordine ZZTEST → stato **Arrivato**).
3. **Atteso**: il messaggio arriva al numero **giusto** (prima, con un +44/+49, non arrivava).
4. La logica è già coperta dai test automatici (verdi); questa è la conferma sul campo.

## 5. C5 — Ripristino backup  → NON sul database del negozio

Il ripristino riscrive i record: **non** eseguirlo contro il Supabase di produzione
(potrebbe sovrascrivere dati attuali con versioni più vecchie del backup). È già
coperto dai test automatici (restore di un backup notturno con cliente estero →
prefisso e codice fiscale preservati). Se vuoi provarlo dal vivo, fallo solo su un
progetto Supabase di prova separato. Altrimenti **salta** e fidati del test.

---

## Riepilogo esito atteso

| # | Fix | Dove | Esito atteso |
|---|-----|------|--------------|
| 1 | C2 | negozio (3000) | Marca/Referenza/Lavori salvati e visibili |
| 2 | A9 | prova (3005) | consegna solo l'arrivato, messaggio "parziale" |
| 3 | C3 | prova (3005) | banda rossa offline + toast "Salvataggio non riuscito" |
| 4 | A4 | dopo merge | WhatsApp arriva al numero estero corretto |
| 5 | C5 | test automatico | (dal vivo solo su DB separato) |

Se tutto torna → procedi col merge: `bash audit/merge-sessione2.sh`.
Ricordati di **cancellare i record ZZTEST** e di **fermare l'app di prova** (Ctrl-C).
