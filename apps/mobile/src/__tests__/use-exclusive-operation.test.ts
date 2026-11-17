import { describe, expect, it, jest } from "@jest/globals";
import { act, renderHook } from "@testing-library/react-native";

import { useExclusiveOperation } from "@/hooks/use-exclusive-operation";

function deferred() {
  let resolve: () => void = () => undefined;
  let reject: (error: Error) => void = () => undefined;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, reject, resolve };
}

async function setup() {
  const { result } = await renderHook(() => useExclusiveOperation());
  return result;
}

describe("useExclusiveOperation", () => {
  it("dos llamadas casi simultáneas ejecutan la operación una sola vez", async () => {
    const exclusive = await setup();
    const pending = deferred();
    const operation = jest.fn(() => pending.promise);

    let first: Promise<{ ran: boolean }> = Promise.resolve({ ran: false });
    let second: Promise<{ ran: boolean }> = Promise.resolve({ ran: false });
    await act(() => {
      first = exclusive.current.run(operation);
      second = exclusive.current.run(operation);
      expect(exclusive.current.isBusy()).toBe(true);
      pending.resolve();
    });

    expect(await first).toEqual({ ran: true });
    expect(await second).toEqual({ ran: false });
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it("guardar y comprobar no se ejecutan a la vez", async () => {
    const exclusive = await setup();
    const save = deferred();
    const saveOp = jest.fn(() => save.promise);
    const checkOp = jest.fn(() => Promise.resolve());

    await act(async () => {
      const saving = exclusive.current.run(saveOp);
      expect(await exclusive.current.run(checkOp)).toEqual({ ran: false });
      save.resolve();
      await saving;
    });

    expect(saveOp).toHaveBeenCalledTimes(1);
    expect(checkOp).not.toHaveBeenCalled();
  });

  it("se libera tras el éxito y permite otra operación", async () => {
    const exclusive = await setup();
    const op = jest.fn(() => Promise.resolve());
    await act(async () => {
      await exclusive.current.run(op);
    });
    expect(exclusive.current.isBusy()).toBe(false);
    await act(async () => {
      expect(await exclusive.current.run(op)).toEqual({ ran: true });
    });
    expect(op).toHaveBeenCalledTimes(2);
  });

  it("se libera tras un error (propagado) y permite otra operación", async () => {
    const exclusive = await setup();
    const failing = deferred();
    await act(async () => {
      const running = exclusive.current.run(() => failing.promise);
      failing.reject(new Error("fallo"));
      await expect(running).rejects.toThrow("fallo");
    });
    expect(exclusive.current.isBusy()).toBe(false);

    const next = jest.fn(() => Promise.resolve());
    await act(async () => {
      expect(await exclusive.current.run(next)).toEqual({ ran: true });
    });
    expect(next).toHaveBeenCalledTimes(1);
  });
});
