/* AUDIT — Area H (pagine pubbliche GitHub Pages): token invalidi, conferma/disdetta, idempotenza, esposizione dati.
 * Il fetch è interamente mockato: NESSUNA chiamata al Supabase di produzione. */
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

const repairRow = {
  id: "r1", numero: "R2026-0042", descrizione: "Anello oro", categoria: "Gioiello", problema: "Maglia rotta",
  preventivo: 120, richiesta_preventivo_fornitore: true, preventivo_accettato: false, preventivo_rifiutato: false,
  status: "presso_esterno", eliminata: false, nota_preventivo: "Saldatura",
  // colonne interne che NON dovrebbero servire al cliente:
  spesa: 40, note: "cliente difficile, richiamare", prezzo_finale: null,
};

test("H1 — repair-status: senza token → 'Link non valido'; token inesistente → 'Riparazione non trovata'", async () => {
  loadPage("repair-status.html", "", () => json([]));
  await waitFor(() => expect(document.body.textContent).toMatch(/Link non valido/));

  loadPage("repair-status.html", "?token=inesistente", () => json([]));
  await waitFor(() => expect(document.body.textContent).toMatch(/Riparazione non trovata/));
});

test("H1 — repair-status: preventivo in attesa → conferma esegue i 2 PATCH attesi (token + flag riparazione)", async () => {
  const patches = [];
  loadPage("repair-status.html", "?token=LT1", (url, opts) => {
    if (opts && opts.method === "PATCH") { patches.push({ url, body: JSON.parse(opts.body) }); return json({}); }
    if (String(url).includes("/repairs?")) return json([repairRow]);
    if (String(url).includes("/quote_tokens?")) return json([{ token: "QT1" }]);
    return json([]);
  });
  await waitFor(() => expect(document.getElementById("btnConfirm")).toBeTruthy());
  document.getElementById("btnConfirm").click();
  await waitFor(() => expect(patches).toHaveLength(2));

  expect(patches[0].url).toMatch(/quote_tokens\?token=eq\.QT1/);
  expect(patches[0].body.accepted_at).toBeTruthy();
  expect(patches[1].url).toMatch(/repairs\?id=eq\.r1/);
  expect(patches[1].body).toEqual({ preventivo_accettato: true });
  expect(document.body.textContent).toMatch(/Preventivo confermato/);
});

test("BUG M10 — il PATCH di conferma NON è condizionato (manca accepted_at=is.null): due sessioni possono confermare e disdire lo stesso preventivo", async () => {
  const patches = [];
  loadPage("repair-status.html", "?token=LT1", (url, opts) => {
    if (opts && opts.method === "PATCH") { patches.push(url); return json({}); }
    if (String(url).includes("/repairs?")) return json([repairRow]);
    if (String(url).includes("/quote_tokens?")) return json([{ token: "QT1" }]);
    return json([]);
  });
  await waitFor(() => expect(document.getElementById("btnDecline")).toBeTruthy());
  document.getElementById("btnDecline").click();
  await waitFor(() => expect(patches).toHaveLength(2));
  // il PATCH sovrascrive senza guardia di idempotenza lato server
  expect(patches[0]).not.toMatch(/accepted_at=is\.null/);
  expect(patches[0]).not.toMatch(/declined_at=is\.null/);
});

test("H2 — approve-quote: token già confermato → pagina idempotente in lettura, nessun PATCH", async () => {
  const patches = [];
  loadPage("approve-quote.html", "?token=QT1", (url, opts) => {
    if (opts && opts.method === "PATCH") { patches.push(url); return json({}); }
    if (String(url).includes("/quote_tokens?")) return json([{ token: "QT1", repair_id: "r1", accepted_at: "2026-06-01T10:00:00Z" }]);
    if (String(url).includes("/repairs?")) return json([repairRow]);
    return json([]);
  });
  await waitFor(() => expect(document.body.textContent).toMatch(/già confermato/));
  expect(patches).toHaveLength(0);
});

test("SICUREZZA C1/M8 — la pagina pubblica richiede select=* : colonne interne (spesa, note) escono verso il browser del cliente", async () => {
  const gets = [];
  loadPage("repair-status.html", "?token=LT1", (url, opts) => {
    if (!opts || !opts.method) gets.push(String(url));
    if (String(url).includes("/repairs?")) return json([repairRow]);
    return json([]);
  });
  await waitFor(() => expect(document.body.textContent).toMatch(/R2026-0042/));
  expect(gets[0]).toMatch(/select=\*/); // tutte le colonne, incluse note interne e spesa fornitore
});
