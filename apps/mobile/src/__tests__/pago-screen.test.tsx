import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react-native";

import PaymentScreen from "@/app/(app)/pago";
import { stripePublishableKey } from "@/lib/stripe";

// F4 móvil: pago con Stripe (mismo flujo que apps/web). El SDK @stripe/stripe-react-native está SIMULADO: sin red, sin
// Stripe y sin backend real. El resultado que se muestra es siempre el que devuelve el backend (fetch simulado).
const APPOINTMENT_ID = "11111111-1111-4111-8111-111111111111";
const PAYMENT_ID = "22222222-2222-4222-8222-222222222222";
const PUBLISHABLE_KEY = "pk_test_sintetica0000";
const PM_ID = "pm_sintetico_0001";
const CLIENT_SECRET = "pi_sintetico_secret_0001";
const APPOINTMENT = {
  holdExpiresAt: null,
  id: APPOINTMENT_ID,
  price: "650.00",
  scheduledAt: "2026-11-20T16:00:00.000Z",
  status: "pending_payment",
};

const mockParams: { appointmentId?: string } = {
  appointmentId: APPOINTMENT_ID,
};
const mockDismissTo = jest.fn();
const mockNavigate = jest.fn();
jest.mock("expo-router", () => ({
  router: {
    dismissTo: (...args: unknown[]) => mockDismissTo(...args),
    navigate: (...args: unknown[]) => mockNavigate(...args),
  },
  useLocalSearchParams: () => mockParams,
}));
jest.mock("expo-linking", () => ({
  createURL: (path: string) => `gestinovo://${path}`,
}));
jest.mock("@/lib/auth-client", () => ({
  authClient: {
    getCookie: () => Promise.resolve("better-auth.session_token=abc"),
  },
}));
const mockStore = new Map<string, string>();
jest.mock("expo-secure-store", () => ({
  getItemAsync: (k: string) => Promise.resolve(mockStore.get(k) ?? null),
  setItemAsync: (k: string, v: string) => {
    mockStore.set(k, v);
    return Promise.resolve();
  },
}));

type StripeResult = {
  paymentMethod?: { id: string };
  error?: { code: string; message: string; localizedMessage?: string };
};
const mockStripe = {
  createPaymentMethod: jest.fn<(params: unknown) => Promise<StripeResult>>(),
  handleNextAction:
    jest.fn<(secret: string, returnUrl?: string) => Promise<StripeResult>>(),
  providerProps: [] as Record<string, unknown>[],
};
type CardFieldProps = {
  testID: string;
  onCardChange: (d: { complete: boolean }) => void;
};
const mockCardFields: CardFieldProps[] = [];
jest.mock("@stripe/stripe-react-native", () => {
  const { View } =
    jest.requireActual<typeof import("react-native")>("react-native");
  const React = jest.requireActual<typeof import("react")>("react");
  return {
    CardField: (props: CardFieldProps) => {
      mockCardFields.push(props);
      return React.createElement(View, { testID: props.testID });
    },
    StripeProvider: (
      props: { children: unknown } & Record<string, unknown>
    ) => {
      mockStripe.providerProps.push(props);
      return props.children;
    },
    useStripe: () => ({
      createPaymentMethod: mockStripe.createPaymentMethod,
      handleNextAction: mockStripe.handleNextAction,
    }),
  };
});

type Reply = { status: number; body: unknown } | Error;
let routes: Record<string, Reply[]>;
const sent: { key: string; init?: RequestInit }[] = [];
function reply(r: Reply): Promise<Response> {
  if (r instanceof Error) {
    return Promise.reject(r);
  }
  return Promise.resolve({
    json: () => Promise.resolve(r.body),
    ok: r.status < 300,
    status: r.status,
  } as Response);
}
const PAY_BUTTON = /^Pagar /;
const AUTH_CANCELED = /Cancelaste la verificación de tu banco/;
const NOT_PAYABLE = /Esta cita ya no admite pago/;
const KEY_SHAPE = /^pay-/;
const NETWORK_ERROR = /No pudimos conectar con el servidor/;
const CONFIRMED = /Pago exitoso|consulta está confirmada|cita quedó confirmada/;
const SENSITIVE = /pm_|secret|4242/;
const AUTO_SYNC = /consultando el estado automáticamente/;
const PAY = `POST /me/patient/appointments/${APPOINTMENT_ID}/payment`;
const SYNC = `POST /me/patient/payments/${PAYMENT_ID}/sync`;
const GET = `GET /me/patient/appointments/${APPOINTMENT_ID}`;
const payment = (over: Record<string, unknown> = {}) => ({
  amount: "650.00",
  appointmentConfirmed: true,
  confirmation: { result: "confirmed" },
  currency: "MXN",
  paymentId: PAYMENT_ID,
  recoverable: false,
  status: "succeeded",
  ...over,
});
const processingWith3ds = payment({
  appointmentConfirmed: false,
  confirmation: { result: "not_requested" },
  nextAction: { clientSecret: CLIENT_SECRET, type: "stripe_sdk" },
  recoverable: true,
  status: "processing",
});

beforeEach(() => {
  mockCardFields.length = 0;
  mockStripe.providerProps.length = 0;
  mockStripe.createPaymentMethod.mockReset();
  mockStripe.createPaymentMethod.mockResolvedValue({
    paymentMethod: { id: PM_ID },
  });
  mockStripe.handleNextAction.mockReset();
  mockStripe.handleNextAction.mockResolvedValue({});
  mockStore.clear();
  sent.length = 0;
  mockParams.appointmentId = APPOINTMENT_ID;
  process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY = PUBLISHABLE_KEY;
  routes = { [GET]: [{ body: APPOINTMENT, status: 200 }] };
  global.fetch = jest.fn((input: string, init?: RequestInit) => {
    const key = `${init?.method ?? "GET"} ${new URL(input).pathname}`;
    sent.push({ init, key });
    const queue = routes[key];
    if (!queue?.length) {
      return Promise.reject(new Error(`no simulada: ${key}`));
    }
    return reply(queue.length > 1 ? (queue.shift() as Reply) : queue[0]);
  }) as unknown as typeof fetch;
});

async function renderScreen(): Promise<void> {
  await render(<PaymentScreen />);
  await waitFor(() => expect(mockCardFields.length).toBeGreaterThan(0));
}
const lastCardField = () => mockCardFields.at(-1) as CardFieldProps;
// Completa la tarjeta en CardField (simulado) y pulsa «Pagar».
async function payWithCard(): Promise<void> {
  await waitFor(() => expect(mockCardFields.length).toBeGreaterThan(0));
  await act(async () => lastCardField().onCardChange({ complete: true }));
  await act(async () => fireEvent.press(screen.getByText(PAY_BUTTON)));
}
const payBody = () =>
  JSON.parse(String(sent.find((s) => s.key === PAY)?.init?.body));
const keys = () =>
  sent
    .filter((s) => s.key === PAY)
    .map(
      (s) =>
        ((s.init?.headers ?? {}) as Record<string, string>)["Idempotency-Key"]
    );
const pays = () => sent.filter((s) => s.key === PAY);

describe("pago.tsx con Stripe", () => {
  it("muestra el importe del backend y CardField del SDK, sin campos propios de tarjeta", async () => {
    await renderScreen();
    expect(screen.getByLabelText("Importe de la consulta")).toHaveTextContent(
      "$650.00 MXN"
    );
    expect(screen.getByTestId("stripe-card-field")).toBeTruthy();
    expect(screen.queryByPlaceholderText("1234 5678 9101 1123")).toBeNull();
    expect(screen.queryByText("CVV")).toBeNull();
    expect(mockStripe.providerProps[0]).toMatchObject({
      publishableKey: PUBLISHABLE_KEY,
      urlScheme: "gestinovo",
    });
  });

  it("«Pagar» está deshabilitado hasta que la tarjeta está completa", async () => {
    await renderScreen();
    await act(async () => fireEvent.press(screen.getByText(PAY_BUTTON)));
    expect(mockStripe.createPaymentMethod).not.toHaveBeenCalled();
    expect(pays()).toHaveLength(0);
  });

  it("sin cita reservada o sin clave publicable válida no se muestra el formulario", async () => {
    mockParams.appointmentId = undefined;
    await render(<PaymentScreen />);
    expect(
      screen.getByText("Reserva un horario antes de pagar tu consulta.")
    ).toBeTruthy();
    expect(mockCardFields).toHaveLength(0);

    mockParams.appointmentId = APPOINTMENT_ID;
    process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY = "sk_test_secreta000";
    await render(<PaymentScreen />);
    expect(
      screen.getByText(
        "El pago con tarjeta no está disponible en este momento."
      )
    ).toBeTruthy();
    expect(mockCardFields).toHaveLength(0);
  });

  it("la clave debe ser publicable (pk_…); una secreta o restringida se rechaza", () => {
    expect(stripePublishableKey(PUBLISHABLE_KEY)).toBe(PUBLISHABLE_KEY);
    expect(stripePublishableKey("")).toBeNull();
    expect(stripePublishableKey("sk_test_abc123")).toBeNull();
    expect(stripePublishableKey("rk_test_abc123")).toBeNull();
    expect(stripePublishableKey("TEST-1234567890")).toBeNull();
  });
});

describe("envío de la referencia del medio de pago a PEI", () => {
  it("envía solo el PaymentMethod (pm_…) con la sesión e Idempotency-Key, sin importe; confirma solo si M08 confirmó", async () => {
    routes[PAY] = [{ body: payment(), status: 200 }];
    await renderScreen();
    await payWithCard();
    expect(await screen.findByText("¡Pago exitoso!")).toBeTruthy();
    expect(mockStripe.createPaymentMethod).toHaveBeenCalledWith({
      paymentMethodType: "Card",
    });
    expect(payBody()).toEqual({ token: PM_ID });
    expect(pays()[0].init?.headers).toMatchObject({
      Cookie: "better-auth.session_token=abc",
    });
    expect(keys()[0]).toMatch(KEY_SHAPE);
    expect(mockStripe.handleNextAction).not.toHaveBeenCalled();
  });

  it("si Stripe no puede leer la tarjeta, se muestra su mensaje y no se llama al backend", async () => {
    mockStripe.createPaymentMethod.mockResolvedValue({
      error: {
        code: "Failed",
        localizedMessage: "El número de tu tarjeta no es válido.",
        message: "Your card number is invalid.",
      },
    });
    await renderScreen();
    await payWithCard();
    expect(
      await screen.findByText("El número de tu tarjeta no es válido.")
    ).toBeTruthy();
    expect(pays()).toHaveLength(0);
  });

  it("idempotencia: tras un error de red el reintento usa la misma clave; tras un rechazo, una nueva", async () => {
    routes[PAY] = [
      new TypeError("network"),
      {
        body: payment({
          appointmentConfirmed: false,
          confirmation: { result: "not_requested" },
          status: "failed",
        }),
        status: 200,
      },
      { body: payment(), status: 200 },
    ];
    await renderScreen();
    await payWithCard();
    expect(await screen.findByText(NETWORK_ERROR)).toBeTruthy();
    await payWithCard();
    expect(await screen.findByText("Tu pago fue rechazado")).toBeTruthy();
    await payWithCard();
    expect(await screen.findByText("¡Pago exitoso!")).toBeTruthy();
    const [a, b, c] = keys();
    expect(a).toBe(b);
    expect(c).not.toBe(b);
    // Solo se guarda la clave de idempotencia: nunca el PaymentMethod ni el client_secret.
    expect([...mockStore.values()].join()).not.toMatch(SENSITIVE);
  });
});

describe("3-D Secure", () => {
  it("con nextAction, el SDK completa el reto y el resultado mostrado es el del backend (sync)", async () => {
    routes[PAY] = [{ body: processingWith3ds, status: 200 }];
    routes[SYNC] = [{ body: payment(), status: 200 }];
    await renderScreen();
    await payWithCard();
    expect(await screen.findByText("¡Pago exitoso!")).toBeTruthy();
    expect(mockStripe.handleNextAction).toHaveBeenCalledWith(
      CLIENT_SECRET,
      "gestinovo://stripe-redirect"
    );
    expect(sent.filter((s) => s.key === SYNC)).toHaveLength(1);
    expect([...mockStore.values()].join()).not.toMatch(SENSITIVE);
  });

  it("si el paciente cancela el reto, se informa y se muestra el estado real del backend", async () => {
    mockStripe.handleNextAction.mockResolvedValue({
      error: { code: "Canceled", message: "canceled" },
    });
    routes[PAY] = [{ body: processingWith3ds, status: 200 }];
    routes[SYNC] = [
      {
        body: payment({
          appointmentConfirmed: false,
          confirmation: { result: "not_requested" },
          status: "failed",
        }),
        status: 200,
      },
    ];
    await renderScreen();
    await payWithCard();
    expect(await screen.findByText("Tu pago fue rechazado")).toBeTruthy();
    expect(screen.getByText(AUTH_CANCELED)).toBeTruthy();
    expect(screen.queryByText(CONFIRMED)).toBeNull();
    // Tras el rechazo vuelve a ofrecerse el formulario para otro intento.
    expect(screen.getByText(PAY_BUTTON)).toBeTruthy();
  });

  it("si no se puede consultar el estado tras el reto, no confirma y permite consultarlo después", async () => {
    routes[PAY] = [{ body: processingWith3ds, status: 200 }];
    routes[SYNC] = [new TypeError("network"), { body: payment(), status: 200 }];
    await renderScreen();
    await payWithCard();
    expect(await screen.findByText("Tu pago se está procesando")).toBeTruthy();
    expect(screen.queryByText(CONFIRMED)).toBeNull();
    fireEvent.press(screen.getByText("Consultar estado del pago"));
    expect(await screen.findByText("¡Pago exitoso!")).toBeTruthy();
    expect(pays()).toHaveLength(1);
  });
});

describe("estados", () => {
  it("processing sin reto no confirma la consulta y permite sincronizar hasta la confirmación", async () => {
    routes[PAY] = [
      {
        body: payment({
          appointmentConfirmed: false,
          confirmation: { result: "not_requested" },
          recoverable: true,
          status: "processing",
        }),
        status: 200,
      },
    ];
    routes[SYNC] = [
      {
        body: payment({ confirmation: { result: "already_confirmed" } }),
        status: 200,
      },
    ];
    await renderScreen();
    await payWithCard();
    expect(await screen.findByText("Tu pago se está procesando")).toBeTruthy();
    expect(screen.queryByText(CONFIRMED)).toBeNull();
    expect(mockStripe.handleNextAction).not.toHaveBeenCalled();
    fireEvent.press(screen.getByText("Consultar estado del pago"));
    expect(await screen.findByText("¡Pago exitoso!")).toBeTruthy();
    expect(pays()).toHaveLength(1);
  });

  it("succeeded con not_confirmable no muestra confirmación", async () => {
    routes[PAY] = [
      {
        body: payment({
          appointmentConfirmed: false,
          confirmation: { reason: "expired", result: "not_confirmable" },
        }),
        status: 200,
      },
    ];
    await renderScreen();
    await payWithCard();
    expect(
      await screen.findByText(
        "Recibimos tu pago, pero no pudimos confirmar la consulta"
      )
    ).toBeTruthy();
    expect(screen.queryByText("¡Pago exitoso!")).toBeNull();
  });

  it("una cita que ya no está en pending_payment no ofrece el formulario", async () => {
    routes[GET] = [
      { body: { ...APPOINTMENT, status: "expired" }, status: 200 },
    ];
    await render(<PaymentScreen />);
    expect(await screen.findByText(NOT_PAYABLE)).toBeTruthy();
    expect(mockCardFields).toHaveLength(0);
  });
});

describe("pago.tsx · finalización del pago y de la cita", () => {
  const DOCTOR_ID = "33333333-3333-4333-8333-333333333333";
  const BOOKABLE = "GET /doctors/bookable";
  const DOCTORS = {
    doctors: [
      {
        displayName: "Dra. Ana Real",
        doctorProfileId: DOCTOR_ID,
        specialty: { id: "s", name: "Medicina general" },
      },
    ],
    timeZone: "America/Mexico_City",
  };
  const processing = payment({
    appointmentConfirmed: false,
    confirmation: { result: "not_requested" },
    recoverable: true,
    status: "processing",
  });
  const LAST_PAYMENT = `pei.payment.last.${APPOINTMENT_ID}`;

  beforeEach(() => {
    mockDismissTo.mockReset();
    mockNavigate.mockReset();
  });

  it("[TC-MOB-PAY-001] aprobado y confirmado: confirmación con médico, fecha y hora; «Ver mis citas» abre la lista real con la cita resaltada y «Volver al inicio» va a Inicio", async () => {
    routes[GET] = [
      { body: { ...APPOINTMENT, doctorProfileId: DOCTOR_ID }, status: 200 },
    ];
    routes[BOOKABLE] = [{ body: DOCTORS, status: 200 }];
    routes[PAY] = [{ body: payment(), status: 200 }];
    await renderScreen();
    await payWithCard();
    expect(await screen.findByText("¡Pago exitoso!")).toBeTruthy();
    expect(screen.getByText("Tu cita quedó confirmada")).toBeTruthy();
    expect(await screen.findByText("Dra. Ana Real")).toBeTruthy();
    expect(screen.getByText("20 de noviembre de 2026")).toBeTruthy();
    await fireEvent.press(
      screen.getByRole("button", { name: "Ver mis citas" })
    );
    // Cierra el flujo de agendar y pagar y abre «Mis citas» con la cita recién pagada.
    expect(mockDismissTo).toHaveBeenCalledWith("/(app)/(tabs)/home");
    expect(mockNavigate).toHaveBeenCalledWith({
      params: { cita: APPOINTMENT_ID },
      pathname: "/mis-citas",
    });
    mockDismissTo.mockReset();
    mockNavigate.mockReset();
    await fireEvent.press(
      screen.getByRole("button", { name: "Volver al inicio" })
    );
    expect(mockDismissTo).toHaveBeenCalledWith("/(app)/(tabs)/home");
    expect(mockNavigate).not.toHaveBeenCalled();
    expect(screen.queryByTestId("stripe-card-field")).toBeNull();
  });

  it("[TC-MOB-PAY-002] pendiente: espera amigable y consulta el backend automáticamente hasta la confirmación", async () => {
    routes[PAY] = [{ body: processing, status: 200 }];
    routes[SYNC] = [
      { body: processing, status: 200 },
      { body: payment(), status: 200 },
    ];
    await renderScreen();
    jest.useFakeTimers();
    await payWithCard();
    expect(await screen.findByText("Tu pago se está procesando")).toBeTruthy();
    expect(screen.getByText(AUTO_SYNC)).toBeTruthy();
    await act(() => {
      jest.advanceTimersByTime(4000);
    });
    await act(() => {
      jest.advanceTimersByTime(4000);
    });
    jest.useRealTimers();
    expect(await screen.findByText("¡Pago exitoso!")).toBeTruthy();
    expect(pays()).toHaveLength(1);
  });

  it("[TC-MOB-PAY-003] rechazado: mensaje claro y la tarjeta para volver a intentar", async () => {
    routes[PAY] = [
      {
        body: payment({
          appointmentConfirmed: false,
          confirmation: { result: "not_requested" },
          status: "failed",
        }),
        status: 200,
      },
    ];
    await renderScreen();
    await payWithCard();
    expect(await screen.findByText("Tu pago fue rechazado")).toBeTruthy();
    expect(screen.queryByText("¡Pago exitoso!")).toBeNull();
    expect(screen.getByText(PAY_BUTTON)).toBeTruthy();
    expect(mockCardFields.length).toBeGreaterThan(1);
  });

  it("[TC-MOB-PAY-004] aprobado sin la cita confirmada todavía: no muestra confirmación y permite actualizar", async () => {
    const notYet = payment({
      appointmentConfirmed: false,
      confirmation: { result: "confirmation_failed" },
    });
    routes[PAY] = [{ body: notYet, status: 200 }];
    routes[SYNC] = [{ body: notYet, status: 200 }];
    await renderScreen();
    await payWithCard();
    expect(
      await screen.findByText(
        "Recibimos tu pago; estamos confirmando tu consulta"
      )
    ).toBeTruthy();
    expect(screen.queryByText("¡Pago exitoso!")).toBeNull();
    expect(screen.getByText("Consultar estado del pago")).toBeTruthy();
  });

  it("[TC-MOB-PAY-005] volver a abrir la pantalla con la cita confirmada muestra la confirmación sin cobrar", async () => {
    routes[GET] = [
      { body: { ...APPOINTMENT, status: "confirmed" }, status: 200 },
    ];
    await render(<PaymentScreen />);
    expect(await screen.findByText("¡Pago exitoso!")).toBeTruthy();
    expect(pays()).toHaveLength(0);
    expect(mockCardFields).toHaveLength(0);
  });

  it("[TC-MOB-PAY-006] con un pago ya iniciado, al volver se consulta su estado (sync) y no se crea otro cobro", async () => {
    mockStore.set(LAST_PAYMENT, PAYMENT_ID);
    routes[SYNC] = [{ body: payment(), status: 200 }];
    await render(<PaymentScreen />);
    expect(await screen.findByText("¡Pago exitoso!")).toBeTruthy();
    expect(sent.filter((s) => s.key === SYNC)).toHaveLength(1);
    expect(pays()).toHaveLength(0);
  });

  it("[TC-MOB-PAY-007] guarda solo el id del pago para retomarlo, nunca datos de la tarjeta", async () => {
    routes[PAY] = [{ body: processing, status: 200 }];
    routes[SYNC] = [{ body: processing, status: 200 }];
    await renderScreen();
    await payWithCard();
    await screen.findByText("Tu pago se está procesando");
    expect(mockStore.get(LAST_PAYMENT)).toBe(PAYMENT_ID);
    expect(JSON.stringify([...mockStore.values()])).not.toMatch(SENSITIVE);
  });
});
