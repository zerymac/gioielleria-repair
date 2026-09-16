/* AUDIT — Area H (pagine pubbliche): token invalidi, conferma/disdetta, idempotenza, esposizione dati.
 * Dal 21/07/2026 (69dcb0a) le pagine parlano SOLO con le RPC get_repair_status / get_quote / respond_quote
 * (niente select=* né PATCH diretti). Il fetch è interamente mockato: NESSUNA chiamata al Supabase di produzione. */
import { waitFor } from "@testing-library/react";
const fs = require("fs");
const path = require("path");

function loadPage(file, search, fetchImpl) {
  const html = fs.readFileSync(path.join(__dirname, "../../docs", file), "utf8");
  const body = html.match(/<body>([\s\S]*?)<script>/)[1];
  const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
  window.history.replaceState(null, "", "/" + (search || ""));
  document.body.innerHTML = body;
  global.fetch = jest.fn(fetchImpl);
  // eslint-disable-next-line no-eval
  eval(script);
}

const json = (data) => Promise.resolve({ json: () => Promise.resolve(data) });

// Riga come la restituisce la RPC get_repair_status: SOLO colonne pubbliche
// (niente spesa, note, prezzo_finale, link_token). quote_token = preventivo pendente.
const statusRow = {
  numero: "R2026-0042", categoria: "Gioiello", tipo_lavoro: null, descrizione: "Anello oro", problema: "Maglia rotta",
  status: "presso_esterno", preventivo: 120, nota_preventivo: "Saldatura", richiesta_preventivo_fornitore: true,
  preventivo_accettato: false, preventivo_rifiutato: false, data_consegna: null, quote_token: "QT1",
};

/* Mock fetch stile RPC: registra ogni chiamata {fn, args} e risponde per funzione. */
function rpcMock(responders) {
  const calls = [];
  const impl = (url, opts) => {
    const m = String(url).match(/\/rest\/v1\/rpc\/([a-z_]+)$/);
    if (!m) throw new Error("chiamata NON-RPC verso " + url + " " + (opts && opts.method));
    const fn = m[1]; const args = JSON.parse(opts.body);
    calls.push({ fn, args, method: opts.method });
    const r = responders[fn];
    return json(typeof r === "function" ? r(args) : r === undefined ? [] : r);
  };
  return { impl, calls };
}

test("H1 — repair-status: senza token → 'Link non valido'; token inesistente → 'Riparazione non trovata'", async () => {
  loadPage("repair-status.html", "", () => json([]));
  await waitFor(() => expect(document.body.textContent).toMatch(/Link non valido/));

  const { impl, calls } = rpcMock({ get_repair_status: [] });
  loadPage("repair-status.html", "?token=inesistente", impl);
  await waitFor(() => expect(document.body.textContent).toMatch(/Riparazione non trovata/));
  expect(calls).toEqual([{ fn: "get_repair_status", args: { p_link_token: "inesistente" }, method: "POST" }]);
});

test("H1 — repair-status: preventivo in attesa → conferma chiama respond_quote(accept) con il quote_token della RPC", async () => {
  const { impl, calls } = rpcMock({ get_repair_status: [statusRow], respond_quote: "accepted" });
  loadPage("repair-status.html", "?token=LT1", impl);
  await waitFor(() => expect(document.getElementById("btnConfirm")).toBeTruthy());
  document.getElementById("btnConfirm").click();
  await waitFor(() => expect(calls).toHaveLength(2));

  expect(calls[0]).toEqual({ fn: "get_repair_status", args: { p_link_token: "LT1" }, method: "POST" });
  expect(calls[1]).toEqual({ fn: "respond_quote", args: { p_token: "QT1", p_decision: "accept" }, method: "POST" });
  expect(document.body.textContent).toMatch(/Preventivo confermato/);
});

test("FIX M10 — la decisione passa dalla RPC respond_quote (guardia server-side): la seconda sessione vede l'esito già scritto e non sovrascrive", async () => {
  // Sessione A ha già confermato: il server risponde already_accepted alla disdetta di B
  const { impl, calls } = rpcMock({ get_repair_status: [statusRow], respond_quote: "already_accepted" });
  loadPage("repair-status.html", "?token=LT1", impl);
  await waitFor(() => expect(document.getElementById("btnDecline")).toBeTruthy());
  document.getElementById("btnDecline").click();
  await waitFor(() => expect(calls).toHaveLength(2));
  expect(calls[1]).toEqual({ fn: "respond_quote", args: { p_token: "QT1", p_decision: "decline" }, method: "POST" });
  // nessun PATCH diretto e la pagina mostra lo stato reale (confermato), non la disdetta
  expect(calls.every((c) => c.method === "POST" && c.fn)).toBe(true);
  expect(document.body.textContent).toMatch(/Preventivo confermato/);
  expect(document.body.textContent).not.toMatch(/Preventivo disdetto/);
});

test("H2 — approve-quote: token già confermato → pagina idempotente in lettura, nessuna scrittura", async () => {
  const { impl, calls } = rpcMock({
    get_quote: [{ numero: "R2026-0042", descrizione: "Anello oro", preventivo: 120, nota_preventivo: "Saldatura", accepted_at: "2026-06-01T10:00:00Z", declined_at: null }],
  });
  loadPage("approve-quote.html", "?token=QT1", impl);
  await waitFor(() => expect(document.body.textContent).toMatch(/già confermato/));
  expect(calls).toEqual([{ fn: "get_quote", args: { p_token: "QT1" }, method: "POST" }]);
});

test("FIX C1/M8 — la pagina pubblica non chiede più select=* : legge solo la RPC e non mostra colonne interne", async () => {
  const gets = [];
  const { impl, calls } = rpcMock({ get_repair_status: [statusRow] });
  loadPage("repair-status.html", "?token=LT1", (url, opts) => { gets.push(String(url)); return impl(url, opts); });
  await waitFor(() => expect(document.body.textContent).toMatch(/R2026-0042/));
  expect(gets).toHaveLength(1);
  expect(gets[0]).not.toMatch(/select=/);
  expect(gets[0]).toMatch(/\/rest\/v1\/rpc\/get_repair_status$/);
  expect(calls[0].args).toEqual({ p_link_token: "LT1" });
  // il DOM contiene solo dati pubblici
  expect(document.body.textContent).toMatch(/Anello oro/);
  expect(document.body.textContent).not.toMatch(/richiamare|cliente difficile/);
});
