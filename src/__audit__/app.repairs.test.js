/* AUDIT — Area A (Riparazioni): intake wizard, numerazione, salvataggio campi.
 * DB: finto client in memoria (jest.mock di ./supabase). Nessuna rete reale. */
jest.mock("../supabase", () => require("./mocks/fakeSupabase"));

import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import App from "../App";
import { __fake } from "./mocks/fakeSupabase";
import { seedBase, unlockAndLoad, runRepairWizard, click, type } from "./helpers";

beforeEach(() => {
  __fake.reset();
  seedBase();
});

test("A1/A3 — intake wizard completo: riparazione salvata con numero progressivo e stato ricevuto", async () => {
  render(<App />);
  await unlockAndLoad();
  await runRepairWizard();

  const saved = __fake.db.repairs;
  expect(saved).toHaveLength(1);
  const r = saved[0];
  const anno = new Date().getFullYear();
  expect(r.numero).toBe(`R${anno}-0001`);
  expect(r.status).toBe("ricevuto");
  expect(r.customer_id).toBe("c1");
  expect(r.descrizione).toBe("Anello oro test");
  expect(r.materiali).toBe("Oro 18k");
  expect(r.problema).toBe("Maglia rotta");
  expect(r.operatore).toBe("Adri");
  expect(r.preventivo).toBe(100);
  expect(r.link_token).toBeTruthy();
});

test("BUG C2 — marca, referenza e nota preventivo raccolti dal wizard NON vengono salvati", async () => {
  render(<App />);
  await unlockAndLoad();
  await runRepairWizard({ marca: "Bulgari", referenza: "AB123", notaPreventivo: "Saldatura maglia" });

  const r = __fake.db.repairs[0];
  // Comportamento REALE (bug documentato): i tre campi vengono scartati da handleSaveRepair.
  expect(r.marca).toBeNull();
  expect(r.referenza).toBeNull();
  expect(r.nota_preventivo).toBeNull();
});

test("A3 — secondo intake incrementa il numero (nessun duplicato in sequenza)", async () => {
  render(<App />);
  await unlockAndLoad();
  await runRepairWizard();
  fireEvent.click(screen.getAllByText("Chiudi")[0]); // chiude modal etichette
  await runRepairWizard({ descrizione: "Bracciale argento" });

  const nums = __fake.db.repairs.map((r) => r.numero).sort();
  const anno = new Date().getFullYear();
  expect(nums).toEqual([`R${anno}-0001`, `R${anno}-0002`]);
});

test("A9 — cambio stato a 'consegnato' imposta data_consegnata", async () => {
  const anno = new Date().getFullYear();
  __fake.seed("repairs", [{
    id: "r1", numero: `R${anno}-0001`, customer_id: "c1", categoria: "Gioiello",
    descrizione: "Anello test", status: "pronto", eliminata: false, data_ricevuta: "2026-06-01",
  }]);
  render(<App />);
  await unlockAndLoad();

  // apre il dettaglio dalla dashboard (card "Pronte al ritiro")
  click((await screen.findAllByText("Anello test"))[0]);
  await screen.findByText("CAMBIA STATO");
  click(screen.getByText("Consegnato"));

  await waitFor(() => expect(__fake.db.repairs[0].status).toBe("consegnato"));
  expect(__fake.db.repairs[0].data_consegnata).toBe(new Date().toISOString().split("T")[0]);
});

test("Resilienza — Supabase irraggiungibile all'avvio: l'app resta su 'Caricamento…' senza messaggio di errore", async () => {
  __fake.setFailSelects(true);
  render(<App />);
  fireEvent.change(screen.getByPlaceholderText("PIN di accesso"), { target: { value: "1234" } });
  fireEvent.click(screen.getByText("Entra"));
  await new Promise((r) => setTimeout(r, 400));
  // getRepairs & co. restituiscono {data:null} → (data||[]) → l'app carica vuota senza avvisare
  // NB: qui documentiamo che NON esiste alcuna UI di errore.
  expect(screen.queryByText(/errore/i)).toBeNull();
});
