import { router, useLocalSearchParams } from "expo-router";
import { SymbolView } from "expo-symbols";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import {
  ApiError,
  type DoctorSlot,
  getDoctorSlots,
  holdAppointment,
  type IdentityRequirement,
  identityRequirementOf,
} from "@/lib/api";

// Reserva real (M08): los horarios salen de GET /doctors/:id/slots (M07) y la cita se crea con
// POST /me/patient/appointments (pending_payment con retención de 5 minutos). Solo con la cita creada se navega a
// /pago, con su appointmentId. El backend valida disponibilidad (RB-1), retención única (RB-3) y elegibilidad.
//
// Reintentos sin duplicar: mientras la petición está en curso el botón no responde; si la red falla, el reintento es
// la MISMA petición (mismo médico y horario) y el backend devuelve la misma retención (RB-2); una cita ya creada para
// ese horario se reutiliza sin volver a pedirla.

const MONTHS_ES = [
  "Ene",
  "Feb",
  "Mar",
  "Abr",
  "May",
  "Jun",
  "Jul",
  "Ago",
  "Sep",
  "Oct",
  "Nov",
  "Dic",
];
const SLOT_DAYS = 14;

// RegistrationIncompleteError por identidad (details.missing): se ofrece ir a la verificación. La reserva solo se
// habilita cuando el backend la acepta; esta pantalla no supone ningún estado de la identidad.
const IDENTITY_MESSAGE: Record<IdentityRequirement, string> = {
  identity_resubmission:
    "Tu verificación de identidad fue rechazada. Envía de nuevo tu INE para poder reservar.",
  identity_review:
    "Tu INE está en revisión. Podrás reservar cuando tu identidad sea aprobada.",
  identity_submission:
    "Para reservar necesitas verificar tu identidad con tu INE.",
};
const IDENTITY_ACTION: Record<IdentityRequirement, string> = {
  identity_resubmission: "Reenviar mi INE",
  identity_review: "Ver estado de mi verificación",
  identity_submission: "Verificar mi identidad",
};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const localDate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export function slotRange(today: Date = new Date()): {
  from: string;
  to: string;
} {
  const to = new Date(today);
  to.setDate(today.getDate() + SLOT_DAYS - 1);
  return { from: localDate(today), to: localDate(to) };
}

export default function ResumenCitaScreen() {
  const { doctorProfileId, doctorName, doctorSpecialty, doctorAvatar } =
    useLocalSearchParams<{
      doctorProfileId?: string;
      doctorName?: string;
      doctorSpecialty?: string;
      doctorAvatar?: string;
    }>();
  const validDoctor =
    typeof doctorProfileId === "string" && UUID.test(doctorProfileId);

  const [slots, setSlots] = useState<DoctorSlot[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [holding, setHolding] = useState(false);
  const [holdError, setHoldError] = useState<string | null>(null);
  const [identityStep, setIdentityStep] = useState<IdentityRequirement | null>(
    null
  );
  // Cita ya creada por horario (startsAt → appointmentId): un segundo toque no vuelve a reservar.
  const created = useRef(new Map<string, string>());
  const inFlight = useRef(false);

  useEffect(() => {
    if (!validDoctor) {
      return;
    }
    const { from, to } = slotRange();
    getDoctorSlots(doctorProfileId, from, to)
      .then((view) => {
        setSlots(view.slots);
        setSelectedDate(view.slots[0]?.date ?? null);
      })
      .catch((e: unknown) =>
        setLoadError(
          e instanceof ApiError
            ? e.message
            : "No se pudieron cargar los horarios."
        )
      );
  }, [doctorProfileId, validDoctor]);

  const selectDate = useCallback((date: string) => {
    setSelectedDate(date);
    setSelectedSlot(null);
  }, []);

  const dates = useMemo(
    () => [...new Set((slots ?? []).map((s) => s.date))],
    [slots]
  );
  const daySlots = useMemo(
    () => (slots ?? []).filter((s) => s.date === selectedDate),
    [slots, selectedDate]
  );

  const handleContinue = useCallback(async () => {
    if (!(validDoctor && selectedSlot) || inFlight.current) {
      return;
    }
    if (!reason.trim()) {
      setHoldError("Escribe el motivo de la consulta.");
      return;
    }
    const existing = created.current.get(selectedSlot);
    if (existing) {
      router.push({ params: { appointmentId: existing }, pathname: "/pago" });
      return;
    }
    inFlight.current = true;
    setHolding(true);
    setHoldError(null);
    setIdentityStep(null);
    try {
      const appointment = await holdAppointment({
        doctorProfileId,
        reason: reason.trim(),
        startsAt: selectedSlot,
      });
      if (!appointment.id || appointment.status !== "pending_payment") {
        setHoldError("No se pudo reservar el horario. Inténtalo de nuevo.");
        return;
      }
      created.current.set(selectedSlot, appointment.id);
      router.push({
        params: { appointmentId: appointment.id },
        pathname: "/pago",
      });
    } catch (e) {
      // Sin cita no hay pago. Un reintento repite la misma petición (RB-2 devuelve la misma retención).
      const requirement = identityRequirementOf(e);
      if (requirement) {
        setIdentityStep(requirement);
        setHoldError(IDENTITY_MESSAGE[requirement]);
        return;
      }
      setHoldError(
        e instanceof ApiError
          ? e.message
          : "No se pudo reservar el horario. Inténtalo de nuevo."
      );
    } finally {
      inFlight.current = false;
      setHolding(false);
    }
  }, [doctorProfileId, reason, selectedSlot, validDoctor]);

  const goToIdentity = useCallback(() => {
    router.push({
      params: { origen: "reserva" },
      pathname: "/verificacionidentidad",
    });
  }, []);

  const header = (
    <View style={styles.topSection}>
      {doctorAvatar ? (
        <Image
          source={{ uri: String(doctorAvatar) }}
          style={styles.doctorAvatar}
        />
      ) : null}
      <Text style={styles.doctorName}>{doctorName}</Text>
      <Text style={styles.doctorSpecialty}>{doctorSpecialty}</Text>
    </View>
  );

  if (!validDoctor) {
    return (
      <View style={styles.container}>
        {header}
        <Text accessibilityRole="alert" style={styles.errorText}>
          Selecciona un médico disponible para reservar.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {header}

        {loadError ? (
          <Text accessibilityRole="alert" style={styles.errorText}>
            {loadError}
          </Text>
        ) : null}
        {slots === null && !loadError ? <ActivityIndicator /> : null}
        {slots?.length === 0 ? (
          <Text style={styles.errorText}>
            Este médico no tiene horarios disponibles en los próximos días.
          </Text>
        ) : null}

        {dates.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Fechas disponibles</Text>
            <ScrollView
              contentContainerStyle={styles.carouselContent}
              horizontal
              showsHorizontalScrollIndicator={false}
            >
              {dates.map((date) => (
                <DateChip
                  date={date}
                  key={date}
                  onSelect={selectDate}
                  selected={selectedDate === date}
                />
              ))}
            </ScrollView>
          </View>
        ) : null}

        {daySlots.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Horarios disponibles</Text>
            <ScrollView
              contentContainerStyle={styles.carouselContent}
              horizontal
              showsHorizontalScrollIndicator={false}
            >
              {daySlots.map((slot) => (
                <TimeChip
                  key={slot.startsAt}
                  onSelect={setSelectedSlot}
                  selected={selectedSlot === slot.startsAt}
                  slot={slot}
                />
              ))}
            </ScrollView>
          </View>
        ) : null}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Motivo de la consulta</Text>
          <TextInput
            accessibilityLabel="Motivo de la consulta"
            maxLength={500}
            multiline
            onChangeText={setReason}
            placeholder="Describe brevemente el motivo"
            style={styles.reasonInput}
            value={reason}
          />
        </View>
      </ScrollView>

      <View style={styles.summaryCard}>
        <Text style={styles.summaryLabel}>
          El importe se confirma con la reserva y se cobra en el siguiente paso.
        </Text>
        {holdError ? (
          <Text accessibilityRole="alert" style={styles.errorText}>
            {holdError}
          </Text>
        ) : null}
        {identityStep ? (
          <Pressable
            accessibilityRole="button"
            onPress={goToIdentity}
            style={styles.identityButton}
          >
            <Text style={styles.identityButtonText}>
              {IDENTITY_ACTION[identityStep]}
            </Text>
          </Pressable>
        ) : null}
        <Pressable
          accessibilityRole="button"
          disabled={!selectedSlot || holding}
          onPress={handleContinue}
          style={[
            styles.continueButton,
            (!selectedSlot || holding) && styles.continueDisabled,
          ]}
        >
          {holding ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.continueButtonText}>
              Reservar y continuar al pago
            </Text>
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
    </View>
  );
}

function DateChip({
  date,
  selected,
  onSelect,
}: {
  date: string;
  selected: boolean;
  onSelect: (date: string) => void;
}) {
  const [, month, day] = date.split("-");
  const press = useCallback(() => onSelect(date), [date, onSelect]);
  return (
    <Pressable
      accessibilityLabel={`Fecha ${date}`}
      onPress={press}
      style={[styles.dateCard, selected && styles.dateCardSelected]}
    >
      <Text style={[styles.dateDay, selected && styles.dateTextSelected]}>
        {Number(day)}
      </Text>
      <Text style={[styles.dateMonth, selected && styles.dateTextSelected]}>
        {MONTHS_ES[Number(month) - 1]}
      </Text>
    </Pressable>
  );
}

function TimeChip({
  slot,
  selected,
  onSelect,
}: {
  slot: DoctorSlot;
  selected: boolean;
  onSelect: (startsAt: string) => void;
}) {
  const press = useCallback(
    () => onSelect(slot.startsAt),
    [slot.startsAt, onSelect]
  );
  return (
    <Pressable
      accessibilityLabel={`Horario ${slot.start}`}
      onPress={press}
      style={[styles.timeCard, selected && styles.timeCardSelected]}
    >
      <Text style={[styles.timeText, selected && styles.timeTextSelected]}>
        {slot.start}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  carouselContent: {
    gap: 8,
    paddingHorizontal: 28,
  },
  container: {
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
  continueDisabled: { opacity: 0.5 },

  dateCard: {
    alignItems: "center",
    backgroundColor: "transparent",
    borderColor: "#fffffb60",
    borderRadius: 10,
    borderWidth: 2,
    height: 64,
    justifyContent: "center",
    width: 56,
  },
  dateCardSelected: {
    backgroundColor: "#FFFFFF",
    borderColor: "#FFFFFF",
  },
  dateDay: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "700",
  },
  dateMonth: {
    color: "#E0D9FF",
    fontSize: 12,
    fontWeight: "500",
    marginTop: 2,
  },
  dateTextSelected: {
    color: "#7355F7",
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
    fontWeight: "400",
    marginBottom: 4,
  },
  doctorSpecialty: {
    color: "#ffffff70",
    fontSize: 14,
    fontWeight: "500",
  },
  errorText: { color: "#B91C1C", marginHorizontal: 20, marginVertical: 8 },
  identityButton: {
    alignItems: "center",
    alignSelf: "center",
    marginBottom: 8,
    paddingVertical: 6,
  },
  identityButtonText: {
    color: "#7355F7",
    fontSize: 15,
    fontWeight: "600",
  },
  monthLabel: {
    color: "#E0D9FF",
    fontSize: 13,
    marginBottom: 12,
    paddingHorizontal: 24,
    textTransform: "capitalize",
  },
  reasonInput: {
    backgroundColor: "#FFFFFF",
    borderColor: "#E5E7EB",
    borderRadius: 10,
    borderWidth: 1,
    marginHorizontal: 20,
    minHeight: 70,
    padding: 12,
  },
  scrollContent: {
    paddingBottom: 10,
  },

  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    color: "#FFFFFF",
    fontSize: 19,
    fontWeight: "500",
    marginBottom: 12,
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
    paddingBottom: 30,
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
    borderColor: "#ffffff60",
    borderRadius: 10,
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
  timeTextSelected: {
    color: "#7355F7",
  },

  topSection: {
    alignItems: "center",
    paddingBottom: 30,
    paddingTop: 20,
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
