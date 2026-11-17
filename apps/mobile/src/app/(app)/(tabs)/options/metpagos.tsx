import { SymbolView } from "expo-symbols";
import { ScrollView, StyleSheet, Text, View } from "react-native";

export default function PaymentScreen() {
  return (
    <ScrollView
      contentContainerStyle={styles.scrollContent}
      contentInsetAdjustmentBehavior="automatic"
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.emptyState}>
        <SymbolView
          name={{ android: "credit_card", ios: "creditcard" }}
          resizeMode="scaleAspectFit"
          size={48}
          tintColor="#D1D5DB"
        />
        <Text style={styles.emptyText}>No tienes métodos de pago</Text>
        <Text style={styles.emptySubtext}>
          Toca el botón + para agregar una tarjeta
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },

  emptyState: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
    paddingTop: 120,
  },
  emptySubtext: {
    color: "#9CA3AF",
    fontSize: 13,
    marginTop: 4,
    textAlign: "center",
  },
  emptyText: {
    color: "#6B7280",
    fontSize: 16,
    fontWeight: "600",
    marginTop: 16,
  },

  header: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    paddingBottom: 20,
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  headerButton: {
    alignItems: "center",
    height: 40,
    justifyContent: "center",
    width: 40,
  },
  headerTitle: {
    color: "#111827",
    fontSize: 18,
    fontWeight: "700",
  },

  scrollContent: {
    flexGrow: 1,
    paddingBottom: 40,
    paddingHorizontal: 20,
    paddingTop: 10,
  },
});
