import { useCallback, useRef } from "react";

// Una sola operación asíncrona a la vez entre todas las que comparten este hook. La marca es un ref (síncrono): un
// estado de React solo cambia en el siguiente render, y dos toques en el mismo frame lo verían libre.
// run() toma la marca antes de llamar a la operación (antes de su primer await) y la libera en finally, también si
// la operación falla. Si ya hay una en curso, no ejecuta nada y devuelve { ran: false }.
export function useExclusiveOperation() {
  const inFlight = useRef(false);

  const isBusy = useCallback(() => inFlight.current, []);

  const run = useCallback(
    async (operation: () => Promise<void>): Promise<{ ran: boolean }> => {
      // biome-ignore lint/suspicious/noUnnecessaryConditions: el ref cambia entre llamadas; Biome no lo sigue
      if (inFlight.current) {
        return { ran: false };
      }
      inFlight.current = true;
      try {
        await operation();
        return { ran: true };
      } finally {
        inFlight.current = false;
      }
    },
    []
  );

  return { isBusy, run };
}
