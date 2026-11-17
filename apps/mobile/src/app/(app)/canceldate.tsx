import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { SymbolView } from "expo-symbols";

import { ServiceAgenda } from "./citas-demos";

export default function CancelDateScreen() {
  const params = useLocalSearchParams<{ citaId?: string }>();

  const [motivo, setMotivo] = useState("");
  const [loading, setLoading] = useState(false);

  const handleConfirmarCancelacion = async () => {
    try {
      setLoading(true);
      const citaId = params.citaId || "cita-1";
      const respuesta = await ServiceAgenda.cancelarCita(citaId, motivo);

      if (respuesta.exito) {
        Alert.alert("Éxito", respuesta.mensaje, [
          {
            text: "Entendido",
            onPress: () => router.back(),
          },
        ]);
      } else {
        Alert.alert("Aviso", respuesta.mensaje);
      }
    } catch (error) {
      Alert.alert("Error", "No se pudo procesar la cancelación.");
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.title}>Cancelar Cita</Text>
        <Text style={styles.subtitle}>Cancela solo si es necesario</Text>

        <View style={styles.warningCard}>
          <SymbolView
            name={{ android: "warning", ios: "exclamationmark.triangle" }}
            size={20}
            tintColor="#D93838"
          />
          <Text style={styles.warningText}>
            Al cancelar una cita no se hará devolución del pago
          </Text>
        </View>

        <Text style={styles.inputLabel}>Motivo de la cancelación (opcional)</Text>
        <TextInput
          style={styles.input}
          placeholder="Motivo breve"
          placeholderTextColor="#B0B0B0"
          value={motivo}
          onChangeText={setMotivo}
          maxLength={120}
        />

        <Pressable
          style={({ pressed }) => [
            styles.btnConfirm,
            loading && styles.btnDisabled,
            pressed && !loading && styles.pressed,
          ]}
          onPress={handleConfirmarCancelacion}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#FFFFFF" size="small" />
          ) : (
            <Text style={styles.btnConfirmText}>Cancelar Cita</Text>
          )}
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: "#FFFFFF",
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 32,
  },
  title: {
    color: "#000000",
    fontSize: 20,
    fontWeight: "700",
    marginBottom: 4,
  },
  subtitle: {
    color: "#666666",
    fontSize: 14,
    marginBottom: 24,
  },
  warningCard: {
    alignItems: "center",
    backgroundColor: "#FCE8E8",
    borderRadius: 12,
    flexDirection: "row",
    gap: 12,
    marginBottom: 28,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  warningText: {
    color: "#D93838",
    flex: 1,
    fontSize: 13,
    fontWeight: "500",
    lineHeight: 18,
  },
  inputLabel: {
    color: "#000000",
    fontSize: 15,
    fontWeight: "600",
    marginBottom: 12,
  },
  input: {
    borderColor: "#E5E5EA",
    borderRadius: 24,
    borderWidth: 1,
    color: "#000000",
    fontSize: 14,
    height: 48,
    paddingHorizontal: 18,
    marginBottom: 36,
  },
  btnConfirm: {
    alignItems: "center",
    backgroundColor: "#7355F7",
    borderRadius: 25,
    justifyContent: "center",
    paddingVertical: 14,
  },
  btnConfirmText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
  },
  btnDisabled: {
    opacity: 0.6,
  },
  pressed: {
    opacity: 0.85,
  },
});