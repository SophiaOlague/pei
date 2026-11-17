import React, { useEffect, useState, useCallback } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
  Alert,
} from "react-native";
import { router, useFocusEffect } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";

import { ServiceAgenda, CitaProxima } from "./citas-demos";

export default function AgendaScreen() {
  const [citas, setCitas] = useState<CitaProxima[]>([]);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      async function cargarAgenda() {
        try {
          setLoading(true);
          const data = await ServiceAgenda.getCitasProximas();
          setCitas(data);
        } catch (error) {
          console.error("Error al obtener la agenda:", error);
        } finally {
          setLoading(false);
        }
      }

      cargarAgenda();
    }, [])
  );

  const handleReagendar = (cita: CitaProxima) => {
    Alert.alert(
      "Aviso de Producción",
      `Temporalmente a pagina de citas nuevas`,
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Continuar",
          onPress: () => {
            router.push({
              pathname: "/seleccioncita",
              params: {
                doctorId: cita.id,
                doctorName: cita.doctorName,
                doctorSpecialty: cita.especialidad,
                fecha: cita.fecha,
                horaActual: cita.hora,
              },
            });
          },
        },
      ]
    );
  };

  const handleCancelar = (citaId: string) => {
    router.push("/(app)/canceldate");
  };

  return (
    <SafeAreaView style={styles.container} edges={["top", "left", "right"]}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      {loading ? (
        <View style={styles.centerLoader}>
          <ActivityIndicator size="large" color="#7355F7" />
          <Text style={styles.loadingText}>Cargando agenda...</Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {citas.map((cita) => (
            <View key={cita.id} style={styles.card}>
              <View style={styles.cardHeader}>
                <Image
                  source={{ uri: cita.doctorAvatar }}
                  style={styles.avatar}
                />
                <View style={styles.infoContainer}>
                  <Text style={styles.doctorName}>{cita.doctorName}</Text>
                  <Text style={styles.specialty}>{cita.especialidad}</Text>
                  <Text style={styles.dateTime}>
                    {cita.fecha}   {cita.hora}
                  </Text>
                </View>
              </View>

              <View style={styles.actionsContainer}>
                <Pressable
                  style={({ pressed }) => [
                    styles.btnCancel,
                    pressed && styles.pressed,
                  ]}
                  onPress={() => handleCancelar(cita.id)}
                >
                  <Text style={styles.btnCancelText}>Cancelar cita</Text>
                </Pressable>

                <Pressable
                  style={({ pressed }) => [
                    styles.btnReschedule,
                    pressed && styles.pressed,
                  ]}
                  onPress={() => handleReagendar(cita)}
                >
                  <Text style={styles.btnRescheduleText}>Reagendar cita</Text>
                </Pressable>
              </View>
            </View>
          ))}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centerLoader: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
  },
  loadingText: {
    color: "#8E8E93",
    fontSize: 14,
    marginTop: 12,
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingBottom: 110,
  },

  card: {
    marginBottom: 20,
  },
  cardHeader: {
    alignItems: "center",
    flexDirection: "row",
    marginBottom: 14,  
  },
  avatar: {
    backgroundColor: "#E5E7EB",
    borderRadius: 28,
    height: 56,
    width: 56,
  },
  infoContainer: {
    flex: 1,
    marginLeft: 16,
  },
  doctorName: {
    color: "#000000",
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 2,
  },
  specialty: {
    color: "#8E8E93",
    fontSize: 14,
    marginBottom: 4,
  },
  dateTime: {
    color: "#000000",
    fontSize: 14,
    fontWeight: "500",
  },

  actionsContainer: {
    flexDirection: "row",
    gap: 12,
  },
  btnCancel: {
    alignItems: "center",
    backgroundColor: "#E56363",
    borderRadius: 24,
    flex: 1,
    justifyContent: "center",
    paddingVertical: 10,
  },
  btnCancelText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "600",
  },
  btnReschedule: {
    alignItems: "center",
    backgroundColor: "#F4F4F6",
    borderRadius: 24,
    flex: 1,
    justifyContent: "center",
    paddingVertical: 10,
  },
  btnRescheduleText: {
    color: "#4A4A4A",
    fontSize: 14,
    fontWeight: "500",
  },
  pressed: {
    opacity: 0.8,
  },
});