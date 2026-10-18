import { vi } from "vitest";
import type {
  LegalDocument,
  PendingLegalDocument,
  RegistrationStatus,
} from "@/lib/api";

type Reply = { status: number; body: unknown };
type Handler = Reply | ((init: RequestInit | undefined) => Reply);

// fetch simulado por "MÉTODO /ruta" (sin origen ni query). Cada llamada queda registrada en orden.
export function mockFetch(routes: Record<string, Handler | Handler[]>) {
  const calls: { key: string; body: unknown }[] = [];
  const queues = new Map(
    Object.entries(routes).map(([k, v]) => [k, Array.isArray(v) ? [...v] : v]),
  );
  const fetchMock = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      const key = `${init?.method ?? "GET"} ${url.pathname}`;
      calls.push({
        key,
        body: init?.body ? JSON.parse(String(init.body)) : undefined,
      });
      const entry = queues.get(key);
      if (!entry) throw new Error(`Petición no simulada: ${key}`);
      const handler = Array.isArray(entry)
        ? entry.length > 1
          ? (entry.shift() as Handler)
          : entry[0]
        : entry;
      const reply = typeof handler === "function" ? handler(init) : handler;
      return new Response(JSON.stringify(reply.body), {
        status: reply.status,
        headers: { "Content-Type": "application/json" },
      });
    },
  );
  vi.stubGlobal("fetch", fetchMock);
  return { calls, fetchMock };
}

export const terms: LegalDocument = {
  id: "11111111-1111-4111-8111-111111111111",
  type: "patient_terms",
  version: "1.0",
  publishedAt: "2026-10-01T00:00:00.000Z",
  content: "Texto de los términos",
};

export const privacy: LegalDocument = {
  id: "22222222-2222-4222-8222-222222222222",
  type: "privacy_policy",
  version: "2.1",
  publishedAt: "2026-10-01T00:00:00.000Z",
  content: "Texto del aviso",
};

export const pendingOf = (doc: LegalDocument): PendingLegalDocument => ({
  type: doc.type,
  documentId: doc.id,
  version: doc.version,
});

export function status(
  overrides: Partial<RegistrationStatus> = {},
): RegistrationStatus {
  return {
    profileCompleted: true,
    legal: { accepted: true, pending: [] },
    identity: { status: "not_submitted", rejectionReason: null },
    registrationComplete: false,
    canBookAppointments: false,
    missing: ["identity_submission"],
    ...overrides,
  };
}

export const ok = (body: unknown): Reply => ({ status: 200, body });
