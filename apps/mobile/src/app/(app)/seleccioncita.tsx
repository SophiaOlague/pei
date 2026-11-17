import { router } from "expo-router";
import { SymbolView } from "expo-symbols";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { ApiError, type BookableDoctor, getBookableDoctors } from "@/lib/api";

// Catálogo real (M08 CC-6): GET /doctors/bookable devuelve solo médicos que pueden operar y con horarios libres. Se
// navega a seleccionfecha con el doctorProfileId real; nunca con identificadores ficticios.

function DoctorItem({
  doctor,
  onSelect,
}: {
  doctor: BookableDoctor;
  onSelect: (doctor: BookableDoctor) => void;
}) {
  const press = useCallback(() => onSelect(doctor), [doctor, onSelect]);
  return (
    <TouchableOpacity
      accessibilityLabel={`Médico ${doctor.displayName}`}
      activeOpacity={0.7}
      onPress={press}
      style={styles.doctorItem}
    >
      <View style={styles.avatar} />
      <View style={styles.doctorInfo}>
        <Text style={styles.doctorName}>{doctor.displayName}</Text>
        <View style={styles.specialtyRow}>
          <Text style={styles.specialty}>{doctor.specialty.name}</Text>
        </View>
      </View>
      <SymbolView
        name={{ android: "chevron_right", ios: "chevron.right" }}
        resizeMode="scaleAspectFit"
        size={20}
        tintColor="#9CA3AF"
      />
    </TouchableOpacity>
  );
}

export default function DoctorSelectionScreen() {
  const [doctors, setDoctors] = useState<BookableDoctor[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getBookableDoctors()
      .then(setDoctors)
      .catch((e: unknown) =>
        setError(
          e instanceof ApiError
            ? e.message
            : "No se pudieron cargar los médicos."
        )
      );
  }, []);

  const handleSelectDoctor = useCallback((doctor: BookableDoctor) => {
    router.push({
      params: {
        doctorAvatar: "",
        doctorName: doctor.displayName,
        doctorProfileId: doctor.doctorProfileId,
        doctorSpecialty: doctor.specialty.name,
      },
      pathname: "/seleccionfecha",
    });
  }, []);

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {error ? <Text accessibilityRole="alert">{error}</Text> : null}
        {doctors === null && !error ? <ActivityIndicator /> : null}
        {doctors?.length === 0 ? (
          <Text>No hay médicos con horarios disponibles por ahora.</Text>
        ) : null}
        {doctors?.map((doctor) => (
          <DoctorItem
            doctor={doctor}
            key={doctor.doctorProfileId}
            onSelect={handleSelectDoctor}
          />
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  avatar: {
    backgroundColor: "#F3F4F6",
    borderRadius: 24,
    height: 48,
    width: 48,
  },
  container: {
    backgroundColor: "#FFFFFF",
    flex: 1,
  },
  doctorInfo: {
    flex: 1,
  },
  doctorItem: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
    paddingVertical: 12,
  },
  doctorName: {
    color: "#111827",
    fontSize: 15,
    fontWeight: "700",
    marginBottom: 2,
  },
  rating: {
    color: "#6B7280",
    fontSize: 13,
    fontWeight: "500",
  },
  scrollContent: {
    paddingBottom: 40,
    paddingHorizontal: 24,
    paddingTop: 24,
  },
  specialty: {
    color: "#6B7280",
    fontSize: 13,
    marginRight: 4,
  },
  specialtyRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 4,
  },
  star: {
    color: "#E2C920",
    fontSize: 13,
  },
});
