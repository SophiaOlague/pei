import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CardPaymentInput, PatientPayment } from "@/lib/api";
import { mockFetch, ok, status } from "@/test/http";
import { BookingFlow } from "./booking-flow";
import { MyAppointments } from "./my-appointments";
import { NextAppointmentCard } from "./next-appointment-card";
import { PaymentPage } from "./payment-page";
import { slotRange } from "./schedule";

// Flujo web de agendamiento → pago → confirmación, con fetch SIMULADO (sin backend, sin Stripe y sin cobros).
const push = vi.fn();
const replace = vi.fn();
// Como el de Next, el router es el mismo objeto en cada render.
const router = { push, replace };
vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("@/features/components/user-menu", () => ({ UserMenu: () => null }));
// Formulario de Stripe simulado: entrega directamente una referencia sintética (el real tokeniza dentro de su iframe).
const CARD: CardPaymentInput = {
  token: "pm_sintetico00001",
};
vi.mock("@/features/payments/stripe-card-form", () => ({
  StripeCardForm: ({
    onSubmit,
  }: {
    onSubmit: (card: CardPaymentInput) => Promise<void>;
  }): ReactNode => (
    <button type="button" onClick={() => onSubmit(CARD)}>
      Pagar con tarjeta (simulado)
    </button>
  ),
}));

const DOCTOR_ID = "33333333-3333-4333-8333-333333333333";
const OTHER_DOCTOR_ID = "44444444-4444-4444-8444-444444444444";
const APPOINTMENT_ID = "11111111-1111-4111-8111-111111111111";
const PAYMENT_ID = "22222222-2222-4222-8222-222222222222";

const STATUS_KEY = "GET /me/registration-status";
const BOOKABLE_KEY = "GET /doctors/bookable";
const SLOTS_KEY = `GET /doctors/${DOCTOR_ID}/slots`;
const HOLD_KEY = "POST /me/patient/appointments";
const LIST_KEY = "GET /me/patient/appointments";
const APPOINTMENT_KEY = `GET /me/patient/appointments/${APPOINTMENT_ID}`;
const PAY_KEY = `POST /me/patient/appointments/${APPOINTMENT_ID}/payment`;
const SYNC_KEY = `POST /me/patient/payments/${PAYMENT_ID}/sync`;
const RESERVE = "Reservar y continuar al pago";

const DOCTORS = {
  timeZone: "America/Mexico_City",
  doctors: [
    {
      doctorProfileId: DOCTOR_ID,
      displayName: "Dra. Ana Real",
      specialty: { id: "sp-1", name: "Infectología" },
    },
    {
      doctorProfileId: OTHER_DOCTOR_ID,
      displayName: "Dr. Luis Prado",
      specialty: { id: "sp-2", name: "Medicina general" },
    },
  ],
};
const SLOT_A = {
  date: "2030-11-20",
  start: "10:00",
  end: "10:30",
  startsAt: "2030-11-20T16:00:00.000Z",
  endsAt: "2030-11-20T16:30:00.000Z",
};
const SLOT_B = {
  date: "2030-11-21",
  start: "11:00",
  end: "11:30",
  startsAt: "2030-11-21T17:00:00.000Z",
  endsAt: "2030-11-21T17:30:00.000Z",
};
const slotsView = (slots = [SLOT_A, SLOT_B]) =>
  ok({
    timeZone: "America/Mexico_City",
    doctorProfileId: DOCTOR_ID,
    durationMinutes: 30,
    from: "2030-11-20",
    to: "2030-12-03",
    slots,
  });
const HOLD = {
  id: APPOINTMENT_ID,
  doctorProfileId: DOCTOR_ID,
  patientProfileId: "p-1",
  status: "pending_payment",
  scheduledAt: SLOT_A.startsAt,
  reason: "Dolor de cabeza",
  price: "650.00",
  holdExpiresAt: "2030-11-20T15:05:00.000Z",
  cancelledAt: null,
  cancelledBy: null,
};
const created = { status: 201, body: HOLD };
const fail = (code: number, body: unknown) => ({ status: code, body });
const networkError = () => {
  throw new TypeError("Failed to fetch");
};
const canBook = ok(status({ canBookAppointments: true, missing: [] }));
const incomplete = (missing: string[]) =>
  fail(403, {
    statusCode: 403,
    error: "RegistrationIncompleteError",
    message: "El registro del paciente está incompleto",
    details: { missing },
  });

beforeEach(() => {
  push.mockReset();
  replace.mockReset();
  sessionStorage.clear();
});
afterEach(() => {
  vi.unstubAllEnvs();
});

const keys = (calls: { key: string }[]) => calls.map((c) => c.key);

async function chooseDoctorAndSlot() {
  await userEvent.click(
    await screen.findByRole("button", { name: /Dra\. Ana Real/ }),
  );
  await userEvent.click(
    await screen.findByRole("button", { name: "Horario 10:00" }),
  );
  await userEvent.type(
    screen.getByLabelText("Motivo de la consulta"),
    "  Dolor de cabeza  ",
  );
}

describe("/agendar-cita: médico, horario y reserva reales", () => {
  it("lista los médicos reservables, pide sus horarios reales y crea la cita antes de ir al pago", async () => {
    const { calls, fetchMock } = mockFetch({
      [STATUS_KEY]: canBook,
      [BOOKABLE_KEY]: ok(DOCTORS),
      [SLOTS_KEY]: slotsView(),
      [HOLD_KEY]: created,
    });
    render(<BookingFlow />);
    expect(
      await screen.findByRole("button", { name: /Dr\. Luis Prado/ }),
    ).toBeInTheDocument();
    // Sin médicos, horarios ni precios de maqueta.
    expect(screen.queryByText(/\$\d/)).toBeNull();
    expect(screen.queryByText("Dr Jose Mart")).toBeNull();

    await chooseDoctorAndSlot();
    // El médico elegido queda en la URL como contexto.
    expect(replace).toHaveBeenCalledWith(`/agendar-cita?medico=${DOCTOR_ID}`, {
      scroll: false,
    });
    const slotsCall = fetchMock.mock.calls.find(([input]) =>
      String(input).includes("/slots"),
    );
    const params = new URL(String(slotsCall?.[0])).searchParams;
    expect({ from: params.get("from"), to: params.get("to") }).toEqual(
      slotRange(),
    );

    await userEvent.click(screen.getByRole("button", { name: RESERVE }));
    expect(push).toHaveBeenCalledWith(`/pagar-cita/${APPOINTMENT_ID}`);
    const hold = calls.find((c) => c.key === HOLD_KEY);
    // Sin importe: el backend fija el precio.
    expect(hold?.body).toEqual({
      doctorProfileId: DOCTOR_ID,
      startsAt: SLOT_A.startsAt,
      reason: "Dolor de cabeza",
    });
  });

  it("cambiar de fecha muestra solo sus horarios y limpia la selección", async () => {
    mockFetch({
      [STATUS_KEY]: canBook,
      [BOOKABLE_KEY]: ok(DOCTORS),
      [SLOTS_KEY]: slotsView(),
    });
    render(<BookingFlow />);
    await chooseDoctorAndSlot();
    const dates = screen.getAllByRole("button", { name: /^Fecha / });
    expect(dates).toHaveLength(2);
    await userEvent.click(dates[1]);
    expect(screen.queryByRole("button", { name: "Horario 10:00" })).toBeNull();
    expect(
      screen.getByRole("button", { name: "Horario 11:00" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: RESERVE })).toBeDisabled();
  });

  it("sin motivo no se reserva", async () => {
    const { calls } = mockFetch({
      [STATUS_KEY]: canBook,
      [BOOKABLE_KEY]: ok(DOCTORS),
      [SLOTS_KEY]: slotsView(),
    });
    render(<BookingFlow />);
    await userEvent.click(
      await screen.findByRole("button", { name: /Dra\. Ana Real/ }),
    );
    await userEvent.click(
      await screen.findByRole("button", { name: "Horario 10:00" }),
    );
    await userEvent.click(screen.getByRole("button", { name: RESERVE }));
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Escribe el motivo de la consulta.",
    );
    expect(keys(calls)).not.toContain(HOLD_KEY);
  });

  it("sin médicos disponibles lo indica; si falla la carga, permite reintentar", async () => {
    mockFetch({
      [STATUS_KEY]: canBook,
      [BOOKABLE_KEY]: [fail(503, {}), ok({ timeZone: "x", doctors: [] })],
    });
    render(<BookingFlow />);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "El servidor no pudo completar la operación.",
    );
    await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(
      await screen.findByText(
        "No hay médicos con horarios disponibles por ahora.",
      ),
    ).toBeInTheDocument();
  });

  it("el médico del contexto se preselecciona; si ya no es reservable, se pide elegir otro", async () => {
    const { calls } = mockFetch({
      [STATUS_KEY]: canBook,
      [BOOKABLE_KEY]: ok(DOCTORS),
      [SLOTS_KEY]: slotsView(),
    });
    const first = render(<BookingFlow initialDoctorId={DOCTOR_ID} />);
    expect(
      await screen.findByRole("button", { name: "Horario 10:00" }),
    ).toBeInTheDocument();
    first.unmount();

    render(
      <BookingFlow initialDoctorId="55555555-5555-4555-8555-555555555555" />,
    );
    expect(
      await screen.findByText(/El médico que elegiste ya no tiene horarios/),
    ).toBeInTheDocument();
    expect(keys(calls).filter((k) => k === SLOTS_KEY)).toHaveLength(1);
  });

  it("horario ocupado (409): lo informa, vuelve a pedir los horarios y no va al pago", async () => {
    const { calls } = mockFetch({
      [STATUS_KEY]: canBook,
      [BOOKABLE_KEY]: ok(DOCTORS),
      [SLOTS_KEY]: [slotsView(), slotsView([SLOT_B])],
      [HOLD_KEY]: fail(409, {
        error: "SlotUnavailableError",
        message: "El horario ya no está disponible",
      }),
    });
    render(<BookingFlow />);
    await chooseDoctorAndSlot();
    await userEvent.click(screen.getByRole("button", { name: RESERVE }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "El horario ya no está disponible",
    );
    await waitFor(() =>
      expect(keys(calls).filter((k) => k === SLOTS_KEY)).toHaveLength(2),
    );
    expect(
      await screen.findByRole("button", { name: "Horario 11:00" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Horario 10:00" })).toBeNull();
    expect(push).not.toHaveBeenCalled();
  });

  it("otra retención vigente: lo explica y dirige a sus citas para completar el pago", async () => {
    mockFetch({
      [STATUS_KEY]: canBook,
      [BOOKABLE_KEY]: ok(DOCTORS),
      [SLOTS_KEY]: slotsView(),
      [HOLD_KEY]: fail(409, {
        error: "ActiveHoldExistsError",
        message: "Ya tienes un horario retenido; libéralo o espera a que venza",
      }),
    });
    render(<BookingFlow />);
    await chooseDoctorAndSlot();
    await userEvent.click(screen.getByRole("button", { name: RESERVE }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(
      "Ya tienes un horario apartado pendiente de pago",
    );
    expect(
      within(alert).getByRole("link", { name: "Ver mis citas" }),
    ).toHaveAttribute("href", "/mis-citas");
    expect(push).not.toHaveBeenCalled();
  });

  it("un error de red no inicia el pago; el reintento repite la MISMA reserva", async () => {
    const { calls } = mockFetch({
      [STATUS_KEY]: canBook,
      [BOOKABLE_KEY]: ok(DOCTORS),
      [SLOTS_KEY]: slotsView(),
      [HOLD_KEY]: [networkError, created],
    });
    render(<BookingFlow />);
    await chooseDoctorAndSlot();
    await userEvent.click(screen.getByRole("button", { name: RESERVE }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "no se duplicará tu reserva",
    );
    expect(push).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: RESERVE }));
    await waitFor(() =>
      expect(push).toHaveBeenCalledWith(`/pagar-cita/${APPOINTMENT_ID}`),
    );
    const holds = calls.filter((c) => c.key === HOLD_KEY);
    expect(holds).toHaveLength(2);
    expect(holds[1].body).toEqual(holds[0].body);
  });

  it("doble clic: una sola reserva; una cita ya creada se reutiliza sin volver a reservar", async () => {
    let release: () => void = () => undefined;
    const { calls, fetchMock } = mockFetch({
      [STATUS_KEY]: canBook,
      [BOOKABLE_KEY]: ok(DOCTORS),
      [SLOTS_KEY]: slotsView(),
      [HOLD_KEY]: created,
    });
    const original = fetchMock.getMockImplementation() as typeof fetch;
    fetchMock.mockImplementation(async (input, init) => {
      if (init?.method === "POST")
        await new Promise<void>((resolve) => {
          release = resolve;
        });
      return original(input, init);
    });
    render(<BookingFlow />);
    await chooseDoctorAndSlot();
    const button = screen.getByRole("button", { name: RESERVE });
    button.click();
    button.click();
    release();
    await waitFor(() => expect(push).toHaveBeenCalledTimes(1));
    await userEvent.click(screen.getByRole("button", { name: RESERVE }));
    expect(push).toHaveBeenCalledTimes(2);
    expect(push).toHaveBeenLastCalledWith(`/pagar-cita/${APPOINTMENT_ID}`);
    expect(calls.filter((c) => c.key === HOLD_KEY)).toHaveLength(1);
  });

  it("una respuesta que no es una cita pending_payment no inicia el pago", async () => {
    mockFetch({
      [STATUS_KEY]: canBook,
      [BOOKABLE_KEY]: ok(DOCTORS),
      [SLOTS_KEY]: slotsView(),
      [HOLD_KEY]: { status: 201, body: { ...HOLD, status: "confirmed" } },
    });
    render(<BookingFlow />);
    await chooseDoctorAndSlot();
    await userEvent.click(screen.getByRole("button", { name: RESERVE }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "No se pudo reservar el horario.",
    );
    expect(push).not.toHaveBeenCalled();
  });

  it("sesión vencida (401) al reservar envía a /login", async () => {
    mockFetch({
      [STATUS_KEY]: canBook,
      [BOOKABLE_KEY]: ok(DOCTORS),
      [SLOTS_KEY]: slotsView(),
      [HOLD_KEY]: fail(401, {}),
    });
    render(<BookingFlow />);
    await chooseDoctorAndSlot();
    await userEvent.click(screen.getByRole("button", { name: RESERVE }));
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/login"));
    expect(push).not.toHaveBeenCalled();
  });
});

describe("/agendar-cita: identidad pendiente, rechazada y aprobada", () => {
  it("identidad sin enviar según el registro: dirige a la verificación con el médico y no reserva", async () => {
    const { calls } = mockFetch({
      [STATUS_KEY]: ok(
        status({
          canBookAppointments: false,
          missing: ["identity_submission"],
        }),
      ),
      [BOOKABLE_KEY]: ok(DOCTORS),
      [SLOTS_KEY]: slotsView(),
    });
    render(<BookingFlow initialDoctorId={DOCTOR_ID} />);
    const notice = await screen.findByRole("alert");
    expect(notice).toHaveTextContent(
      "Para reservar necesitas verificar tu identidad con tu INE.",
    );
    await userEvent.click(
      await screen.findByRole("button", { name: "Horario 10:00" }),
    );
    expect(
      within(notice).getByRole("link", { name: "Verificar mi identidad" }),
    ).toHaveAttribute(
      "href",
      `/verificacion-identidad?origen=reserva&medico=${DOCTOR_ID}`,
    );
    expect(screen.getByRole("button", { name: RESERVE })).toBeDisabled();
    expect(keys(calls)).not.toContain(HOLD_KEY);
  });

  it("si el registro no se pudo consultar, decide el backend: identidad rechazada al reservar", async () => {
    mockFetch({
      [STATUS_KEY]: fail(503, {}),
      [BOOKABLE_KEY]: ok(DOCTORS),
      [SLOTS_KEY]: slotsView(),
      [HOLD_KEY]: incomplete(["identity_resubmission"]),
    });
    render(<BookingFlow />);
    await chooseDoctorAndSlot();
    await userEvent.click(screen.getByRole("button", { name: RESERVE }));
    expect(
      await screen.findByRole("link", { name: "Reenviar mi INE" }),
    ).toHaveAttribute(
      "href",
      `/verificacion-identidad?origen=reserva&medico=${DOCTOR_ID}`,
    );
    expect(
      screen.getAllByText(
        "Tu verificación de identidad fue rechazada. Envía de nuevo tu INE para poder reservar.",
      ).length,
    ).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: RESERVE })).toBeDisabled();
    expect(push).not.toHaveBeenCalled();
  });

  it("identidad en revisión según el backend: no se reserva ni se habilita el pago", async () => {
    mockFetch({
      [STATUS_KEY]: canBook,
      [BOOKABLE_KEY]: ok(DOCTORS),
      [SLOTS_KEY]: slotsView(),
      [HOLD_KEY]: incomplete(["identity_review"]),
    });
    render(<BookingFlow />);
    await chooseDoctorAndSlot();
    await userEvent.click(screen.getByRole("button", { name: RESERVE }));
    expect(
      await screen.findByRole("link", {
        name: "Ver estado de mi verificación",
      }),
    ).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });

  it("al volver de la verificación se consulta otra vez el registro y, aprobada, se reserva con el mismo médico", async () => {
    const { calls } = mockFetch({
      [STATUS_KEY]: [
        ok(
          status({ canBookAppointments: false, missing: ["identity_review"] }),
        ),
        canBook,
      ],
      [BOOKABLE_KEY]: ok(DOCTORS),
      [SLOTS_KEY]: slotsView(),
      [HOLD_KEY]: created,
    });
    const before = render(<BookingFlow initialDoctorId={DOCTOR_ID} />);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Tu INE está en revisión.",
    );
    before.unmount();

    // Regreso desde /verificacion-identidad: /agendar-cita?medico=<id> vuelve a montar el flujo.
    render(<BookingFlow initialDoctorId={DOCTOR_ID} />);
    await userEvent.click(
      await screen.findByRole("button", { name: "Horario 10:00" }),
    );
    await waitFor(() =>
      expect(keys(calls).filter((k) => k === STATUS_KEY)).toHaveLength(2),
    );
    expect(screen.queryByRole("alert")).toBeNull();
    await userEvent.type(
      screen.getByLabelText("Motivo de la consulta"),
      "Control",
    );
    await userEvent.click(screen.getByRole("button", { name: RESERVE }));
    expect(push).toHaveBeenCalledWith(`/pagar-cita/${APPOINTMENT_ID}`);
  });

  it("otro requisito pendiente del registro (legal) se informa con el mensaje del backend", async () => {
    mockFetch({
      [STATUS_KEY]: canBook,
      [BOOKABLE_KEY]: ok(DOCTORS),
      [SLOTS_KEY]: slotsView(),
      [HOLD_KEY]: fail(403, {
        error: "LegalAcceptancesRequiredError",
        message:
          "Para reservar debes tener aceptados el aviso de privacidad y los términos vigentes",
      }),
    });
    render(<BookingFlow />);
    await chooseDoctorAndSlot();
    await userEvent.click(screen.getByRole("button", { name: RESERVE }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "debes tener aceptados el aviso de privacidad",
    );
    expect(screen.queryByRole("link", { name: /identidad|INE/ })).toBeNull();
    expect(push).not.toHaveBeenCalled();
  });
});

const payment = (over: Partial<PatientPayment>): PatientPayment => ({
  paymentId: PAYMENT_ID,
  status: "succeeded",
  amount: "650.00",
  currency: "MXN",
  appointmentConfirmed: true,
  confirmation: { result: "confirmed" },
  recoverable: false,
  ...over,
});

describe("/pagar-cita/:appointmentId: pago y confirmación (formulario de Stripe simulado)", () => {
  beforeEach(() =>
    vi.stubEnv("NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY", "pk_test_sintetica0000"),
  );

  it("muestra el importe del backend y confirma la cita solo cuando el backend confirma pago y reserva", async () => {
    const { calls } = mockFetch({
      [APPOINTMENT_KEY]: ok(HOLD),
      [PAY_KEY]: ok(payment({})),
    });
    render(<PaymentPage appointmentId={APPOINTMENT_ID} />);
    expect(
      await screen.findByLabelText("Importe de la consulta"),
    ).toHaveTextContent("$650.00 MXN");
    expect(screen.getByRole("link", { name: "Ver mis citas" })).toHaveAttribute(
      "href",
      "/mis-citas",
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Pagar con tarjeta (simulado)" }),
    );
    expect(
      await screen.findByText("Pago aprobado: tu consulta está confirmada"),
    ).toBeInTheDocument();
    const pay = calls.find((c) => c.key === PAY_KEY);
    expect(pay?.body).not.toHaveProperty("amount");
    expect(pay?.body).not.toHaveProperty("transaction_amount");
  });

  it("pago en proceso: no confirma hasta sincronizar con el backend", async () => {
    mockFetch({
      [APPOINTMENT_KEY]: ok(HOLD),
      [PAY_KEY]: ok(
        payment({
          status: "processing",
          appointmentConfirmed: false,
          confirmation: { result: "not_requested" },
        }),
      ),
      [SYNC_KEY]: ok(payment({})),
    });
    render(<PaymentPage appointmentId={APPOINTMENT_ID} />);
    await userEvent.click(
      await screen.findByRole("button", {
        name: "Pagar con tarjeta (simulado)",
      }),
    );
    expect(
      await screen.findByText("Tu pago se está procesando"),
    ).toBeInTheDocument();
    expect(screen.queryByText(/tu consulta está confirmada/)).toBeNull();
    await userEvent.click(
      screen.getByRole("button", { name: "Consultar estado del pago" }),
    );
    expect(
      await screen.findByText("Pago aprobado: tu consulta está confirmada"),
    ).toBeInTheDocument();
  });

  it("pago pendiente: permite reintentar con la misma clave de idempotencia", async () => {
    const { fetchMock } = mockFetch({
      [APPOINTMENT_KEY]: ok(HOLD),
      [PAY_KEY]: [
        ok(
          payment({
            status: "pending",
            appointmentConfirmed: false,
            confirmation: { result: "not_requested" },
          }),
        ),
        ok(payment({})),
      ],
    });
    render(<PaymentPage appointmentId={APPOINTMENT_ID} />);
    await userEvent.click(
      await screen.findByRole("button", {
        name: "Pagar con tarjeta (simulado)",
      }),
    );
    expect(
      await screen.findByText("Tu pago está pendiente"),
    ).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: "Pagar con tarjeta (simulado)" }),
    );
    expect(
      await screen.findByText("Pago aprobado: tu consulta está confirmada"),
    ).toBeInTheDocument();
    const keysUsed = fetchMock.mock.calls
      .filter(([, init]) => init?.method === "POST")
      .map(([, init]) => new Headers(init?.headers).get("Idempotency-Key"));
    expect(keysUsed).toHaveLength(2);
    expect(keysUsed[0]).toBe(keysUsed[1]);
  });

  it("pago rechazado: no confirma y permite intentar de nuevo", async () => {
    mockFetch({
      [APPOINTMENT_KEY]: ok(HOLD),
      [PAY_KEY]: ok(
        payment({
          status: "failed",
          appointmentConfirmed: false,
          confirmation: { result: "not_requested" },
        }),
      ),
    });
    render(<PaymentPage appointmentId={APPOINTMENT_ID} />);
    await userEvent.click(
      await screen.findByRole("button", {
        name: "Pagar con tarjeta (simulado)",
      }),
    );
    expect(
      await screen.findByText("Tu pago fue rechazado"),
    ).toBeInTheDocument();
    expect(screen.queryByText(/tu consulta está confirmada/)).toBeNull();
    expect(
      screen.getByRole("button", { name: "Pagar con tarjeta (simulado)" }),
    ).toBeInTheDocument();
  });

  it("pago cobrado pero cita no confirmable: dice que la consulta NO está confirmada", async () => {
    mockFetch({
      [APPOINTMENT_KEY]: ok(HOLD),
      [PAY_KEY]: ok(
        payment({
          appointmentConfirmed: false,
          confirmation: { result: "not_confirmable", reason: "hold_expired" },
        }),
      ),
    });
    render(<PaymentPage appointmentId={APPOINTMENT_ID} />);
    await userEvent.click(
      await screen.findByRole("button", {
        name: "Pagar con tarjeta (simulado)",
      }),
    );
    expect(
      await screen.findByText(/Tu consulta NO está confirmada/),
    ).toBeInTheDocument();
  });

  it("error de red al pagar: lo informa sin dar la cita por confirmada", async () => {
    mockFetch({
      [APPOINTMENT_KEY]: ok(HOLD),
      [PAY_KEY]: networkError,
    });
    render(<PaymentPage appointmentId={APPOINTMENT_ID} />);
    await userEvent.click(
      await screen.findByRole("button", {
        name: "Pagar con tarjeta (simulado)",
      }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "No se pudo conectar con el servidor",
    );
    expect(screen.queryByText(/tu consulta está confirmada/)).toBeNull();
  });

  it("una retención vencida ya no admite pago", async () => {
    mockFetch({ [APPOINTMENT_KEY]: ok({ ...HOLD, status: "expired" }) });
    render(<PaymentPage appointmentId={APPOINTMENT_ID} />);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Esta cita ya no admite pago.",
    );
    expect(
      screen.queryByRole("button", { name: "Pagar con tarjeta (simulado)" }),
    ).toBeNull();
  });
});

const appointment = (over: Record<string, unknown>) => ({ ...HOLD, ...over });

describe("/mis-citas y «Mi próxima cita»: estado real de M08", () => {
  it("separa próximas y anteriores, nombra al médico y ofrece pagar solo una retención vigente", async () => {
    mockFetch({
      [LIST_KEY]: ok({
        appointments: [
          appointment({
            id: "c-confirmed",
            status: "confirmed",
            holdExpiresAt: null,
            scheduledAt: "2030-12-01T16:00:00.000Z",
          }),
          appointment({ id: "c-hold", status: "pending_payment" }),
          appointment({
            id: "c-expired",
            status: "expired",
            holdExpiresAt: null,
            scheduledAt: "2030-12-02T16:00:00.000Z",
          }),
          appointment({
            id: "c-done",
            status: "completed",
            holdExpiresAt: null,
            scheduledAt: "2020-01-10T16:00:00.000Z",
          }),
        ],
      }),
      [BOOKABLE_KEY]: ok(DOCTORS),
    });
    render(<MyAppointments />);
    const upcoming = await screen.findByRole("list");
    const items = within(upcoming).getAllByRole("listitem");
    expect(items).toHaveLength(2);
    // Orden ascendente: la retención (20 nov) antes de la confirmada (1 dic).
    expect(within(items[0]).getByText("Pendiente de pago")).toBeInTheDocument();
    expect(
      within(items[0]).getByRole("link", { name: "Continuar al pago" }),
    ).toHaveAttribute("href", "/pagar-cita/c-hold");
    expect(within(items[1]).getByText("Confirmada")).toBeInTheDocument();
    expect(within(items[1]).getAllByText("Dra. Ana Real")).toHaveLength(1);
    expect(within(items[1]).queryByRole("link")).toBeNull();
    // Sin acciones de maqueta.
    expect(screen.queryByText("Unirse")).toBeNull();
    expect(screen.queryByText("Cancelar")).toBeNull();
    expect(screen.queryByText("Reprogramar")).toBeNull();

    await userEvent.click(screen.getByRole("tab", { name: "Anteriores" }));
    expect(screen.getByText("Reserva vencida")).toBeInTheDocument();
    expect(screen.getByText("Completada")).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Continuar al pago" }),
    ).toBeNull();
  });

  it("si el catálogo de médicos falla, muestra las citas sin nombre; si fallan las citas, permite reintentar", async () => {
    mockFetch({
      [LIST_KEY]: [
        fail(503, {}),
        ok({
          appointments: [
            appointment({ status: "confirmed", holdExpiresAt: null }),
          ],
        }),
      ],
      [BOOKABLE_KEY]: fail(500, {}),
    });
    render(<MyAppointments />);
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(await screen.findByText("Consulta médica")).toBeInTheDocument();
    expect(screen.getByText("Confirmada")).toBeInTheDocument();
  });

  it("sin citas ofrece agendar; 401 envía a /login", async () => {
    mockFetch({
      [LIST_KEY]: ok({ appointments: [] }),
      [BOOKABLE_KEY]: ok(DOCTORS),
    });
    const first = render(<MyAppointments />);
    expect(
      await screen.findByRole("link", { name: "Agendar cita" }),
    ).toHaveAttribute("href", "/agendar-cita");
    first.unmount();

    mockFetch({ [LIST_KEY]: fail(401, {}), [BOOKABLE_KEY]: ok(DOCTORS) });
    render(<MyAppointments />);
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/login"));
  });

  it("«Mi próxima cita» muestra la próxima confirmada; sin ella, ofrece agendar", async () => {
    mockFetch({
      [LIST_KEY]: ok({
        appointments: [
          appointment({ status: "pending_payment" }),
          appointment({
            id: "c-2",
            status: "confirmed",
            holdExpiresAt: null,
            scheduledAt: "2030-12-01T16:00:00.000Z",
          }),
        ],
      }),
    });
    const first = render(<NextAppointmentCard />);
    expect(
      await screen.findByText("1 de diciembre de 2030"),
    ).toBeInTheDocument();
    expect(screen.getByText("10:00")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ver mis citas" })).toHaveAttribute(
      "href",
      "/mis-citas",
    );
    first.unmount();

    mockFetch({
      [LIST_KEY]: ok({
        appointments: [appointment({ status: "pending_payment" })],
      }),
    });
    render(<NextAppointmentCard />);
    expect(
      await screen.findByText("No tienes citas confirmadas."),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Agendar cita" })).toHaveAttribute(
      "href",
      "/agendar-cita",
    );
  });
});
