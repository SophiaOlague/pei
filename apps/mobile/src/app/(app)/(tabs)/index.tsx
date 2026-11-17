import { router } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { Colors, Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";

const API_URL = "https://telehealth-api.bayonaj368.workers.dev";

export default function HomeScreen() {
  const theme = useTheme();
  const isDark = theme.background === Colors.dark.background;

  const [joinId, setJoinId] = useState("");
  const [loading, setLoading] = useState<"new" | "join" | null>(null);

  async function handleNewCall() {
    setLoading("new");
    try {
      const res = await fetch(`${API_URL}/meetings`, {
        body: JSON.stringify({ title: "Telehealth Call" }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const meeting = await res.json<{ id: string }>();
      router.push({
        params: { meetingId: meeting.id, name: "Doctor" },
        pathname: "/call",
      });
    } catch {
      Alert.alert("Error", "Could not create a call. Please try again.");
    } finally {
      setLoading(null);
    }
  }

  async function handleJoin() {
    if (!joinId.trim()) {
      return;
    }
    setLoading("join");
    try {
      const res = await fetch(`${API_URL}/meetings/${joinId.trim()}`);
      if (!res.ok) {
        Alert.alert("Not found", "No call found with that ID.");
        return;
      }
      router.push({
        params: { meetingId: joinId.trim(), name: "Patient" },
        pathname: "/call",
      });
    } catch {
      Alert.alert("Error", "Could not join the call. Please try again.");
    } finally {
      setLoading(null);
    }
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <ThemedText style={styles.title} type="title">
            Telehealth
          </ThemedText>
          <ThemedText themeColor="textSecondary" type="default">
            Secure video consultations
          </ThemedText>
        </View>

        <View style={styles.actions}>
          <Pressable
            disabled={loading !== null}
            onPress={handleNewCall}
            style={({ pressed }) => [
              styles.primaryButton,
              pressed && styles.pressed,
            ]}
          >
            {loading === "new" ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <ThemedText style={styles.primaryButtonText}>New Call</ThemedText>
            )}
          </Pressable>

          <View style={styles.divider}>
            <View
              style={[
                styles.dividerLine,
                { backgroundColor: theme.backgroundElement },
              ]}
            />
            <ThemedText
              style={styles.dividerText}
              themeColor="textSecondary"
              type="small"
            >
              or join existing
            </ThemedText>
            <View
              style={[
                styles.dividerLine,
                { backgroundColor: theme.backgroundElement },
              ]}
            />
          </View>

          <View
            style={[
              styles.joinRow,
              { backgroundColor: theme.backgroundElement },
            ]}
          >
            <TextInput
              autoCapitalize="none"
              autoCorrect={false}
              onChangeText={setJoinId}
              onSubmitEditing={handleJoin}
              placeholder="Enter meeting ID"
              placeholderTextColor={theme.textSecondary}
              returnKeyType="join"
              style={[styles.input, { color: theme.text }]}
              value={joinId}
            />
            <Pressable
              disabled={loading !== null || !joinId.trim()}
              onPress={handleJoin}
              style={({ pressed }) => [
                styles.joinButton,
                {
                  backgroundColor: isDark
                    ? theme.backgroundSelected
                    : "#E0E1E6",
                },
                pressed && styles.pressed,
                !joinId.trim() && styles.disabled,
              ]}
            >
              {loading === "join" ? (
                <ActivityIndicator color={theme.text} size="small" />
              ) : (
                <ThemedText type="smallBold">Join</ThemedText>
              )}
            </Pressable>
          </View>
        </View>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  actions: {
    gap: Spacing.three,
  },
  container: {
    flex: 1,
  },
  disabled: {
    opacity: 0.4,
  },
  divider: {
    alignItems: "center",
    flexDirection: "row",
    gap: Spacing.two,
  },
  dividerLine: {
    flex: 1,
    height: 1,
  },
  dividerText: {
    flexShrink: 0,
  },
  header: {
    alignItems: "center",
    flex: 1,
    gap: Spacing.two,
    justifyContent: "center",
  },
  input: {
    flex: 1,
    fontSize: 16,
    height: "100%",
  },
  joinButton: {
    alignItems: "center",
    borderRadius: 14,
    height: "100%",
    justifyContent: "center",
    margin: 4,
    paddingHorizontal: Spacing.three,
  },
  joinRow: {
    alignItems: "center",
    borderRadius: 16,
    flexDirection: "row",
    gap: Spacing.two,
    height: 56,
    overflow: "hidden",
    paddingLeft: Spacing.three,
  },
  pressed: {
    opacity: 0.7,
  },
  primaryButton: {
    alignItems: "center",
    backgroundColor: "#208AEF",
    borderRadius: 16,
    height: 56,
    justifyContent: "center",
  },
  primaryButtonText: {
    color: "#fff",
    fontSize: 17,
    fontWeight: "600",
  },
  safeArea: {
    flex: 1,
    justifyContent: "space-between",
    paddingBottom: Spacing.five,
    paddingHorizontal: Spacing.four,
  },
  title: {
    textAlign: "center",
  },
});
