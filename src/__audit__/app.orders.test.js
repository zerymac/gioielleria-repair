/* AUDIT — Area C (Ordini): wizard, stato derivato, WA automatici, consegna. */
jest.mock("../supabase", () => require("./mocks/fakeSupabase"));

import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import App from "../App";
import { __fake } from "./mocks/fakeSupabase";
import { seedBase, unlockAndLoad, click, type } from "./helpers";

beforeEach(() => {
  __fake.reset();
  seedBase();
});

async function gotoOrders() {
  render(<App />);
  await unlockAndLoad();
  click(screen.getByText("Ordini"));
  await screen.findByText("+ Nuovo Ordine");
}

test("C1/C2 — wizard ordine: salvataggio con stato derivato dai prodotti e modal etichette", async () => {
  await gotoOrders();
  click(screen.getByText("+ Nuovo Ordine"));
  await screen.findByText("Chi prende l'ordine?");
  click(screen.getByText("Adri"));
  click(screen.getByText("Avanti →"));
  await screen.findByText("Chi è il cliente?");
  click(screen.getByText("Mario Rossi"));
  await screen.findByText("Che tipo di prodotto?");
  click(screen.getByText("Gioiello"));
  await screen.findByText("Dettagli articolo");
  type(screen.getByPlaceholderText("Es. Anello in oro giallo 18kt misura 14…"), "Anello solitario 18kt");
  click(screen.getByText("Avanti →"));
  await screen.findByText("Quantità e prezzi");
  const prices = screen.getAllByPlaceholderText("0.00"); // [vendita, acquisto, acconto]
  type(prices[0], "100");
  type(prices[2], "20");
  click(screen.getByText("Avanti →"));
  await screen.findByText("Date e dettagli");
  click(screen.getByText("Rivedi riepilogo →"));
  await screen.findByText("Tutto pronto!");
  click(screen.getByText("✓ Crea ordine"));
  await screen.findByText(/^Etichette ORD/);

  const o = __fake.db.orders[0];
  const anno = new Date().getFullYear();
  expect(o.numero).toBe(`ORD${anno}-0001`);
  expect(o.stato).toBe("da_ordinare"); // derivato: unico prodotto in stato default "da_ordinare"
  expect(o.prodotti).toHaveLength(1);
  expect(o.prodotti[0].prezzoVendita).toBe(100);
  expect(o.prodotti[0].acconto).toBe(20);
  expect(o.operatore).toBe("Adri");
});

test("C3 — prodotto → 'arrivato': stato ordine derivato + WA automatico fire-and-forget (fallimento silenzioso)", async () => {
  __fake.seed("orders", [{
    id: "o1", numero: "ORD2026-0001", customer_id: "c1", stato: "ordinato", data_ordine: "2026-06-20",
    prodotti: [{ id: "p1", descrizione: "Anello X", stato: "ordinato", prezzoVendita: 100, quantita: 1, acconto: 20 }],
  }]);
  await gotoOrders();
  click(screen.getByText("ORD2026-0001"));
  const card = (await screen.findByText("ARTICOLI (1)")).parentElement;
  click(within(card).getByText(/Ordinato ▾/));
  click(within(card).getByText("Arrivato"));

  await waitFor(() => expect(__fake.db.orders[0].stato).toBe("arrivato"));
  expect(__fake.db.orders[0].prodotti[0].stato).toBe("arrivato");

  // WA automatico: chiamata al print server con messaggio corretto…
  const waCall = global.fetch.mock.calls.find(([url]) => String(url).includes("/wa/send-bulk"));
  expect(waCall).toBeTruthy();
  const body = JSON.parse(waCall[1].body);
  expect(body.messages[0].telefono).toBe("3331234567");
  expect(body.messages[0].messaggio).toMatch(/Anello X/);
  expect(body.messages[0].messaggio).toMatch(/80\.00/); // rimanenza 100-20

  // …ma il fetch è fallito (server spento simulato) e NESSUN errore è mostrato all'utente
  await new Promise((r) => setTimeout(r, 50));
  expect(window.alert).not.toHaveBeenCalled();
  expect(screen.queryByText(/non inviato|errore/i)).toBeNull();
});

test("BUG A9 — 'Consegna al cliente' dalla card marca consegnati anche i prodotti NON arrivati", async () => {
  __fake.seed("orders", [{
    id: "o2", numero: "ORD2026-0002", customer_id: "c1", stato: "arrivato", data_ordine: "2026-06-20",
    prodotti: [
      { id: "p1", descrizione: "Anello arrivato", stato: "arrivato", quantita: 1 },
      { id: "p2", descrizione: "Bracciale ancora ordinato", stato: "ordinato", quantita: 1 },
    ],
  }]);
  await gotoOrders();
  click(screen.getByText("Consegna al cliente"));

  await waitFor(() => expect(__fake.db.orders[0].stato).toBe("consegnato"));
  // Comportamento REALE (bug): p2 passa da "ordinato" a "consegnato" senza mai essere arrivato
  expect(__fake.db.orders[0].prodotti.map((p) => p.stato)).toEqual(["consegnato", "consegnato"]);
});
