import { router } from "expo-router";
import { SymbolView } from "expo-symbols";
import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";

export default function AddCardScreen() {
  const [cardNumber, setCardNumber] = useState("");
  const [expiry, setExpiry] = useState("");
  const [cvv, setCvv] = useState("");

  const handleAddCard = () => {
    console.log("Añadir tarjeta presionado");
    console.log("Número:", cardNumber);
    console.log("Vencimiento:", expiry);
    console.log("CVV:", cvv ? "***" : "vacío");
    router.back();
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Añadir tarjeta</Text>

      <View style={styles.inputWrapper}>
        <SymbolView
          name={{ android: "credit_card", ios: "creditcard" }}
          resizeMode="scaleAspectFit"
          size={18}
          tintColor="#6B7280"
        />
        <TextInput
          keyboardType="number-pad"
          onChangeText={setCardNumber}
          placeholder="Número de tarjeta"
          placeholderTextColor="#9CA3AF"
          style={styles.inputIcon}
          value={cardNumber}
        />
      </View>

      <View style={styles.row}>
        <TextInput
          keyboardType="number-pad"
          onChangeText={setExpiry}
          placeholder="Fecha de vencimiento"
          placeholderTextColor="#9CA3AF"
          style={[styles.input, styles.inputHalf]}
          value={expiry}
        />
        <TextInput
          keyboardType="number-pad"
          onChangeText={setCvv}
          placeholder="CVV"
          placeholderTextColor="#9CA3AF"
          secureTextEntry
          style={[styles.input, styles.inputHalf]}
          value={cvv}
        />
      </View>

      <Text style={styles.disclaimer}>
        Para verificar esta tarjeta es posible que el banco retenga
        temporalmente una pequeña cantidad en la cuenta
      </Text>

      <Pressable
        onPress={handleAddCard}
        style={({ pressed }) => [
          styles.submitButton,
          { transform: [{ scale: pressed ? 0.97 : 1 }] },
        ]}
      >
        <Text style={styles.submitButtonText}>Añadir tarjeta</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: "#FFFFFF",
    flex: 1,
    paddingBottom: 40,
    paddingHorizontal: 24,
    paddingTop: 28,
  },
  disclaimer: {
    color: "#9CA3AF",
    fontSize: 10,
    lineHeight: 18,
    marginBottom: 24,
  },
  input: {
    borderColor: "#E5E7EB",
    borderRadius: 50,
    borderWidth: 1,
    color: "#1F2937",
    fontSize: 12,
    paddingHorizontal: 18,
    paddingVertical: 14,
  },
  inputHalf: {
    flex: 1,
  },
  inputIcon: {
    color: "#1F2937",
    flex: 1,
    fontSize: 12,
    paddingVertical: 14,
  },
  inputWrapper: {
    alignItems: "center",
    borderColor: "#E5E7EB",
    borderRadius: 50,
    borderWidth: 1,
    flexDirection: "row",
    gap: 10,
    marginBottom: 14,
    paddingHorizontal: 16,
    paddingVertical: 4,
  },
  row: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 16,
  },
  submitButton: {
    alignItems: "center",
    backgroundColor: "#7355F7",
    borderRadius: 50,
    paddingVertical: 16,
  },
  submitButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
  },
  title: {
    color: "#000000",
    fontSize: 20,
    fontWeight: "500",
    marginBottom: 24,
  },
});
