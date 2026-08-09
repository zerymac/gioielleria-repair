/**
 * print-label.js — logica di stampa condivisa.
 * Estratta da server.js così che sia l'endpoint HTTP legacy (POST /print) sia
 * il nuovo consumer della coda `print_jobs` usino lo stesso percorso:
 * HTML -> PDF (Chrome headless) -> lp (CUPS/Brother).
 */
const puppeteer = require('puppeteer');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const BROTHER_PRINTER = process.env.BROTHER_PRINTER || 'Brother_QL_1110NWB';

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

/* Trova il nome della stampante Brother/QL nel sistema (fallback se BROTHER_PRINTER non basta). */
function getBrotherPrinter() {
  return new Promise((resolve, reject) => {
    exec('lpstat -a 2>/dev/null', (err, stdout) => {
      const line = (stdout || '').split('\n').find(l =>
        l.toLowerCase().includes('brother') || l.toLowerCase().includes('ql'));
      if (line) return resolve(line.split(' ')[0].trim());
      exec('lpstat -p 2>/dev/null', (e2, out2) => {
        const line2 = (out2 || '').split('\n').find(l =>
          l.toLowerCase().includes('brother') || l.toLowerCase().includes('ql'));
        if (line2) {
          const parts = line2.trim().split(' ');
          return resolve(parts[1] || parts[0]);
        }
        reject(new Error('Stampante Brother non trovata. Esegui "lpstat -a" e imposta BROTHER_PRINTER.'));
      });
    });
  });
}

/**
 * Genera il PDF dall'HTML e lo invia alla stampante via `lp`.
 * Ritorna una Promise che RISOLVE a stampa accodata in CUPS, RIGETTA su errore
 * (così il chiamante — consumer — può marcare il job come 'error').
 */
function printLabel({ html, copies = 1, width = '62mm', height = '100mm' }) {
  if (!html) return Promise.reject(new Error('Campo "html" mancante.'));
  const tmpPdf = path.join(os.tmpdir(), `zerrillo-label-${Date.now()}-${Math.round(process.hrtime()[1])}.pdf`);
  const cleanup = () => { try { fs.unlinkSync(tmpPdf); } catch (_) {} };

  return (async () => {
    console.log(`📄 Generazione PDF ${width}×${height}…`);
    const browser = await getBrowser();
    const page = await browser.newPage();
    try {
      await page.setContent(html, { waitUntil: 'networkidle2', timeout: 15000 });
      await page.pdf({
        path: tmpPdf, width, height, printBackground: true,
        margin: { top: 0, right: 0, bottom: 0, left: 0 },
      });
    } finally {
      await page.close();
    }
    console.log('✅ PDF generato');

    const printer = BROTHER_PRINTER || await getBrotherPrinter();
    console.log(`🖨️  Invio a "${printer}" (${copies} cop.)…`);
    const cmd = [
      'lp', `-d "${printer}"`, `-n ${copies}`,
      `-o media=Custom.${String(width).replace('mm', '')}x${String(height).replace('mm', '')}mm`,
      '-o fit-to-page', '-o print-quality=5', `"${tmpPdf}"`,
    ].join(' ');

    await new Promise((resolve, reject) => {
      exec(cmd, (err, stdout, stderr) => {
        cleanup();
        if (err) return reject(new Error(stderr || err.message));
        console.log(`✅ Stampato: ${(stdout || '').trim()}`);
        resolve();
      });
    });
  })().catch(e => { cleanup(); throw e; });
}

module.exports = { printLabel, getBrowser, getBrotherPrinter, BROTHER_PRINTER };
