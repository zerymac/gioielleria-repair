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

/* ── Formatta numero telefono in formato WhatsApp (@c.us) ── */
function formatPhone(telefono) {
  const digits = (telefono || '').replace(/\D/g, '');
  if (!digits) return null;
  const withPrefix = digits.startsWith('39') ? digits : '39' + digits;
  return withPrefix + '@c.us';
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
  return ddts?.[0]?.riparatore || null;
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
  if (repair.problema)   lines.push(`Lavoro: ${repair.problema}`);
  if (repair.preventivo) lines.push(`Preventivo: ${repair.preventivo} €`);
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
  if (repair.problema)   lines.push(`Lavoro: ${repair.problema}`);
  if (repair.preventivo) lines.push(`Preventivo: ${repair.preventivo} €`);
  lines.push('', 'La preghiamo di non procedere e di restituire l\'oggetto.', '', SHOP_NOME, `Tel. ${SHOP_TEL}`);
  return lines.join('\n');
}

function buildDeclineShopMessage(repair) {
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
      return;
    }

    const riparatore = await fetchRiparatore(supabase, repairId);
    if (!riparatore?.telefono) {
      console.log(`ℹ️  Nessun telefono riparatore per ${repair.numero} — WA non inviato`);
      return;
    }

    const phone = formatPhone(riparatore.telefono);
    if (!phone) return;

    await waClient.sendMessage(phone, buildAcceptMessage(repair, riparatore));
    console.log(`✅ WA accettazione inviato a ${riparatore.nome} per ${repair.numero}`);

  } catch (e) {
    waSent.delete(repairId);
    console.error(`❌ Errore WA accettazione per ${repairId}:`, e.message);
  }
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

    const shopTel = process.env.SHOP_WA_TEL;
    if (shopTel) {
      const shopPhone = formatPhone(shopTel);
      if (shopPhone) {
        await waClient.sendMessage(shopPhone, buildDeclineShopMessage(repair));
        console.log(`✅ WA disdetta inviato al negozio per ${repair.numero}`);
      }
    } else {
      console.log(`⚠️  SHOP_WA_TEL non configurato — WA negozio non inviato`);
    }

    if (!repair.riparazione_interna) {
      const riparatore = await fetchRiparatore(supabase, repairId);
      if (riparatore?.telefono) {
        const phone = formatPhone(riparatore.telefono);
        if (phone) {
          await waClient.sendMessage(phone, buildDeclineRepairerMessage(repair, riparatore));
          console.log(`✅ WA disdetta inviato a ${riparatore.nome} per ${repair.numero}`);
        }
      }
    }

  } catch (e) {
    waDeclineSent.delete(repairId);
    console.error(`❌ Errore WA disdetta per ${repairId}:`, e.message);
  }
}

/* ── Supabase Realtime: ascolta cambi su repairs ── */
async function startRealtimeSubscription(supabase) {
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

  console.log(`📋 ${waSent.size} accettati, ${waDeclineSent.size} disdettati — ignorati al riavvio`);

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
