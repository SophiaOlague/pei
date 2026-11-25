// Transporte de audio y video de la videoconsulta (RealtimeKit). Es la única pieza que conoce el SDK.
// La presencia, la admisión, la finalización y las inasistencias son de PEI (API del backend): el transporte nunca
// decide nada del estado de la cita. Recibe la credencial individual del médico emitida por el backend; nunca ve el
// token de la API de Cloudflare.

export type KickResult =
  // Nadie más quedó en la llamada después de expulsar a todos.
  | { outcome: "verified" }
  // La expulsión se pidió, pero seguían participantes conectados al terminar la espera.
  | { outcome: "not_verified"; remaining: number }
  // El preset del médico no permite expulsar.
  | { outcome: "not_permitted" }
  | { outcome: "failed" };

export interface RemoteParticipant {
  id: string;
  videoEnabled: boolean;
  audioEnabled: boolean;
  attachVideo(element: HTMLVideoElement): () => void;
}

export interface CallHandle {
  attachLocalVideo(element: HTMLVideoElement): () => void;
  remoteParticipants(): RemoteParticipant[];
  // Se llama cuando cambia algo visible (participantes, cámara, micrófono, conexión).
  onChange(listener: () => void): () => void;
  // Se llama si el proveedor corta la llamada (por ejemplo, tras la revocación al finalizar).
  onDisconnected(listener: () => void): () => void;
  audioEnabled(): boolean;
  videoEnabled(): boolean;
  setAudio(on: boolean): Promise<void>;
  setVideo(on: boolean): Promise<void>;
  kickAllAndVerify(timeoutMs?: number): Promise<KickResult>;
  leave(): Promise<void>;
}

export interface CallTransport {
  join(authToken: string): Promise<CallHandle>;
}

type Listener = () => void;

// Formas mínimas del SDK que se usan (versión 2.x de @cloudflare/realtimekit). Se declaran aquí para que el resto
// de la web no dependa de sus tipos.
interface SdkEmitter {
  on(event: string, listener: (...args: unknown[]) => void): unknown;
  off?(event: string, listener: (...args: unknown[]) => void): unknown;
  removeListener?(
    event: string,
    listener: (...args: unknown[]) => void,
  ): unknown;
}
interface SdkParticipant {
  id: string;
  videoEnabled: boolean;
  audioEnabled: boolean;
  registerVideoElement(el: HTMLVideoElement): void;
  deregisterVideoElement(el?: HTMLVideoElement): void;
}
interface SdkMeeting {
  join(): Promise<void>;
  leave(): Promise<void>;
  self: SdkEmitter & {
    videoEnabled: boolean;
    audioEnabled: boolean;
    permissions: { kickParticipant: boolean };
    registerVideoElement(el: HTMLVideoElement, isPreview?: boolean): void;
    deregisterVideoElement(el?: HTMLVideoElement, isPreview?: boolean): void;
    enableAudio(): Promise<void>;
    disableAudio(): Promise<void>;
    enableVideo(): Promise<void>;
    disableVideo(): Promise<void>;
  };
  participants: SdkEmitter & {
    joined: SdkEmitter & {
      size: number;
      values(): IterableIterator<SdkParticipant>;
    };
    kickAll(): Promise<void>;
  };
}

const off = (
  emitter: SdkEmitter,
  event: string,
  fn: (...args: unknown[]) => void,
) => {
  if (emitter.off) emitter.off(event, fn);
  else emitter.removeListener?.(event, fn);
};

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function wrapMeeting(meeting: SdkMeeting): CallHandle {
  const subscribe = (
    emitter: SdkEmitter,
    events: string[],
    listener: Listener,
  ) => {
    const fn = () => listener();
    for (const e of events) emitter.on(e, fn);
    return () => {
      for (const e of events) off(emitter, e, fn);
    };
  };
  return {
    attachLocalVideo(el) {
      meeting.self.registerVideoElement(el, true);
      return () => meeting.self.deregisterVideoElement(el, true);
    },
    remoteParticipants() {
      return Array.from(meeting.participants.joined.values()).map((p) => ({
        id: p.id,
        videoEnabled: p.videoEnabled,
        audioEnabled: p.audioEnabled,
        attachVideo(el: HTMLVideoElement) {
          p.registerVideoElement(el);
          return () => p.deregisterVideoElement(el);
        },
      }));
    },
    onChange(listener) {
      const a = subscribe(
        meeting.participants.joined,
        [
          "participantJoined",
          "participantLeft",
          "participantsUpdate",
          "videoUpdate",
          "audioUpdate",
        ],
        listener,
      );
      const b = subscribe(
        meeting.self,
        ["videoUpdate", "audioUpdate", "roomJoined"],
        listener,
      );
      return () => {
        a();
        b();
      };
    },
    onDisconnected(listener) {
      return subscribe(meeting.self, ["roomLeft"], listener);
    },
    audioEnabled: () => meeting.self.audioEnabled,
    videoEnabled: () => meeting.self.videoEnabled,
    setAudio: (on) =>
      on ? meeting.self.enableAudio() : meeting.self.disableAudio(),
    setVideo: (on) =>
      on ? meeting.self.enableVideo() : meeting.self.disableVideo(),
    async kickAllAndVerify(timeoutMs = 4000) {
      if (!meeting.self.permissions.kickParticipant)
        return { outcome: "not_permitted" };
      try {
        await meeting.participants.kickAll();
      } catch {
        return { outcome: "failed" };
      }
      // La expulsión llega a los demás por el servidor del proveedor: se espera a que la lista de conectados se vacíe.
      const deadline = Date.now() + timeoutMs;
      while (meeting.participants.joined.size > 0 && Date.now() < deadline)
        await wait(200);
      const remaining = meeting.participants.joined.size;
      return remaining === 0
        ? { outcome: "verified" }
        : { outcome: "not_verified", remaining };
    },
    async leave() {
      try {
        await meeting.leave();
      } catch {
        // Salir de una llamada ya cortada no es un error para el médico.
      }
    },
  };
}

// El SDK solo funciona en el navegador: se carga bajo demanda, al unirse, y nunca en el servidor.
export const realtimeKitTransport: CallTransport = {
  async join(authToken) {
    const sdk = await import("@cloudflare/realtimekit");
    const meeting = (await sdk.default.init({
      authToken,
      defaults: { audio: true, video: true },
    })) as unknown as SdkMeeting;
    await meeting.join();
    return wrapMeeting(meeting);
  },
};
