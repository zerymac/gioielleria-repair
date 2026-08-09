/**
 * print-consumer.js — consumer della coda `print_jobs` su Supabase.
 *
 * Stesso pattern di wa-bot.js: subscribe Realtime + reconcile all'avvio + reconcile
 * periodico (rete di sicurezza se il WebSocket cade) + idempotenza via `status`.
 * Il frontend (Netlify) fa INSERT in `print_jobs`; qui si rende PDF e si stampa.
 *
 * `printLabel` è iniettabile per i test (nessun Puppeteer/lp reale).
 */
const nowIso = () => new Date().toISOString();

async function claim(supabase, id) {
  // Passaggio pending -> printing condizionale: evita doppioni tra Realtime e reconcile.
  await supabase.from('print_jobs').update({ status: 'printing' }).eq('id', id).eq('status', 'pending');
}

function startPrintConsumer(supabase, opts = {}) {
  // require lazy: evita di caricare puppeteer quando printLabel è iniettato (test)
  const printLabel = opts.printLabel || require('./print-label').printLabel;
  const pollMs = opts.pollMs != null ? opts.pollMs : 5 * 60 * 1000;
  const inFlight = new Set();

  async function processJob(job) {
    if (!job || !job.id) return;
    if (job.status && job.status !== 'pending') return; // già preso/finito
    if (inFlight.has(job.id)) return;
    inFlight.add(job.id);
    try {
      await claim(supabase, job.id);
      await printLabel({
        html: job.html,
        copies: job.copies || 1,
        width: job.width || '62mm',
        height: job.height || '100mm',
      });
      await supabase.from('print_jobs').update({ status: 'done', printed_at: nowIso() }).eq('id', job.id);
      console.log(`✅ print_job ${job.id} stampato`);
    } catch (e) {
      const msg = (e && e.message) || String(e);
      await supabase.from('print_jobs').update({ status: 'error', error: msg }).eq('id', job.id);
      console.error(`❌ print_job ${job.id} errore:`, msg);
    } finally {
      inFlight.delete(job.id);
    }
  }

  async function reconcile() {
    try {
      const { data } = await supabase
        .from('print_jobs').select('*')
        .eq('status', 'pending').order('created_at', { ascending: true });
      if (data && data.length) {
        console.log(`🔁 ${data.length} print_jobs in sospeso — stampo ora`);
        for (const job of data) await processJob(job);
      }
    } catch (e) {
      console.error('❌ reconcile print_jobs fallito:', e.message);
    }
  }

  supabase
    .channel('print-jobs')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'print_jobs' },
      payload => { processJob(payload.new).catch(e => console.error('processJob:', e.message)); })
    .subscribe(status => {
      if (status === 'SUBSCRIBED') console.log('📡 Realtime print_jobs attivo');
      else console.warn(`⚠️  Realtime print_jobs: ${status} — reconcile periodico come rete di sicurezza`);
    });

  if (opts.autoReconcile !== false) reconcile();

  let timer = null;
  if (pollMs > 0) {
    timer = setInterval(() => reconcile().catch(e => console.warn('reconcile print periodico:', e.message)), pollMs);
    if (timer.unref) timer.unref();
  }

  return { processJob, reconcile, stop: () => timer && clearInterval(timer) };
}

module.exports = { startPrintConsumer };
