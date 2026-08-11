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
const { createClient } = require('@supabase/supabase-js');

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

/* ── Coda cartellini gestionale: consuma print_jobs da Supabase ──── */
function initPrintQueue() {
  const url = process.env.REACT_APP_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.REACT_APP_SUPABASE_KEY;
  if (!url || !key) { console.warn('⚠️  print_jobs: Supabase non configurato'); return; }
  const supabase = createClient(url, key);

  /* Ricevute di cortesia / scontrini regalo sulla Epson FP-81 II RT: il job
     porta l'XML gia' pronto (envelope SOAP generato dal gestionale, vedi
     gestionale-web/src/lib/epsonPrinter.ts) e qui si fa solo il POST a
     fpmate.cgi — dal server sulla LAN, cosi' il browser (anche iPhone) non e'
     bloccato dal mixed-content. Richiede Node 18+ (fetch globale). */
  const EPSON_FP_URL = (process.env.EPSON_FP_URL || 'http://192.168.1.65').replace(/\/+$/, '');
  async function printEpsonReceipt(job) {
    try {
      const res = await fetch(`${EPSON_FP_URL}/cgi-bin/fpmate.cgi?devid=local_printer&timeout=10000`, {
        method: 'POST',
        headers: { 'Content-Type': 'text/xml; charset=utf-8' },
        body: job.html,
      });
      const text = await res.text().catch(() => '');
      if (!res.ok || !/success\s*=\s*"true"/i.test(text)) {
        throw new Error(`Epson ${res.status}: ${text.replace(/\s+/g, ' ').slice(0, 200)}`);
      }
      await supabase.from('print_jobs').update({ stato: 'done', printed_at: new Date().toISOString() }).eq('id', job.id);
      console.log(`🧾 Ricevuta Epson stampata (${job.id})`);
    } catch (e) {
      await supabase.from('print_jobs').update({ stato: 'error', errore: String(e.message || e) }).eq('id', job.id);
      console.error(`❌ Ricevuta Epson ${job.id}:`, e.message);
    }
  }

  async function renderAndPrint(job) {
    if (job.tipo === 'ricevuta_epson') return printEpsonReceipt(job);
    const tmpPdf = path.join(os.tmpdir(), `cartellino-${job.id}.pdf`);
    const cleanup = () => { try { fs.unlinkSync(tmpPdf); } catch (_) {} };
    try {
      const browser = await getBrowser();
      const page = await browser.newPage();
      await page.setContent(job.html, { waitUntil: 'networkidle2', timeout: 15000 });
      await page.pdf({ path: tmpPdf, width: `${job.width_mm}mm`, height: `${job.height_mm}mm`,
                       printBackground: true, margin: { top: 0, right: 0, bottom: 0, left: 0 } });
      await page.close();
      const cmd = ['lp', `-d "${job.printer}"`, `-n ${job.copies || 1}`,
                   `-o media=Custom.${job.width_mm}x${job.height_mm}mm`,
                   `"${tmpPdf}"`].join(' ');
      await new Promise((res, rej) => exec(cmd, (e, out, err) => { cleanup(); e ? rej(new Error(err || e.message)) : res(out); }));
      await supabase.from('print_jobs').update({ stato: 'done', printed_at: new Date().toISOString() }).eq('id', job.id);
      console.log(`🏷️  Cartellino stampato (${job.id})`);
    } catch (e) {
      cleanup();
      await supabase.from('print_jobs').update({ stato: 'error', errore: String(e.message || e) }).eq('id', job.id);
      console.error(`❌ Cartellino ${job.id}:`, e.message);
    }
  }

  /* Claim atomico: pending -> printing solo se ancora pending (niente doppioni). */
  const claim = async (id) => (await supabase.from('print_jobs')
      .update({ stato: 'printing' }).eq('id', id).eq('stato', 'pending')
      .select('*').maybeSingle()).data || null;

  async function processPending() {
    const { data } = await supabase.from('print_jobs').select('*')
      .eq('stato', 'pending').order('created_at', { ascending: true });
    for (const row of (data || [])) { const j = await claim(row.id); if (j) await renderAndPrint(j); }
  }

  supabase.channel('print-jobs')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'print_jobs' },
        async pl => { const j = await claim(pl.new.id); if (j) await renderAndPrint(j); })
    .subscribe(st => console.log(st === 'SUBSCRIBED' ? '📡 print_jobs — in ascolto cartellini' : `⚠️  print_jobs Realtime: ${st}`));

  processPending();
  setInterval(() => processPending().catch(() => {}), 5 * 1000);
  console.log('🏷️  Coda cartellini attiva');
}

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

  /* Coda cartellini gestionale (print_jobs) */
  initPrintQueue();
});