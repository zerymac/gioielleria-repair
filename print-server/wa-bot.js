const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode               = require('qrcode');
const { createClient }     = require('@supabase/supabase-js');
const { exec }             = require('child_process');
const path                 = require('path');
const os                   = require('os');
const fs                   = require('fs');

const SHOP_NOME = 'Zerrillo preziosi S.r.l.';
const SHOP_TEL  = '019564570';

/* IDs riparazioni per cui il WA è già stato inviato — evita duplicati al riavvio */
const waSent        = new Set();
const waDeclineSent = new Set();

let waClient        = null;
let waReady         = false;
let realtimeStarted = false;

/* ── Formatta numero telefono in formato WhatsApp (@c.us) ── */
function formatPhone(telefono) {
  const digits = (telefono || '').replace(/\D/g, '');
  if (!digits) return null;
  const withPrefix = digits.startsWith('39') ? digits : '39' + digits;
  return withPrefix + '@c.us';
}

/* ── Costruisce il messaggio per il riparatore ── */
function buildMessage(repair, riparatore) {
  const lines = [
    `Gentile ${riparatore.nome},`,
    `il preventivo per la riparazione n° ${repair.numero} è stato accettato dal cliente.`,
    '',
    `Oggetto: ${repair.descrizione}`,
  ];
  if (repair.categoria) {
    lines.push(`Categoria: ${repair.categoria}${repair.tipo_lavoro ? ' · ' + repair.tipo_lavoro : ''}`);
  }
  if (repair.problema)   lines.push(`Lavoro: ${repair.problema}`);
  if (repair.preventivo) lines.push(`Preventivo: ${repair.preventivo} €`);
  lines.push('', 'Può procedere con la riparazione.', '', SHOP_NOME, `Tel. ${SHOP_TEL}`);
  return lines.join('\n');
}

/* ── Invia WA al riparatore per una singola riparazione ── */
async function sendPreventivoWA(supabase, repairId) {
  if (waSent.has(repairId)) return;
  waSent.add(repairId); /* segna subito per evitare doppio invio */

  try {
    const { data: repair } = await supabase
      .from('repairs')
      .select('*')
      .eq('id', repairId)
      .single();
    if (!repair) return;

    const { data: ddts } = await supabase
      .from('ddts')
      .select('*')
      .contains('riparazioni_ids', [repairId]);

    const riparatore = ddts?.[0]?.riparatore;
    if (!riparatore?.telefono) {
      console.log(`ℹ️  Nessun telefono riparatore per ${repair.numero} — WA non inviato`);
      return;
    }

    const phone = formatPhone(riparatore.telefono);
    if (!phone) return;

    const msg = buildMessage(repair, riparatore);
    await waClient.sendMessage(phone, msg);
    console.log(`✅ WA inviato a ${riparatore.nome} per ${repair.numero}`);

  } catch (e) {
    waSent.delete(repairId); /* permetti retry al prossimo aggiornamento */
    console.error(`❌ Errore invio WA per riparazione ${repairId}:`, e.message);
  }
}

/* ── Costruisce il messaggio di disdetta per il negozio ── */
function buildDeclineMessage(repair) {
  const lines = [
    `Il cliente ha rifiutato il preventivo per la riparazione n° ${repair.numero}.`,
    '',
    `Oggetto: ${repair.descrizione}`,
  ];
  if (repair.problema)   lines.push(`Lavoro: ${repair.problema}`);
  if (repair.preventivo) lines.push(`Preventivo: ${repair.preventivo} €`);
  if (repair.cliente)    lines.push(`Cliente: ${repair.cliente}`);
  lines.push('', 'Contattare il cliente per concordare il ritiro o ulteriori informazioni.');
  return lines.join('\n');
}

/* ── Invia WA al negozio quando un cliente rifiuta il preventivo ── */
async function sendDeclineWA(supabase, repairId) {
  if (waDeclineSent.has(repairId)) return;
  waDeclineSent.add(repairId);

  try {
    const { data: repair } = await supabase
      .from('repairs')
      .select('*')
      .eq('id', repairId)
      .single();
    if (!repair) return;

    const shopTel = process.env.SHOP_WA_TEL;
    if (!shopTel) {
      console.log(`⚠️  SHOP_WA_TEL non configurato nel .env — notifica disdetta non inviata`);
      return;
    }

    const phone = formatPhone(shopTel);
    if (!phone) return;

    const msg = buildDeclineMessage(repair);
    await waClient.sendMessage(phone, msg);
    console.log(`✅ WA disdetta inviato al negozio per ${repair.numero}`);

  } catch (e) {
    waDeclineSent.delete(repairId);
    console.error(`❌ Errore invio WA disdetta per ${repairId}:`, e.message);
  }
}

/* ── Supabase Realtime: ascolta cambi preventivo_accettato e preventivo_rifiutato ── */
async function startRealtimeSubscription(supabase) {
  /* Pre-carica IDs già accettati e disdettati: evita reinvii al riavvio */
  const { data: existing } = await supabase
    .from('repairs')
    .select('id')
    .eq('preventivo_accettato', true)
    .eq('eliminata', false);
  if (existing) existing.forEach(r => waSent.add(r.id));

  const { data: declined } = await supabase
    .from('repairs')
    .select('id')
    .eq('preventivo_rifiutato', true)
    .eq('eliminata', false);
  if (declined) declined.forEach(r => waDeclineSent.add(r.id));

  console.log(`📋 ${waSent.size} preventivi accettati, ${waDeclineSent.size} disdettati — ignorati al riavvio`);

  supabase
    .channel('wa-preventivi')
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'repairs' }, async payload => {
      const rep = payload.new;
      if (rep?.preventivo_accettato && !waSent.has(rep.id)) {
        console.log(`🔔 Preventivo accettato: ${rep.numero}`);
        await sendPreventivoWA(supabase, rep.id);
      }
      if (rep?.preventivo_rifiutato && !waDeclineSent.has(rep.id)) {
        console.log(`🔔 Preventivo rifiutato: ${rep.numero}`);
        await sendDeclineWA(supabase, rep.id);
      }
    })
    .subscribe(status => {
      if (status === 'SUBSCRIBED') {
        console.log('📡 Supabase Realtime attivo — in ascolto preventivi');
      }
    });
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
    puppeteer: { headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] },
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

module.exports = { initWABot, isWAReady: () => waReady };
