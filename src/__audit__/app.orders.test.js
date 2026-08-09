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

  // WA automatico: accodato in wa_jobs con messaggio corretto…
  await waitFor(() => expect(__fake.db.wa_jobs || []).toHaveLength(1));
  const job = __fake.db.wa_jobs[0];
  expect(job.telefono).toBe("+393331234567"); // E.164 (fix A4)
  expect(job.messaggio).toMatch(/Anello X/);
  expect(job.messaggio).toMatch(/80\.00/); // rimanenza 100-20

  // …e NESSUN errore è mostrato all'utente (accodamento fire-and-forget)
  await new Promise((r) => setTimeout(r, 50));
  expect(window.alert).not.toHaveBeenCalled();
  expect(screen.queryByText(/non inviato|errore/i)).toBeNull();
});

test("FIX A9 — 'Consegna al cliente' consegna solo gli arrivati; l'ordine resta aperto per gli altri", async () => {
  __fake.seed("orders", [{
    id: "o2", numero: "ORD2026-0002", customer_id: "c1", stato: "arrivato", data_ordine: "2026-06-20",
    prodotti: [
      { id: "p1", descrizione: "Anello arrivato", stato: "arrivato", quantita: 1, prezzoVendita: 100, acconto: 20 },
      { id: "p2", descrizione: "Bracciale ancora ordinato", stato: "ordinato", quantita: 1 },
    ],
  }]);
  await gotoOrders();
  click(screen.getByText("Consegna al cliente"));

  await waitFor(() => expect(__fake.db.orders[0].prodotti.find((p) => p.id === "p1").stato).toBe("consegnato"));
  // p2 (mai arrivato) NON viene consegnato
  expect(__fake.db.orders[0].prodotti.find((p) => p.id === "p2").stato).toBe("ordinato");
  // stato ordine derivato dai prodotti → resta aperto ("ordinato")
  expect(__fake.db.orders[0].stato).toBe("ordinato");

  // il WhatsApp di conferma riguarda solo l'articolo effettivamente consegnato
  const toast = await screen.findByText(/Conferma consegna/);
  fireEvent.click(toast);
  const waUrl = window.open.mock.calls.map(([u]) => decodeURIComponent(String(u))).find((u) => u.includes("wa.me"));
  expect(waUrl).toMatch(/Anello arrivato/);
  expect(waUrl).not.toMatch(/Bracciale/);
  expect(waUrl).toMatch(/parziale/);
});

test("FIX A9 — ordine con tutti gli articoli arrivati: consegna completa, stato consegnato, messaggio non parziale", async () => {
  __fake.seed("orders", [{
    id: "o3", numero: "ORD2026-0003", customer_id: "c1", stato: "arrivato", data_ordine: "2026-06-20",
    prodotti: [
      { id: "p1", descrizione: "Anello", stato: "arrivato", quantita: 1 },
      { id: "p2", descrizione: "Bracciale", stato: "arrivato", quantita: 1 },
    ],
  }]);
  await gotoOrders();
  click(screen.getByText("Consegna al cliente"));

  await waitFor(() => expect(__fake.db.orders[0].stato).toBe("consegnato"));
  expect(__fake.db.orders[0].prodotti.every((p) => p.stato === "consegnato")).toBe(true);
  const toast = await screen.findByText(/Conferma consegna/);
  fireEvent.click(toast);
  const waUrl = window.open.mock.calls.map(([u]) => decodeURIComponent(String(u))).find((u) => u.includes("wa.me"));
  expect(waUrl).not.toMatch(/parziale/);
});

test("FIX ordine — 'CAMBIA STATO ORDINE' → Arrivato propaga a TUTTI i prodotti e invia 1 WA riepilogo", async () => {
  __fake.seed("orders", [{
    id: "o5", numero: "ORD2026-0005", customer_id: "c1", stato: "ordinato", data_ordine: "2026-06-20",
    prodotti: [
      { id: "p1", descrizione: "Anello", stato: "ordinato", prezzoVendita: 100, quantita: 1, acconto: 20 },
      { id: "p2", descrizione: "Bracciale", stato: "ordinato", prezzoVendita: 50, quantita: 1 },
    ],
  }]);
  await gotoOrders();
  click(screen.getByText("ORD2026-0005"));
  const sect = (await screen.findByText("CAMBIA STATO ORDINE")).parentElement;
  click(within(sect).getByText("Arrivato"));

  await waitFor(() => expect(__fake.db.orders[0].stato).toBe("arrivato"));
  // propagato a tutti i prodotti (coerenza ordine/prodotti)
  expect(__fake.db.orders[0].prodotti.every((p) => p.stato === "arrivato")).toBe(true);

  // esattamente 1 WhatsApp accodato, riepilogo ordine, in E.164
  await waitFor(() => expect(__fake.db.wa_jobs || []).toHaveLength(1));
  const job = __fake.db.wa_jobs[0];
  expect(job.telefono).toBe("+393331234567");
  expect(job.messaggio).toMatch(/ORD2026-0005/);
  expect(job.messaggio).toMatch(/arrivat|pronto/i);
});

test("FIX ordine — ordine a 1 articolo: stato ordine ad Arrivato rende attiva la consegna (no bottone morto per A9)", async () => {
  __fake.seed("orders", [{
    id: "o6", numero: "ORD2026-0006", customer_id: "c1", stato: "ordinato", data_ordine: "2026-06-20",
    prodotti: [{ id: "p1", descrizione: "Anello solo", stato: "ordinato", quantita: 1 }],
  }]);
  await gotoOrders();
  click(screen.getByText("ORD2026-0006"));
  const sect = (await screen.findByText("CAMBIA STATO ORDINE")).parentElement;
  click(within(sect).getByText("Arrivato"));
  await waitFor(() => expect(__fake.db.orders[0].prodotti[0].stato).toBe("arrivato"));

  // ora 'Consegna al cliente' consegna davvero (il prodotto è arrivato)
  click((await screen.findAllByText("Consegna al cliente"))[0]);
  await waitFor(() => expect(__fake.db.orders[0].prodotti[0].stato).toBe("consegnato"));
  expect(__fake.db.orders[0].stato).toBe("consegnato");
});
