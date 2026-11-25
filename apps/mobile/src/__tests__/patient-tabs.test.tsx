import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, jest } from "@jest/globals";
import { render } from "@testing-library/react-native";

import AppTabs from "@/components/app-tabs";

// Navegación principal del paciente (pestañas). «Mis citas» es la pantalla real (GET /me/patient/appointments) y
// sustituye al «Historial» de demostración. Se inspeccionan las pestañas declaradas y los archivos de ruta reales.

const triggers: { name: string; label: string }[] = [];
// Iconos de las pestañas (imágenes): Jest no los transforma.
jest.mock("@/lib/theme", () => ({ Colors: {} }));
jest.mock("@/assets/images/tabIcons/home.png", () => 1);
jest.mock("@/assets/images/tabIcons/lab.png", () => 1);
jest.mock("@/assets/images/tabIcons/user.png", () => 1);
jest.mock("expo-router/unstable-native-tabs", () => {
  const React = jest.requireActual<typeof import("react")>("react");
  const collectLabel = (children: unknown): string =>
    React.Children.toArray(children as never)
      .map((c) =>
        React.isValidElement(c) && (c.type as { label?: boolean }).label
          ? String((c.props as { children: unknown }).children)
          : ""
      )
      .join("");
  const Label = ({ children }: { children: unknown }) => children ?? null;
  Label.label = true;
  const Trigger = ({ name, children }: { name: string; children: unknown }) => {
    triggers.push({ label: collectLabel(children), name });
    return null;
  };
  Trigger.Label = Label;
  Trigger.Icon = function TriggerIcon() {
    return null;
  };
  const NativeTabs = ({ children }: { children: unknown }) => children ?? null;
  NativeTabs.Trigger = Trigger;
  return { NativeTabs };
});

// Jest corre desde apps/mobile (rootDir).
const APP = join(process.cwd(), "src", "app", "(app)");
const TABS = join(APP, "(tabs)");
const DEMO_SOURCES = /citas-demos|histllamada|detailscall/;

describe("Pestañas del paciente", () => {
  it("[TC-MOB-NAV-001] la pestaña «Mis citas» reemplaza a «Historial» y abre la ruta real", async () => {
    triggers.length = 0;
    await render(<AppTabs />);
    expect(triggers.map((t) => t.name)).toEqual([
      "home",
      "mis-citas",
      "lab",
      "options",
    ]);
    expect(triggers.find((t) => t.name === "mis-citas")?.label).toBe(
      "Mis citas"
    );
    expect(triggers.some((t) => t.label === "Historial")).toBe(false);
    // La pestaña es la misma pantalla que usan Inicio y el pago exitoso (/mis-citas): no hay una copia en el stack.
    expect(existsSync(join(TABS, "mis-citas.tsx"))).toBe(true);
    expect(existsSync(join(APP, "mis-citas.tsx"))).toBe(false);
    const stack = readFileSync(join(APP, "_layout.tsx"), "utf8");
    expect(stack).not.toContain('name="mis-citas"');
  });

  it("[TC-MOB-NAV-002] ninguna pantalla de demostración queda en la navegación principal", () => {
    // Las pantallas de llamadas de demostración se retiraron de las rutas.
    expect(existsSync(join(TABS, "histllamada.tsx"))).toBe(false);
    expect(existsSync(join(APP, "detailscall.tsx"))).toBe(false);
    expect(readFileSync(join(APP, "_layout.tsx"), "utf8")).not.toContain(
      'name="detailscall"'
    );
    // Cada pestaña existe como ruta y ninguna usa datos de demostración.
    for (const name of ["home", "mis-citas", "lab"]) {
      const source = readFileSync(join(TABS, `${name}.tsx`), "utf8");
      expect(source).not.toMatch(DEMO_SOURCES);
    }
    const myAppointments = readFileSync(join(TABS, "mis-citas.tsx"), "utf8");
    expect(myAppointments).toContain("listPatientAppointments");
  });
});
