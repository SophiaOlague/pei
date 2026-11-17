import { router, useLocalSearchParams } from "expo-router";
import { SymbolView } from "expo-symbols";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from "react-native";

import {
  type EmergencyAssign,
  type EmergencySlot,
  ServiceEmergency,
} from "./emergency-demo";

export default function CambiarHorarioEmergenciaScreen() {
  const params = useLocalSearchParams<{
    doctorId?: string;
    doctorName?: string;
    doctorSpecialty?: string;
    doctorAvatar?: string;
    fecha?: string;
    horaActual?: string;
  }>();

  const [datosEmergencia, setDatosEmergencia] =
    useState<EmergencyAssign | null>(null);
  const [horarios, setHorarios] = useState<EmergencySlot[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<EmergencySlot | null>(null);

  const allTimeSlots = useMemo(() => {
    const list: { key: string; label: string; disponible: boolean }[] = [];
    let count = 0;

    for (let h = 8; h <= 17; h++) {
      for (const m of [0, 30]) {
        if (h === 17 && m > 0) {
          break;
        }

        const period = h >= 12 ? "PM" : "AM";
        const displayHour = h > 12 ? h - 12 : h;
        const displayMinutes = m === 0 ? "00" : "30";
        const timeStr = `${displayHour}:${displayMinutes} ${period}`;

        const estaDisponible = count % 3 !== 2;

        list.push({
          disponible: estaDisponible,
          key: timeStr,
          label: timeStr,
        });

        count++;
      }
    }
    return list;
  }, []);

  useEffect(() => {
    async function fetchHorariosDoctor() {
      try {
        setLoading(true);

        const res = await ServiceEmergency.getAssignEmergency();
        setDatosEmergencia(res);

        const listaHorarios: EmergencySlot[] = res?.horariosLibresDoctor ?? [];
        setHorarios(listaHorarios);

        const actual = listaHorarios.find(
          (h: EmergencySlot) => h.hora === params.horaActual && h.disponible
        );

        if (actual) {
          setSelectedSlot(actual);
        } else {
          const primerDisponible = listaHorarios.find(
            (h: EmergencySlot) => h.disponible
          );
          if (primerDisponible) {
            setSelectedSlot(primerDisponible);
          } else {
            const primerLocalLibre = allTimeSlots.find((s) => s.disponible);
            if (primerLocalLibre) {
              setSelectedSlot({
                disponible: true,
                hora: primerLocalLibre.key,
                id: "temp-1",
              });
            }
          }
        }
      } catch (error) {
        console.error("Error al obtener datos de agenda del backend:", error);
      } finally {
        setLoading(false);
      }
    }

    fetchHorariosDoctor();
  }, [params.horaActual, allTimeSlots]);

  const handleConfirmarNuevoHorario = async () => {
    if (!selectedSlot) {
      return;
    }

    try {
      setIsSubmitting(true);

      const doctorId =
        datosEmergencia?.doctorId || params.doctorId || "doc-101";
      const exito = await ServiceEmergency.updateEmergencySlot(
        doctorId,
        selectedSlot.id
      );

      if (exito) {
        router.replace({
          params: {
            horaCambiada: selectedSlot.hora,
            slotIdCambia: selectedSlot.id,
          },
          pathname: "/fastdate",
        });
      }
    } catch (error) {
      console.error("Error al reasignar horario en el servidor:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return (
      <View style={[styles.container, styles.centerLoader]}>
        <ActivityIndicator color="#FFFFFF" size="large" />
        <Text style={styles.loadingText}>Cargando agenda disponible...</Text>
      </View>
    );
  }

  const doctorAvatar = datosEmergencia?.fotoUrl || params.doctorAvatar || "";
  const doctorName =
    datosEmergencia?.doctorName || params.doctorName || "Dr. Asignado";
  const doctorSpecialty =
    datosEmergencia?.especialidad || params.doctorSpecialty || "Especialista";

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.centeredView}>
          <View style={styles.topSection}>
            <Image source={{ uri: doctorAvatar }} style={styles.doctorAvatar} />
            <Text style={styles.doctorName}>{doctorName}</Text>
            <Text style={styles.doctorSpecialty}>{doctorSpecialty}</Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Reasignar horario</Text>

            <ScrollView
              contentContainerStyle={styles.carouselContent}
              horizontal
              showsHorizontalScrollIndicator={false}
            >
              {allTimeSlots.map((slot) => {
                const matchingSlot = horarios.find((h) => h.hora === slot.key);

                const isAvailable = Boolean(
                  matchingSlot ? matchingSlot.disponible : slot.disponible
                );

                const isSelected = selectedSlot?.hora === slot.key;

                return (
                  <Pressable
                    disabled={!isAvailable}
                    key={slot.key}
                    onPress={() =>
                      setSelectedSlot(
                        matchingSlot || {
                          disponible: true,
                          hora: slot.key,
                          id: slot.key,
                        }
                      )
                    }
                    style={({ pressed }) => [
                      styles.timeCard,
                      isSelected && styles.timeCardSelected,
                      !isAvailable && styles.cardDisabled,
                      pressed &&
                        isAvailable && { transform: [{ scale: 0.95 }] },
                    ]}
                  >
                    <Text
                      style={[
                        styles.timeText,
                        isSelected && styles.timeTextSelected,
                        !isAvailable && styles.timeTextDisabled,
                      ]}
                    >
                      {slot.label}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </ScrollView>

      <View style={styles.summaryCard}>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Consulta de la cita</Text>
          <Text style={styles.summaryValue}>$200 MXN</Text>
        </View>

        <View style={styles.divider} />

        <View style={styles.summaryRow}>
          <Text style={styles.totalLabel}>Total</Text>
          <Text style={styles.totalValue}>$200 MXN</Text>
        </View>

        <Pressable
          disabled={!selectedSlot || isSubmitting}
          onPress={handleConfirmarNuevoHorario}
          style={({ pressed }) => [
            styles.continueButton,
            (!selectedSlot || isSubmitting) && styles.buttonDisabled,
            pressed &&
              selectedSlot &&
              !isSubmitting && { transform: [{ scale: 0.97 }] },
          ]}
        >
          {isSubmitting ? (
            <ActivityIndicator color="#FFFFFF" size="small" />
          ) : (
            <Text style={styles.continueButtonText}>Reagendar</Text>
          )}
        </Pressable>

        <View style={styles.secureRow}>
          <SymbolView
            name={{ android: "lock", ios: "lock.fill" }}
            resizeMode="scaleAspectFit"
            size={14}
            tintColor="#9CA3AF"
          />
          <Text style={styles.secureText}>Pago seguro</Text>
        </View>
      </View>
      <View style={styles.bottomWhiteFill} />
    </View>
  );
}

const styles = StyleSheet.create({
  bottomWhiteFill: {
    backgroundColor: "#FFFFFF",
    height: 50,
  },
  buttonDisabled: {
    opacity: 0.5,
  },

  cardDisabled: {
    borderColor: "rgba(255,255,255,0.15)",
    opacity: 0.4,
  },
  carouselContent: {
    gap: 8,
    paddingHorizontal: 28,
  },
  centeredView: {
    justifyContent: "center",
    width: "100%",
  },
  centerLoader: {
    alignItems: "center",
    justifyContent: "center",
  },
  container: {
    backgroundColor: "#7355F7",
    flex: 1,
  },
  continueButton: {
    alignItems: "center",
    backgroundColor: "#7355F7",
    borderRadius: 50,
    marginTop: 16,
    paddingVertical: 16,
  },
  continueButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
  },
  divider: {
    backgroundColor: "#E5E7EB",
    height: 1,
    marginVertical: 8,
  },
  doctorAvatar: {
    backgroundColor: "#E5E7EB",
    borderRadius: 65,
    height: 130,
    marginBottom: 16,
    width: 130,
  },
  doctorName: {
    color: "#FFFFFF",
    fontSize: 22,
    fontWeight: "700",
    marginBottom: 4,
  },
  doctorSpecialty: {
    color: "#E0D9FF",
    fontSize: 14,
    fontWeight: "500",
  },
  loadingText: {
    color: "#FFFFFF",
    fontSize: 14,
    marginTop: 12,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: "center",
    paddingBottom: 20,
  },

  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    color: "#FFFFFF",
    fontSize: 20,
    fontWeight: "500",
    marginBottom: 16,
    paddingHorizontal: 24,
  },
  secureRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 4,
    justifyContent: "center",
    marginTop: 14,
  },
  secureText: {
    color: "#9CA3AF",
    fontSize: 12,
  },

  summaryCard: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingBottom: 24,
    paddingHorizontal: 24,
    paddingTop: 24,
  },
  summaryLabel: {
    color: "#00000050",
    fontSize: 15,
  },
  summaryRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  summaryValue: {
    color: "#00000050",
    fontSize: 15,
    fontWeight: "500",
  },

  timeCard: {
    backgroundColor: "transparent",
    borderColor: "rgba(255,255,255,0.4)",
    borderRadius: 12,
    borderWidth: 2,
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  timeCardSelected: {
    backgroundColor: "#FFFFFF",
    borderColor: "#FFFFFF",
  },
  timeText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "600",
  },
  timeTextDisabled: {
    color: "rgba(255, 255, 255, 0.4)",
    textDecorationLine: "line-through",
  },
  timeTextSelected: {
    color: "#7355F7",
  },

  topSection: {
    alignItems: "center",
    paddingBottom: 36,
    paddingTop: 10,
  },
  totalLabel: {
    color: "#7355F7",
    fontSize: 16,
    fontWeight: "500",
  },
  totalValue: {
    color: "#7355F7",
    fontSize: 16,
    fontWeight: "500",
  },
});
