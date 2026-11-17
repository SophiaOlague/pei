import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import {
  act,
  fireEvent,
  renderRouter,
  screen,
} from "expo-router/testing-library";
import { Text } from "react-native";

import RootLayout from "@/app/_layout";
import RegisterScreen from "@/app/(auth)/register";

type SessionState = {
  data: { user: { id: string } } | null;
  isPending: boolean;
};

// Estado de useSession controlado desde la prueba, con la misma forma que el átomo de Better Auth.
let mockSessionState: SessionState = { data: null, isPending: true };
const mockListeners = new Set<() => void>();

async function setSession(next: SessionState) {
  await act(() => {
    mockSessionState = next;
    for (const listener of mockListeners) {
      listener();
    }
  });
}

jest.mock("@/lib/auth-client", () => {
  const { useSyncExternalStore } =
    jest.requireActual<typeof import("react")>("react");
  return {
    authClient: {
      signUp: { email: jest.fn() },
      useSession: () =>
        useSyncExternalStore(
          (listener: () => void) => {
            mockListeners.add(listener);
            return () => mockListeners.delete(listener);
          },
          () => mockSessionState
        ),
    },
  };
});

jest.mock("@/components/animated-icon", () => ({
  AnimatedSplashOverlay: () => null,
}));

jest.mock("expo-symbols", () => ({ SymbolView: () => null }));

const routes = {
  _layout: RootLayout,
  "(app)/_layout": () => <Text>Contenido protegido</Text>,
  "(auth)/_layout": RegisterScreen,
};

beforeEach(() => {
  mockSessionState = { data: null, isPending: true };
  mockListeners.clear();
});

describe("RootLayout", () => {
  it("no muestra ninguna pantalla mientras se confirma la sesión inicial", async () => {
    await renderRouter(routes, { initialUrl: "/" });
    expect(screen.queryByText("Crea tu cuenta")).toBeNull();
    expect(screen.queryByText("Contenido protegido")).toBeNull();

    await setSession({ data: null, isPending: false });
    expect(screen.getByText("Crea tu cuenta")).toBeTruthy();
    expect(screen.queryByText("Contenido protegido")).toBeNull();
  });

  it("conserva el formulario cuando get-session se repite al volver a primer plano", async () => {
    await setSession({ data: null, isPending: false });
    await renderRouter(routes, { initialUrl: "/" });

    await fireEvent.changeText(
      screen.getByPlaceholderText("Ingresa tus nombres"),
      "Sophy"
    );
    await fireEvent.changeText(
      screen.getByPlaceholderText("Ingresa tu email"),
      "persona@ejemplo.com"
    );

    // Better Auth marca isPending de nuevo (sin sesión) y luego responde null.
    await setSession({ data: null, isPending: true });
    expect(screen.getByDisplayValue("Sophy")).toBeTruthy();
    expect(screen.getByDisplayValue("persona@ejemplo.com")).toBeTruthy();

    await setSession({ data: null, isPending: false });
    expect(screen.getByDisplayValue("Sophy")).toBeTruthy();
    expect(screen.queryByText("Contenido protegido")).toBeNull();
  });

  it("abre las rutas protegidas solo con una sesión confirmada", async () => {
    await setSession({ data: null, isPending: false });
    await renderRouter(routes, { initialUrl: "/" });
    expect(screen.queryByText("Contenido protegido")).toBeNull();

    await setSession({ data: { user: { id: "u1" } }, isPending: false });
    expect(screen.getByText("Contenido protegido")).toBeTruthy();
    expect(screen.queryByText("Crea tu cuenta")).toBeNull();

    // Si una consulta posterior ya no devuelve sesión, se vuelve a las pantallas de acceso.
    await setSession({ data: null, isPending: false });
    expect(screen.queryByText("Contenido protegido")).toBeNull();
    expect(screen.getByText("Crea tu cuenta")).toBeTruthy();
  });
});
