/**
 * Nucleo della Function AI dell'app riparazioni.
 * Usato da netlify/functions/ai.js (produzione) e da src/setupProxy.js (npm start).
 *
 * La chiave Anthropic vive SOLO qui, lato server (env ANTHROPIC_API_KEY su
 * Netlify; in dev anche REACT_APP_ANTHROPIC_KEY dal .env, per compatibilità).
 * La chiamata è consentita solo a un operatore loggato: il browser manda il
 * token di sessione Supabase e qui lo verifichiamo prima di spendere un token.
 */
const Anthropic = require('@anthropic-ai/sdk');
const { createClient } = require('@supabase/supabase-js');

const MODEL = 'claude-opus-5';

function env(...names) {
  for (const n of names) if (process.env[n]) return process.env[n];
  return '';
}

/* Verifica il JWT Supabase dell'operatore. Ritorna l'utente o null. */
async function verifyUser(authHeader) {
  const token = (authHeader || '').replace(/^Bearer\s+/i, '').trim();
  if (!token) return null;
  const url = env('SUPABASE_URL', 'REACT_APP_SUPABASE_URL');
  const key = env('SUPABASE_ANON_KEY', 'REACT_APP_SUPABASE_KEY');
  if (!url || !key) return null;
  const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await sb.auth.getUser(token);
  if (error || !data?.user) return null;
  return data.user;
}

/* Esegue la richiesta AI. Ritorna { text } oppure lancia. */
async function runAi({ prompt, b64 = null, mt = 'image/jpeg' }) {
  if (!prompt || typeof prompt !== 'string') throw new Error('prompt mancante');
  const apiKey = env('ANTHROPIC_API_KEY', 'REACT_APP_ANTHROPIC_KEY');
  if (!apiKey || apiKey === 'placeholder') return { text: '' };

  const client = new Anthropic({ apiKey });
  const content = b64
    ? [{ type: 'image', source: { type: 'base64', media_type: mt || 'image/jpeg', data: b64 } }, { type: 'text', text: prompt }]
    : prompt;

  /* fallbacks: "default" — se il modello rifiuta per policy, l'API riprova
     da sola su un modello di ripiego nella stessa chiamata. */
  const msg = await client.beta.messages.create({
    model: MODEL,
    max_tokens: 2048,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    messages: [{ role: 'user', content }],
  });
  if (msg.stop_reason === 'refusal') return { text: '' };
  const text = (msg.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
  return { text };
}

/* Handler HTTP comune: { status, body } */
async function handle({ method, authorization, bodyText }) {
  if (method === 'OPTIONS') return { status: 204, body: '' };
  if (method !== 'POST') return { status: 405, body: JSON.stringify({ error: 'POST richiesto' }) };
  const user = await verifyUser(authorization);
  if (!user) return { status: 401, body: JSON.stringify({ error: 'Accesso non autorizzato' }) };
  let payload;
  try { payload = JSON.parse(bodyText || '{}'); } catch { return { status: 400, body: JSON.stringify({ error: 'JSON non valido' }) }; }
  try {
    const out = await runAi(payload);
    return { status: 200, body: JSON.stringify(out) };
  } catch (e) {
    console.error('[ai] errore:', e.message);
    return { status: 502, body: JSON.stringify({ error: e.message }) };
  }
}

module.exports = { handle, runAi, verifyUser, MODEL };
