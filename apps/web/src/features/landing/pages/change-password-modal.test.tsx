import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ChangePasswordModal } from "./change-password-modal";

const changePassword = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth-client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth-client")>()),
  authClient: { changePassword },
}));

const ACTUAL = "Actual-123456";
const NUEVA = "Nueva-1234567";

async function fill(current: string, next: string, confirm: string) {
  if (current)
    await userEvent.type(screen.getByLabelText("Contraseña actual"), current);
  if (next)
    await userEvent.type(screen.getByLabelText("Nueva contraseña"), next);
  if (confirm)
    await userEvent.type(
      screen.getByLabelText("Confirmar contraseña"),
      confirm,
    );
  await userEvent.click(screen.getByRole("button", { name: "Guardar cambio" }));
}

describe("Cambiar contraseña", () => {
  const onChanged = vi.fn();
  const onClose = vi.fn();
  beforeEach(() => {
    changePassword.mockReset();
    onChanged.mockReset();
  });

  it("exige todos los campos antes de enviar", async () => {
    render(<ChangePasswordModal onClose={onClose} onChanged={onChanged} />);
    await fill(ACTUAL, NUEVA, "");

    expect(screen.getByRole("alert")).toHaveTextContent(
      "completa todos los campos",
    );
    expect(changePassword).not.toHaveBeenCalled();
  });

  it("exige que la nueva contraseña coincida con la confirmación", async () => {
    render(<ChangePasswordModal onClose={onClose} onChanged={onChanged} />);
    await fill(ACTUAL, NUEVA, `${NUEVA}x`);

    expect(screen.getByRole("alert")).toHaveTextContent("no coinciden");
    expect(changePassword).not.toHaveBeenCalled();
  });

  it("rechaza una contraseña nueva demasiado corta sin enviarla", async () => {
    render(<ChangePasswordModal onClose={onClose} onChanged={onChanged} />);
    await fill(ACTUAL, "corta", "corta");

    expect(screen.getByRole("alert")).toHaveTextContent(
      "al menos 8 caracteres",
    );
    expect(changePassword).not.toHaveBeenCalled();
  });

  it("con éxito envía la operación de Better Auth y confirma", async () => {
    changePassword.mockResolvedValue({ data: { token: "t" }, error: null });
    render(<ChangePasswordModal onClose={onClose} onChanged={onChanged} />);
    await fill(ACTUAL, NUEVA, NUEVA);

    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
    expect(changePassword).toHaveBeenCalledWith({
      currentPassword: ACTUAL,
      newPassword: NUEVA,
      revokeOtherSessions: true,
    });
  });

  it("si la contraseña actual es incorrecta, muestra el error y no confirma", async () => {
    changePassword.mockResolvedValue({
      data: null,
      error: {
        status: 400,
        code: "INVALID_PASSWORD",
        message: "Invalid password",
      },
    });
    render(<ChangePasswordModal onClose={onClose} onChanged={onChanged} />);
    await fill(ACTUAL, NUEVA, NUEVA);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "La contraseña actual no es correcta.",
    );
    expect(onChanged).not.toHaveBeenCalled();
  });

  it("con demasiados intentos (429) muestra el aviso y no confirma", async () => {
    changePassword.mockResolvedValue({ data: null, error: { status: 429 } });
    render(<ChangePasswordModal onClose={onClose} onChanged={onChanged} />);
    await fill(ACTUAL, NUEVA, NUEVA);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Demasiados intentos",
    );
    expect(onChanged).not.toHaveBeenCalled();
  });

  it("si falla la conexión, muestra el error y no confirma", async () => {
    changePassword.mockRejectedValue(new TypeError("Failed to fetch"));
    render(<ChangePasswordModal onClose={onClose} onChanged={onChanged} />);
    await fill(ACTUAL, NUEVA, NUEVA);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "No se pudo conectar",
    );
    expect(onChanged).not.toHaveBeenCalled();
  });

  it("no escribe las contraseñas en la consola", async () => {
    const spies = (["log", "info", "warn", "error", "debug"] as const).map(
      (m) => vi.spyOn(console, m),
    );
    changePassword.mockResolvedValue({
      data: null,
      error: { status: 400, code: "INVALID_PASSWORD" },
    });
    render(<ChangePasswordModal onClose={onClose} onChanged={onChanged} />);
    await fill(ACTUAL, NUEVA, NUEVA);
    await screen.findByRole("alert");

    const logged = spies
      .flatMap((s) => s.mock.calls.flat())
      .map(String)
      .join(" ");
    expect(logged).not.toContain(ACTUAL);
    expect(logged).not.toContain(NUEVA);
    for (const s of spies) s.mockRestore();
  });
});
