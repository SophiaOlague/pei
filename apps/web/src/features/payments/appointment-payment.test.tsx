import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PatientPayment } from "@/lib/api";
import { mockFetch } from "@/test/http";
import {
  AppointmentPayment,
  idempotencyStorageKey,
  paymentMessage,
} from "./appointment-payment";
import {
  loadStripe,
  resetStripeForTests,
  STRIPE_SDK_URL,
  type StripeError,
  stripePublishableKey,
} from "./stripe-sdk";

// Checkout web con un Stripe.js SIMULADO: sin red, sin Stripe y sin backend real. El elemento real captura la tarjeta
// dentro de un iframe de Stripe; aquí el doble entrega directamente el resultado de createPaymentMethod.
const APPOINTMENT_ID = "11111111-1111-4111-8111-111111111111";
const PAYMENT_ID = "22222222-2222-4222-8222-222222222222";
// Clave publicable SINTÉTICA (no es de ninguna cuenta).
const PUBLISHABLE_KEY = "pk_test_sintetica0000";
const PAYMENT_METHOD = "pm_sintetico00001";
const CLIENT_SECRET = "pi_sintetico_secret_sintetico";
const PAY = `POST /me/patient/appointments/${APPOINTMENT_ID}/payment`;
const SYNC = `POST /me/patient/payments/${PAYMENT_ID}/sync`;
const GET = `GET /me/patient/appointments/${APPOINTMENT_ID}`;
const APPOINTMENT = {
  id: APPOINTMENT_ID,
  status: "pending_payment",
  scheduledAt: "2026-11-20T16:00:00.000Z",
  price: "200.00",
  holdExpiresAt: "2026-11-15T12:05:00.000Z",
};
const payment = (over: Partial<PatientPayment>): PatientPayment => ({
  paymentId: PAYMENT_ID,
  status: "succeeded",
  amount: "200.00",
  currency: "MXN",
  appointmentConfirmed: true,
  confirmation: { result: "confirmed" },
  recoverable: false,
  ...over,
});
const pendingAuth = payment({
  status: "processing",
  appointmentConfirmed: false,
  confirmation: { result: "not_requested" },
  nextAction: { type: "stripe_sdk", clientSecret: CLIENT_SECRET },
});

interface FakeCard {
  options: unknown;
  handlers: Record<
    string,
    (e: { complete?: boolean; error?: StripeError }) => void
  >;
  mount: ReturnType<typeof vi.fn>;
  unmount: ReturnType<typeof vi.fn>;
}

let stripe: {
  instances: { key: string; options: unknown }[];
  cards: FakeCard[];
  createPaymentMethod: ReturnType<typeof vi.fn>;
  handleNextAction: ReturnType<typeof vi.fn>;
};

beforeEach(() => {
  sessionStorage.clear();
  resetStripeForTests();
  vi.stubEnv("NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY", PUBLISHABLE_KEY);
  stripe = {
    instances: [],
    cards: [],
    createPaymentMethod: vi.fn(async () => ({
      paymentMethod: { id: PAYMENT_METHOD },
    })),
    handleNextAction: vi.fn(async () => ({
      paymentIntent: { status: "succeeded" },
    })),
  };
  window.Stripe = ((key: string, options?: unknown) => {
    stripe.instances.push({ key, options });
    return {
      elements: () => ({
        create: (_type: "card", cardOptions?: unknown) => {
          const card: FakeCard = {
            options: cardOptions,
            handlers: {},
            mount: vi.fn(),
            unmount: vi.fn(),
          };
          stripe.cards.push(card);
          return {
            mount: card.mount,
            unmount: card.unmount,
            on: (event: string, handler: FakeCard["handlers"][string]) => {
              card.handlers[event] = handler;
            },
          };
        },
      }),
      createPaymentMethod: stripe.createPaymentMethod,
      handleNextAction: stripe.handleNextAction,
    };
  }) as unknown as Window["Stripe"];
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  delete window.Stripe;
});

const lastCard = () => stripe.cards[stripe.cards.length - 1];

// El elemento avisa que está listo y que la tarjeta está completa (lo que hace Stripe al escribirla en su iframe).
async function fillCard() {
  await waitFor(() => expect(lastCard()?.handlers.change).toBeDefined());
  await act(async () => {
    lastCard().handlers.ready({});
    lastCard().handlers.change({ complete: true });
  });
}

async function renderPayment() {
  render(<AppointmentPayment appointmentId={APPOINTMENT_ID} />);
  await fillCard();
}

async function pay() {
  await userEvent.click(screen.getByRole("button", { name: "Pagar" }));
}

function headersOf(init: RequestInit | undefined): Record<string, string> {
  return (init?.headers ?? {}) as Record<string, string>;
}

describe("Checkout web · formulario de Stripe", () => {
  it("muestra el importe de la cita y monta el elemento de tarjeta con la clave publicable", async () => {
    mockFetch({ [GET]: { status: 200, body: APPOINTMENT } });
    await renderPayment();
    expect(screen.getByLabelText("Importe de la consulta")).toHaveTextContent(
      "$200.00 MXN",
    );
    expect(stripe.instances).toEqual([
      { key: PUBLISHABLE_KEY, options: { locale: "es-419" } },
    ]);
    expect(lastCard().mount).toHaveBeenCalledWith(
      screen.getByTestId("stripe-card-element"),
    );
    // Stripe nunca recibe el importe desde el navegador: lo cobra el backend.
    expect(JSON.stringify(lastCard().options)).not.toMatch(/amount|200/);
  });

  it("el botón Pagar solo se habilita con la tarjeta completa y muestra el error que informa Stripe", async () => {
    mockFetch({ [GET]: { status: 200, body: APPOINTMENT } });
    render(<AppointmentPayment appointmentId={APPOINTMENT_ID} />);
    await waitFor(() => expect(lastCard()?.handlers.ready).toBeDefined());
    await act(async () => lastCard().handlers.ready({}));
    expect(screen.getByRole("button", { name: "Pagar" })).toBeDisabled();
    await act(async () =>
      lastCard().handlers.change({
        complete: false,
        error: { message: "El número de tu tarjeta está incompleto." },
      }),
    );
    expect(screen.getByRole("alert")).toHaveTextContent("incompleto");
    await act(async () => lastCard().handlers.change({ complete: true }));
    expect(screen.getByRole("button", { name: "Pagar" })).toBeEnabled();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("sin clave publicable (o con una clave secreta por error) no se muestra el formulario", async () => {
    vi.stubEnv("NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY", "");
    render(<AppointmentPayment appointmentId={APPOINTMENT_ID} />);
    expect(screen.getByRole("alert")).toHaveTextContent("no está disponible");
    expect(stripe.cards).toEqual([]);
    for (const key of [
      "sk_test_sintetica0000",
      "rk_test_sintetica0000",
      "sk_live_sintetica0000",
      "whsec_sintetico0000",
      "APP_USR-c3e21d2c-59f4",
      "pk_test_",
    ]) {
      expect(stripePublishableKey({ key })).toBeNull();
    }
    expect(stripePublishableKey({ key: ` ${PUBLISHABLE_KEY} ` })).toBe(
      PUBLISHABLE_KEY,
    );
  });

  it("una cita que ya no está en pending_payment no muestra el formulario", async () => {
    mockFetch({
      [GET]: { status: 200, body: { ...APPOINTMENT, status: "expired" } },
    });
    render(<AppointmentPayment appointmentId={APPOINTMENT_ID} />);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "ya no admite pago",
    );
    expect(stripe.cards).toEqual([]);
  });

  it("si Stripe no puede tokenizar la tarjeta, se muestra su mensaje y no se llama a PEI", async () => {
    const { calls } = mockFetch({ [GET]: { status: 200, body: APPOINTMENT } });
    stripe.createPaymentMethod.mockResolvedValueOnce({
      error: { message: "Tu tarjeta fue rechazada." },
    });
    await renderPayment();
    await pay();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Tu tarjeta fue rechazada.",
    );
    expect(calls.filter((c) => c.key === PAY)).toEqual([]);
  });
});

describe("Checkout web · envío a PEI", () => {
  it("envía solo la referencia del medio de pago, con Idempotency-Key y SIN importe", async () => {
    let init: RequestInit | undefined;
    const { calls } = mockFetch({
      [GET]: { status: 200, body: APPOINTMENT },
      [PAY]: (i) => {
        init = i;
        return { status: 200, body: payment({}) };
      },
    });
    await renderPayment();
    await pay();
    await screen.findByText("Pago aprobado: tu consulta está confirmada");
    expect(calls.find((c) => c.key === PAY)?.body).toEqual({
      token: PAYMENT_METHOD,
    });
    expect(stripe.createPaymentMethod).toHaveBeenCalledTimes(1);
    expect(stripe.createPaymentMethod.mock.calls[0][0]).toMatchObject({
      type: "card",
    });
    expect(headersOf(init)["Idempotency-Key"]).toMatch(/^pay-[0-9a-f-]{36}$/);
    expect(init?.credentials).toBe("include");
  });

  it("idempotencia: un error de red conserva la clave y el reintento usa la misma", async () => {
    const keys: string[] = [];
    mockFetch({
      [GET]: { status: 200, body: APPOINTMENT },
      [PAY]: [
        (i) => {
          keys.push(headersOf(i)["Idempotency-Key"]);
          throw new TypeError("network");
        },
        (i) => {
          keys.push(headersOf(i)["Idempotency-Key"]);
          return { status: 200, body: payment({}) };
        },
      ],
    });
    await renderPayment();
    await pay();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "No se pudo conectar con el servidor",
    );
    await waitFor(() => expect(stripe.cards).toHaveLength(2));
    await fillCard();
    await pay();
    await screen.findByText("Pago aprobado: tu consulta está confirmada");
    expect(keys).toHaveLength(2);
    expect(keys[0]).toBe(keys[1]);
    expect(sessionStorage.getItem(idempotencyStorageKey(APPOINTMENT_ID))).toBe(
      keys[0],
    );
  });

  it("un rechazo renueva la clave para el siguiente intento", async () => {
    const keys: string[] = [];
    mockFetch({
      [GET]: { status: 200, body: APPOINTMENT },
      [PAY]: [
        (i) => {
          keys.push(headersOf(i)["Idempotency-Key"]);
          return {
            status: 200,
            body: payment({
              status: "failed",
              appointmentConfirmed: false,
              confirmation: { result: "not_requested" },
            }),
          };
        },
        (i) => {
          keys.push(headersOf(i)["Idempotency-Key"]);
          return { status: 200, body: payment({}) };
        },
      ],
    });
    await renderPayment();
    await pay();
    expect(
      await screen.findByText("Tu pago fue rechazado"),
    ).toBeInTheDocument();
    await waitFor(() => expect(stripe.cards).toHaveLength(2));
    await fillCard();
    await pay();
    expect(
      await screen.findByText("Pago aprobado: tu consulta está confirmada"),
    ).toBeInTheDocument();
    expect(keys[0]).not.toBe(keys[1]);
  });
});

describe("Checkout web · autenticación 3-D Secure", () => {
  it("con nextAction, Stripe muestra el reto y el resultado sale del backend: aprobado → consulta confirmada", async () => {
    const { calls } = mockFetch({
      [GET]: { status: 200, body: APPOINTMENT },
      [PAY]: { status: 200, body: pendingAuth },
      [SYNC]: { status: 200, body: payment({}) },
    });
    await renderPayment();
    await pay();
    expect(
      await screen.findByText("Pago aprobado: tu consulta está confirmada"),
    ).toBeInTheDocument();
    expect(stripe.handleNextAction).toHaveBeenCalledWith({
      clientSecret: CLIENT_SECRET,
    });
    expect(calls.map((c) => c.key)).toEqual([GET, PAY, SYNC]);
  });

  it("que el navegador diga «aprobado» no confirma nada: si el backend aún no lo ve aprobado, la consulta no se muestra confirmada", async () => {
    mockFetch({
      [GET]: { status: 200, body: APPOINTMENT },
      [PAY]: { status: 200, body: pendingAuth },
      [SYNC]: { status: 200, body: { ...pendingAuth, nextAction: undefined } },
    });
    await renderPayment();
    await pay();
    expect(
      await screen.findByText("Tu pago se está procesando"),
    ).toBeInTheDocument();
    expect(screen.queryByText(/consulta está confirmada/)).toBeNull();
    expect(
      screen.getByRole("button", { name: "Consultar estado del pago" }),
    ).toBeInTheDocument();
  });

  it("autenticación rechazada: el backend informa failed, se renueva la clave y se puede reintentar", async () => {
    stripe.handleNextAction.mockResolvedValueOnce({
      error: { message: "No pudimos autenticar tu medio de pago." },
    });
    mockFetch({
      [GET]: { status: 200, body: APPOINTMENT },
      [PAY]: { status: 200, body: pendingAuth },
      [SYNC]: {
        status: 200,
        body: payment({
          status: "failed",
          appointmentConfirmed: false,
          confirmation: { result: "not_requested" },
        }),
      },
    });
    await renderPayment();
    const before = sessionStorage.getItem(
      idempotencyStorageKey(APPOINTMENT_ID),
    );
    await pay();
    expect(
      await screen.findByText("Tu pago fue rechazado"),
    ).toBeInTheDocument();
    await waitFor(() => expect(stripe.cards).toHaveLength(2));
    expect(
      sessionStorage.getItem(idempotencyStorageKey(APPOINTMENT_ID)),
    ).not.toBe(before);
  });

  it("si el reto falla de forma inesperada o no se puede consultar el estado, queda en proceso y se puede consultar después", async () => {
    stripe.handleNextAction.mockRejectedValueOnce(new Error("sdk"));
    mockFetch({
      [GET]: { status: 200, body: APPOINTMENT },
      [PAY]: { status: 200, body: pendingAuth },
      [SYNC]: [
        { status: 503, body: { message: "x" } },
        { status: 200, body: payment({}) },
      ],
    });
    await renderPayment();
    await pay();
    expect(
      await screen.findByText("Tu pago se está procesando"),
    ).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: "Consultar estado del pago" }),
    );
    expect(
      await screen.findByText("Pago aprobado: tu consulta está confirmada"),
    ).toBeInTheDocument();
  });
});

describe("Checkout web · estados para el paciente", () => {
  it("succeeded + confirmed: confirma la consulta y oculta el formulario", async () => {
    mockFetch({
      [GET]: { status: 200, body: APPOINTMENT },
      [PAY]: { status: 200, body: payment({}) },
    });
    await renderPayment();
    await pay();
    expect(
      await screen.findByText("Pago aprobado: tu consulta está confirmada"),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("stripe-card-element")).toBeNull();
  });

  it("processing sin acción pendiente: no muestra la consulta confirmada y permite sincronizar hasta la confirmación", async () => {
    const processing = payment({
      status: "processing",
      appointmentConfirmed: false,
      confirmation: { result: "not_requested" },
    });
    const { calls } = mockFetch({
      [GET]: { status: 200, body: APPOINTMENT },
      [PAY]: { status: 200, body: processing },
      [SYNC]: [
        { status: 200, body: processing },
        {
          status: 200,
          body: payment({ confirmation: { result: "already_confirmed" } }),
        },
      ],
    });
    await renderPayment();
    await pay();
    expect(
      await screen.findByText("Tu pago se está procesando"),
    ).toBeInTheDocument();
    expect(screen.queryByText(/consulta está confirmada/)).toBeNull();
    expect(screen.queryByTestId("stripe-card-element")).toBeNull();
    expect(stripe.handleNextAction).not.toHaveBeenCalled();
    await userEvent.click(
      screen.getByRole("button", { name: "Consultar estado del pago" }),
    );
    expect(
      await screen.findByText("Tu pago se está procesando"),
    ).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: "Consultar estado del pago" }),
    );
    expect(
      await screen.findByText("Pago aprobado: tu consulta está confirmada"),
    ).toBeInTheDocument();
    expect(calls.filter((c) => c.key === SYNC)).toHaveLength(2);
    expect(calls.filter((c) => c.key === PAY)).toHaveLength(1);
  });

  it("succeeded + not_confirmable: no se muestra confirmación exitosa", async () => {
    mockFetch({
      [GET]: { status: 200, body: APPOINTMENT },
      [PAY]: {
        status: 200,
        body: payment({
          appointmentConfirmed: false,
          confirmation: { result: "not_confirmable", reason: "expired" },
        }),
      },
    });
    await renderPayment();
    await pay();
    expect(
      await screen.findByText(
        "Recibimos tu pago, pero no pudimos confirmar la consulta",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText(/NO está confirmada/)).toBeInTheDocument();
    expect(
      screen.queryByText("Pago aprobado: tu consulta está confirmada"),
    ).toBeNull();
  });

  it("succeeded + confirmación fallida: no se muestra confirmada y ofrece sincronizar", async () => {
    mockFetch({
      [GET]: { status: 200, body: APPOINTMENT },
      [PAY]: {
        status: 200,
        body: payment({
          appointmentConfirmed: false,
          confirmation: { result: "confirmation_failed" },
          recoverable: true,
        }),
      },
    });
    await renderPayment();
    await pay();
    expect(
      await screen.findByText(
        "Recibimos tu pago; estamos confirmando tu consulta",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Consultar estado del pago" }),
    ).toBeInTheDocument();
  });

  it.each([
    ["pending", "Tu pago está pendiente", true],
    ["failed", "Tu pago fue rechazado", true],
    ["canceled", "El pago fue cancelado", true],
  ] as const)("%s: mensaje y reintento", (status, title, retry) => {
    const m = paymentMessage(
      payment({
        status,
        appointmentConfirmed: false,
        confirmation: { result: "not_requested" },
      }),
    );
    expect(m).toMatchObject({ title, retry });
  });

  it("un error del servidor se muestra sin confirmar", async () => {
    mockFetch({
      [GET]: { status: 200, body: APPOINTMENT },
      [PAY]: { status: 503, body: { message: "x" } },
    });
    await renderPayment();
    await pay();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "El servidor no pudo completar la operación",
    );
    expect(screen.queryByText(/consulta está confirmada/)).toBeNull();
  });
});

describe("Checkout web · sin datos sensibles", () => {
  it("ni los logs, ni el almacenamiento, ni las peticiones a PEI contienen datos de tarjeta, secretos o credenciales", async () => {
    const logged: string[] = [];
    for (const level of ["log", "info", "warn", "error", "debug"] as const) {
      vi.spyOn(console, level).mockImplementation(
        (...args: unknown[]) => void logged.push(args.map(String).join(" ")),
      );
    }
    const { calls } = mockFetch({
      [GET]: { status: 200, body: APPOINTMENT },
      [PAY]: { status: 200, body: pendingAuth },
      [SYNC]: { status: 200, body: payment({}) },
    });
    await renderPayment();
    await pay();
    await screen.findByText("Pago aprobado: tu consulta está confirmada");
    const storage =
      Object.keys(sessionStorage)
        .map((k) => `${k}=${sessionStorage.getItem(k)}`)
        .join("\n") + Object.keys(localStorage).join("\n");
    const requests = JSON.stringify(calls);
    for (const haystack of [logged.join("\n"), storage, requests]) {
      expect(haystack).not.toMatch(
        /4242424242424242|card_number|cvc|cvv|sk_test_|sk_live_|whsec_|_secret_|amount/i,
      );
    }
    // Ni la referencia de la tarjeta ni el secreto del pago se guardan en el navegador.
    expect(storage).not.toContain(PAYMENT_METHOD);
    expect(storage).not.toContain(CLIENT_SECRET);
    expect(Object.keys(localStorage)).toEqual([]);
  });
});

describe("Checkout web · SDK de Stripe", () => {
  it("carga el script oficial de Stripe una sola vez", async () => {
    delete window.Stripe;
    const appended: HTMLScriptElement[] = [];
    const spy = vi
      .spyOn(document.head, "appendChild")
      .mockImplementation((node) => {
        appended.push(node as HTMLScriptElement);
        return node;
      });
    const a = loadStripe();
    const b = loadStripe();
    expect(appended).toHaveLength(1);
    expect(appended[0].src).toBe(STRIPE_SDK_URL);
    expect(STRIPE_SDK_URL).toBe("https://js.stripe.com/v3");
    window.Stripe = (() => ({})) as unknown as Window["Stripe"];
    appended[0].onload?.(new Event("load"));
    await expect(a).resolves.toBe(window.Stripe);
    await expect(b).resolves.toBe(window.Stripe);
    spy.mockRestore();
  });
});
