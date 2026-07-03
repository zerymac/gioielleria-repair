/* AUDIT — Area D (Clienti): anti-doppione, casi limite, merge duplicati. */
jest.mock("../supabase", () => require("./mocks/fakeSupabase"));

import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import App from "../App";
import { __fake } from "./mocks/fakeSupabase";
import { seedBase, unlockAndLoad, click, type } from "./helpers";

beforeEach(() => {
  __fake.reset();
  seedBase();
});

async function openNewCustomerForm() {
  render(<App />);
  await unlockAndLoad();
  click(screen.getByText("Clienti"));
  await screen.findByPlaceholderText(/Cerca cliente/);
  click(screen.getByText("+"));
  await screen.findByText("Nuovo Cliente");
}

test("D3 — anti-doppione: stesso nome con maiuscole/spazi diversi viene intercettato", async () => {
  await openNewCustomerForm();
  type(screen.getByPlaceholderText("Nome *"), "  mario ");
  type(screen.getByPlaceholderText("Cognome *"), "ROSSI");
  click(screen.getByText("Salva"));
  await screen.findByText("Cliente già presente");
  expect(__fake.db.customers).toHaveLength(2); // nessun salvataggio
});

test("D3 — anti-doppione: stesso telefono con nome diverso viene intercettato", async () => {
  await openNewCustomerForm();
  type(screen.getByPlaceholderText("Nome *"), "Luigi");
  type(screen.getByPlaceholderText("Cognome *"), "Bianchi");
  type(screen.getByPlaceholderText("3331234567"), "3331234567");
  click(screen.getByText("Salva"));
  await screen.findByText("Cliente già presente");
});

test("LIMITE D3 — accenti non normalizzati: 'Jose Nunez' NON matcha 'José Núñez' (doppione passa)", async () => {
  __fake.seed("customers", [{ id: "c9", nome: "José", cognome: "Núñez", telefono: "", telefono_prefisso: "+39" }]);
  await openNewCustomerForm();
  type(screen.getByPlaceholderText("Nome *"), "Jose");
  type(screen.getByPlaceholderText("Cognome *"), "Nunez");
  click(screen.getByText("Salva"));
  // Comportamento REALE: nessun avviso, il duplicato viene creato
  await waitFor(() => expect(__fake.db.customers.filter((c) => /n[uú]/i.test(c.cognome))).toHaveLength(2));
  expect(screen.queryByText("Cliente già presente")).toBeNull();
});

test("D4 — merge duplicati: ordini/riparazioni riassegnati al primario scelto, anagrafica duplicata eliminata", async () => {
  __fake.seed("customers", [{ id: "c3", nome: "Mario", cognome: "Rossi", telefono: "3479999999", telefono_prefisso: "+39" }]);
  __fake.seed("repairs", [{ id: "r1", numero: "R2026-0001", customer_id: "c1", descrizione: "x", status: "ricevuto", eliminata: false }]);
  __fake.seed("orders", [{ id: "o1", numero: "ORD2026-0001", customer_id: "c3", stato: "ordinato", prodotti: [] }]);

  render(<App />);
  await unlockAndLoad();
  click(screen.getByText("Clienti"));
  await screen.findByText("Duplicati");
  click(screen.getByText("Duplicati"));
  await screen.findByText(/Gruppo 1/);

  // sceglie come primario il c1 (telefono 3331234567) — query nel contesto della modal
  const sheet = screen.getByText("🔗 Unisci duplicati").parentElement.parentElement;
  click(within(sheet).getByText("+39 3331234567").closest("button"));
  click(within(sheet).getByText(/🔗 Unisci \d/));

  await waitFor(() => expect(__fake.db.customers.find((c) => c.id === "c3")).toBeUndefined());
  expect(__fake.db.orders[0].customer_id).toBe("c1");
  expect(__fake.db.repairs[0].customer_id).toBe("c1");
});
