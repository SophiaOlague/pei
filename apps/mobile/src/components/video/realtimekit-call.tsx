import {
  RealtimeKitProvider,
  useRealtimeKitClient,
} from "@cloudflare/realtimekit-react-native";
import {
  RtkDialogManager,
  RtkGrid,
  RtkParticipantTile,
  RtkUIContext,
  RtkUIProvider,
} from "@cloudflare/realtimekit-react-native-ui";
import * as Device from "expo-device";
import { useCallback, useContext, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  NativeModules,
  PermissionsAndroid,
  Platform,
  Pressable,
  StyleSheet,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ThemedText } from "@/components/themed-text";

// Interfaz de llamada con RealtimeKit. joincall.tsx la monta SOLO con una credencial real que emite el backend de PEI
// para la cita (POST /me/patient/appointments/:id/session/token) y con proveedor «realtimekit». No obtiene el token
// por su cuenta ni llama a ningún servidor externo. Hoy el backend no tiene adaptador del proveedor (responde 422), así
// que esta interfaz no se llega a mostrar. El proveedor sigue sin confirmarse en el Maestro; si cambia, se sustituye.

type RtkClient = NonNullable<ReturnType<typeof useRealtimeKitClient>[0]>;

const RtkUIModule = NativeModules.CoreUiKit;

async function startKeepAliveService() {
  if (Platform.OS !== "android") {
    return;
  }
  if ((Platform.Version as number) >= 33) {
    await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS
    );
  }
  const isRunning = await RtkUIModule.isForegroundServiceRunning();
  if (!isRunning) {
    await RtkUIModule.startService();
  }
}

async function stopKeepAliveService() {
  if (Platform.OS !== "android") {
    return;
  }
  await RtkUIModule.stopService();
}

function CallControls({ meeting }: { meeting: RtkClient }) {
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);

  const toggleMic = useCallback(() => {
    if (micOn) {
      meeting.self.disableAudio();
    } else {
      meeting.self.enableAudio();
    }
    setMicOn(!micOn);
  }, [meeting, micOn]);

  const toggleCam = useCallback(() => {
    if (camOn) {
      meeting.self.disableVideo();
    } else {
      meeting.self.enableVideo();
    }
    setCamOn(!camOn);
  }, [meeting, camOn]);

  // Salir dispara roomLeft, que avisa a quien monta el componente (onLeft).
  const leave = useCallback(() => {
    meeting.leave();
  }, [meeting]);

  return (
    <View style={styles.controls}>
      <Pressable
        accessibilityLabel={micOn ? "Apagar micrófono" : "Encender micrófono"}
        onPress={toggleMic}
        style={[styles.controlBtn, !micOn && styles.controlBtnOff]}
      >
        <ThemedText style={styles.controlIcon}>{micOn ? "🎙️" : "🔇"}</ThemedText>
      </Pressable>

      <Pressable
        accessibilityLabel="Salir de la llamada"
        onPress={leave}
        style={styles.endBtn}
      >
        <ThemedText style={styles.controlIcon}>📵</ThemedText>
      </Pressable>

      <Pressable
        accessibilityLabel={camOn ? "Apagar cámara" : "Encender cámara"}
        onPress={toggleCam}
        style={[styles.controlBtn, !camOn && styles.controlBtnOff]}
      >
        <ThemedText style={styles.controlIcon}>
          {camOn ? "📷" : "🚫"}
        </ThemedText>
      </Pressable>
    </View>
  );
}

function ActiveCall({
  meeting,
  onLeft,
}: {
  meeting: RtkClient;
  onLeft: () => void;
}) {
  const { storeStates, setStates } = useContext(RtkUIContext);
  const storeStatesRef = useRef(storeStates);
  storeStatesRef.current = storeStates;

  useEffect(() => {
    const onRoomJoined = () => {
      startKeepAliveService();
      setStates({ ...storeStatesRef.current, meeting: "joined" });
    };
    const onRoomLeft = () => {
      stopKeepAliveService();
      onLeft();
    };

    meeting.self.addListener("roomJoined", onRoomJoined);
    meeting.self.addListener("roomLeft", onRoomLeft);

    return () => {
      meeting.self.removeListener("roomJoined", onRoomJoined);
      meeting.self.removeListener("roomLeft", onRoomLeft);
    };
  }, [meeting, onLeft, setStates]);

  useEffect(() => {
    meeting.join();
  }, [meeting]);

  if (storeStates.meeting !== "joined") {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator color="#fff" size="large" />
        <ThemedText style={styles.loadingText}>Conectando…</ThemedText>
      </View>
    );
  }

  return (
    <View style={styles.callContainer}>
      <View style={styles.grid}>
        <RtkGrid meeting={meeting} />
      </View>

      <SafeAreaView pointerEvents="box-none" style={styles.overlay}>
        <View style={styles.topRow}>
          <View style={styles.selfViewContainer}>
            <RtkParticipantTile
              meeting={meeting}
              participant={meeting.self}
              style={styles.selfView}
            />
          </View>
        </View>
        <CallControls meeting={meeting} />
      </SafeAreaView>

      <RtkDialogManager meeting={meeting} />
    </View>
  );
}

function CallSession({
  authToken,
  onLeft,
}: {
  authToken: string;
  onLeft: () => void;
}) {
  const [meeting, initMeeting] = useRealtimeKitClient();
  const initialized = useRef<boolean>(false);

  useEffect(() => {
    if (initialized.current) {
      return;
    }
    initialized.current = true;
    initMeeting({
      authToken,
      defaults: { audio: true, video: Device.isDevice },
    });
  }, [authToken, initMeeting]);

  if (!meeting) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator color="#fff" size="large" />
        <ThemedText style={styles.loadingText}>
          Preparando la llamada…
        </ThemedText>
      </View>
    );
  }

  return (
    <RealtimeKitProvider value={meeting}>
      <ActiveCall meeting={meeting} onLeft={onLeft} />
    </RealtimeKitProvider>
  );
}

export function RealtimeKitCall({
  authToken,
  onLeft,
}: {
  authToken: string;
  onLeft: () => void;
}) {
  return (
    <View style={styles.page}>
      <RtkUIProvider>
        <CallSession authToken={authToken} onLeft={onLeft} />
      </RtkUIProvider>
    </View>
  );
}

const styles = StyleSheet.create({
  callContainer: {
    backgroundColor: "#000",
    flex: 1,
  },
  controlBtn: {
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.2)",
    borderRadius: 30,
    height: 60,
    justifyContent: "center",
    width: 60,
  },
  controlBtnOff: {
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  controlIcon: {
    fontSize: 24,
  },
  controls: {
    alignItems: "center",
    flexDirection: "row",
    gap: 20,
    justifyContent: "center",
    paddingBottom: 16,
    paddingHorizontal: 32,
  },
  endBtn: {
    alignItems: "center",
    backgroundColor: "#FF3B30",
    borderRadius: 35,
    height: 70,
    justifyContent: "center",
    width: 70,
  },
  grid: {
    flex: 1,
  },
  loadingContainer: {
    alignItems: "center",
    backgroundColor: "#000",
    flex: 1,
    gap: 16,
    justifyContent: "center",
  },
  loadingText: {
    color: "#fff",
    fontSize: 16,
  },
  overlay: {
    ...StyleSheet.absoluteFill,
    justifyContent: "space-between",
  },
  page: {
    backgroundColor: "#000",
    flex: 1,
  },
  selfView: {
    height: 140,
    width: 100,
  },
  selfViewContainer: {
    borderRadius: 16,
    elevation: 8,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { height: 4, width: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
  },
  topRow: {
    alignItems: "flex-start",
    flexDirection: "row",
    justifyContent: "flex-end",
    padding: 16,
  },
});
