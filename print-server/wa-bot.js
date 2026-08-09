const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode               = require('qrcode');
const { createClient }     = require('@supabase/supabase-js');
const { exec }             = require('child_process');
const path                 = require('path');
const os                   = require('os');
const fs                   = require('fs');

const SHOP_NOME = 'Zerrillo preziosi S.r.l.';
const SHOP_TEL  = '019564570';

/* IDs riparazioni già processati — evita duplicati al riavvio */
const waSent        = new Set();
const waDeclineSent = new Set();

let waClient        = null;
let waReady         = false;
let realtimeStarted = false;
let reconcileTimer = null;

/* ── Delay casuale per evitare rilevamento spam da WhatsApp ── */
const waDelay = () => new Promise(r => setTimeout(r, 8000 + Math.random() * 7000));

/* ── Formatta numero telefono in formato WhatsApp (@c.us) ──
   Un numero gia' internazionale ('+' o '00') conserva il proprio prefisso paese;
   un numero nazionale nudo viene trattato come italiano (prefisso 39). */
function formatPhone(telefono) {
  const raw = (telefono || '').trim();
  if (!raw) return null;
  if (raw.startsWith('+')) {
    const d = raw.replace(/\D/g, '');
    return d ? d + '@c.us' : null;
  }
  if (raw.startsWith('00')) {
    const d = raw.slice(2).replace(/\D/g, '');
    return d ? d + '@c.us' : null;
  }
  const digits = raw.replace(/\D/g, '');
  if (!digits) return null;
  return '39' + digits + '@c.us';
}

/* ── Recupera riparazione da Supabase ── */
async function fetchRepair(supabase, repairId) {
  const { data } = await supabase.from('repairs').select('*').eq('id', repairId).single();
  return data;
}

/* ── Recupera riparatore dal DDT associato ── */
async function fetchRiparatore(supabase, repairId) {
  const { data: ddts } = await supabase
    .from('ddts')
    .select('*')
    .contains('riparazioni_ids', [repairId]);
  const rip = ddts?.[0]?.riparatore || null;
  if (!rip) return null;
  /* Lo snapshot DDT congela i dati al momento della creazione: se il telefono è stato
     aggiunto nel registro "repairers" più tardi, qui sarebbe vuoto. Fallback al registro. */
  if (!rip.telefono && rip.nome) {
    const { data: reg } = await supabase
      .from('repairers')
      .select('telefono')
      .eq('nome', rip.nome)
      .maybeSingle();
    if (reg?.telefono) return { ...rip, telefono: reg.telefono };
  }
  return rip;
}

/* ── Messaggi ── */
function buildAcceptMessage(repair, riparatore) {
  const lines = [
    `Gentile ${riparatore.nome},`,
    `il preventivo per la riparazione n° ${repair.numero} è stato accettato dal cliente.`,
    '',
    `Oggetto: ${repair.descrizione}`,
  ];
  if (repair.categoria) lines.push(`Categoria: ${repair.categoria}${repair.tipo_lavoro ? ' · ' + repair.tipo_lavoro : ''}`);
  if (repair.problema)       lines.push(`Lavoro richiesto: ${repair.problema}`);
  if (repair.nota_preventivo) lines.push(`Lavori da eseguire: ${repair.nota_preventivo}`);
  if (repair.preventivo) lines.push(`Preventivo al pubblico: ${repair.preventivo} €`);
  lines.push('', 'Può procedere con la riparazione.', '', SHOP_NOME, `Tel. ${SHOP_TEL}`);
  return lines.join('\n');
}

function buildDeclineRepairerMessage(repair, riparatore) {
  const lines = [
    `Gentile ${riparatore.nome},`,
    `il cliente ha rifiutato il preventivo per la riparazione n° ${repair.numero}.`,
    '',
    `Oggetto: ${repair.descrizione}`,
  ];
  if (repair.problema)        lines.push(`Lavoro richiesto: ${repair.problema}`);
  if (repair.nota_preventivo) lines.push(`Lavori da eseguire: ${repair.nota_preventivo}`);
  if (repair.preventivo) lines.push(`Preventivo al pubblico: ${repair.preventivo} €`);
  lines.push('', 'La preghiamo di non procedere e di restituire l\'oggetto.', '', SHOP_NOME, `Tel. ${SHOP_TEL}`);
  return lines.join('\n');
}

function buildAcceptShopMessage(repair) {
  const lines = [
    `Il cliente ha accettato il preventivo per la riparazione n° ${repair.numero}.`,
    '',
    `Oggetto: ${repair.descrizione}`,
  ];
  if (repair.problema)        lines.push(`Lavoro richiesto: ${repair.problema}`);
  if (repair.nota_preventivo) lines.push(`Lavori da eseguire: ${repair.nota_preventivo}`);
  if (repair.preventivo) lines.push(`Preventivo: ${repair.preventivo} €`);
  if (repair.cliente)    lines.push(`Cliente: ${repair.cliente}`);
  lines.push('', 'Può procedere con la riparazione.');
  return lines.join('\n');
}

function buildDeclineShopMessage(repair) {
  const lines = [
    `Il cliente ha rifiutato il preventivo per la riparazione n° ${repair.numero}.`,
    '',
    `Oggetto: ${repair.descrizione}`,
  ];
  if (repair.problema)        lines.push(`Lavoro richiesto: ${repair.problema}`);
  if (repair.nota_preventivo) lines.push(`Lavori da eseguire: ${repair.nota_preventivo}`);
  if (repair.preventivo) lines.push(`Preventivo: ${repair.preventivo} €`);
  if (repair.cliente)    lines.push(`Cliente: ${repair.cliente}`);
  lines.push('', 'Contattare il cliente per concordare il ritiro o ulteriori informazioni.');
  return lines.join('\n');
}

/* ── Marca in DB che il WA di accettazione è stato inviato (best-effort) ── */
async function markAcceptSent(supabase, repairId) {
  const { error } = await supabase.from('repairs').update({ wa_accept_sent_at: new Date().toISOString() }).eq('id', repairId);
  if (error && error.code !== 'PGRST204') console.warn(`⚠️  Impossibile marcare wa_accept_sent_at per ${repairId}:`, error.message);
}

/* ── Gestisce accettazione preventivo ── */
async function handleAccepted(supabase, repairId) {
  if (waSent.has(repairId)) return;
  waSent.add(repairId);

  try {
    const repair = await fetchRepair(supabase, repairId);
    if (!repair) return;

    if (repair.riparazione_interna) {
      await supabase.from('repairs').update({ status: 'lavorazione' }).eq('id', repairId);
      console.log(`✅ Stato → lavorazione per ${repair.numero} (interna)`);
      const shopTel = process.env.SHOP_WA_TEL;
      if (shopTel) {
        const shopPhone = formatPhone(shopTel);
        if (shopPhone) {
          await waDelay();
          await waClient.sendMessage(shopPhone, buildAcceptShopMessage(repair));
          console.log(`✅ WA accettazione inviato al negozio per ${repair.numero}`);
        }
      }
      await markAcceptSent(supabase, repairId);
      return;
    }

    const riparatore = await fetchRiparatore(supabase, repairId);
    if (riparatore?.telefono) {
      const phone = formatPhone(riparatore.telefono);
      if (phone) {
        await waDelay();
        await waClient.sendMessage(phone, buildAcceptMessage(repair, riparatore));
        console.log(`✅ WA accettazione inviato a ${riparatore.nome} per ${repair.numero}`);
      }
    } else {
      console.log(`ℹ️  Nessun telefono riparatore per ${repair.numero}`);
    }

    const shopTel = process.env.SHOP_WA_TEL;
    if (shopTel) {
      const shopPhone = formatPhone(shopTel);
      if (shopPhone) {
        await waDelay();
        await waClient.sendMessage(shopPhone, buildAcceptShopMessage(repair));
        console.log(`✅ WA accettazione inviato al negozio per ${repair.numero} (esterna)`);
      }
    }

    await markAcceptSent(supabase, repairId);

  } catch (e) {
    waSent.delete(repairId);
    console.error(`❌ Errore WA accettazione per ${repairId}:`, e.message);
  }
}

/* ── Marca in DB che il WA di disdetta è stato inviato (best-effort) ── */
async function markDeclineSent(supabase, repairId) {
  const { error } = await supabase.from('repairs').update({ wa_decline_sent_at: new Date().toISOString() }).eq('id', repairId);
  if (error && error.code !== 'PGRST204') console.warn(`⚠️  Impossibile marcare wa_decline_sent_at per ${repairId}:`, error.message);
}

/* ── Gestisce rifiuto preventivo ── */
async function handleDeclined(supabase, repairId) {
  if (waDeclineSent.has(repairId)) return;
  waDeclineSent.add(repairId);

  try {
    const repair = await fetchRepair(supabase, repairId);
    if (!repair) return;

    await supabase.from('repairs').update({ status: 'reso_non_riparato' }).eq('id', repairId);
    console.log(`✅ Stato → reso_non_riparato per ${repair.numero}`);

    if (repair.riparazione_interna) {
      const shopTel = process.env.SHOP_WA_TEL;
      if (shopTel) {
        const shopPhone = formatPhone(shopTel);
        if (shopPhone) {
          await waDelay();
          await waClient.sendMessage(shopPhone, buildDeclineShopMessage(repair));
          console.log(`✅ WA disdetta inviato al negozio per ${repair.numero}`);
        }
      } else {
        console.log(`⚠️  SHOP_WA_TEL non configurato — WA negozio non inviato`);
      }
    } else {
      const riparatore = await fetchRiparatore(supabase, repairId);
      if (riparatore?.telefono) {
        const phone = formatPhone(riparatore.telefono);
        if (phone) {
          await waDelay();
          await waClient.sendMessage(phone, buildDeclineRepairerMessage(repair, riparatore));
          console.log(`✅ WA disdetta inviato a ${riparatore.nome} per ${repair.numero}`);
        }
      }
      const shopTel = process.env.SHOP_WA_TEL;
      if (shopTel) {
        const shopPhone = formatPhone(shopTel);
        if (shopPhone) {
          await waDelay();
          await waClient.sendMessage(shopPhone, buildDeclineShopMessage(repair));
          console.log(`✅ WA disdetta inviato al negozio per ${repair.numero} (esterna)`);
        }
      }
    }

    await markDeclineSent(supabase, repairId);

  } catch (e) {
    waDeclineSent.delete(repairId);
    console.error(`❌ Errore WA disdetta per ${repairId}:`, e.message);
  }
}

/* ── Supabase Realtime: ascolta cambi su repairs ── */
async function startRealtimeSubscription(supabase) {
  /* Pre-popola i set con quelli GIÀ notificati (wa_*_sent_at valorizzato).
     I `preventivo_accettato=true` senza timestamp WA sono pending → recuperati sotto. */
  const { data: existing } = await supabase
    .from('repairs')
    .select('id')
    .not('wa_accept_sent_at', 'is', null)
    .eq('eliminata', false);
  if (existing) existing.forEach(r => waSent.add(r.id));

  const { data: declined } = await supabase
    .from('repairs')
    .select('id')
    .not('wa_decline_sent_at', 'is', null)
    .eq('eliminata', false);
  if (declined) declined.forEach(r => waDeclineSent.add(r.id));

  console.log(`📋 ${waSent.size} accettati, ${waDeclineSent.size} disdettati — già notificati`);

  supabase
    .channel('wa-preventivi')
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'repairs' }, async payload => {
      const rep = payload.new;
      if (rep?.preventivo_accettato && !waSent.has(rep.id)) {
        console.log(`🔔 Preventivo accettato: ${rep.numero}`);
        await handleAccepted(supabase, rep.id);
      }
      if (rep?.preventivo_rifiutato && !waDeclineSent.has(rep.id)) {
        console.log(`🔔 Preventivo rifiutato: ${rep.numero}`);
        await handleDeclined(supabase, rep.id);
      }
    })
    .subscribe(status => {
      if (status === 'SUBSCRIBED') console.log('📡 Supabase Realtime attivo — in ascolto preventivi');
      else console.warn(`⚠️  Realtime status: ${status} — riconciliazione periodica come rete di sicurezza`);
    });

  /* Reconciliation: preventivi accettati/rifiutati mentre il bot era down.
     Query per accettato_true + wa_accept_sent_at IS NULL → li processa uno a uno. */
  await reconcilePending(supabase);

  /* Consumer della coda wa_jobs (bulk WA accodati dal frontend Netlify) */
  startWaJobsConsumer(supabase);

  /* Rete di sicurezza: il WebSocket Realtime può cadere in silenzio senza riconnettersi
     (eventi persi finché non si riavvia). Ogni 5 min ri-scansiona i pendenti e li recupera.
     handleAccepted/handleDeclined sono idempotenti (Set waSent + wa_*_sent_at), niente doppioni. */
  if (!reconcileTimer) {
    reconcileTimer = setInterval(() => {
      reconcilePending(supabase).catch(e => console.warn('⚠️  Reconcile periodico fallito:', e.message));
      reconcileWaJobs(supabase).catch(e => console.warn('⚠️  Reconcile wa_jobs fallito:', e.message));
    }, 5 * 60 * 1000);
  }
}

/* ── Consumer coda wa_jobs ──────────────────────────────────────────
   Il frontend fa INSERT in wa_jobs; qui si invia con sendBulkWA (delay anti-ban)
   e si marca lo stato. Idempotenza: claim condizionale pending -> sending. */
const waJobsInFlight = new Set();

async function processWaJob(supabase, job) {
  if (!job || !job.id) return;
  if (job.status && job.status !== 'pending') return;
  if (waJobsInFlight.has(job.id)) return;
  waJobsInFlight.add(job.id);
  try {
    await supabase.from('wa_jobs').update({ status: 'sending' }).eq('id', job.id).eq('status', 'pending');
    const res = await sendBulkWA([{ telefono: job.telefono, messaggio: job.messaggio }]);
    if (res && res.sent >= 1) {
      await supabase.from('wa_jobs').update({ status: 'done', sent_at: new Date().toISOString() }).eq('id', job.id);
      console.log(`✅ wa_job ${job.id} inviato`);
    } else {
      await supabase.from('wa_jobs').update({ status: 'error', error: 'invio fallito' }).eq('id', job.id);
      console.warn(`⚠️  wa_job ${job.id} non inviato`);
    }
  } catch (e) {
    await supabase.from('wa_jobs').update({ status: 'error', error: (e && e.message) || String(e) }).eq('id', job.id);
    console.error(`❌ wa_job ${job.id} errore:`, e.message);
  } finally {
    waJobsInFlight.delete(job.id);
  }
}

async function reconcileWaJobs(supabase) {
  const { data } = await supabase
    .from('wa_jobs').select('*')
    .eq('status', 'pending').order('created_at', { ascending: true });
  if (data && data.length) {
    console.log(`🔁 ${data.length} wa_jobs in sospeso — invio ora`);
    for (const job of data) await processWaJob(supabase, job);
  }
}

function startWaJobsConsumer(supabase) {
  supabase
    .channel('wa-jobs')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'wa_jobs' },
      payload => { processWaJob(supabase, payload.new).catch(e => console.error('processWaJob:', e.message)); })
    .subscribe(status => {
      if (status === 'SUBSCRIBED') console.log('📡 Realtime wa_jobs attivo');
    });
  reconcileWaJobs(supabase).catch(e => console.warn('reconcile wa_jobs iniziale:', e.message));
}

async function reconcilePending(supabase) {
  try {
    const { data: pendingAccept } = await supabase
      .from('repairs')
      .select('id, numero')
      .eq('preventivo_accettato', true)
      .is('wa_accept_sent_at', null)
      .eq('eliminata', false);
    if (pendingAccept?.length) {
      console.log(`🔁 ${pendingAccept.length} preventivi accettati in sospeso — invio ora`);
      for (const r of pendingAccept) {
        console.log(`🔔 Recupero accettazione: ${r.numero}`);
        await handleAccepted(supabase, r.id);
      }
    }

    const { data: pendingDecline } = await supabase
      .from('repairs')
      .select('id, numero')
      .eq('preventivo_rifiutato', true)
      .is('wa_decline_sent_at', null)
      .eq('eliminata', false);
    if (pendingDecline?.length) {
      console.log(`🔁 ${pendingDecline.length} preventivi rifiutati in sospeso — invio ora`);
      for (const r of pendingDecline) {
        console.log(`🔔 Recupero disdetta: ${r.numero}`);
        await handleDeclined(supabase, r.id);
      }
    }
  } catch (e) {
    console.error('❌ Errore reconcile pending:', e.message);
  }
}

/* ── Inizializza il client WhatsApp ── */
function initWABot() {
  const supabaseUrl = process.env.REACT_APP_SUPABASE_URL;
  const supabaseKey = process.env.REACT_APP_SUPABASE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.warn('⚠️  Credenziali Supabase mancanti nel .env — WA bot disabilitato');
    return;
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  waClient = new Client({
    authStrategy: new LocalAuth({ dataPath: path.join(__dirname, '.wwebjs_auth') }),
    puppeteer: { headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'], timeout: 120000 },
  });

  waClient.on('qr', async qr => {
    const qrPath = path.join(os.tmpdir(), 'zerrillo-wa-qr.png');
    try {
      await qrcode.toFile(qrPath, qr, { width: 400, margin: 2 });
      exec(`open "${qrPath}"`);
      console.log(`\n📱 QR aperto automaticamente — scansionalo con WhatsApp sul telefono`);
      console.log(`   (il QR scade in ~60 secondi — riavvia il server se non fai in tempo)\n`);
    } catch (e) {
      console.log('\n📱 Scansiona il QR — apri questo file:', qrPath);
    }
  });

  waClient.on('authenticated', () => console.log('🔐 WhatsApp autenticato'));

  waClient.on('ready', async () => {
    console.log('✅ WhatsApp connesso e pronto');
    waReady = true;
    if (!realtimeStarted) {
      realtimeStarted = true;
      await startRealtimeSubscription(supabase);
    }
  });

  waClient.on('auth_failure', msg => {
    console.error('❌ WhatsApp autenticazione fallita:', msg);
    waReady = false;
  });

  waClient.on('disconnected', reason => {
    console.warn('⚠️  WhatsApp disconnesso:', reason);
    console.warn('   Riavvia il server per riconnetterti');
    waReady = false;
  });

  console.log('🔄 Avvio WhatsApp Web client…');
  waClient.initialize();
}

/* ── Invio massivo con delay ── */
async function sendBulkWA(messages) {
  if (!waReady || !waClient) {
    console.warn('⚠️  WA non pronto — invio bulk annullato');
    return { sent: 0, failed: messages.length };
  }
  let sent = 0, failed = 0;
  for (const { telefono, messaggio } of messages) {
    const phone = formatPhone(telefono);
    if (!phone) { failed++; continue; }
    try {
      await waDelay();
      await waClient.sendMessage(phone, messaggio);
      console.log(`✅ WA bulk inviato a ${telefono}`);
      sent++;
    } catch (e) {
      console.error(`❌ WA bulk errore per ${telefono}:`, e.message);
      failed++;
    }
  }
  console.log(`📊 WA bulk completato: ${sent} inviati, ${failed} falliti`);
  return { sent, failed };
}

module.exports = { initWABot, isWAReady: () => waReady, sendBulkWA, startWaJobsConsumer, processWaJob, reconcileWaJobs };
