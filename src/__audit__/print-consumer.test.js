/* Consumer coda print_jobs: claim, stampa, done/error, reconcile, idempotenza.
 * printLabel è iniettato (nessun Puppeteer/lp reale). Supabase è il fake in memoria. */
const { __fake, supabase } = require("./mocks/fakeSupabase");
const { startPrintConsumer } = require("../../print-server/print-consumer");

beforeEach(() => { __fake.reset(); });

function makeConsumer(printImpl) {
  const printLabel = jest.fn(printImpl || (async () => {}));
  // pollMs:0 → niente setInterval; autoReconcile:false → nessun reconcile nel costruttore
  // (i test invocano reconcile/processJob esplicitamente per essere deterministici)
  const c = startPrintConsumer(supabase, { printLabel, pollMs: 0, autoReconcile: false });
  return { c, printLabel };
}

test("job pending → stampato e marcato done", async () => {
  __fake.seed("print_jobs", [
    { id: "p1", html: "<b>etichetta</b>", copies: 1, width: "62mm", height: "100mm", status: "pending" },
  ]);
  const { c, printLabel } = makeConsumer();
  await c.reconcile();

  expect(printLabel).toHaveBeenCalledTimes(1);
  expect(printLabel).toHaveBeenCalledWith(expect.objectContaining({ html: "<b>etichetta</b>", copies: 1, width: "62mm", height: "100mm" }));
  const job = __fake.db.print_jobs.find((j) => j.id === "p1");
  expect(job.status).toBe("done");
  expect(job.printed_at).toBeTruthy();
});

test("errore di stampa → job marcato error con messaggio", async () => {
  __fake.seed("print_jobs", [{ id: "p2", html: "x", status: "pending" }]);
  const { c } = makeConsumer(async () => { throw new Error("lp offline"); });
  await c.reconcile();

  const job = __fake.db.print_jobs.find((j) => j.id === "p2");
  expect(job.status).toBe("error");
  expect(job.error).toMatch(/lp offline/);
});

test("reconcile all'avvio recupera i job creati mentre il Mac era spento", async () => {
  __fake.seed("print_jobs", [
    { id: "a", html: "1", status: "pending" },
    { id: "b", html: "2", status: "pending" },
    { id: "c", html: "3", status: "done" }, // già fatto → ignorato
  ]);
  const { c, printLabel } = makeConsumer();
  await c.reconcile();
  expect(printLabel).toHaveBeenCalledTimes(2);
  expect(__fake.db.print_jobs.filter((j) => j.status === "done")).toHaveLength(3);
});

test("idempotenza: un job già 'done' non viene ristampato da un evento Realtime", async () => {
  __fake.seed("print_jobs", [{ id: "p3", html: "x", status: "done" }]);
  const { c, printLabel } = makeConsumer();
  await c.processJob({ id: "p3", html: "x", status: "done" });
  expect(printLabel).not.toHaveBeenCalled();
});

test("l'INSERT via Realtime fa partire la stampa", async () => {
  const { printLabel } = makeConsumer();
  // insert reale sul fake → emette l'evento al canale sottoscritto
  await supabase.from("print_jobs").insert({ id: "p4", html: "realtime", status: "pending" });
  // la callback è sincrona fino all'await interno: diamo un tick
  await new Promise((r) => setTimeout(r, 0));
  expect(printLabel).toHaveBeenCalledWith(expect.objectContaining({ html: "realtime" }));
});
