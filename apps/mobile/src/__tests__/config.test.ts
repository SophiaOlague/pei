import { afterEach, describe, expect, it, jest } from "@jest/globals";

type ConfigModule = typeof import("@/lib/config");

// Evalúa config.ts de nuevo con el valor actual de la variable.
function loadConfig(): ConfigModule {
  let loaded: ConfigModule | undefined;
  jest.isolateModules(() => {
    loaded = jest.requireActual<ConfigModule>("@/lib/config");
  });
  return loaded as ConfigModule;
}

describe("config", () => {
  const original = process.env.EXPO_PUBLIC_API_URL;

  afterEach(() => {
    process.env.EXPO_PUBLIC_API_URL = original;
  });

  it("arma la ruta de Better Auth sin barra final duplicada", () => {
    process.env.EXPO_PUBLIC_API_URL = "http://backend.test/";
    const { API_URL, AUTH_BASE_URL } = loadConfig();
    expect(API_URL).toBe("http://backend.test");
    expect(AUTH_BASE_URL).toBe("http://backend.test/api/auth");
  });

  it("falla con un mensaje claro si falta la variable", () => {
    process.env.EXPO_PUBLIC_API_URL = "";
    expect(loadConfig).toThrow("EXPO_PUBLIC_API_URL");
  });
});
