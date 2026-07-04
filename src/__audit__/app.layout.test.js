/* AUDIT — Compatibilità: breakpoint mobile/desktop (useW, BP=768). */
jest.mock("../supabase", () => require("./mocks/fakeSupabase"));

import { render, screen, fireEvent, act } from "@testing-library/react";
import App from "../App";
import { __fake } from "./mocks/fakeSupabase";
import { seedBase, unlockAndLoad } from "./helpers";

beforeEach(() => {
  __fake.reset();
  seedBase();
});

test("Layout <768px: tab bar mobile; ≥768px: sidebar — il resize commuta live", async () => {
  window.innerWidth = 500;
  render(<App />);
  await unlockAndLoad();

  // mobile: bottone header "+ Riparazione" (non "+ Nuova Riparazione" della sidebar)
  expect(screen.getByText("+ Riparazione")).toBeInTheDocument();
  expect(screen.queryByText("+ Nuova Riparazione")).toBeNull();
  expect(screen.getByText("Home")).toBeInTheDocument(); // tab bar

  act(() => {
    window.innerWidth = 1024;
    window.dispatchEvent(new Event("resize"));
  });
  expect(screen.getByText("+ Nuova Riparazione")).toBeInTheDocument();
  expect(screen.queryByText("+ Riparazione")).toBeNull();
});
