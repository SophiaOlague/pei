import { router } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { authClient } from "@/lib/auth-client";

const REASONS = [
  { id: "1", label: "Motivo 1..." },
  { id: "2", label: "Motivo 2..." },
  { id: "3", label: "Motivo 3..." },
];

export default function DeleteAccountScreen() {
  const [selectedReason, setSelectedReason] = useState<string>("");
  const [otherReason, setOtherReason] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleDelete = async () => {
    try {
      setIsLoading(true);

      console.log("Motivo:", selectedReason);
      console.log("Otro motivo:", otherReason);

      const { data } = await authClient.deleteUser();

      if (data?.success) {
        await authClient.signOut();
        router.replace("/login");
      }
    } catch (error) {
      console.error("Error al eliminar la cuenta:", error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.title}>Eliminar cuenta</Text>
        <Text style={styles.description}>
          La eliminación de cuenta es definitiva. Si eliminas tu cuenta de PEI
          tu perfil, tu historial y tus datos se eliminarán de forma definitiva.
        </Text>

        <Text style={styles.sectionTitle}>Motivo para eliminar tu cuenta</Text>

        {REASONS.map((reason) => {
          const isSelected = selectedReason === reason.id;
          return (
            <Pressable
              disabled={isLoading}
              key={reason.id}
              onPress={() => setSelectedReason(reason.id)}
              style={({ pressed }) => [
                styles.reasonRow,
                isSelected && styles.reasonRowSelected,
                { transform: [{ scale: pressed ? 0.98 : 1 }] },
              ]}
            >
              <Text
                style={[
                  styles.reasonText,
                  isSelected && styles.reasonTextSelected,
                ]}
              >
                {reason.label}
              </Text>
              <View style={[styles.radio, isSelected && styles.radioActive]}>
                {isSelected && <View style={styles.radioDot} />}
              </View>
            </Pressable>
          );
        })}

        <TextInput
          editable={!isLoading}
          onChangeText={setOtherReason}
          placeholder="Otro motivo..."
          placeholderTextColor="#9CA3AF"
          style={styles.otherInput}
          value={otherReason}
        />

        <Pressable
          disabled={isLoading}
          onPress={handleDelete}
          style={({ pressed }) => [
            styles.deleteButton,
            isLoading && styles.deleteButtonDisabled,
            { transform: [{ scale: pressed ? 0.97 : 1 }] },
          ]}
        >
          {isLoading ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.deleteButtonText}>Eliminar cuenta</Text>
          )}
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },

  deleteButton: {
    alignItems: "center",
    backgroundColor: "#7355F7",
    borderRadius: 50,
    paddingVertical: 16,
  },
  deleteButtonDisabled: {
    opacity: 0.7,
  },
  deleteButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
  },
  description: {
    color: "#000000",
    fontSize: 15,
    lineHeight: 20,
    marginBottom: 28,
  },

  otherInput: {
    borderColor: "#E5E7EB",
    borderRadius: 50,
    borderWidth: 1,
    color: "#1F2937",
    fontSize: 14,
    marginBottom: 24,
    marginTop: 8,
    paddingHorizontal: 18,
    paddingVertical: 14,
  },
  radio: {
    alignItems: "center",
    borderColor: "#D1D5DB",
    borderRadius: 10,
    borderWidth: 2,
    height: 20,
    justifyContent: "center",
    width: 20,
  },
  radioActive: {
    borderColor: "#7355F7",
  },
  radioDot: {
    backgroundColor: "#7355F7",
    borderRadius: 5,
    height: 10,
    width: 10,
  },

  reasonRow: {
    alignItems: "center",
    backgroundColor: "#F8F8F8",
    borderRadius: 12,
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  reasonRowSelected: {
    backgroundColor: "#F5F3FF",
  },
  reasonText: {
    color: "#6B7280",
    flex: 1,
    fontSize: 14,
  },
  reasonTextSelected: {
    color: "#111827",
    fontWeight: "500",
  },
  scrollContent: {
    paddingBottom: 40,
    paddingHorizontal: 24,
    paddingTop: 28,
  },
  sectionTitle: {
    color: "#000000",
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 16,
  },
  title: {
    color: "#111827",
    fontSize: 20,
    fontWeight: "700",
    marginBottom: 12,
  },
});
