import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ADMIN_HOME_PATH } from "@/features/components/require-registration";
import { PROFESSIONAL_PORTAL_PATH } from "@/features/professionals/paths";
import {
  meAs,
  mockFetch,
  ok,
  pendingOf,
  privacy,
  status,
  terms,
} from "@/test/http";
import {
  CompleteRegistration,
  REGISTRATION_DONE_PATH,
} from "./complete-registration";

const replace = vi.fn();
// Como el de Next, el router es el mismo objeto en cada render.
const router = { replace };
vi.mock("next/navigation", () => ({ useRouter: () => router }));

const legalPending = (...docs: (typeof terms)[]) =>
  status({
    legal: { accepted: false, pending: docs.map(pendingOf) },
    missing: ["legal", "identity_submission"],
  });

const TERMS_LABEL = "He leído y acepto los Términos y Condiciones";
const PRIVACY_LABEL = "He leído y acepto el Aviso de Privacidad";

describe("CompleteRegistration: paso legal", () => {
  beforeEach(() => replace.mockReset());

  it("las casillas empiezan desmarcadas y no se puede continuar sin todas", async () => {
    mockFetch({
      "GET /me": ok(meAs("patient")),
      "GET /me/registration-status": ok(legalPending(terms, privacy)),
      "GET /legal-documents/current": ok([terms, privacy]),
    });
    render(<CompleteRegistration />);

    const termsBox = await screen.findByLabelText(TERMS_LABEL);
    const privacyBox = screen.getByLabelText(PRIVACY_LABEL);
    const button = screen.getByRole("button", { name: "Aceptar y continuar" });
    expect(termsBox).not.toBeChecked();
    expect(privacyBox).not.toBeChecked();
    expect(button).toBeDisabled();

    await userEvent.click(termsBox);
    expect(button).toBeDisabled();
    await userEvent.click(privacyBox);
    expect(button).toBeEnabled();
  });

  it("cada documento muestra su título, su versión y su contenido", async () => {
    mockFetch({
      "GET /me": ok(meAs("patient")),
      "GET /me/registration-status": ok(legalPending(terms, privacy)),
      "GET /legal-documents/current": ok([terms, privacy]),
    });
    render(<CompleteRegistration />);

    expect(
      await screen.findByRole("heading", {
        name: /Términos y Condiciones\s+versión 1\.0/,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", {
        name: /Aviso de Privacidad\s+versión 2\.1/,
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("Texto de los términos")).toBeInTheDocument();
    expect(screen.getByText("Texto del aviso")).toBeInTheDocument();
  });

  it("envía exactamente los IDs devueltos por /legal-documents/current", async () => {
    const { calls } = mockFetch({
      "GET /me": ok(meAs("patient")),
      "GET /me/registration-status": [
        ok(legalPending(terms, privacy)),
        ok(status()),
      ],
      "GET /legal-documents/current": ok([terms, privacy]),
      "POST /me/legal-acceptances": ok({ accepted: [] }),
    });
    render(<CompleteRegistration />);

    await userEvent.click(await screen.findByLabelText(TERMS_LABEL));
    await userEvent.click(screen.getByLabelText(PRIVACY_LABEL));
    await userEvent.click(
      screen.getByRole("button", { name: "Aceptar y continuar" }),
    );

    await waitFor(() =>
      expect(replace).toHaveBeenCalledWith(REGISTRATION_DONE_PATH),
    );
    const accept = calls.filter((c) => c.key === "POST /me/legal-acceptances");
    expect(accept).toHaveLength(1);
    expect(accept[0].body).toEqual({ documentIds: [terms.id, privacy.id] });
  });

  it("muestra el error si fallan los documentos y permite reintentar", async () => {
    mockFetch({
      "GET /me": ok(meAs("patient")),
      "GET /me/registration-status": ok(legalPending(terms, privacy)),
      "GET /legal-documents/current": [
        { status: 500, body: { statusCode: 500, message: "x" } },
        ok([terms, privacy]),
      ],
    });
    render(<CompleteRegistration />);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "El servidor no pudo completar la operación",
    );
    await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(await screen.findByLabelText(TERMS_LABEL)).toBeInTheDocument();
  });

  it("muestra el error si falla la aceptación y no avanza", async () => {
    mockFetch({
      "GET /me": ok(meAs("patient")),
      "GET /me/registration-status": ok(legalPending(terms, privacy)),
      "GET /legal-documents/current": ok([terms, privacy]),
      "POST /me/legal-acceptances": {
        status: 409,
        body: {
          statusCode: 409,
          message: "El documento legal no corresponde a tu tipo de cuenta",
          error: "LegalDocumentNotRequiredForRoleError",
        },
      },
    });
    render(<CompleteRegistration />);

    await userEvent.click(await screen.findByLabelText(TERMS_LABEL));
    await userEvent.click(screen.getByLabelText(PRIVACY_LABEL));
    await userEvent.click(
      screen.getByRole("button", { name: "Aceptar y continuar" }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "El documento legal no corresponde a tu tipo de cuenta",
    );
    expect(replace).not.toHaveBeenCalled();
  });

  it("una versión nueva pendiente vuelve a pedir solo esa aceptación", async () => {
    const newTerms = {
      ...terms,
      id: "33333333-3333-4333-8333-333333333333",
      version: "2.0",
    };
    const { calls } = mockFetch({
      "GET /me": ok(meAs("patient")),
      "GET /me/registration-status": [ok(legalPending(newTerms)), ok(status())],
      "GET /legal-documents/current": ok([newTerms, privacy]),
      "POST /me/legal-acceptances": ok({ accepted: [] }),
    });
    render(<CompleteRegistration />);

    const box = await screen.findByLabelText(TERMS_LABEL);
    expect(box).not.toBeChecked();
    expect(screen.queryByLabelText(PRIVACY_LABEL)).not.toBeInTheDocument();
    expect(screen.getByText(/versión 2\.0/)).toBeInTheDocument();

    await userEvent.click(box);
    await userEvent.click(
      screen.getByRole("button", { name: "Aceptar y continuar" }),
    );
    await waitFor(() =>
      expect(replace).toHaveBeenCalledWith(REGISTRATION_DONE_PATH),
    );
    expect(
      calls.find((c) => c.key === "POST /me/legal-acceptances")?.body,
    ).toEqual({
      documentIds: [newTerms.id],
    });
  });

  it("sin documentos publicados no ofrece continuar", async () => {
    mockFetch({
      "GET /me": ok(meAs("patient")),
      "GET /me/registration-status": ok(
        status({ legal: { accepted: false, pending: [] }, missing: ["legal"] }),
      ),
      "GET /legal-documents/current": ok([]),
    });
    render(<CompleteRegistration />);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "no están disponibles",
    );
    expect(
      screen.queryByRole("button", { name: "Aceptar y continuar" }),
    ).not.toBeInTheDocument();
  });
});

describe("CompleteRegistration: perfil y orden", () => {
  beforeEach(() => replace.mockReset());

  it("crea el perfil antes de registrar las aceptaciones", async () => {
    const { calls } = mockFetch({
      "GET /me": ok(meAs("patient")),
      "GET /me/registration-status": [
        ok(
          status({
            profileCompleted: false,
            legal: {
              accepted: false,
              pending: [pendingOf(terms), pendingOf(privacy)],
            },
            missing: ["profile", "legal"],
          }),
        ),
        ok(legalPending(terms, privacy)),
        ok(status()),
      ],
      "POST /me/patient-profile": ok({
        patientProfileId: "p",
        userProfileId: "u",
      }),
      "GET /legal-documents/current": ok([terms, privacy]),
      "POST /me/legal-acceptances": ok({ accepted: [] }),
    });
    render(<CompleteRegistration />);

    // Mientras falta el perfil no se muestran las casillas legales.
    expect(await screen.findByLabelText("CURP")).toBeInTheDocument();
    expect(screen.queryByLabelText(TERMS_LABEL)).not.toBeInTheDocument();
    const next = screen.getByRole("button", { name: "Continuar" });
    expect(next).toBeDisabled();

    await userEvent.type(screen.getByLabelText("Nombre(s)"), "Ana");
    await userEvent.type(screen.getByLabelText("Apellidos"), "Pérez");
    await userEvent.type(screen.getByLabelText("CURP"), "PEAA000101MDFRNNA1");
    await userEvent.type(
      screen.getByLabelText("Fecha de nacimiento"),
      "2000-01-01",
    );
    await userEvent.click(next);

    await userEvent.click(await screen.findByLabelText(TERMS_LABEL));
    await userEvent.click(screen.getByLabelText(PRIVACY_LABEL));
    await userEvent.click(
      screen.getByRole("button", { name: "Aceptar y continuar" }),
    );
    await waitFor(() =>
      expect(replace).toHaveBeenCalledWith(REGISTRATION_DONE_PATH),
    );

    const order = calls.map((c) => c.key).filter((k) => k.startsWith("POST"));
    expect(order).toEqual([
      "POST /me/patient-profile",
      "POST /me/legal-acceptances",
    ]);
    expect(
      calls.find((c) => c.key === "POST /me/patient-profile")?.body,
    ).toEqual({
      firstName: "Ana",
      lastName: "Pérez",
      curp: "PEAA000101MDFRNNA1",
      birthDate: "2000-01-01",
    });
  });

  it("muestra el error del backend al crear el perfil", async () => {
    mockFetch({
      "GET /me": ok(meAs("patient")),
      "GET /me/registration-status": ok(
        status({ profileCompleted: false, missing: ["profile"] }),
      ),
      "POST /me/patient-profile": {
        status: 400,
        body: {
          statusCode: 400,
          message: ["curp no es una CURP válida"],
          error: "Bad Request",
        },
      },
    });
    render(<CompleteRegistration />);

    await userEvent.type(await screen.findByLabelText("Nombre(s)"), "Ana");
    await userEvent.type(screen.getByLabelText("Apellidos"), "Pérez");
    await userEvent.type(screen.getByLabelText("CURP"), "MAL");
    await userEvent.type(
      screen.getByLabelText("Fecha de nacimiento"),
      "2000-01-01",
    );
    await userEvent.click(screen.getByRole("button", { name: "Continuar" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "curp no es una CURP válida",
    );
  });

  it("si el registro ya está completo, redirige al inicio sin pedir documentos", async () => {
    const { calls } = mockFetch({
      "GET /me": ok(meAs("patient")),
      "GET /me/registration-status": ok(status()),
    });
    render(<CompleteRegistration />);

    await waitFor(() =>
      expect(replace).toHaveBeenCalledWith(REGISTRATION_DONE_PATH),
    );
    expect(calls.map((c) => c.key)).toEqual([
      "GET /me",
      "GET /me/registration-status",
    ]);
  });

  it("sin sesión en el backend (401) envía a /login", async () => {
    mockFetch({
      "GET /me": ok(meAs("patient")),
      "GET /me/registration-status": {
        status: 401,
        body: { statusCode: 401, message: "x" },
      },
    });
    render(<CompleteRegistration />);

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/login"));
  });
});

describe("CompleteRegistration: rol antes del registro", () => {
  beforeEach(() => replace.mockReset());

  it("un administrador va a /admin sin consultar ni mostrar nada del registro de pacientes", async () => {
    const { calls } = mockFetch({
      "GET /me": ok(meAs("admin", "admin@example.test")),
    });
    render(<CompleteRegistration />);

    await waitFor(() => expect(replace).toHaveBeenCalledWith(ADMIN_HOME_PATH));
    expect(calls.map((c) => c.key)).toEqual(["GET /me"]);
    expect(screen.queryByText("Completa tu registro")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("CURP")).not.toBeInTheDocument();
  });

  it.each([
    ["sin perfil todavía (rol null)", null],
    ["paciente", "patient"],
  ] as const)("%s: sigue el flujo del registro", async (_, role) => {
    mockFetch({
      "GET /me": ok(meAs(role)),
      "GET /me/registration-status": ok(
        status({ profileCompleted: false, missing: ["profile"] }),
      ),
    });
    render(<CompleteRegistration />);

    expect(await screen.findByLabelText("CURP")).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalledWith(ADMIN_HOME_PATH);
  });

  it("un médico va al portal profesional sin consultar el registro de pacientes", async () => {
    const { calls } = mockFetch({ "GET /me": ok(meAs("doctor")) });
    render(<CompleteRegistration />);

    await waitFor(() =>
      expect(replace).toHaveBeenCalledWith(PROFESSIONAL_PORTAL_PATH),
    );
    expect(calls.map((c) => c.key)).toEqual(["GET /me"]);
  });

  it("sin rol, si empezó en el portal profesional, vuelve a él (no al registro de pacientes)", async () => {
    sessionStorage.setItem("pei.professionalIntent", "1");
    try {
      const { calls } = mockFetch({ "GET /me": ok(meAs(null)) });
      render(<CompleteRegistration />);

      await waitFor(() =>
        expect(replace).toHaveBeenCalledWith(PROFESSIONAL_PORTAL_PATH),
      );
      expect(calls.map((c) => c.key)).toEqual(["GET /me"]);
    } finally {
      sessionStorage.removeItem("pei.professionalIntent");
    }
  });

  it("el rol se consulta una sola vez: los pasos del registro no repiten GET /me", async () => {
    const { calls } = mockFetch({
      "GET /me": ok(meAs(null)),
      "GET /me/registration-status": [
        ok(status({ profileCompleted: false, missing: ["profile"] })),
        ok(status()),
      ],
      "POST /me/patient-profile": ok({
        patientProfileId: "p",
        userProfileId: "u",
      }),
    });
    render(<CompleteRegistration />);

    await userEvent.type(await screen.findByLabelText("Nombre(s)"), "Ana");
    await userEvent.type(screen.getByLabelText("Apellidos"), "Pérez");
    await userEvent.type(screen.getByLabelText("CURP"), "PEAA000101MDFRNNA1");
    await userEvent.type(
      screen.getByLabelText("Fecha de nacimiento"),
      "2000-01-01",
    );
    await userEvent.click(screen.getByRole("button", { name: "Continuar" }));

    await waitFor(() =>
      expect(replace).toHaveBeenCalledWith(REGISTRATION_DONE_PATH),
    );
    expect(calls.filter((c) => c.key === "GET /me")).toHaveLength(1);
  });

  it("sin sesión al consultar el rol (401) envía a /login sin consultar el registro", async () => {
    const { calls } = mockFetch({
      "GET /me": { status: 401, body: { statusCode: 401 } },
    });
    render(<CompleteRegistration />);

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/login"));
    expect(calls.map((c) => c.key)).toEqual(["GET /me"]);
  });

  it("si falla la consulta del rol, muestra el error sin mostrar el registro y el reintento vuelve a consultarlo", async () => {
    const { calls } = mockFetch({
      "GET /me": [
        { status: 500, body: { statusCode: 500 } },
        ok(meAs("admin")),
      ],
    });
    render(<CompleteRegistration />);

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.queryByLabelText("CURP")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));

    await waitFor(() => expect(replace).toHaveBeenCalledWith(ADMIN_HOME_PATH));
    expect(calls.map((c) => c.key)).toEqual(["GET /me", "GET /me"]);
  });
});
