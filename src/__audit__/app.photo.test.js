/* AUDIT — Foto riparazioni (16-17/09/2026): la foto non veniva mai salvata.
 * 1) Bozza wizard: su iPhone Safari ricarica la pagina al ritorno dalla fotocamera
 *    e il wizard ripartiva vuoto (R2026-0578). La bozza in localStorage, foto inclusa,
 *    deve sopravvivere al remount e la foto deve essere caricata al salvataggio.
 * 2) Foto dal dettaglio: una riparazione creata senza foto deve poterla ricevere dopo.
 * DB e storage finti in memoria. Nessuna rete reale. */
jest.mock("../supabase", () => require("./mocks/fakeSupabase"));

import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import App from "../App";
import { __fake } from "./mocks/fakeSupabase";
import { seedBase, unlockAndLoad, click, type } from "./helpers";

const anno = new Date().getFullYear();

/* jsdom non decodifica immagini: Image non emette mai load/error e la vecchia
   compressImage restava appesa per sempre. Simuliamo il caso reale "foto non
   decodificabile" (onerror): preparePhoto deve ripiegare sul file originale. */
const RealImage = window.Image;
beforeAll(() => {
  window.Image = class {
    set src(_v) { setTimeout(() => this.onerror && this.onerror(new Error("no decode")), 0); }
  };
});
afterAll(() => { window.Image = RealImage; });

beforeEach(() => {
  __fake.reset();
  seedBase();
  localStorage.clear();
});

const fakePhoto = () => new File([new Uint8Array(2048)], "oggetto.jpg", { type: "image/jpeg" });
const fileInputs = () => Array.from(document.querySelectorAll('input[type="file"][accept="image/*"]'));

test("FIX foto — bozza wizard: dopo un reload (remount) descrizione e foto tornano, e la foto viene caricata al salvataggio", async () => {
  const first = render(<App />);
  await unlockAndLoad();
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
  type(screen.getByPlaceholderText("Es. Anello in oro giallo con solitario brillante…"), "Anello con foto");

  // scatta la foto (input nascosto del passo "Descrivi l'oggetto")
  const fotoInput = fileInputs().find((i) => i.previousSibling && /Scatta o carica foto/.test(i.previousSibling.textContent || ""));
  expect(fotoInput).toBeTruthy();
  fireEvent.change(fotoInput, { target: { files: [fakePhoto()] } });
  await waitFor(() => expect(screen.getByAltText("oggetto").getAttribute("src")).toMatch(/^data:image\/jpeg/));

  // la bozza è su disco, foto inclusa
  await waitFor(() => expect(JSON.parse(localStorage.getItem("repairWizardDraft")).form.fotoUrl).toMatch(/^data:/));

  // "Safari ricarica la pagina": smonta tutto e rimonta
  first.unmount();
  render(<App />);
  await screen.findByText("Repair Manager");
  click(screen.getByText("+ Nuova Riparazione"));
  await screen.findByText("Descrivi l'oggetto");
  expect(screen.getByPlaceholderText("Es. Anello in oro giallo con solitario brillante…").value).toBe("Anello con foto");
  expect(screen.getByAltText("oggetto").getAttribute("src")).toMatch(/^data:image\/jpeg/);

  // completa e salva
  click(screen.getByText("Avanti →"));
  await screen.findByText("Descrivi il problema");
  type(screen.getByPlaceholderText("Es. Catena rotta a 3 cm dalla chiusura…"), "Maglia rotta");
  click(screen.getByText("Avanti →"));
  await screen.findByText("Preventivo e date");
  click(screen.getByText("Rivedi riepilogo →"));
  await screen.findByText("Tutto pronto!");
  click(screen.getByText(/Crea riparazione e stampa/));
  await screen.findByText(/^Etichette R/);

  const r = __fake.db.repairs[0];
  expect(r.numero).toBe(`R${anno}-0001`);
  expect(r.descrizione).toBe("Anello con foto");
  expect(r.foto_url).toBe(`https://fake.storage.local/repair-photos/repairs/${r.id}.jpg`);
  // bozza cancellata dopo il salvataggio
  expect(localStorage.getItem("repairWizardDraft")).toBeNull();
});

test("FIX foto — annulla esplicito del wizard butta la bozza", async () => {
  render(<App />);
  await unlockAndLoad();
  click(screen.getByText("+ Nuova Riparazione"));
  await screen.findByText("Chi prende la riparazione?");
  click(screen.getByText("Adri"));
  click(screen.getByText("Avanti →"));
  await screen.findByText("Chi è il cliente?");
  await waitFor(() => expect(localStorage.getItem("repairWizardDraft")).toBeTruthy());
  click(screen.getByText("✕ Annulla"));
  await waitFor(() => expect(screen.queryByText("Chi è il cliente?")).toBeNull());
  expect(localStorage.getItem("repairWizardDraft")).toBeNull();
});

test("FIX foto — dal dettaglio: 'Aggiungi foto dell'oggetto' carica sullo storage e salva foto_url", async () => {
  __fake.seed("repairs", [{ id: "r578", numero: `R${anno}-0578`, customer_id: "c1", categoria: "Gioiello", descrizione: "Anello senza foto", status: "ricevuto", eliminata: false, data_ricevuta: "2026-09-16", foto_url: null }]);
  render(<App />);
  await unlockAndLoad();
  click(screen.getAllByText(`R${anno}-0578`)[0]);
  const btn = await screen.findByText("📷 Aggiungi foto dell'oggetto");
  const input = btn.parentElement.querySelector('input[type="file"]');
  expect(input).toBeTruthy();
  fireEvent.change(input, { target: { files: [fakePhoto()] } });

  await waitFor(() => expect(__fake.db.repairs.find((x) => x.id === "r578").foto_url).toMatch(/^https:\/\/fake\.storage\.local\/repair-photos\/repairs\/r578\.jpg\?v=\d+$/));
  await screen.findByText("📷 Sostituisci foto");
  expect(screen.getByAltText("oggetto").getAttribute("src")).toMatch(/repairs\/r578\.jpg\?v=/);
});
