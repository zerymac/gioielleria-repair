# Sessione 2 — Nota di rilascio (perdite di dati silenziose + fix rapidi)

Branch: `fix/perdite-dati` · 5 fix, 6 commit, **36 test verdi** (1 skip tecnico).
**Non ancora sul negozio**: il merge su `gestionale` lo decide il proprietario dopo la checklist qui sotto.

## Cosa cambia — in parole semplici

### 1. Non si perdono più Marca, Referenza e "Lavori da eseguire" (C2)
Quando registri una riparazione, questi tre campi ora vengono **salvati** (prima
sparivano dopo il salvataggio, anche se li avevi scritti e visti nel riepilogo).
Vale anche per le riparazioni con più oggetti.

### 2. La consegna di un ordine consegna solo ciò che è arrivato (A9)
Se un ordine ha più articoli e ne è arrivato solo uno, premendo **"Consegna al
cliente"** ora consegni **solo l'articolo arrivato**; gli altri restano nell'ordine
finché non arrivano. Il WhatsApp al cliente elenca solo ciò che è stato consegnato
e scrive "consegna parziale" quando l'ordine non è completo. (Prima venivano segnati
consegnati **tutti**, anche quelli mai arrivati.)

### 3. I WhatsApp automatici funzionano con i numeri esteri (A4)
Un cliente con numero estero (es. +49, +44) ora riceve il messaggio sul numero
giusto. Prima veniva sempre anteposto il prefisso italiano e il messaggio non
arrivava. I numeri italiani continuano a funzionare come prima.

### 4. Il ripristino da backup non rovina più i dati (C5)
Se un giorno si deve **ripristinare da un backup**, l'operazione ora mantiene
correttamente prefisso telefonico, codice fiscale e tutti i campi — anche partendo
dal backup automatico notturno (prima quel ripristino azzerava il prefisso a +39 e
perdeva il codice fiscale). Il backup notturno ora salva anche i link di conferma
preventivo, e la copia dello schema del database è aggiornata.

### 5. **NOVITÀ VISIBILE PER GLI OPERATORI**: gli errori ora si vedono (C3)
Questa è la modifica che il personale deve conoscere:

- **Banda rossa in alto "⚠️ Connessione al database persa — i dati mostrati
  potrebbero non essere aggiornati"**: compare quando l'app non riesce a raggiungere
  il database (Mac Mini spento, WiFi giù, internet assente). **Cosa fare**: non fidarsi
  di ciò che si vede a schermo, non reinserire dati pensando che siano spariti;
  verificare rete/Mac Mini. Prima l'app mostrava semplicemente l'**archivio vuoto**
  come se i dati fossero stati cancellati. Ora i dati già caricati **restano
  visibili** e la banda avvisa. Quando la connessione torna, la banda sparisce da sola.

- **Avviso rosso in basso "Salvataggio non riuscito — riprova"**: compare quando una
  modifica **non** è stata salvata sul database. **Cosa fare**: rifare l'operazione
  (cambio stato, modifica, ecc.). Prima l'app diceva "Sincronizzato" anche quando il
  salvataggio era fallito, quindi si poteva credere di aver salvato senza averlo fatto.

- L'indicatore in alto a sinistra (il pallino accanto a "Sincronizzato") diventa
  **rosso** con "Connessione persa" o "Errore di salvataggio" quando c'è un problema.

## Checklist manuale prima del merge su `gestionale`

Da eseguire in negozio (o su un ambiente di prova), idealmente su iPad/Mac e iPhone:

1. **Marca/Referenza/Lavori (C2)**: crea una riparazione di prova compilando Marca,
   Referenza e "Lavori da eseguire"; apri il dettaglio e verifica che ci siano tutti.
   Ripeti con una riparazione a 2 oggetti.
2. **Consegna parziale (A9)**: crea un ordine con 2 articoli, porta **uno solo** ad
   "arrivato", premi "Consegna al cliente"; verifica che l'altro resti nell'ordine e
   che il messaggio citi solo l'articolo consegnato.
3. **Numero estero (A4)**: in ambiente di prova (bot WhatsApp non collegato al numero
   reale) verifica che un invio verso un +49/+44 produca il destinatario corretto.
4. **Errori visibili (C3)**: con il Mac Mini/print server o la rete **spenti**, prova
   a cambiare uno stato → deve comparire l'avviso rosso "Salvataggio non riuscito";
   riaccendendo, riprova e verifica che salvi. Simula anche la perdita di connessione
   e verifica che compaia la banda rossa e che i dati non spariscano.
5. **Backup (C5)**: opzionale, su ambiente separato — ripristina un file
   `database-YYYY-MM-DD.json` notturno e verifica che un cliente estero mantenga
   prefisso e codice fiscale.

## Follow-up rimandati (fuori da questa sessione)
- **C1 — sicurezza (Sessione 1)**: RLS aperta + chiave pubblica nel repo → priorità.
- **C4 — numerazione (Sessione 3)**: numeri DDT/ordine/riparazione da contatore atomico.
- **A1/A3/A8 — outbox WhatsApp (Sessione 4)**: notifiche automatiche con coda e retry.
- **Pulizia**: warning eslint preesistenti (`multiReceiptHTML` inutilizzato, escape a
  riga ~392); estrazione moduli da App.js; dipendenze (`npm audit`).

## Dettaglio tecnico (per chi sviluppa)
Vedi i messaggi di commit su `fix/perdite-dati` e `audit/FASE1-ANALISI.md` /
`audit/FASE2-RISULTATI.md`. Decisioni chiave: A9 semantica "consegna parziale"
(scelta col proprietario); A4 numero in E.164 via helper `waPhone`; C5
normalizzazione snake→camel via i convertitori `toX` + `orders` in export/restore;
C3 flag di errore condiviso letto da `withSync` + `getX` che ritornano `{data,error}`.
