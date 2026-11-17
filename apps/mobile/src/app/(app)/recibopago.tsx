import React from "react";
import {
  View,
  Text,
  StyleSheet,
  StatusBar,
  Pressable,
  ScrollView,
} from "react-native";
import { SymbolView } from "expo-symbols";
import { router } from "expo-router";

export default function PagoConfirmadoScreen() {
  const handleRegresar = () => {
    router.replace("/(app)/(tabs)/home");
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content"/>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >

        <Text style={styles.successMessage}>¡Pago realizado con éxito!</Text>

        <View style={styles.iconWrapper}>
          <View style={styles.iconCircle}>
            <SymbolView
              name={{ android: "check", ios: "checkmark" }}
              size={52}
              tintColor="#16A34A"
              resizeMode="scaleAspectFit"
            />
          </View>
        </View>

        <Text style={styles.sectionTitle}>Resumen de la compra</Text>

        <View style={styles.summaryCard}>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Subtotal (3 productos)</Text>
            <Text style={styles.summaryValue}>$30,730.00 MXN</Text>
          </View>

          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Envío estándar</Text>
            <Text style={styles.summaryValue}>Gratis</Text>
          </View>

          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Descuento</Text>
            <Text style={styles.summaryValue}>-$0.00MXN</Text>
          </View>

          <View style={styles.divider} />

          <View style={styles.summaryRow}>
            <Text style={styles.totalLabel}>Total</Text>
            <Text style={styles.totalValue}>$30,730.00 MXN</Text>
          </View>
        </View>
      </ScrollView>

      <View style={styles.bottomContainer}>
        <Pressable
          onPress={handleRegresar}
          style={({ pressed }) => [
            styles.primaryButton,
            { transform: [{ scale: pressed ? 0.97 : 1 }] },
          ]}
        >
          <Text style={styles.primaryButtonText}>Regresar al inicio</Text>
        </Pressable>

        <View style={styles.secureRow}>
          <SymbolView
            name={{ android: "lock", ios: "lock.fill" }}
            size={14}
            tintColor="#9CA3AF"
            resizeMode="scaleAspectFit"
          />
          <Text style={styles.secureText}>Pago seguro</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 20,
    alignItems: "center",
  },

  successMessage: {
    fontSize: 17,
    fontWeight: "600",
    color: "#16A34A",
    textAlign: "center",
    marginBottom: 20,
  },

  iconWrapper: {
    alignItems: "center",
    marginBottom: 32,
  },
  iconCircle: {
    width: 84,
    height: 84,
    borderRadius: 42,
    borderWidth: 2,
    borderColor: "#16A34A",
    alignItems: "center",
    justifyContent: "center",
  },

  sectionTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#111827",
    alignSelf: "flex-start",
    marginBottom: 14,
  },
  summaryCard: {
    width: "100%",
    backgroundColor: "#F5F5F7",
    borderRadius: 16,
    padding: 18,
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  summaryLabel: {
    fontSize: 13,
    color: "#6B7280",
  },
  summaryValue: {
    fontSize: 13,
    color: "#111827",
    fontWeight: "600",
  },
  divider: {
    height: 1,
    backgroundColor: "#E5E7EB",
    marginVertical: 6,
  },
  totalLabel: {
    fontSize: 14,
    fontWeight: "700",
    color: "#7355F7",
  },
  totalValue: {
    fontSize: 14,
    fontWeight: "700",
    color: "#7355F7",
  },

  bottomContainer: {
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 24,
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
  secureRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 12,
    gap: 4,
  },
  secureText: {
    fontSize: 12,
    color: "#9CA3AF",
  },
});