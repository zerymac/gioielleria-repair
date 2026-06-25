/**
 * Zerrillo Print Server
 * Riceve HTML dall'app React (iPhone/Mac), genera PDF con Chrome headless,
 * stampa sulla Brother QL tramite driver nativo macOS (lp/lpr).
 *
 * Avvio: node server.js
 * Porta: 3001
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const express  = require('express');
const puppeteer = require('puppeteer');
const { exec }  = require('child_process');
const fs        = require('fs');
const path      = require('path');
const os        = require('os');
const { initWABot, isWAReady, sendBulkWA } = require('./wa-bot');

const app  = express();
const PORT = 3001;

/* ── Middleware ───────────────────────────────────────────────────── */
app.use(express.json({ limit: '10mb' }));

/* CORS aperto — il server è locale, non esposto a internet */
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

/* ── Cache browser Puppeteer ──────────────────────────────────────── */
let _browser = null;

async function getBrowser() {
  if (_browser && _browser.isConnected()) return _browser;
  console.log('🚀 Avvio Chrome headless…');
  _browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  _browser.on('disconnected', () => { _browser = null; });
  return _browser;
}

/* ── Trova nome stampante Brother nel sistema ─────────────────────── */
function getBrotherPrinter() {
  return new Promise((resolve, reject) => {
    exec('lpstat -a 2>/dev/null', (err, stdout) => {
      const output = stdout || '';
      const line = output.split('\n').find(l =>
        l.toLowerCase().includes('brother') || l.toLowerCase().includes('ql')
      );
      if (line) {
        /* lpstat -a restituisce "NomePrinter accepting requests since..." */
        resolve(line.split(' ')[0].trim());
        return;
      }
      /* Fallback: lpstat -p */
      exec('lpstat -p 2>/dev/null', (e2, out2) => {
        const line2 = (out2 || '').split('\n').find(l =>
          l.toLowerCase().includes('brother') || l.toLowerCase().includes('ql')
        );
        if (line2) {
          /* lpstat -p: "printer NomePrinter is idle..." */
          const parts = line2.trim().split(' ');
          resolve(parts[1] || parts[0]);
          return;
        }
        reject(new Error(
          'Stampante Brother non trovata.\n' +
          'Esegui "lpstat -a" nel Terminale per vedere le stampanti disponibili.\n' +
          'Poi aggiorna BROTHER_PRINTER in server.js se necessario.'
        ));
      });
    });
  });
}

/* ── Permette override manuale del nome stampante ─────────────────── */
const BROTHER_PRINTER = process.env.BROTHER_PRINTER || "Brother_QL_1110NWB"; // es: "Brother_QL_1110NWB"

/* ── GET /status — health check ──────────────────────────────────── */
app.get('/status', async (req, res) => {
  try {
    const printer = BROTHER_PRINTER || await getBrotherPrinter();
    res.json({
      ok: true,
      printer,
      server: 'Zerrillo Print Server v1.0',
      timestamp: new Date().toISOString(),
    });
  } catch (e) {
    res.json({
      ok: false,
      error: e.message,
      timestamp: new Date().toISOString(),
    });
  }
});

/* ── POST /print — stampa etichetta ──────────────────────────────── */
app.post('/print', async (req, res) => {
  const { html, copies = 1, width = '62mm', height = '100mm' } = req.body;

  if (!html) {
    return res.status(400).json({ error: 'Campo "html" mancante nel body.' });
  }

  /* ── Risponde SUBITO all'iPhone per evitare timeout ── */
  res.json({ ok: true, status: 'queued' });

  /* ── Stampa in background (non blocca la risposta HTTP) ── */
  const tmpPdf = path.join(os.tmpdir(), `zerrillo-label-${Date.now()}.pdf`);
  const cleanup = () => { try { fs.unlinkSync(tmpPdf); } catch (_) {} };

  try {
    console.log(`📄 Generazione PDF ${width}×${height}…`);
    const browser = await getBrowser();
    const page = await browser.newPage();

    await page.setContent(html, {
      waitUntil: 'networkidle2',
      timeout: 15000,
    });

    await page.pdf({
      path: tmpPdf,
      width,
      height,
      printBackground: true,
      margin: { top: 0, right: 0, bottom: 0, left: 0 },
    });

    await page.close();
    console.log(`✅ PDF generato`);

    const printer = BROTHER_PRINTER || await getBrotherPrinter();
    console.log(`🖨️  Invio a "${printer}" (${copies} cop.)…`);

    const cmd = [
      'lp',
      `-d "${printer}"`,
      `-n ${copies}`,
      `-o media=Custom.${width.replace('mm','')}x${height.replace('mm','')}mm`,
      `-o fit-to-page`,
      `-o print-quality=5`,
      `"${tmpPdf}"`,
    ].join(' ');

    exec(cmd, (err, stdout, stderr) => {
      cleanup();
      if (err) console.error('❌ lp error:', stderr || err.message);
      else console.log(`✅ Stampato: ${stdout.trim()}`);
    });

  } catch (e) {
    cleanup();
    console.error('❌ Errore stampa background:', e.message);
  }
});

/* ── GET /wa-status — stato connessione WhatsApp ─────────────────── */
app.get('/wa-status', (req, res) => {
  res.json({ ok: isWAReady(), timestamp: new Date().toISOString() });
});

/* ── POST /wa/send-bulk — invio massivo WA con delay anti-ban ────── */
app.post('/wa/send-bulk', (req, res) => {
  const { messages } = req.body;
  if (!Array.isArray(messages) || messages.length === 0)
    return res.status(400).json({ error: 'messages array richiesto' });
  if (!isWAReady())
    return res.status(503).json({ error: 'WhatsApp non connesso' });
  res.json({ ok: true, queued: messages.length });
  sendBulkWA(messages).catch(e => console.error('❌ send-bulk error:', e.message));
});

/* ── Avvio server ─────────────────────────────────────────────────── */
app.listen(PORT, '0.0.0.0', async () => {
  console.log('\n╔══════════════════════════════════════╗');
  console.log('║   🖨️  Zerrillo Print Server  v1.0    ║');
  console.log('╠══════════════════════════════════════╣');
  console.log(`║  Porta:   ${PORT}                         ║`);
  console.log(`║  Status:  http://localhost:${PORT}/status  ║`);
  console.log('╚══════════════════════════════════════╝\n');

  /* Rileva subito la stampante all'avvio */
  try {
    const printer = BROTHER_PRINTER || await getBrotherPrinter();
    console.log(`✅ Stampante rilevata: "${printer}"`);
  } catch (e) {
    console.warn(`⚠️  ${e.message}`);
    console.warn('   Il server funziona, ma la stampante non è ancora rilevata.');
  }

  /* Pre-avvia Chrome headless per ridurre latenza alla prima stampa */
  getBrowser().catch(e => console.warn('⚠️  Chrome headless:', e.message));

  /* Avvia il bot WhatsApp */
  initWABot();
});