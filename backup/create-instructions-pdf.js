#!/usr/bin/env node
/**
 * Zerrillo — Genera PDF istruzioni di recupero
 * Salva il PDF nella cartella Google Drive dei backup.
 *
 * Uso: node create-instructions-pdf.js
 */

const puppeteer = require("../print-server/node_modules/puppeteer");
const fs   = require("fs");
const path = require("path");
const os   = require("os");

const BACKUP_DIR = path.join(
  os.homedir(),
  "Google Drive (zerrillopreziosi@gmail.com)",
  "gioielleria-backups"
);
const OUTPUT = path.join(BACKUP_DIR, "ISTRUZIONI-RECUPERO.pdf");
const DATE   = new Date().toLocaleDateString("it-IT", { day: "2-digit", month: "long", year: "numeric" });

const HTML = `<!DOCTYPE html>
<html lang="it">
<head>
<meta charset="UTF-8"/>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: -apple-system, "Helvetica Neue", Arial, sans-serif;
    font-size: 11pt;
    color: #1c1c1e;
    padding: 28mm 22mm 24mm 22mm;
    line-height: 1.55;
  }

  /* Intestazione */
  .header {
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
    border-bottom: 3px solid #B8860B;
    padding-bottom: 10px;
    margin-bottom: 22px;
  }
  .header-title { font-size: 22pt; font-weight: 800; color: #1c1c1e; }
  .header-sub   { font-size: 10pt; color: #636366; }
  .header-date  { font-size: 9pt; color: #636366; text-align: right; }

  /* Sezioni */
  h2 {
    font-size: 13pt;
    font-weight: 700;
    color: #B8860B;
    margin: 22px 0 8px;
    padding-bottom: 4px;
    border-bottom: 1px solid #F2E8C8;
  }
  h3 {
    font-size: 11pt;
    font-weight: 700;
    color: #1c1c1e;
    margin: 14px 0 5px;
  }

  p  { margin-bottom: 7px; }
  ul { margin: 6px 0 10px 18px; }
  li { margin-bottom: 4px; }

  /* Step numerati */
  .steps { counter-reset: step; }
  .step {
    display: flex;
    gap: 14px;
    margin-bottom: 14px;
    align-items: flex-start;
  }
  .step-num {
    flex-shrink: 0;
    width: 26px; height: 26px;
    border-radius: 50%;
    background: #B8860B;
    color: white;
    font-size: 12pt;
    font-weight: 800;
    display: flex; align-items: center; justify-content: center;
  }
  .step-body { flex: 1; padding-top: 3px; }
  .step-body strong { display: block; font-size: 11pt; margin-bottom: 3px; }

  /* Code block */
  code {
    background: #F2F2F7;
    border-radius: 5px;
    padding: 1px 5px;
    font-family: "SF Mono", "Menlo", monospace;
    font-size: 9.5pt;
    color: #5856D6;
  }
  pre {
    background: #1c1c1e;
    color: #a8ff78;
    border-radius: 8px;
    padding: 10px 14px;
    margin: 7px 0 10px;
    font-family: "SF Mono", "Menlo", monospace;
    font-size: 9pt;
    white-space: pre;
    line-height: 1.6;
  }

  /* Avvisi */
  .alert {
    border-left: 4px solid #FF3B30;
    background: #FFF1F2;
    padding: 8px 12px;
    border-radius: 0 8px 8px 0;
    margin: 10px 0;
    font-size: 10pt;
  }
  .note {
    border-left: 4px solid #3B82F6;
    background: #EFF6FF;
    padding: 8px 12px;
    border-radius: 0 8px 8px 0;
    margin: 10px 0;
    font-size: 10pt;
  }
  .ok {
    border-left: 4px solid #059669;
    background: #ECFDF5;
    padding: 8px 12px;
    border-radius: 0 8px 8px 0;
    margin: 10px 0;
    font-size: 10pt;
  }

  /* Tabella file backup */
  table { width: 100%; border-collapse: collapse; margin: 10px 0; font-size: 10pt; }
  th { background: #F2F2F7; padding: 7px 10px; text-align: left; font-weight: 700; }
  td { padding: 6px 10px; border-bottom: 1px solid #F2F2F7; }

  /* Footer */
  .footer {
    margin-top: 30px;
    padding-top: 10px;
    border-top: 1px solid #E5E5EA;
    font-size: 9pt;
    color: #8E8E93;
    display: flex;
    justify-content: space-between;
  }
</style>
</head>
<body>

<div class="header">
  <div>
    <div class="header-title">Zerrillo Preziosi S.r.l.</div>
    <div class="header-sub">Istruzioni di recupero dati e ripristino sistema</div>
  </div>
  <div class="header-date">Aggiornato il ${DATE}</div>
</div>

<div class="note">
  <strong>Conserva questo documento.</strong>
  Contiene le istruzioni complete per ripristinare l'intera applicazione e tutti i dati
  in caso di guasto hardware, perdita dati o sostituzione del Mac Mini.
</div>

<!-- ═══════════════════════════════════════════════════ -->
<h2>1. Struttura del backup</h2>

<p>Il backup automatico viene eseguito ogni notte alle <strong>03:00</strong> e salvato su
<strong>Google Drive</strong> (account zerrillopreziosi@gmail.com), cartella
<code>gioielleria-backups</code>. Vengono conservati gli ultimi <strong>30 giorni</strong>.</p>

<p>Ogni giorno viene creata una sottocartella con la data (es. <code>2026-05-21/</code>)
contenente tre file:</p>

<table>
  <tr><th>File</th><th>Contenuto</th></tr>
  <tr><td><code>database-YYYY-MM-DD.json</code></td><td>Tutti i dati: clienti, riparazioni, DDT, riparatori, ordini</td></tr>
  <tr><td><code>schema-YYYY-MM-DD.sql</code></td><td>Struttura tabelle + policy Supabase (eseguire prima del restore)</td></tr>
  <tr><td><code>app-source-YYYY-MM-DD.tar.gz</code></td><td>Codice sorgente completo dell'app + file <code>.env</code> con le chiavi API</td></tr>
</table>

<div class="alert">
  <strong>Attenzione:</strong> le foto delle riparazioni caricate <em>prima</em> di maggio 2026
  sono salvate su Supabase Storage e <em>non</em> sono incluse nel backup JSON.
  Le foto più recenti (ordini e riparazioni nuove) sono invece salvate nel database
  come base64 e vengono recuperate correttamente.
</div>

<!-- ═══════════════════════════════════════════════════ -->
<h2>2. Recupero completo (scenario: Mac bruciato + Supabase perso)</h2>

<div class="steps">

<div class="step">
  <div class="step-num">1</div>
  <div class="step-body">
    <strong>Scarica il backup da Google Drive</strong>
    Accedi a Google Drive con l'account <code>zerrillopreziosi@gmail.com</code>,
    apri la cartella <code>gioielleria-backups</code> e scarica la data più recente.
    Estrai i file in una cartella locale, es. <code>~/Scrivania/recupero/</code>.
  </div>
</div>

<div class="step">
  <div class="step-num">2</div>
  <div class="step-body">
    <strong>Installa Node.js sul nuovo Mac</strong>
    Scarica l'installer da <code>nodejs.org</code> e installalo.
    Verifica l'installazione aprendo il Terminale:
<pre>node --version
npm --version</pre>
  </div>
</div>

<div class="step">
  <div class="step-num">3</div>
  <div class="step-body">
    <strong>Estrai il codice sorgente dell'app</strong>
<pre>cd ~/Scrivania/recupero
tar -xzf app-source-2026-05-21.tar.gz
cd gioielleria-repair
npm install
cd print-server && npm install && cd ..
cd backup && npm install && cd ..</pre>
  </div>
</div>

<div class="step">
  <div class="step-num">4</div>
  <div class="step-body">
    <strong>Ricrea il progetto Supabase</strong>
    <ul>
      <li>Vai su <code>supabase.com</code> e accedi (o crea un nuovo progetto)</li>
      <li>Apri il <strong>SQL Editor</strong></li>
      <li>Incolla il contenuto di <code>schema-2026-05-21.sql</code> e clicca <strong>RUN</strong></li>
      <li>Questo crea tutte le tabelle e le policy di accesso in un colpo solo</li>
    </ul>
    <div class="note">
      Se usi lo stesso progetto Supabase (credenziali nel <code>.env</code> recuperato), il file
      <code>.env</code> è già corretto e non serve modificarlo.
    </div>
  </div>
</div>

<div class="step">
  <div class="step-num">5</div>
  <div class="step-body">
    <strong>Importa i dati</strong>
    Il comando cerca automaticamente l'ultimo backup in Google Drive:
<pre>node backup/restore.js</pre>
    Oppure specifica un file manualmente:
<pre>node backup/restore.js ~/Scrivania/recupero/database-2026-05-21.json</pre>
    Al termine vedrai il riepilogo dei record importati per ogni tabella.
  </div>
</div>

<div class="step">
  <div class="step-num">6</div>
  <div class="step-body">
    <strong>Configura l'avvio automatico e riavvia</strong>
<pre>chmod +x setup-autostart.sh
./setup-autostart.sh</pre>
    Questo registra i due LaunchAgent (app React + print server) che
    si avviano automaticamente all'accensione del Mac.
  </div>
</div>

<div class="step">
  <div class="step-num">7</div>
  <div class="step-body">
    <strong>Riconfigura il backup automatico</strong>
<pre>cd backup
chmod +x setup-backup.sh
./setup-backup.sh</pre>
    Il backup notturno ripartirà automaticamente.
  </div>
</div>

<div class="step">
  <div class="step-num">8</div>
  <div class="step-body">
    <strong>Verifica il funzionamento</strong>
    <ul>
      <li>Apri il browser su <code>http://localhost:3000</code> — l'app deve caricarsi</li>
      <li>Controlla che clienti e riparazioni siano presenti</li>
      <li>Verifica il print server: <code>curl http://localhost:3001/status</code></li>
      <li>Su iPhone/iPad: vai in Impostazioni → Stampa e inserisci il nuovo IP del Mac</li>
    </ul>
  </div>
</div>

</div><!-- end .steps -->

<!-- ═══════════════════════════════════════════════════ -->
<h2>3. Recupero parziale (solo Supabase perso, Mac intatto)</h2>

<p>Se il Mac è funzionante ma i dati su Supabase sono stati persi accidentalmente:</p>

<div class="steps">
<div class="step">
  <div class="step-num">1</div>
  <div class="step-body">
    <strong>Ricrea le tabelle</strong> eseguendo lo schema SQL nel SQL Editor di Supabase
    (vedi punto 4 sopra).
  </div>
</div>
<div class="step">
  <div class="step-num">2</div>
  <div class="step-body">
    <strong>Importa i dati</strong> dal backup più recente:
<pre>node ~/gioielleria-repair/backup/restore.js</pre>
  </div>
</div>
</div>

<!-- ═══════════════════════════════════════════════════ -->
<h2>4. Verifica manuale del backup</h2>

<p>Per forzare un backup immediato e verificare che funzioni correttamente:</p>
<pre>node ~/gioielleria-repair/backup/backup.js</pre>

<p>Per controllare i log del backup notturno:</p>
<pre>tail -50 /tmp/zerrillo-backup.log</pre>

<div class="ok">
  <strong>Il backup è in buono stato se vedi:</strong>
  "Backup completato con successo" come ultima riga del log,
  con la data di ieri alle ore 03:00.
</div>

<!-- ═══════════════════════════════════════════════════ -->
<h2>5. Riferimenti rapidi</h2>

<table>
  <tr><th>Cosa</th><th>Dove / Come</th></tr>
  <tr><td>App React</td><td><code>http://localhost:3000</code></td></tr>
  <tr><td>Print server</td><td><code>http://localhost:3001/status</code></td></tr>
  <tr><td>Log backup</td><td><code>/tmp/zerrillo-backup.log</code></td></tr>
  <tr><td>Log app React</td><td><code>/tmp/zerrillo-react.log</code></td></tr>
  <tr><td>Log print server</td><td><code>/tmp/zerrillo-print.log</code></td></tr>
  <tr><td>Cartella progetto</td><td><code>~/gioielleria-repair/</code></td></tr>
  <tr><td>Cartella backup</td><td><code>~/Google Drive (zerrillopreziosi@gmail.com)/gioielleria-backups/</code></td></tr>
  <tr><td>Supabase dashboard</td><td><code>supabase.com</code> → account zerrillopreziosi@gmail.com</td></tr>
</table>

<div class="footer">
  <span>Zerrillo Preziosi S.r.l. — Documento interno riservato</span>
  <span>Generato automaticamente — ${DATE}</span>
</div>

</body>
</html>`;

async function main() {
  console.log("Generazione PDF istruzioni di recupero…");

  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
  }

  const browser = await puppeteer.launch({
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  try {
    const page = await browser.newPage();
    await page.setContent(HTML, { waitUntil: "networkidle0" });
    await page.pdf({
      path: OUTPUT,
      format: "A4",
      printBackground: true,
      margin: { top: 0, right: 0, bottom: 0, left: 0 },
    });
    await page.close();
    const sizeKB = Math.round(fs.statSync(OUTPUT).size / 1024);
    console.log(`✅ PDF salvato: ${OUTPUT} (${sizeKB} KB)`);
  } finally {
    await browser.close();
  }
}

main().catch(err => {
  console.error("❌ Errore:", err.message);
  process.exit(1);
});
