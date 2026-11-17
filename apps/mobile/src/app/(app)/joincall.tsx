import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  StatusBar,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { SymbolView } from "expo-symbols";
import { router, useLocalSearchParams } from "expo-router";

export default function CitaEmergenciaScreen() {
  const params = useLocalSearchParams<{
    doctorName?: string;
    doctorSpecialty?: string;
    fecha?: string;
    hora?: string;
    motivo?: string;
  }>();

  const [micOn, setMicOn] = useState(true);
  const [cameraOn, setCameraOn] = useState(true);

  const doctorName = params.doctorName || "Carlos Zuñiga";
  const doctorSpecialty = params.doctorSpecialty || "Médico General";
  const fecha = params.fecha || "3 de agosto de 2026";
  const hora = params.hora || "3:30 PM";
  const motivo = params.motivo || "Motivo 1";

  const handleUnirse = () => {
    //console.log("Unirse a la videollamada");
    router.push("/call");
  };

  const handleCancelar = () => {
    router.back();
  };

  return (
    <SafeAreaView style={styles.container} edges={["bottom", "left", "right"]}>
      <StatusBar barStyle="dark-content"/>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >

        <View style={styles.cameraPlaceholder} />

        <View style={styles.controlsRow}>
          <Pressable
            onPress={() => setMicOn(!micOn)}
            style={({ pressed }) => [
              styles.controlButton,
              !micOn && styles.controlButtonOff,
              { transform: [{ scale: pressed ? 0.95 : 1 }] },
            ]}
          >
            <SymbolView
              name={{
                android: micOn ? "mic" : "mic_off",
                ios: micOn ? "mic.fill" : "mic.slash.fill",
              }}
              size={22}
              tintColor="#616161"
              resizeMode="scaleAspectFit"
            />
          </Pressable>

          <Pressable
            onPress={() => setCameraOn(!cameraOn)}
            style={({ pressed }) => [
              styles.controlButton,
              !cameraOn && styles.controlButtonOff,
              { transform: [{ scale: pressed ? 0.95 : 1 }] },
            ]}
          >
            <SymbolView
              name={{
                android: cameraOn ? "videocam" : "videocam_off",
                ios: cameraOn ? "video.fill" : "video.slash.fill",
              }}
              size={22}
              tintColor="#616161"
              resizeMode="scaleAspectFit"
            />
          </Pressable>
        </View>

        <Text style={styles.sectionTitle}>Información de la reunión</Text>

        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Doctor:</Text>
          <Text style={styles.infoValue}>{doctorName}</Text>
        </View>

        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Especialidad:</Text>
          <Text style={styles.infoValue}>{doctorSpecialty}</Text>
        </View>

        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Fecha:</Text>
          <Text style={styles.infoValue}>{fecha}</Text>
        </View>

        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Hora:</Text>
          <Text style={styles.infoValue}>{hora}</Text>
        </View>

        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Motivo:</Text>
          <Text style={styles.infoValue}>{motivo}</Text>
        </View>
      </ScrollView>

      <View style={styles.bottomContainer}>
        <Pressable
          onPress={handleUnirse}
          style={({ pressed }) => [
            styles.joinButton,
            { transform: [{ scale: pressed ? 0.97 : 1 }] },
          ]}
        >
          <Text style={styles.joinButtonText}>Unirse a videollamada</Text>
        </Pressable>

        <Pressable
          onPress={handleCancelar}
          style={({ pressed }) => [
            styles.cancelButton,
            { transform: [{ scale: pressed ? 0.97 : 1 }] },
          ]}
        >
          <Text style={styles.cancelButtonText}>Cancelar</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 20,
  },


  cameraPlaceholder: {
    width: "100%",
    height: 200,
    borderRadius: 20,
    backgroundColor: "#E9E4FF",
    marginBottom: 20,
  },

  controlsRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 16,
    marginBottom: 32,
  },
  controlButton: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "#F3F4F6",
    justifyContent: "center",
    alignItems: "center",
  },
  controlButtonOff: {
    backgroundColor: "#FEE2E2",
  },

  sectionTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: "#111827",
    marginBottom: 16,
  },

  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 10,
  },
  infoLabel: {
    fontSize: 14,
    color: "#616161",
    flex: 1,
  },
  infoValue: {
    fontSize: 14,
    color: "#000000",
    fontWeight: "600",
    flex: 1.5,
    textAlign: "right",
  },

  bottomContainer: {
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 20,
    gap: 10,
  },
  joinButton: {
    backgroundColor: "#7355F7",
    paddingVertical: 16,
    borderRadius: 50,
    alignItems: "center",
  },
  joinButtonText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "500",
  },
  cancelButton: {
    backgroundColor: "#FFFFFF",
    paddingVertical: 16,
    borderRadius: 50,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#9A9A9A",
  },
  cancelButtonText: {
    color: "#616161",
    fontSize: 15,
    fontWeight: "500",
  },
});