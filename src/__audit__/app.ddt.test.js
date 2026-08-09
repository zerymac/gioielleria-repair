/* AUDIT — Area E (DDT/rientri): creazione, numerazione dopo eliminazione, rientro rapido, consegna multipla. */
jest.mock("../supabase", () => require("./mocks/fakeSupabase"));

import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import App from "../App";
import { __fake } from "./mocks/fakeSupabase";
import { seedBase, unlockAndLoad, click, type } from "./helpers";

const anno = new Date().getFullYear();

beforeEach(() => {
  __fake.reset();
  seedBase();
});

const seedRepair = (id, num, status = "ricevuto", extra = {}) =>
  __fake.seed("repairs", [{ id, numero: num, customer_id: "c1", categoria: "Gioiello", descrizione: `Oggetto ${id}`, status, eliminata: false, data_ricevuta: "2026-06-01", ...extra }]);

async function createDDT(repairNumero, nomeRip = "Averla") {
  click(screen.getByText("DDT"));
  await screen.findByPlaceholderText(/Cerca DDT/);
  click(screen.getAllByText("+").pop());
  await screen.findByText("Nuovo DDT Riparatore");
  type(screen.getByPlaceholderText("Nome riparatore *"), nomeRip);
  click(screen.getByText(repairNumero).closest("button"));
  click(screen.getByText("📄 Crea DDT e stampa"));
  await waitFor(() => expect(screen.queryByText("Nuovo DDT Riparatore")).toBeNull());
}

test("E1/E2 — creazione DDT: numero progressivo, snapshot riparatore, stato riparazione → presso_esterno", async () => {
  seedRepair("r1", `R${anno}-0001`);
  render(<App />);
  await unlockAndLoad();
  await createDDT(`R${anno}-0001`);

  const d = __fake.db.ddts[0];
  expect(d.numero).toBe(`DDT${anno}-0001`);
  expect(d.riparatore.nome).toBe("Averla");
  expect(d.stato).toBe("inviato");
  const r = __fake.db.repairs.find((x) => x.id === "r1");
  expect(r.status).toBe("presso_esterno");
  expect(r.data_spedita).toBe(new Date().toISOString().split("T")[0]);
});

test("BUG C4 — numerazione DDT: dopo l'eliminazione di un DDT il numero successivo DUPLICA uno esistente", async () => {
  seedRepair("r1", `R${anno}-0001`);
  seedRepair("r2", `R${anno}-0002`);
  render(<App />);
  await unlockAndLoad();

  await createDDT(`R${anno}-0001`); // DDT-0001
  await createDDT(`R${anno}-0002`); // DDT-0002
  expect(__fake.db.ddts.map((d) => d.numero)).toEqual([`DDT${anno}-0001`, `DDT${anno}-0002`]);

  // elimina il primo DDT
  click((await screen.findAllByText(`DDT${anno}-0001`))[0]);
  await screen.findByText("🗑️ Elimina DDT");
  click(screen.getByText("🗑️ Elimina DDT"));
  click(screen.getByText("Elimina"));
  await waitFor(() => expect(__fake.db.ddts).toHaveLength(1));
  await waitFor(() => expect(__fake.db.repairs.find((x) => x.id === "r1").status).toBe("ricevuto"));

  // nuovo DDT → ddts.length+1 = 2 → numero già usato dal DDT esistente
  await createDDT(`R${anno}-0001`);
  const nums = __fake.db.ddts.map((d) => d.numero);
  expect(nums).toEqual([`DDT${anno}-0002`, `DDT${anno}-0002`]); // DUPLICATO
});

test("E4 — rientro rapido singolo: costi, stato, data rientro, DDT auto-chiuso, WAToast (niente bulk)", async () => {
  seedRepair("r1", `R${anno}-0001`, "presso_esterno");
  __fake.seed("ddts", [{ id: "d1", numero: `DDT${anno}-0001`, data: "2026-06-10", riparatore: { nome: "Averla" }, riparazioni_ids: ["r1"], stato: "inviato" }]);
  render(<App />);
  await unlockAndLoad();

  click(screen.getByText("Rientro rapido dal fornitore"));
  await screen.findByText("Seleziona le riparazioni rientrate dal fornitore. Puoi scansionare il QR o spuntarle dalla lista.");
  click(screen.getAllByText(`R${anno}-0001`).pop().closest("button"));
  click(await screen.findByText(/Avanti → \(1 selezionata\)/));
  await screen.findByText("💰 Costi e stato");
  const inputs = screen.getAllByPlaceholderText("0.00"); // [spesa, prezzoFinale]
  type(inputs[0], "30");
  type(inputs[1], "80");
  click(screen.getByText("✅ Conferma rientri"));

  await waitFor(() => expect(__fake.db.repairs.find((x) => x.id === "r1").status).toBe("pronto"));
  const r = __fake.db.repairs.find((x) => x.id === "r1");
  expect(r.spesa).toBe(30);
  expect(r.prezzo_finale).toBe(80);
  expect(r.data_rientrata).toBe(new Date().toISOString().split("T")[0]);
  await waitFor(() => expect(__fake.db.ddts[0].stato).toBe("rientrato"));

  // singola riparazione → WAToast manuale, nessun accodamento bulk in wa_jobs
  await screen.findByText(new RegExp(`R${anno}-0001 è pronto!`));
  expect((__fake.db.wa_jobs || [])).toHaveLength(0);
});

test("E4/G3 — rientro rapido multiplo: WA bulk automatico con un messaggio per cliente", async () => {
  seedRepair("r1", `R${anno}-0001`, "presso_esterno");
  seedRepair("r2", `R${anno}-0002`, "presso_esterno");
  __fake.seed("ddts", [{ id: "d1", numero: `DDT${anno}-0001`, data: "2026-06-10", riparatore: { nome: "Averla" }, riparazioni_ids: ["r1", "r2"], stato: "inviato" }]);
  render(<App />);
  await unlockAndLoad();

  click(screen.getByText("Rientro rapido dal fornitore"));
  await screen.findByText("💰 Costi e stato", { exact: false }).catch(() => {});
  click(await screen.findByText("Tutti"));
  click(await screen.findByText(/Avanti → \(2 selezionate\)/));
  await screen.findByText("💰 Costi e stato");
  click(screen.getByText("✅ Conferma rientri"));

  await waitFor(() => {
    const jobs = __fake.db.wa_jobs || [];
    expect(jobs).toHaveLength(2);
    expect(jobs[0].messaggio).toMatch(/pronta per il ritiro/);
  });
});

test("BUG A8 — consegna multipla: un solo WAToast sopravvive, gli altri messaggi non vengono mai proposti", async () => {
  seedRepair("r1", `R${anno}-0001`, "pronto");
  seedRepair("r2", `R${anno}-0002`, "pronto");
  render(<App />);
  await unlockAndLoad();

  click(screen.getByText("Consegna al cliente"));
  await screen.findByText("🤝 Consegna al cliente");
  click(screen.getAllByText(`R${anno}-0001`).pop().closest("button"));
  click(screen.getAllByText(`R${anno}-0002`).pop().closest("button"));
  click(screen.getByText(/🤝 Consegna tutte/));

  await waitFor(() => expect(__fake.db.repairs.every((r) => r.status === "consegnato")).toBe(true), { timeout: 3000 });
  // due consegne con telefono → dovrebbero esserci due proposte WA; ne resta UNA sola
  const toasts = screen.getAllByText("Consegnato!");
  expect(toasts).toHaveLength(1);
});
