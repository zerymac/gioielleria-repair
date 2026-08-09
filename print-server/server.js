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
const { createClient } = require('@supabase/supabase-js');
const { initWABot, isWAReady, sendBulkWA } = require('./wa-bot');
const { printLabel, getBrowser, getBrotherPrinter, BROTHER_PRINTER } = require('./print-label');
const { startPrintConsumer } = require('./print-consumer');

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

/* getBrowser / getBrotherPrinter / BROTHER_PRINTER / printLabel sono in ./print-label
   (condivisi tra l'endpoint HTTP legacy e il consumer della coda print_jobs). */

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

/* ── POST /print — stampa etichetta (endpoint LEGACY per uso in LAN) ──
   Con Netlify il percorso di produzione è la coda print_jobs (vedi consumer);
   questo endpoint resta per test/uso locale e coesistenza durante la transizione. */
app.post('/print', async (req, res) => {
  const { html, copies = 1, width = '62mm', height = '100mm' } = req.body;
  if (!html) return res.status(400).json({ error: 'Campo "html" mancante nel body.' });

  /* Risponde SUBITO per evitare timeout; stampa in background. */
  res.json({ ok: true, status: 'queued' });
  printLabel({ html, copies, width, height })
    .catch(e => console.error('❌ Errore stampa background:', e.message));
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

  /* Avvia il consumer della coda di stampa (percorso di produzione con Netlify) */
  const supabaseUrl = process.env.REACT_APP_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.REACT_APP_SUPABASE_KEY;
  if (supabaseUrl && supabaseKey) {
    const supabase = createClient(supabaseUrl, supabaseKey);
    startPrintConsumer(supabase);
    console.log('🖨️  Consumer coda print_jobs avviato');
  } else {
    console.warn('⚠️  Credenziali Supabase mancanti — consumer stampa disabilitato (solo endpoint HTTP)');
  }

  /* Avvia il bot WhatsApp (include il consumer della coda wa_jobs) */
  initWABot();
});