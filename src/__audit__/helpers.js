/* AUDIT — helper condivisi per le suite RTL. */
import { screen, fireEvent } from "@testing-library/react";
import { __fake } from "./mocks/fakeSupabase";

export const seedBase = () => {
  __fake.seed("customers", [
    { id: "c1", nome: "Mario", cognome: "Rossi", telefono: "3331234567", telefono_prefisso: "+39", email: "mario@example.com" },
    { id: "c2", nome: "Anna", cognome: "Verdi", telefono: "", telefono_prefisso: "+39", email: "" },
  ]);
};

export async function unlockAndLoad() {
  fireEvent.change(screen.getByPlaceholderText("PIN di accesso"), { target: { value: "1234" } });
  fireEvent.click(screen.getByText("Entra"));
  await screen.findByText("Repair Manager");
}

export const click = (el) => fireEvent.click(el);
export const type = (el, value) => fireEvent.change(el, { target: { value } });

/** Compila il wizard riparazioni end-to-end (cliente esistente Mario Rossi). */
export async function runRepairWizard({ descrizione = "Anello oro test", materiali = "Oro 18k", marca = "Bulgari", referenza = "AB123", problema = "Maglia rotta", preventivo = "100", notaPreventivo = "Saldatura maglia" } = {}) {
  click(screen.getByText("+ Nuova Riparazione"));
  await screen.findByText("Chi prende la riparazione?");
  click(screen.getByText("Adri"));
  click(screen.getByText("Avanti →"));
  await screen.findByText("Chi è il cliente?");
  click(screen.getByText("Mario Rossi"));
  await screen.findByText("Che tipo di oggetto?");
  click(screen.getByText("Gioiello"));
  await screen.findByText("Che lavoro serve?");
  click(screen.getByText("Riparazione"));
  await screen.findByText("Descrivi l'oggetto");
  type(screen.getByPlaceholderText("Es. Anello in oro giallo con solitario brillante…"), descrizione);
  type(screen.getByPlaceholderText("Es. Oro 18k, argento 925…"), materiali);
  type(screen.getByPlaceholderText("Es. Bulgari, Rolex…"), marca);
  type(screen.getByPlaceholderText("Es. AB1234"), referenza);
  click(screen.getByText("Avanti →"));
  await screen.findByText("Descrivi il problema");
  type(screen.getByPlaceholderText("Es. Catena rotta a 3 cm dalla chiusura…"), problema);
  click(screen.getByText("Avanti →"));
  await screen.findByText("Preventivo e date");
  type(screen.getByPlaceholderText("0.00"), preventivo);
  type(screen.getByPlaceholderText("Es. Sostituzione maglia, pulizia e lucidatura…"), notaPreventivo);
  click(screen.getByText("Rivedi riepilogo →"));
  await screen.findByText("Tutto pronto!");
  click(screen.getByText(/Crea riparazione e stampa/));
  // il modal etichette conferma il salvataggio
  await screen.findByText(/^Etichette R/);
}
