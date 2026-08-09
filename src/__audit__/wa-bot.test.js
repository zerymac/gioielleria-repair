/* AUDIT — Area B/G (wa-bot): reconciliation, dedup, invii parziali, prefissi telefonici.
 * whatsapp-web.js e @supabase/supabase-js sono mockati (moduleNameMapper): nessun WA reale. */
const { __fake, supabase } = require("./mocks/fakeSupabase");
const { Client } = require("whatsapp-web.js");

process.env.REACT_APP_SUPABASE_URL = "http://audit.fake";
process.env.REACT_APP_SUPABASE_KEY = "audit";
process.env.SHOP_WA_TEL = "3441583658";

// accorcia il waDelay anti-ban (8–15 s) per i test
const realSetTimeout = global.setTimeout;
beforeAll(() => {
  global.setTimeout = (fn, ms, ...a) => realSetTimeout(fn, ms > 3000 ? 0 : ms, ...a);
});
afterAll(() => { global.setTimeout = realSetTimeout; });

const bot = require("../../print-server/wa-bot.js");

const SHOP_WA = "393441583658@c.us";
const RIP_WA = "393471111111@c.us";

function repairHandlers() {
  return __fake.realtimeHandlers.filter((h) => h.table === "repairs").map((h) => h.cb);
}

beforeAll(async () => {
  __fake.reset();
  __fake.setAutoEmit(false);
  // rA: accettato mentre il bot era "down" (nessun wa_accept_sent_at) → deve essere recuperato
  __fake.seed("repairs", [
    { id: "rA", numero: "R2026-0100", descrizione: "Anello", preventivo: 90, preventivo_accettato: true, wa_accept_sent_at: null, riparazione_interna: false, eliminata: false },
    { id: "rB", numero: "R2026-0101", descrizione: "Collana", preventivo_accettato: true, wa_accept_sent_at: "2026-06-01T10:00:00Z", riparazione_interna: false, eliminata: false },
  ]);
  __fake.seed("ddts", [
    { id: "dA", numero: "DDT2026-0001", riparatore: { nome: "Averla", telefono: "3471111111" }, riparazioni_ids: ["rA", "rC", "rE"] },
  ]);

  bot.initWABot();
  await Client.instance.handlers["ready"]();
});

test("B4 — reconciliation all'avvio: il preventivo accettato mentre il bot era down viene recuperato (riparatore + negozio) e marcato", async () => {
  const calls = Client.instance.sendMessage.mock.calls;
  const toRip = calls.filter(([to, msg]) => to === RIP_WA && msg.includes("R2026-0100"));
  const toShop = calls.filter(([to, msg]) => to === SHOP_WA && msg.includes("R2026-0100"));
  expect(toRip).toHaveLength(1);
  expect(toShop).toHaveLength(1);
  expect(toRip[0][1]).toMatch(/Preventivo al pubblico: 90 €/);
  expect(__fake.db.repairs.find((r) => r.id === "rA").wa_accept_sent_at).toBeTruthy();
});

test("B4 — dedup: il già-notificato (rB) non viene reinviato; un secondo evento Realtime per rA è ignorato", async () => {
  const calls = Client.instance.sendMessage.mock.calls;
  expect(calls.filter(([, msg]) => msg.includes("R2026-0101"))).toHaveLength(0);

  const before = calls.length;
  for (const cb of repairHandlers()) await cb({ new: { id: "rA", numero: "R2026-0100", preventivo_accettato: true } });
  expect(Client.instance.sendMessage.mock.calls.length).toBe(before);
});

test("BUG A3 — fallimento del WA negozio: al retry il riparatore riceve il messaggio DUE volte", async () => {
  __fake.seed("repairs", [
    { id: "rC", numero: "R2026-0102", descrizione: "Spilla", preventivo_accettato: true, wa_accept_sent_at: null, riparazione_interna: false, eliminata: false },
  ]);
  // 1ª chiamata (riparatore) ok, 2ª (negozio) fallisce
  Client.instance.sendMessage
    .mockImplementationOnce(async () => ({}))
    .mockImplementationOnce(async () => { throw new Error("WA rate limit"); });

  for (const cb of repairHandlers()) await cb({ new: { id: "rC", numero: "R2026-0102", preventivo_accettato: true } });
  // retry (es. riavvio bot o secondo evento)
  for (const cb of repairHandlers()) await cb({ new: { id: "rC", numero: "R2026-0102", preventivo_accettato: true } });

  const toRipC = Client.instance.sendMessage.mock.calls.filter(([to, msg]) => to === RIP_WA && msg.includes("R2026-0102"));
  expect(toRipC).toHaveLength(2); // DOPPIONE al riparatore
});

test("BUG M13 — disdetta su riparazione ESTERNA: lo stato passa a reso_non_riparato anche se l'oggetto è ancora presso il riparatore", async () => {
  __fake.seed("repairs", [
    { id: "rE", numero: "R2026-0103", descrizione: "Orologio", preventivo_rifiutato: true, wa_decline_sent_at: null, riparazione_interna: false, eliminata: false, status: "presso_esterno" },
  ]);
  for (const cb of repairHandlers()) await cb({ new: { id: "rE", numero: "R2026-0103", preventivo_rifiutato: true } });

  const rE = __fake.db.repairs.find((r) => r.id === "rE");
  expect(rE.status).toBe("reso_non_riparato"); // non è più "presso_esterno" → sparisce dal Rientro Rapido
  expect(rE.wa_decline_sent_at).toBeTruthy();
});

test("FIX A4 — sendBulkWA rispetta i prefissi internazionali; il nazionale nudo resta italiano", async () => {
  const res = await bot.sendBulkWA([
    { telefono: "+49 764 1234567", messaggio: "de" },   // E.164 estero (come lo invia l'app)
    { telefono: "0044 7911 123456", messaggio: "uk" },  // formato 00 estero
    { telefono: "+39 333 1234567", messaggio: "it+" },  // E.164 italiano
    { telefono: "3331234567", messaggio: "it" },        // nazionale nudo → italiano
  ]);
  expect(res).toEqual({ sent: 4, failed: 0 });
  const calls = Client.instance.sendMessage.mock.calls.slice(-4);
  expect(calls[0][0]).toBe("497641234567@c.us");   // Germania, non 39…
  expect(calls[1][0]).toBe("447911123456@c.us");   // UK via 00, non 39…
  expect(calls[2][0]).toBe("393331234567@c.us");   // italiano E.164
  expect(calls[3][0]).toBe("393331234567@c.us");   // italiano nazionale
});

/* ── Consumer coda wa_jobs (bulk WA accodati dal frontend Netlify) ── */
test("wa_jobs: un job pending viene inviato e marcato done", async () => {
  Client.instance.sendMessage.mockClear();
  __fake.seed("wa_jobs", [
    { id: "w1", telefono: "+39 333 1234567", messaggio: "Ordine arrivato", status: "pending" },
  ]);
  await bot.reconcileWaJobs(supabase);

  const calls = Client.instance.sendMessage.mock.calls.filter(([, m]) => m === "Ordine arrivato");
  expect(calls).toHaveLength(1);
  expect(calls[0][0]).toBe("393331234567@c.us");
  const job = __fake.db.wa_jobs.find((j) => j.id === "w1");
  expect(job.status).toBe("done");
  expect(job.sent_at).toBeTruthy();
});

test("wa_jobs: fallimento invio → job marcato error", async () => {
  __fake.seed("wa_jobs", [{ id: "w2", telefono: "+39 333 0000000", messaggio: "ko", status: "pending" }]);
  Client.instance.sendMessage.mockImplementationOnce(async () => { throw new Error("WA down"); });
  await bot.reconcileWaJobs(supabase);

  const job = __fake.db.wa_jobs.find((j) => j.id === "w2");
  expect(job.status).toBe("error");
});

test("wa_jobs: un job già done non viene reinviato", async () => {
  Client.instance.sendMessage.mockClear();
  __fake.seed("wa_jobs", [{ id: "w3", telefono: "+393331234567", messaggio: "già fatto", status: "done" }]);
  await bot.reconcileWaJobs(supabase);
  expect(Client.instance.sendMessage.mock.calls.filter(([, m]) => m === "già fatto")).toHaveLength(0);
});
