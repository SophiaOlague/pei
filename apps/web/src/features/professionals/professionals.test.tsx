import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Landing as Home } from "@/features/landing/pages/landing-home";
import { Landing as Login } from "@/features/landing/pages/login";
import type { DoctorProfile, DoctorStatus, LegalDocument } from "@/lib/api";
import { meAs, mockFetch, ok } from "@/test/http";
import { DoctorPortal } from "./doctor-portal";
import { PROFESSIONAL_ACCESS_PATH, PROFESSIONAL_PORTAL_PATH } from "./paths";
import { ProfessionalAccess } from "./professional-access";

const replace = vi.fn();
const push = vi.fn();
const router = { replace, push };
vi.mock("next/navigation", () => ({ useRouter: () => router }));

const auth = vi.hoisted(() => ({
  signUp: vi.fn(),
  signIn: vi.fn(),
  signOut: vi.fn(),
  intent: vi.fn(),
  forget: vi.fn(),
}));
vi.mock("@/lib/auth-client", () => ({
  authClient: {
    signUp: { email: auth.signUp },
    signIn: { email: auth.signIn },
    signOut: auth.signOut,
  },
  appUrl: (path: string) => `http://web.test${path}`,
  authErrorMessage: () => "Error de autenticación",
  rememberPendingEmail: vi.fn(),
  rememberProfessionalIntent: auth.intent,
  forgetProfessionalIntent: auth.forget,
  hasProfessionalIntent: () => false,
  PASSWORD_MIN: 8,
  PASSWORD_MAX: 128,
}));

const SPECIALTY = {
  id: "33333333-3333-4333-8333-333333333333",
  code: "psicologia",
  name: "Psicología",
};
const PROFILE: DoctorProfile = {
  doctorProfileId: "d1",
  firstName: "Ana",
  lastName: "Pérez",
  curp: "PEAA900101MDFRNN09",
  phone: null,
  bio: null,
  licenseNumber: null,
  specialty: { ...SPECIALTY, isActive: true },
  hasPhoto: false,
};
const doctorStatus = (overrides: Partial<DoctorStatus> = {}): DoctorStatus => ({
  status: "pending",
  identity: "required",
  professional: "required",
  registrationComplete: false,
  missing: ["legal", "identity_submission", "license_submission"],
  identityRejectionReason: null,
  licenseRejectionReason: null,
  ...overrides,
});
const DOCTOR_TERMS: LegalDocument = {
  id: "44444444-4444-4444-8444-444444444444",
  type: "doctor_terms",
  version: "1",
  publishedAt: "2026-10-01T00:00:00.000Z",
  content: "Términos para profesionales",
};
const POLICY: LegalDocument = {
  ...DOCTOR_TERMS,
  id: "55555555-5555-4555-8555-555555555555",
  type: "privacy_policy",
  content: "Aviso",
};
const EMPTY_HISTORY = { identity: [], license: [] };

const doctorRoutes = (
  status: DoctorStatus,
  extra: Record<string, unknown> = {},
) => ({
  "GET /me": ok(meAs("doctor")),
  "GET /me/doctor/status": ok(status),
  "GET /me/doctor-profile": ok(PROFILE),
  "GET /me/doctor/verification-history": ok(EMPTY_HISTORY),
  "GET /specialties": ok([SPECIALTY]),
  "GET /legal-documents/current": ok([POLICY, DOCTOR_TERMS]),
  ...extra,
});

const png = (name: string) => new File(["x"], name, { type: "image/png" });

beforeEach(() => {
  replace.mockReset();
  push.mockReset();
});

describe("Puntos de entrada del registro profesional", () => {
  it("la página de inicio enlaza a /profesionales junto a «Sobre nosotros»", () => {
    render(<Home />);
    expect(
      screen.getByRole("link", { name: "Soy profesional de la salud" }),
    ).toHaveAttribute("href", PROFESSIONAL_ACCESS_PATH);
    expect(
      screen.getByRole("link", { name: "Sobre nosotros" }),
    ).toBeInTheDocument();
  });

  it("el inicio de sesión ofrece el registro profesional sin cambiar el formulario de pacientes", () => {
    render(<Login />);
    expect(
      screen.getByRole("heading", { name: "¿Eres profesional de la salud?" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Registrarme como profesional" }),
    ).toHaveAttribute("href", PROFESSIONAL_ACCESS_PATH);
    expect(screen.getByRole("button", { name: "Sign up" })).toBeInTheDocument();
  });
});

describe("/profesionales", () => {
  it("crea la cuenta con Better Auth, sin rol, y vuelve al portal tras verificar el correo", async () => {
    auth.signUp.mockResolvedValue({ error: null });
    render(<ProfessionalAccess />);
    await userEvent.type(screen.getByLabelText("Nombre"), "Ana Pérez");
    await userEvent.type(
      screen.getByLabelText("Correo electrónico"),
      "ana@ejemplo.test",
    );
    await userEvent.type(screen.getByLabelText("Contraseña"), "contrasena1");
    await userEvent.type(
      screen.getByLabelText("Confirmar contraseña"),
      "contrasena1",
    );
    await userEvent.click(screen.getByRole("button", { name: "Crear cuenta" }));

    expect(auth.signUp).toHaveBeenCalledWith({
      email: "ana@ejemplo.test",
      password: "contrasena1",
      name: "Ana Pérez",
      callbackURL: `http://web.test${PROFESSIONAL_PORTAL_PATH}`,
    });
    expect(auth.intent).toHaveBeenCalled();
    expect(push).toHaveBeenCalledWith("/verificar-correo");
  });

  it("valida antes de llamar a Better Auth", async () => {
    render(<ProfessionalAccess />);
    await userEvent.type(screen.getByLabelText("Nombre"), "Ana");
    await userEvent.type(
      screen.getByLabelText("Correo electrónico"),
      "ana@ejemplo.test",
    );
    await userEvent.type(screen.getByLabelText("Contraseña"), "contrasena1");
    await userEvent.type(
      screen.getByLabelText("Confirmar contraseña"),
      "otra12345",
    );
    await userEvent.click(screen.getByRole("button", { name: "Crear cuenta" }));

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Las contraseñas no coinciden",
    );
    expect(auth.signUp).not.toHaveBeenCalled();
  });

  it("sin conexión con el servidor muestra el error y reactiva el botón", async () => {
    auth.signIn.mockRejectedValue(new TypeError("Failed to fetch"));
    render(<ProfessionalAccess />);
    await userEvent.click(screen.getByRole("tab", { name: "Ya tengo cuenta" }));
    await userEvent.type(
      screen.getByLabelText("Correo electrónico"),
      "ana@ejemplo.test",
    );
    await userEvent.type(screen.getByLabelText("Contraseña"), "contrasena1");
    await userEvent.click(
      screen.getByRole("button", { name: "Iniciar sesión" }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "No se pudo conectar con el servidor",
    );
    expect(
      screen.getByRole("button", { name: "Iniciar sesión" }),
    ).toBeEnabled();
    expect(push).not.toHaveBeenCalled();
  });

  it("inicia sesión y entra al portal", async () => {
    auth.signIn.mockResolvedValue({ error: null });
    render(<ProfessionalAccess />);
    await userEvent.click(screen.getByRole("tab", { name: "Ya tengo cuenta" }));
    await userEvent.type(
      screen.getByLabelText("Correo electrónico"),
      "ana@ejemplo.test",
    );
    await userEvent.type(screen.getByLabelText("Contraseña"), "contrasena1");
    await userEvent.click(
      screen.getByRole("button", { name: "Iniciar sesión" }),
    );

    expect(auth.signIn).toHaveBeenCalledWith(
      expect.objectContaining({ email: "ana@ejemplo.test" }),
    );
    expect(push).toHaveBeenCalledWith(PROFESSIONAL_PORTAL_PATH);
  });
});

describe("/profesionales/registro", () => {
  it("una cuenta sin rol crea el perfil médico sin enviar rol ni privilegios", async () => {
    const { calls } = mockFetch({
      "GET /me": [ok(meAs(null)), ok(meAs("doctor"))],
      "GET /specialties": ok([SPECIALTY]),
      "POST /me/doctor-profile": {
        status: 201,
        body: { doctorProfileId: "d1", userProfileId: "u1" },
      },
      "GET /me/doctor/status": ok(doctorStatus()),
      "GET /me/doctor-profile": ok(PROFILE),
      "GET /me/doctor/verification-history": ok(EMPTY_HISTORY),
      "GET /legal-documents/current": ok([POLICY, DOCTOR_TERMS]),
    });
    render(<DoctorPortal />);
    await userEvent.type(await screen.findByLabelText("Nombre(s)"), "Ana");
    await userEvent.type(screen.getByLabelText("Apellidos"), "Pérez");
    await userEvent.type(screen.getByLabelText("CURP"), PROFILE.curp);
    await waitFor(() =>
      expect(
        screen.getByRole("option", { name: "Psicología" }),
      ).toBeInTheDocument(),
    );
    await userEvent.selectOptions(
      screen.getByLabelText("Especialidad"),
      SPECIALTY.id,
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Crear perfil profesional" }),
    );

    expect(
      await screen.findByText("Estado de tu registro"),
    ).toBeInTheDocument();
    const body = calls.find((c) => c.key === "POST /me/doctor-profile")?.body;
    expect(body).toEqual({
      firstName: "Ana",
      lastName: "Pérez",
      curp: PROFILE.curp,
      specialtyId: SPECIALTY.id,
    });
  });

  it("una cuenta de paciente no se convierte en médico", async () => {
    const { calls } = mockFetch({ "GET /me": ok(meAs("patient")) });
    render(<DoctorPortal />);
    expect(
      await screen.findByText("Esta cuenta es de paciente"),
    ).toBeInTheDocument();
    expect(calls.map((c) => c.key)).toEqual(["GET /me"]);
    expect(auth.forget).toHaveBeenCalled();
  });

  it("una cuenta sin rol conserva la intención hasta crear el perfil", async () => {
    mockFetch({
      "GET /me": ok(meAs(null)),
      "GET /specialties": ok([SPECIALTY]),
    });
    render(<DoctorPortal />);
    expect(await screen.findByLabelText("Nombre(s)")).toBeInTheDocument();
    expect(auth.forget).not.toHaveBeenCalled();
  });

  it("401 en el portal: vuelve a /profesionales sin mostrar el portal", async () => {
    mockFetch(
      doctorRoutes(doctorStatus(), {
        "GET /me/doctor/status": { status: 401, body: { statusCode: 401 } },
      }),
    );
    render(<DoctorPortal />);
    await waitFor(() =>
      expect(replace).toHaveBeenCalledWith(PROFESSIONAL_ACCESS_PATH),
    );
    expect(screen.queryByText("Estado de tu registro")).not.toBeInTheDocument();
  });

  it("otro error HTTP no cierra la sesión: muestra el error y permite reintentar", async () => {
    mockFetch(
      doctorRoutes(doctorStatus(), {
        "GET /me/doctor/status": { status: 500, body: { statusCode: 500 } },
      }),
    );
    render(<DoctorPortal />);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "El servidor no pudo completar la operación",
    );
    expect(
      screen.getByRole("button", { name: "Reintentar" }),
    ).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });

  it("cambiar la especialidad explica cuándo vuelve a revisión la cédula", async () => {
    const other = {
      id: "66666666-6666-4666-8666-666666666666",
      code: "medicina_general",
      name: "Medicina general",
    };
    const { calls } = mockFetch(
      doctorRoutes(doctorStatus(), {
        "GET /specialties": ok([SPECIALTY, other]),
        "PUT /me/doctor-profile/specialty": { status: 200, body: {} },
      }),
    );
    render(<DoctorPortal />);
    await screen.findByRole("option", { name: "Medicina general" });
    const select = screen
      .getAllByLabelText("Especialidad")
      .at(-1) as HTMLSelectElement;
    await userEvent.selectOptions(select, other.id);
    await userEvent.click(
      screen.getByRole("button", { name: "Cambiar especialidad" }),
    );

    expect(
      await screen.findByText(
        "Especialidad actualizada. Si tu cédula estaba en revisión o aprobada, volverá a revisarse.",
      ),
    ).toBeInTheDocument();
    expect(
      calls.find((c) => c.key === "PUT /me/doctor-profile/specialty")?.body,
    ).toEqual({ specialtyId: other.id });
  });

  it("el administrador va a su panel", async () => {
    mockFetch({ "GET /me": ok(meAs("admin")) });
    render(<DoctorPortal />);
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/admin"));
  });

  it("D-37: con la aceptación pendiente el portal no se bloquea y permite enviar la INE", async () => {
    const { calls } = mockFetch(
      doctorRoutes(doctorStatus(), {
        "POST /me/doctor/identity-verifications": {
          status: 201,
          body: { reviewId: "r1", attempt: 1, status: "pending" },
        },
      }),
    );
    render(<DoctorPortal />);
    expect(
      await screen.findByText(
        "Aceptar los documentos legales vigentes para profesionales",
      ),
    ).toBeInTheDocument();
    await userEvent.upload(screen.getByLabelText(/Frente/), png("frente.png"));
    await userEvent.upload(
      screen.getByLabelText(/Reverso/),
      png("reverso.png"),
    );
    await userEvent.click(screen.getByRole("button", { name: "Enviar INE" }));

    const sent = calls.find(
      (c) => c.key === "POST /me/doctor/identity-verifications",
    )?.body as FormData;
    expect(sent.get("front")).toBeInstanceOf(File);
    expect(sent.get("back")).toBeInstanceOf(File);
  });

  it("acepta los documentos vigentes de audiencia doctor", async () => {
    const { calls, fetchMock } = mockFetch(
      doctorRoutes(doctorStatus(), {
        "POST /me/legal-acceptances": ok({ accepted: [] }),
      }),
    );
    render(<DoctorPortal />);
    const button = await screen.findByRole("button", {
      name: "Aceptar documentos",
    });
    expect(button).toBeDisabled();
    for (const box of await screen.findAllByRole("checkbox"))
      await userEvent.click(box);
    await userEvent.click(button);

    expect(
      calls.find((c) => c.key === "POST /me/legal-acceptances")?.body,
    ).toEqual({ documentIds: [POLICY.id, DOCTOR_TERMS.id] });
    // mockFetch ignora la query: se comprueba en la URL real que se piden los documentos del médico.
    const legalUrls = fetchMock.mock.calls
      .map(([input]) => new URL(String(input)))
      .filter((url) => url.pathname === "/legal-documents/current");
    expect(legalUrls.length).toBeGreaterThan(0);
    expect(
      legalUrls.every((url) => url.searchParams.get("audience") === "doctor"),
    ).toBe(true);
  });

  it("envía la cédula con su número y rechaza un tipo de archivo no permitido sin llamar al backend", async () => {
    const { calls } = mockFetch(
      doctorRoutes(doctorStatus({ missing: ["license_submission"] }), {
        "POST /me/doctor/license-verifications": {
          status: 201,
          body: { reviewId: "r2", attempt: 1, status: "pending" },
        },
      }),
    );
    render(<DoctorPortal />);
    await userEvent.type(
      await screen.findByLabelText("Número de cédula"),
      "12345678",
    );
    await userEvent.upload(
      screen.getByLabelText(/^Documento \(PDF/),
      new File(["x"], "c.gif", { type: "image/gif" }),
      { applyAccept: false },
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Enviar cédula" }),
    );
    expect(
      screen
        .getAllByRole("alert")
        .some((a) => a.textContent?.includes("no está permitido")),
    ).toBe(true);
    expect(
      calls.some((c) => c.key === "POST /me/doctor/license-verifications"),
    ).toBe(false);

    await userEvent.upload(
      screen.getByLabelText(/^Documento \(PDF/),
      new File(["x"], "c.pdf", { type: "application/pdf" }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Enviar cédula" }),
    );
    const sent = calls.find(
      (c) => c.key === "POST /me/doctor/license-verifications",
    )?.body as FormData;
    expect(sent.get("licenseNumber")).toBe("12345678");
    expect(sent.get("document")).toBeInstanceOf(File);
  });

  it("muestra las observaciones de la revisión y el historial", async () => {
    mockFetch(
      doctorRoutes(
        doctorStatus({
          status: "rejected",
          identity: "rejected",
          missing: ["identity_resubmission"],
          identityRejectionReason: "La imagen es ilegible",
        }),
        {
          "GET /me/doctor/verification-history": ok({
            identity: [
              {
                attempt: 1,
                revision: 1,
                status: "rejected",
                submittedAt: "2026-10-01T00:00:00.000Z",
                reviewedAt: "2026-10-02T00:00:00.000Z",
                rejectionReason: "La imagen es ilegible",
              },
            ],
            license: [],
          }),
        },
      ),
    );
    render(<DoctorPortal />);
    expect(
      await screen.findByText("INE: La imagen es ilegible"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("cell", { name: "La imagen es ilegible" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Enviar INE" }),
    ).toBeInTheDocument();
  });
});
