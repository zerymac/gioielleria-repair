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

test("BUG C5 — ripristino in-app di un backup NOTTURNO (snake_case): prefisso telefonico e codice fiscale persi in silenzio", async () => {
  render(<App />);
  await unlockAndLoad();
  click(screen.getByText("Altro"));
  await screen.findByText("Ripristina da backup");

  // Estratto realistico del file database-YYYY-MM-DD.json prodotto da backup/backup.js (righe DB grezze)
  const nightly = {
    version: 2,
    date: "2026-07-03T03:00:00Z",
    customers: [{
      id: "cX", nome: "Franz", cognome: "Müller",
      telefono: "7641234567", telefono_prefisso: "+49",
      codice_fiscale: "MLLFNZ80A01Z112K", email: "franz@example.de",
    }],
    repairs: [],
  };
  const file = new File([JSON.stringify(nightly)], "database-2026-07-03.json", { type: "application/json" });
  const input = document.querySelector('input[type="file"][accept=".json"]');
  fireEvent.change(input, { target: { files: [file] } });

  await waitFor(() => expect(screen.getByText(/Ripristino completato/)).toBeInTheDocument());

  const restored = __fake.db.customers.find((c) => c.id === "cX");
  expect(restored).toBeTruthy();
  expect(restored.telefono).toBe("7641234567"); // il telefono sopravvive
  // Comportamento REALE (bug): upsertCustomer legge telefonoPrefisso/codiceFiscale (camelCase),
  // il backup notturno è snake_case → prefisso azzerato a +39, codice fiscale perso.
  expect(restored.telefono_prefisso).toBe("+39"); // era +49 → forzato al default
  expect(restored.codice_fiscale == null).toBe(true); // era MLLFNZ80A01Z112K → perso
});
