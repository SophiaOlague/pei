import { RTCView } from "@cloudflare/react-native-webrtc";
import { router, useLocalSearchParams } from "expo-router";
import { SymbolView } from "expo-symbols";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { RealtimeKitCall } from "@/components/video/realtimekit-call";
import { WaitingRoomStatus } from "@/components/video/waiting-room-status";
import { useLocalMediaPreview } from "@/hooks/use-local-media-preview";
import { useVideoSession } from "@/hooks/use-video-session";
import {
  ApiError,
  getPatientAppointment,
  type PatientAppointment,
} from "@/lib/api";
import {
  formatAppointmentDate,
  formatAppointmentTime,
  waitingRoomAccess,
} from "@/lib/next-appointment";

// Videoconsulta de una cita real (GET /me/patient/appointments/:id): vista previa local, sala de espera del backend
// (entrada, latidos, salida voluntaria, reconexión, casos pendientes) y credencial de la llamada tras la admisión.
// La llamada solo se abre con una credencial real del proveedor. Si el backend no puede emitirla (hoy responde 422: el
// proveedor de video no está configurado), se muestra el mensaje tal cual y no se simula ninguna llamada.

type Load =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "ready"; appointment: PatientAppointment };

// Por qué la cita no admite todavía la preparación; null si la admite.
function unavailableReason(
  appointment: PatientAppointment,
  now: Date
): string | null {
  if (appointment.status !== "confirmed") {
    return "Esta cita no está disponible para videoconsulta.";
  }
  const access = waitingRoomAccess(appointment.scheduledAt, now);
  if (!access) {
    return "No se pudo leer la fecha de tu cita.";
  }
  if (!access.open) {
    return `Podrás entrar a la sala desde las ${formatAppointmentTime(access.opensAt)} h.`;
  }
  return null;
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

function MediaPreview() {
  const { cameraOn, micOn, retry, state, toggleCamera, toggleMic } =
    useLocalMediaPreview(true);

  return (
    <>
      <View style={styles.preview}>
        {state.kind === "starting" ? (
          <ActivityIndicator accessibilityLabel="Abriendo la cámara" />
        ) : null}
        {state.kind === "error" ? (
          <>
            <Text accessibilityRole="alert" style={styles.previewText}>
              No se pudo acceder a la cámara o al micrófono. Revisa los permisos
              de la aplicación.
            </Text>
            <Pressable accessibilityRole="button" onPress={retry}>
              <Text style={styles.previewRetry}>Reintentar</Text>
            </Pressable>
          </>
        ) : null}
        {state.kind === "ready" && cameraOn ? (
          <RTCView
            mirror
            objectFit="cover"
            streamURL={state.streamURL}
            style={styles.previewVideo}
          />
        ) : null}
        {state.kind === "ready" && !cameraOn ? (
          <Text style={styles.previewText}>Cámara apagada</Text>
        ) : null}
      </View>

      <View style={styles.controlsRow}>
        <Pressable
          accessibilityLabel={micOn ? "Apagar micrófono" : "Encender micrófono"}
          accessibilityRole="button"
          disabled={state.kind !== "ready"}
          onPress={toggleMic}
          style={[styles.controlButton, !micOn && styles.controlButtonOff]}
        >
          <SymbolView
            name={{
              android: micOn ? "mic" : "mic_off",
              ios: micOn ? "mic.fill" : "mic.slash.fill",
            }}
            resizeMode="scaleAspectFit"
            size={22}
            tintColor="#616161"
          />
        </Pressable>

        <Pressable
          accessibilityLabel={cameraOn ? "Apagar cámara" : "Encender cámara"}
          accessibilityRole="button"
          disabled={state.kind !== "ready"}
          onPress={toggleCamera}
          style={[styles.controlButton, !cameraOn && styles.controlButtonOff]}
        >
          <SymbolView
            name={{
              android: cameraOn ? "videocam" : "videocam_off",
              ios: cameraOn ? "video.fill" : "video.slash.fill",
            }}
            resizeMode="scaleAspectFit"
            size={22}
            tintColor="#616161"
          />
        </Pressable>
      </View>
    </>
  );
}

// Estado de la credencial de la llamada tras la admisión. El error del backend se muestra tal cual (no se oculta el 422).
function CallTokenNotice({
  token,
  callLeft,
  onRetry,
  onRejoin,
}: {
  token: ReturnType<typeof useVideoSession>["token"];
  callLeft: boolean;
  onRetry: () => void;
  onRejoin: () => void;
}) {
  if (callLeft) {
    return (
      <View style={styles.callNotice}>
        <Text style={styles.notice}>
          Saliste de la videollamada. La consulta sigue en curso.
        </Text>
        <Pressable accessibilityRole="button" onPress={onRejoin}>
          <Text style={styles.previewRetry}>Volver a la videollamada</Text>
        </Pressable>
      </View>
    );
  }
  if (token.kind === "unavailable") {
    return (
      <View style={styles.callNotice}>
        <Text accessibilityRole="alert" style={styles.notice}>
          El médico te admitió, pero la videollamada no se pudo iniciar:{" "}
          {token.message}
        </Text>
        <Pressable accessibilityRole="button" onPress={onRetry}>
          <Text style={styles.previewRetry}>Reintentar</Text>
        </Pressable>
      </View>
    );
  }
  if (token.kind === "ready" && token.token.provider !== "realtimekit") {
    return (
      <Text accessibilityRole="alert" style={styles.notice}>
        Esta versión de la app no admite el proveedor de video «
        {token.token.provider}».
      </Text>
    );
  }
  return (
    <View style={styles.callNotice}>
      <Text style={styles.notice}>
        El médico te admitió. Preparando la videollamada…
      </Text>
      <ActivityIndicator accessibilityLabel="Preparando la videollamada" />
    </View>
  );
}

function useAppointment(appointmentId: string | undefined): Load {
  const [load, setLoad] = useState<Load>({ kind: "loading" });
  useEffect(() => {
    if (!appointmentId) {
      setLoad({ kind: "error", message: "No se indicó la cita." });
      return;
    }
    let cancelled = false;
    getPatientAppointment(appointmentId)
      .then((appointment) => {
        if (!cancelled) {
          setLoad({ appointment, kind: "ready" });
        }
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setLoad({
            kind: "error",
            message:
              e instanceof ApiError ? e.message : "No se pudo cargar la cita.",
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [appointmentId]);
  return load;
}

type Room = ReturnType<typeof useVideoSession>["room"];

function roomFlags(room: Room) {
  const session =
    room.kind === "inside" || room.kind === "left" ? room.session : null;
  const live =
    room.kind === "inside" &&
    (room.session.phase === "waiting" || room.session.phase === "active");
  const active = room.kind === "inside" && room.session.phase === "active";
  return { active, inRoom: live, session };
}

function RoomButton({
  room,
  inRoom,
  canEnter,
  onEnter,
  onLeave,
}: {
  room: Room;
  inRoom: boolean;
  canEnter: boolean;
  onEnter: () => void;
  onLeave: () => void;
}) {
  if (inRoom) {
    return (
      <Pressable
        accessibilityRole="button"
        onPress={onLeave}
        style={styles.cancelButton}
      >
        <Text style={styles.cancelButtonText}>Salir de la sala</Text>
      </Pressable>
    );
  }
  const label =
    room.kind === "left" ? "Volver a la sala" : "Entrar a la sala de espera";
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityState={{ disabled: !canEnter }}
      disabled={!canEnter}
      onPress={onEnter}
      style={[styles.joinButton, !canEnter && styles.joinButtonDisabled]}
    >
      {room.kind === "entering" ? (
        <ActivityIndicator color="#FFFFFF" />
      ) : (
        <Text style={styles.joinButtonText}>{label}</Text>
      )}
    </Pressable>
  );
}

const previewAllowed = (session: ReturnType<typeof roomFlags>["session"]) =>
  !session || session.phase === "waiting";

const realtimeKitToken = (
  token: ReturnType<typeof useVideoSession>["token"]
) =>
  token.kind === "ready" && token.token.provider === "realtimekit"
    ? token.token.authToken
    : null;

function AppointmentInfo({
  appointment,
  doctorName,
}: {
  appointment: PatientAppointment;
  doctorName?: string;
}) {
  const scheduledAt = new Date(appointment.scheduledAt);
  return (
    <>
      <Text style={styles.sectionTitle}>Información de la cita</Text>
      {doctorName ? <InfoRow label="Médico:" value={doctorName} /> : null}
      {Number.isNaN(scheduledAt.getTime()) ? null : (
        <>
          <InfoRow label="Fecha:" value={formatAppointmentDate(scheduledAt)} />
          <InfoRow
            label="Hora:"
            value={`${formatAppointmentTime(scheduledAt)} h`}
          />
        </>
      )}
      <InfoRow label="Motivo:" value={appointment.reason} />
    </>
  );
}

const canEnterRoom = (room: Room) =>
  room.kind === "outside" || room.kind === "error" || room.kind === "left";

export default function JoinCallScreen() {
  const { appointmentId, doctorName } = useLocalSearchParams<{
    appointmentId?: string;
    doctorName?: string;
  }>();
  const load = useAppointment(appointmentId);
  const video = useVideoSession(appointmentId);
  const [callLeft, setCallLeft] = useState(false);

  const goBack = useCallback(() => {
    router.back();
  }, []);

  const unavailable =
    load.kind === "ready"
      ? unavailableReason(load.appointment, new Date())
      : null;

  const { room, token, enter, leave, requestToken } = video;
  const { session, inRoom, active } = roomFlags(room);
  const canEnter = load.kind === "ready" && !unavailable && canEnterRoom(room);
  const showPreview =
    load.kind === "ready" && !unavailable && !active && previewAllowed(session);

  const confirmLeave = useCallback(() => {
    Alert.alert(
      "Salir de la sala",
      "Tu cita no se cancela. Podrás volver a entrar.",
      [
        { style: "cancel", text: "Seguir en la sala" },
        { onPress: () => leave(), style: "destructive", text: "Salir" },
      ]
    );
  }, [leave]);

  const onCallLeft = useCallback(() => setCallLeft(true), []);
  const rejoinCall = useCallback(() => {
    setCallLeft(false);
    requestToken();
  }, [requestToken]);

  // La llamada solo se monta con una credencial real de un proveedor que esta versión conoce.
  const callToken = active && !callLeft ? realtimeKitToken(token) : null;
  if (callToken) {
    return <RealtimeKitCall authToken={callToken} onLeft={onCallLeft} />;
  }

  return (
    <SafeAreaView edges={["bottom", "left", "right"]} style={styles.container}>
      <StatusBar barStyle="dark-content" />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {load.kind === "loading" ? (
          <ActivityIndicator accessibilityLabel="Cargando la cita" />
        ) : null}
        {load.kind === "error" ? (
          <Text accessibilityRole="alert" style={styles.notice}>
            {load.message}
          </Text>
        ) : null}
        {load.kind === "ready" && unavailable ? (
          <Text accessibilityRole="alert" style={styles.notice}>
            {unavailable}
          </Text>
        ) : null}
        {session ? (
          <WaitingRoomStatus
            connectionLost={
              room.kind === "inside" && room.connection === "lost"
            }
            session={session}
          />
        ) : null}
        {room.kind === "left" ? (
          <Text style={styles.notice}>
            Saliste de la sala. Tu cita sigue confirmada; puedes volver a
            entrar.
          </Text>
        ) : null}
        {room.kind === "error" ? (
          <Text accessibilityRole="alert" style={styles.notice}>
            {room.message}
          </Text>
        ) : null}
        {active ? (
          <CallTokenNotice
            callLeft={callLeft}
            onRejoin={rejoinCall}
            onRetry={requestToken}
            token={token}
          />
        ) : null}
        {showPreview ? <MediaPreview /> : null}

        {load.kind === "ready" ? (
          <AppointmentInfo
            appointment={load.appointment}
            doctorName={doctorName}
          />
        ) : null}
      </ScrollView>

      <View style={styles.bottomContainer}>
        <RoomButton
          canEnter={canEnter}
          inRoom={inRoom}
          onEnter={enter}
          onLeave={confirmLeave}
          room={room}
        />

        <Pressable
          accessibilityRole="button"
          onPress={goBack}
          style={styles.cancelButton}
        >
          <Text style={styles.cancelButtonText}>Volver</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  bottomContainer: {
    gap: 10,
    paddingBottom: 20,
    paddingHorizontal: 24,
    paddingTop: 12,
  },
  callNotice: {
    gap: 8,
    marginBottom: 20,
  },
  cancelButton: {
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderColor: "#9A9A9A",
    borderRadius: 50,
    borderWidth: 1,
    paddingVertical: 16,
  },
  cancelButtonText: {
    color: "#616161",
    fontSize: 15,
    fontWeight: "500",
  },
  container: {
    backgroundColor: "#FFFFFF",
    flex: 1,
  },
  controlButton: {
    alignItems: "center",
    backgroundColor: "#F3F4F6",
    borderRadius: 26,
    height: 52,
    justifyContent: "center",
    width: 52,
  },
  controlButtonOff: {
    backgroundColor: "#FEE2E2",
  },
  controlsRow: {
    flexDirection: "row",
    gap: 16,
    justifyContent: "center",
    marginBottom: 32,
  },
  infoLabel: {
    color: "#616161",
    flex: 1,
    fontSize: 14,
  },
  infoRow: {
    alignItems: "flex-start",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  infoValue: {
    color: "#000000",
    flex: 1.5,
    fontSize: 14,
    fontWeight: "600",
    textAlign: "right",
  },
  joinButton: {
    alignItems: "center",
    backgroundColor: "#7355F7",
    borderRadius: 50,
    paddingVertical: 16,
  },
  joinButtonDisabled: {
    opacity: 0.4,
  },
  joinButtonText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "500",
  },
  notice: {
    color: "#111827",
    fontSize: 14,
    marginBottom: 20,
  },
  preview: {
    alignItems: "center",
    backgroundColor: "#E9E4FF",
    borderRadius: 20,
    height: 200,
    justifyContent: "center",
    marginBottom: 20,
    overflow: "hidden",
    padding: 16,
    width: "100%",
  },
  previewRetry: {
    color: "#7355F7",
    fontSize: 14,
    fontWeight: "600",
    marginTop: 8,
  },
  previewText: {
    color: "#111827",
    fontSize: 14,
    textAlign: "center",
  },
  previewVideo: {
    ...StyleSheet.absoluteFill,
  },
  scrollContent: {
    paddingBottom: 20,
    paddingHorizontal: 24,
    paddingTop: 16,
  },
  sectionTitle: {
    color: "#111827",
    fontSize: 15,
    fontWeight: "600",
    marginBottom: 16,
  },
});
