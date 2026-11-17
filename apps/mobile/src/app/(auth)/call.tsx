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
import * as Clipboard from "expo-clipboard";
import * as Device from "expo-device";
import { router, useLocalSearchParams } from "expo-router";
import { useContext, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  NativeModules,
  PermissionsAndroid,
  Platform,
  Pressable,
  StyleSheet,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ThemedText } from "@/components/themed-text";

const API_URL = "https://telehealth-api.bayonaj368.workers.dev";

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

function MeetingIdBadge({ meetingId }: { meetingId: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await Clipboard.setStringAsync(meetingId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Pressable onPress={handleCopy} style={styles.meetingIdBadge}>
      <ThemedText style={styles.meetingIdLabel}>
        {copied ? "Copied!" : `ID: ${meetingId.slice(0, 8)}…`}
      </ThemedText>
    </Pressable>
  );
}

function CallControls({
  meeting,
}: {
  meeting: ReturnType<typeof useRealtimeKitClient>[0];
}) {
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);

  function toggleMic() {
    if (micOn) {
      meeting?.self.disableAudio();
    } else {
      meeting?.self.enableAudio();
    }
    setMicOn((v) => !v);
  }

  function toggleCam() {
    if (camOn) {
      meeting?.self.disableVideo();
    } else {
      meeting?.self.enableVideo();
    }
    setCamOn((v) => !v);
  }

  function endCall() {
    meeting?.leave();
    router.back();
  }

  return (
    <View style={styles.controls}>
      <Pressable
        onPress={toggleMic}
        style={[styles.controlBtn, !micOn && styles.controlBtnOff]}
      >
        <ThemedText style={styles.controlIcon}>{micOn ? "🎙️" : "🔇"}</ThemedText>
      </Pressable>

      <Pressable onPress={endCall} style={styles.endBtn}>
        <ThemedText style={styles.controlIcon}>📵</ThemedText>
      </Pressable>

      <Pressable
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
  meetingId,
}: {
  meeting: ReturnType<typeof useRealtimeKitClient>[0];
  meetingId: string;
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
      router.back();
    };

    meeting?.self.addListener("roomJoined", onRoomJoined);
    meeting?.self.addListener("roomLeft", onRoomLeft);

    return () => {
      meeting?.self.removeListener("roomJoined", onRoomJoined);
      meeting?.self.removeListener("roomLeft", onRoomLeft);
    };
  }, [meeting, setStates]);

  // Explicitly join the meeting once the SDK is ready
  useEffect(() => {
    meeting?.join();
  }, [meeting]);

  const currentState = storeStates.meeting;

  if (currentState !== "joined") {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator color="#fff" size="large" />
        <ThemedText style={styles.loadingText}>Connecting...</ThemedText>
        <MeetingIdBadge meetingId={meetingId} />
      </View>
    );
  }

  return (
    <View style={styles.callContainer}>
      <RtkGrid meeting={meeting} style={styles.grid} />

      <SafeAreaView pointerEvents="box-none" style={styles.overlay}>
        <View style={styles.topRow}>
          <MeetingIdBadge meetingId={meetingId} />
          <View style={styles.selfViewContainer}>
            <RtkParticipantTile
              meeting={meeting}
              participant={meeting?.self}
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

function CallScreen() {
  const { meetingId, name } = useLocalSearchParams<{
    meetingId: string;
    name: string;
  }>();
  const [meet, initMeeting] = useRealtimeKitClient();
  const [authToken, setAuthToken] = useState<string | null>(null);
  const initialized = useRef(false);

  useEffect(() => {
    if (initialized.current) {
      return;
    }
    initialized.current = true;

    async function bootstrap() {
      try {
        const res = await fetch(`${API_URL}/meetings/${meetingId}/join`, {
          body: JSON.stringify({ name: name ?? "Guest" }),
          headers: { "Content-Type": "application/json" },
          method: "POST",
        });

        if (!res.ok) {
          Alert.alert("Error", "Could not join the call.");
          router.back();
          return;
        }

        const { authToken: token } = await res.json<{ authToken: string }>();
        setAuthToken(token);

        initMeeting({
          authToken: token,
          defaults: { audio: true, video: Device.isDevice },
        });
      } catch {
        Alert.alert("Error", "Something went wrong.");
        router.back();
      }
    }

    bootstrap();
  }, [meetingId, name, initMeeting]);

  if (!(meet && authToken)) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator color="#fff" size="large" />
        <ThemedText style={styles.loadingText}>Setting up call...</ThemedText>
      </View>
    );
  }

  return (
    <RealtimeKitProvider value={meet}>
      <ActiveCall meeting={meet} meetingId={meetingId} />
    </RealtimeKitProvider>
  );
}

export default function CallPage() {
  return (
    <View style={styles.page}>
      <RtkUIProvider>
        <CallScreen />
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
  meetingIdBadge: {
    alignSelf: "flex-start",
    backgroundColor: "rgba(0,0,0,0.5)",
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  meetingIdLabel: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "600",
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
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
    justifyContent: "space-between",
    padding: 16,
  },
});
