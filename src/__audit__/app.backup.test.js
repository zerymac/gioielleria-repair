/* AUDIT — Area I (Backup): compatibilità tra backup notturno (snake_case) e ripristino in-app (camelCase). */
jest.mock("../supabase", () => require("./mocks/fakeSupabase"));

import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import App from "../App";
import { __fake } from "./mocks/fakeSupabase";
import { seedBase, unlockAndLoad, click } from "./helpers";

beforeEach(() => {
  __fake.reset();
  seedBase();
});

async function doRestore(nightly) {
  render(<App />);
  await unlockAndLoad();
  click(screen.getByText("Altro"));
  await screen.findByText("Ripristina da backup");
  const file = new File([JSON.stringify(nightly)], "database-2026-07-03.json", { type: "application/json" });
  const input = document.querySelector('input[type="file"][accept=".json"]');
  fireEvent.change(input, { target: { files: [file] } });
  await waitFor(() => expect(screen.getByText(/Ripristino completato/)).toBeInTheDocument());
}

test("FIX C5 — restore di un backup NOTTURNO (snake_case): prefisso e codice fiscale preservati", async () => {
  await doRestore({
    version: 2,
    customers: [{
      id: "cX", nome: "Franz", cognome: "Müller",
      telefono: "7641234567", telefono_prefisso: "+49",
      codice_fiscale: "MLLFNZ80A01Z112K", email: "franz@example.de",
    }],
    repairs: [],
  });

  const restored = __fake.db.customers.find((c) => c.id === "cX");
  expect(restored).toBeTruthy();
  expect(restored.telefono).toBe("7641234567");
  expect(restored.telefono_prefisso).toBe("+49"); // preservato
  expect(restored.codice_fiscale).toBe("MLLFNZ80A01Z112K"); // preservato
});

test("FIX C5 — restore snake_case di repairs e orders: campi chiave riassegnati correttamente", async () => {
  await doRestore({
    version: 2,
    customers: [],
    repairs: [{
      id: "rX", numero: "R2026-0500", customer_id: "c1", categoria: "Gioiello",
      tipo_lavoro: "Riparazione", descrizione: "Anello backup", marca: "Bulgari",
      referenza: "REF9", nota_preventivo: "Saldatura", prezzo_finale: 120,
      status: "pronto", eliminata: false, data_ricevuta: "2026-06-01",
    }],
    orders: [{
      id: "oX", numero: "ORD2026-0500", customer_id: "c1", data_ordine: "2026-06-10",
      stato: "arrivato", operatore: "Massi",
      prodotti: [{ id: "p1", descrizione: "Collana", stato: "arrivato", prezzoVendita: 200 }],
    }],
  });

  const r = __fake.db.repairs.find((x) => x.id === "rX");
  expect(r.customer_id).toBe("c1"); // non perso (camelCase→snake round-trip)
  expect(r.marca).toBe("Bulgari");
  expect(r.referenza).toBe("REF9");
  expect(r.nota_preventivo).toBe("Saldatura");
  expect(r.prezzo_finale).toBe(120);

  const o = __fake.db.orders.find((x) => x.id === "oX");
  expect(o.customer_id).toBe("c1");
  expect(o.stato).toBe("arrivato");
  expect(o.operatore).toBe("Massi");
  expect(o.prodotti[0].descrizione).toBe("Collana");
});

test("FIX C5 — l'export in-app (camelCase) resta ripristinabile senza corruzione", async () => {
  // riga in forma app (camelCase), come prodotta da 'Esporta backup'
  await doRestore({
    version: 2,
    customers: [{
      id: "cY", nome: "Anna", cognome: "Bianchi",
      telefono: "3339998877", telefonoPrefisso: "+41", codiceFiscale: "BNCNNA90...",
    }],
    repairs: [],
  });
  const c = __fake.db.customers.find((x) => x.id === "cY");
  expect(c.telefono_prefisso).toBe("+41"); // il camelCase resta gestito
  expect(c.codice_fiscale).toBe("BNCNNA90...");
});
