import { router, useLocalSearchParams } from "expo-router";
import { SymbolView } from "expo-symbols";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { type EmergencyAssign, ServiceEmergency } from "./emergency-demo";

export default function ResumenEmergenciaScreen() {
  const params = useLocalSearchParams<{
    horaCambiada?: string;
    slotIdCambia?: string;
  }>();
  const [data, setData] = useState<EmergencyAssign | null>(null);
  const [loading, setLoading] = useState(true);
  const [isConfirming, setIsConfirming] = useState(false);

  useEffect(() => {
    async function loadEmergencyData() {
      try {
        const result = await ServiceEmergency.getAssignEmergency();
        setData(result);
      } catch (error) {
        Alert.alert("Error", "No se pudo cargar la asignación de emergencia.");
      } finally {
        setLoading(false);
      }
    }
    loadEmergencyData();
  }, []);

  if (loading || !data) {
    return (
      <SafeAreaView style={[styles.container, styles.center]}>
        <ActivityIndicator color="#FFFFFF" size="large" />
      </SafeAreaView>
    );
  }

  const horaActual = params.horaCambiada || data.slotAsignado.hora;
  const handleIrACambiarHorario = () => {
    router.push({
      params: {
        doctorId: data.doctorId,
        doctorName: data.doctorName,
        fecha: data.fecha,
        horaActual,
      },
      pathname: "/fastdatetime",
    });
  };
  // Sin reserva real no hay pago: M08 no tiene un contrato de citas de emergencia y esta pantalla usa datos de
  // demostración (emergency-demo.ts) sin cita en el backend. No se navega a /pago hasta que exista esa reserva.
  const handleConfirmarCita = () => {
    setIsConfirming(true);
    try {
      Alert.alert(
        "Reserva de emergencia no disponible",
        "Todavía no podemos reservar citas de emergencia. Agenda tu consulta desde «Agendar cita» para continuar al pago."
      );
    } finally {
      setIsConfirming(false);
    }
  };

  return (
    <SafeAreaView edges={["top"]} style={styles.container}>
      <StatusBar backgroundColor="#6C5CE7" barStyle="light-content" />

      <View style={styles.header}>
        <Image source={{ uri: data.fotoUrl }} style={styles.avatar} />
        <Text style={styles.doctorName}>{data.doctorName}</Text>
        <Text style={styles.specialty}>{data.especialidad}</Text>
      </View>

      <View style={styles.card}>
        <ScrollView showsVerticalScrollIndicator={false}>
          <Text style={styles.successText} />

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Fecha:</Text>
            <Text style={styles.infoValue}>{data.fecha}</Text>
          </View>

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Hora:</Text>
            <Text style={styles.infoValueHighlight}>{horaActual}</Text>
          </View>

          <Pressable
            onPress={handleIrACambiarHorario}
            style={({ pressed }) => [
              styles.btnSecondary,
              pressed && styles.pressed,
            ]}
          >
            <Text style={styles.btnSecondaryText}>Cambiar horario</Text>
          </Pressable>

          <View style={styles.divider} />

          <View style={styles.priceRow}>
            <Text style={styles.priceLabel}>Consulta de la cita</Text>
            <Text style={styles.priceValue}>$200 MXN</Text>
          </View>

          <View style={styles.priceRow}>
            <Text style={styles.totalLabel}>Total</Text>
            <Text style={styles.totalValue}>$200 MXN</Text>
          </View>

          <Pressable
            disabled={isConfirming}
            onPress={handleConfirmarCita}
            style={({ pressed }) => [
              styles.btnPrimary,
              pressed && styles.pressed,
            ]}
          >
            {isConfirming ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <Text style={styles.btnPrimaryText}>Confirmar</Text>
            )}
          </Pressable>

          <View style={styles.securePayment}>
            <SymbolView
              name={{ android: "lock", ios: "lock.shield" }}
              size={14}
              tintColor="#8E8E93"
            />
            <Text style={styles.secureText}>Pago seguro</Text>
          </View>
        </ScrollView>
      </View>

      <View style={styles.bottomWhiteFill} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  avatar: {
    borderRadius: 45,
    height: 90,
    marginVertical: 12,
    width: 90,
  },
  bottomWhiteFill: {
    backgroundColor: "#FFFFFF",
    height: 50,
  },
  btnPrimary: {
    alignItems: "center",
    backgroundColor: "#6C5CE7",
    borderRadius: 25,
    marginTop: 45,
    paddingVertical: 16,
  },
  btnPrimaryText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
  },
  btnSecondary: {
    alignItems: "center",
    backgroundColor: "#F2F2F7",
    borderRadius: 20,
    marginVertical: 16,
    paddingVertical: 12,
  },
  btnSecondaryText: {
    color: "#4A4A4A",
    fontSize: 15,
    fontWeight: "500",
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 24,
  },
  center: {
    alignItems: "center",
    justifyContent: "center",
  },
  container: {
    backgroundColor: "#6C5CE7",
    flex: 1,
  },
  divider: {
    backgroundColor: "#E9E9EA",
    height: 1,
    marginVertical: 16,
  },
  doctorName: {
    color: "#FFFFFF",
    fontSize: 20,
    fontWeight: "bold",
  },
  header: {
    alignItems: "center",
    paddingBottom: 20,
    paddingTop: 12,
  },
  headerTitle: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "500",
  },
  infoLabel: {
    color: "#8E8E93",
    fontSize: 14,
  },
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginVertical: 6,
  },
  infoValue: {
    color: "#000000",
    fontSize: 14,
    fontWeight: "600",
  },
  infoValueHighlight: {
    color: "#6C5CE7",
    fontSize: 15,
    fontWeight: "bold",
  },
  pressed: {
    opacity: 0.8,
  },
  priceLabel: {
    color: "#8E8E93",
    fontSize: 14,
  },
  priceRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginVertical: 4,
  },
  priceValue: {
    color: "#8E8E93",
    fontSize: 14,
  },
  securePayment: {
    alignItems: "center",
    flexDirection: "row",
    gap: 4,
    justifyContent: "center",
    marginTop: 12,
    paddingBottom: 8,
  },
  secureText: {
    color: "#8E8E93",
    fontSize: 12,
  },
  specialty: {
    color: "#E0DFFF",
    fontSize: 14,
  },
  successText: {
    color: "#8E8E93",
    fontSize: 14,
    marginBottom: 18,
    textAlign: "center",
  },
  totalLabel: {
    color: "#6C5CE7",
    fontSize: 14,
    fontWeight: "600",
  },
  totalValue: {
    color: "#6C5CE7",
    fontSize: 14,
    fontWeight: "600",
  },
});
