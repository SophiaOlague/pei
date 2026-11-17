import React from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";

export default function DetallesLlamadaScreen() {
  const params = useLocalSearchParams<{
    doctorName?: string;
    specialty?: string;
    hora?: string;
    duracion?: string;
    notas?: string;
  }>();

  const doctorName = params.doctorName || "Dr. Diego Torres";
  const specialty = params.specialty || "Médico general";
  const hora = params.hora || "3:15 PM";
  const duracion = params.duracion || "1 hr 15 min";
  const notas = params.notas || "----------";

  const handleVerReceta = () => {
    //console.log("Ver receta");
    router.push("/(app)/recipe");
  };

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.title}>DETALLES DE LA VIDEOLLAMADA</Text>

        <View style={styles.infoBlock}>
          <Text style={styles.label}>Médico tratante:</Text>
          <Text style={styles.value}>{doctorName}</Text>
        </View>

        <View style={styles.infoBlock}>
          <Text style={styles.label}>Especialidad del médico:</Text>
          <Text style={styles.value}>{specialty}</Text>
        </View>

        <View style={styles.infoBlock}>
          <Text style={styles.label}>Hora de la videollamada:</Text>
          <Text style={styles.value}>{hora}</Text>
        </View>

        <View style={styles.infoBlock}>
          <Text style={styles.label}>Duración de videollamada:</Text>
          <Text style={styles.value}>{duracion}</Text>
        </View>

        <View style={styles.infoBlock}>
          <Text style={styles.label}>Notas del médico:</Text>
          <Text style={styles.value}>{notas}</Text>
        </View>
      </ScrollView>

      <View style={styles.bottomContainer}>
        <Pressable
          onPress={handleVerReceta}
          style={({ pressed }) => [
            styles.primaryButton,
            { transform: [{ scale: pressed ? 0.97 : 1 }] },
          ]}
        >
          <Text style={styles.primaryButtonText}>Ver receta</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingTop: 25,
    paddingBottom: 20,
  },
  title: {
    fontSize: 18,
    fontWeight: "700",
    color: "#111827",
    textAlign: "center",
    marginBottom: 24,
  },

  infoBlock: {
    marginBottom: 18,
  },
  label: {
    fontSize: 13,
    color: "#9CA3AF",
    marginBottom: 2,
  },
  value: {
    fontSize: 15,
    color: "#111827",
    fontWeight: "600",
  },

  bottomContainer: {
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 24,
    borderTopWidth: 1,
    borderTopColor: "#F3F4F6",
  },
  primaryButton: {
    backgroundColor: "#7355F7",
    paddingVertical: 16,
    borderRadius: 50,
    alignItems: "center",
  },
  primaryButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
  },
});