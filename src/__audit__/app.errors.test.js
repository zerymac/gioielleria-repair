/* AUDIT — C3: errori DB visibili (scrittura fallita → toast; lettura fallita → banner, liste non svuotate). */
jest.mock("../supabase", () => require("./mocks/fakeSupabase"));

import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import App from "../App";
import { __fake } from "./mocks/fakeSupabase";
import { seedBase, unlockAndLoad, click } from "./helpers";

const anno = new Date().getFullYear();

beforeEach(() => {
  __fake.reset();
  seedBase();
});

test("FIX C3a — scrittura fallita: toast 'Salvataggio non riuscito', indicatore non 'Sincronizzato', DB invariato", async () => {
  __fake.seed("repairs", [{
    id: "r1", numero: `R${anno}-0001`, customer_id: "c1", categoria: "Gioiello",
    descrizione: "Anello test", status: "pronto", eliminata: false, data_ricevuta: "2026-06-01",
  }]);
  render(<App />);
  await unlockAndLoad();

  click((await screen.findAllByText("Anello test"))[0]);
  await screen.findByText("CAMBIA STATO");

  __fake.setFailWrites(true);
  click(screen.getByText("In lavorazione"));

  // il fallimento diventa visibile all'operatore
  await screen.findByText(/Salvataggio non riuscito/);
  // l'indicatore non dichiara "Sincronizzato"
  expect(screen.queryByText("Sincronizzato")).toBeNull();
  expect(screen.getByText("Errore di salvataggio")).toBeInTheDocument();
  // e il DB non è cambiato
  expect(__fake.db.repairs[0].status).toBe("pronto");
});

test("FIX C3b — lettura fallita (offline): le liste NON vengono svuotate e compare il banner", async () => {
  __fake.seed("customers", [
    { id: "cA", nome: "Giulia", cognome: "Neri", telefono: "3330000001", telefono_prefisso: "+39" },
  ]);
  render(<App />);
  await unlockAndLoad();
  click(screen.getByText("Clienti"));
  // il cliente è caricato e visibile
  await screen.findByText("Giulia Neri");

  // il DB diventa irraggiungibile e scatta un refresh (es. ritorno in foreground)
  __fake.setFailSelects(true);
  await act(async () => {
    document.dispatchEvent(new Event("visibilitychange"));
    await new Promise((r) => setTimeout(r, 50));
  });

  // banner di connessione persa + la lista NON viene svuotata
  await screen.findByText(/aggiornati/);
  expect(screen.getByText("Giulia Neri")).toBeInTheDocument();

  // tornata la connessione, un refresh pulisce il banner
  __fake.setFailSelects(false);
  await act(async () => {
    document.dispatchEvent(new Event("visibilitychange"));
    await new Promise((r) => setTimeout(r, 50));
  });
  await waitFor(() => expect(screen.queryByText(/aggiornati/)).toBeNull());
});
