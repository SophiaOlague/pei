import {
  type MediaStream,
  mediaDevices,
} from "@cloudflare/react-native-webrtc";
import { useCallback, useEffect, useRef, useState } from "react";

// Vista previa LOCAL de cámara y micrófono antes de entrar a la sala. Solo captura en el dispositivo: no se conecta
// con ninguna sala ni con ningún servidor. Usa la biblioteca WebRTC ya instalada; fuera de este archivo, solo joincall.tsx
// la usa (RTCView), de modo que cambiar de proveedor de video queda acotado.

export type MediaPreviewState =
  | { kind: "starting" }
  | { kind: "ready"; streamURL: string }
  | { kind: "error" };

export function useLocalMediaPreview(enabled: boolean) {
  const streamRef = useRef<MediaStream | null>(null);
  const [state, setState] = useState<MediaPreviewState>({ kind: "starting" });
  const [micOn, setMicOn] = useState(true);
  const [cameraOn, setCameraOn] = useState(true);
  const [attempt, setAttempt] = useState(0);

  // `attempt` no se lee dentro del efecto: cambiarlo es la forma de repetir la captura (retry).
  // biome-ignore lint/correctness/useExhaustiveDependencies: ver la línea anterior.
  useEffect(() => {
    if (!enabled) {
      return;
    }
    let cancelled = false;
    mediaDevices
      .getUserMedia({ audio: true, video: { facingMode: "user" } })
      .then((stream) => {
        if (cancelled) {
          stream.release();
          return;
        }
        streamRef.current = stream;
        setMicOn(true);
        setCameraOn(true);
        setState({ kind: "ready", streamURL: stream.toURL() });
      })
      .catch(() => {
        if (!cancelled) {
          setState({ kind: "error" });
        }
      });
    return () => {
      cancelled = true;
      streamRef.current?.release();
      streamRef.current = null;
    };
  }, [enabled, attempt]);

  const toggleMic = useCallback(() => {
    const next = !micOn;
    for (const track of streamRef.current?.getAudioTracks() ?? []) {
      track.enabled = next;
    }
    setMicOn(next);
  }, [micOn]);

  const toggleCamera = useCallback(() => {
    const next = !cameraOn;
    for (const track of streamRef.current?.getVideoTracks() ?? []) {
      track.enabled = next;
    }
    setCameraOn(next);
  }, [cameraOn]);

  const retry = useCallback(() => {
    setState({ kind: "starting" });
    setAttempt((n) => n + 1);
  }, []);

  return { cameraOn, micOn, retry, state, toggleCamera, toggleMic };
}
