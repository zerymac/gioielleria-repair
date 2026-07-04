import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const SHOP_NOME = 'Zerrillo preziosi S.r.l.'
const SHOP_CITTA = '17017 Millesimo (SV)'
const SHOP_TEL  = '019564570'

Deno.serve(async (req) => {
  const url    = new URL(req.url)
  const token  = url.searchParams.get('token')
  const azione = url.searchParams.get('azione') // 'rifiuta' o assente (=conferma)

  if (!token) return page('Link non valido.', 'Errore')

  const sb = createClient(SUPABASE_URL, SERVICE_KEY)

  const { data: tk } = await sb
    .from('quote_tokens')
    .select('*')
    .eq('token', token)
    .maybeSingle()

  if (!tk) return page('Link non valido o scaduto.', 'Errore')

  const { data: r } = await sb
    .from('repairs')
    .select('*')
    .eq('id', tk.repair_id)
    .maybeSingle()

  if (!r) return page('Riparazione non trovata.', 'Errore')

  if (tk.accepted_at) {
    return page(`
      <div class="icon">&#10003;</div>
      <h2>Preventivo gi&agrave; confermato</h2>
      <p>Il preventivo per la riparazione <strong>${r.numero}</strong> &egrave; gi&agrave; stato confermato in precedenza.</p>
      <p class="contact">Per informazioni: <a href="tel:${SHOP_TEL}">${SHOP_TEL}</a></p>
      <p class="shop">${SHOP_NOME} &middot; ${SHOP_CITTA}</p>
    `, 'Gia confermato')
  }

  if (tk.declined_at) {
    return page(`
      <div class="icon" style="color:#DC2626">&#10007;</div>
      <h2>Preventivo gi&agrave; disdetto</h2>
      <p>Il preventivo per la riparazione <strong>${r.numero}</strong> &egrave; gi&agrave; stato disdetto in precedenza.</p>
      <p class="contact">Per informazioni: <a href="tel:${SHOP_TEL}">${SHOP_TEL}</a></p>
      <p class="shop">${SHOP_NOME} &middot; ${SHOP_CITTA}</p>
    `, 'Gia disdetto')
  }

  if (req.method === 'POST') {
    if (azione === 'rifiuta') {
      await sb.from('quote_tokens').update({ declined_at: new Date().toISOString() }).eq('token', token)
      await sb.from('repairs').update({ preventivo_rifiutato: true }).eq('id', r.id)

      return page(`
        <div class="icon" style="color:#DC2626">&#10007;</div>
        <h2>Preventivo disdetto</h2>
        <p>Abbiamo ricevuto la sua disdetta per la riparazione <strong>${r.numero}</strong>.</p>
        <p>La contatteremo per concordare il ritiro o ulteriori informazioni.</p>
        <p class="contact">Per informazioni: <a href="tel:${SHOP_TEL}">${SHOP_TEL}</a></p>
        <p class="shop">${SHOP_NOME} &middot; ${SHOP_CITTA}</p>
      `, 'Preventivo disdetto')
    }

    await sb.from('quote_tokens').update({ accepted_at: new Date().toISOString() }).eq('token', token)
    await sb.from('repairs').update({ preventivo_accettato: true }).eq('id', r.id)

    return page(`
      <div class="icon">&#10003;</div>
      <h2>Preventivo confermato!</h2>
      <p>Grazie. Il preventivo di <strong>&euro; ${r.preventivo}</strong> per la riparazione <strong>${r.numero}</strong> &egrave; stato confermato.</p>
      <p>La contatteremo non appena il lavoro sar&agrave; completato.</p>
      <p class="contact">Per informazioni: <a href="tel:${SHOP_TEL}">${SHOP_TEL}</a></p>
      <p class="shop">${SHOP_NOME} &middot; ${SHOP_CITTA}</p>
    `, 'Confermato')
  }

  return page(`
    <h2>Conferma preventivo</h2>
    <div class="info">
      <div class="row"><span>Riparazione</span><strong>${r.numero}</strong></div>
      <div class="row"><span>Oggetto</span><strong>${r.descrizione}</strong></div>
      ${r.problema ? `<div class="row"><span>Lavoro</span><strong>${r.problema}</strong></div>` : ''}
      <div class="row price"><span>Importo preventivo</span><strong>&euro; ${r.preventivo}</strong></div>
    </div>
    <form method="POST">
      <button type="submit" class="btn-confirm">Confermo il preventivo</button>
    </form>
    <form method="POST" action="?token=${token}&azione=rifiuta">
      <button type="submit" class="btn-decline">Rifiuto il preventivo</button>
    </form>
    <p class="contact">Per informazioni: <a href="tel:${SHOP_TEL}">${SHOP_TEL}</a></p>
    <p class="shop">${SHOP_NOME} &middot; ${SHOP_CITTA}</p>
  `, 'Conferma preventivo')
})

function page(body: string, title: string) {
  return new Response(`<!DOCTYPE html>
<html lang="it">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title} &mdash; Zerrillo Preziosi</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,sans-serif;background:#F2F2F7;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px}
.card{background:white;border-radius:20px;padding:32px 24px;max-width:420px;width:100%;box-shadow:0 4px 20px rgba(0,0,0,.1)}
.icon{font-size:52px;text-align:center;margin-bottom:16px;color:#059669}
h2{font-size:22px;font-weight:700;color:#1C1C1E;margin-bottom:20px;text-align:center}
.info{background:#F2F2F7;border-radius:14px;padding:16px;margin-bottom:24px}
.row{display:flex;justify-content:space-between;align-items:flex-start;padding:10px 0;border-bottom:1px solid #E5E5EA;gap:12px}
.row:last-child{border-bottom:none}
.row span{font-size:14px;color:#6B6B6B;flex-shrink:0}
.row strong{font-size:14px;color:#1C1C1E;text-align:right}
.row.price strong{font-size:22px;font-weight:800;color:#059669}
.btn-confirm{width:100%;background:#059669;color:white;border:none;border-radius:14px;padding:16px;font-size:17px;font-weight:700;cursor:pointer;margin-top:4px}
.btn-decline{width:100%;background:white;color:#DC2626;border:2px solid #DC2626;border-radius:14px;padding:14px;font-size:15px;font-weight:600;cursor:pointer;margin-top:12px}
p{margin-top:16px;font-size:14px;color:#3C3C3C;text-align:center;line-height:1.6}
.contact a{color:#007AFF;text-decoration:none}
.shop{font-size:12px;color:#9B9B9B;margin-top:6px}
</style>
</head>
<body><div class="card">${body}</div></body>
</html>`, { headers: { 'content-type': 'text/html;charset=UTF-8' } })
}
