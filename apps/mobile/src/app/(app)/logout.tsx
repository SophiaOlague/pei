import React from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
} from "react-native";
import { router } from "expo-router";
import { authClient } from "@/lib/auth-client";

export default function LogoutScreen() {
  const handleLogout = async () => {
    await authClient.signOut({
      fetchOptions: {
        onSuccess: () => {
          router.replace("/login");
        },
      },
    });
  };

  const handleCancel = () => {
    router.back();
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Cerrar sesión</Text>
      <Text style={styles.description}>
        ¿Deseas cerrar tu inicio de sesión?
      </Text>

      <Pressable
        onPress={handleLogout}
        style={({ pressed }) => [
          styles.primaryButton,
          { transform: [{ scale: pressed ? 0.97 : 1 }] },
        ]}
      >
        <Text style={styles.primaryButtonText}>Cerrar sesión</Text>
      </Pressable>

      <Pressable
        onPress={handleCancel}
        style={({ pressed }) => [
          styles.secondaryButton,
          { transform: [{ scale: pressed ? 0.97 : 1 }] },
        ]}
      >
        <Text style={styles.secondaryButtonText}>Cancelar</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 22, 
    paddingBottom: 20,  
  },
  title: {
    fontSize: 20,
    fontWeight: "500",
    color: "#000000",
    marginBottom: 24,
  },
  description: {
    fontSize: 14,
    color: "#374151",
    lineHeight: 20,
    marginBottom: 24,
  },
  primaryButton: {
    backgroundColor: "#7355F7",
    paddingVertical: 16,
    borderRadius: 50,
    alignItems: "center",
    marginBottom: 12,
  },
  primaryButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
  },
  secondaryButton: {
    backgroundColor: "#FFFFFF",
    paddingVertical: 16,
    borderRadius: 50,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  secondaryButtonText: {
    color: "#374151",
    fontSize: 16,
    fontWeight: "600",
  },
});