/* AUDIT — Area B/G (wa-bot): reconciliation, dedup, invii parziali, prefissi telefonici.
 * whatsapp-web.js e @supabase/supabase-js sono mockati (moduleNameMapper): nessun WA reale. */
const { __fake } = require("./mocks/fakeSupabase");
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

test("BUG A4 — sendBulkWA: a un numero estero (+44…) viene anteposto il prefisso italiano 39", async () => {
  const res = await bot.sendBulkWA([
    { telefono: "+44 7911 123456", messaggio: "hello" },
    { telefono: "3331234567", messaggio: "ciao" },
  ]);
  expect(res).toEqual({ sent: 2, failed: 0 });
  const calls = Client.instance.sendMessage.mock.calls.slice(-2);
  expect(calls[0][0]).toBe("39447911123456@c.us"); // BUG: numero UK trattato come italiano
  expect(calls[1][0]).toBe("393331234567@c.us");
});
