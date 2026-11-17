import React from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  StatusBar,
  Pressable,
  Image,
} from "react-native";
import { SymbolView } from "expo-symbols";
import { router } from "expo-router";

export default function RecetaGeneradaScreen() {
  const handleDownload = () => {
    console.log("Descargar receta");
  };

  const handleComprar = () => {
    router.push("/(app)/cartscreen");
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content"/>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Receta Médica</Text>
          <Text style={styles.folio}>Folio: 1556987456</Text>

          <Text style={styles.dateEmision}>Fecha de emisión: 28/07/2026</Text>

          <View style={styles.divider} />

          <View style={styles.row}>
            <View style={styles.col}>
              <Text style={styles.label}>Paciente:</Text>
              <Text style={styles.value}>María Gómez</Text>
            </View>
            <View style={styles.col}>
              <Text style={styles.label}>Género:</Text>
              <Text style={styles.value}>Femenino</Text>
            </View>
          </View>

          <View style={styles.infoBlock}>
            <Text style={styles.label}>ID:</Text>
            <Text style={styles.value}>12658967</Text>
          </View>

          <View style={styles.row}>
            <View style={styles.col}>
              <Text style={styles.label}>Edad:</Text>
              <Text style={styles.value}>28 años</Text>
            </View>
            <View style={styles.col}>
              <Text style={styles.labelBold}>Próxima entrega</Text>
            </View>
          </View>

          <View style={styles.divider} />

          <View style={styles.infoBlock}>
            <Text style={styles.label}>Médico tratante:</Text>
            <Text style={styles.value}>Dr. David Wismichu Díaz</Text>
          </View>

          <View style={styles.infoBlock}>
            <Text style={styles.label}>Especialidad:</Text>
            <Text style={styles.value}>Infectología</Text>
          </View>

          <View style={styles.infoBlock}>
            <Text style={styles.label}>Cédula profesional:</Text>
            <Text style={styles.value}>6548975645</Text>
          </View>

          <View style={styles.actionsRow}>
            <Pressable
              onPress={handleDownload}
              style={({ pressed }) => [
                styles.downloadButton,
                { opacity: pressed ? 0.7 : 1 },
              ]}
            >
              <SymbolView
                name={{ android: "download", ios: "arrow.down.to.line" }}
                size={22}
                tintColor="#6B7280"
                resizeMode="scaleAspectFit"
              />
            </Pressable>

            <Pressable
              onPress={handleComprar}
              style={({ pressed }) => [
                styles.comprarButton,
                { transform: [{ scale: pressed ? 0.97 : 1 }] },
              ]}
            >
              <Text style={styles.comprarButtonText}>Comprar</Text>
            </Pressable>
          </View>

          <Text style={styles.sectionTitle}>Prescripción</Text>

          <View style={styles.tableHeader}>
            <Text style={styles.tableHeaderText}>Medicamento</Text>
            <Text style={styles.tableHeaderText}>Presentación</Text>
          </View>

          <View style={styles.medicamentoRow}>
            <View style={styles.medicamentoLeft}>
              <Text style={styles.medicamentoName}>Truvada</Text>
              <Text style={styles.medicamentoDesc}>
                Emtricitabina / Fumarato de tenofovir disoproxilo
              </Text>
            </View>
            <Text style={styles.medicamentoPresentacion}>Tableta 200mg</Text>
          </View>

          <Text style={styles.instruccionesTitle}>
            Instrucciones para el paciente
          </Text>

          <Text style={styles.instruccionesText}>
            Todo medicamento debe ser tu receta, tomar en ayuno o en un horario
            en el que recuerdes y puedas tomarlo al día siguiente
          </Text>

          <View style={styles.firmaContainer}>
            <View style={styles.firmaLinea} />
            <Text style={styles.firmaName}>Dr. Diego Torres</Text>
            <Text style={styles.firmaCedula}>Cédula Profesional:</Text>
            <Text style={styles.firmaCedula}>6548975645</Text>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 40,
  },
  headerTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#111827",
    textAlign: "center",
    marginBottom: 16,
    marginTop: 8,
  },

  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#F3F4F6",
    padding: 20,
  },

  cardTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#111827",
    textAlign: "center",
    marginBottom: 4,
  },
  folio: {
    fontSize: 12,
    color: "#9CA3AF",
    textAlign: "center",
    marginBottom: 16,
  },
  dateEmision: {
    fontSize: 13,
    color: "#374151",
    fontWeight: "500",
    textAlign: "center",
    marginBottom: 4,
  },

  divider: {
    height: 1,
    backgroundColor: "#F3F4F6",
    marginVertical: 16,
  },

  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  col: {
    flex: 1,
  },

  infoBlock: {
    marginBottom: 14,
  },
  label: {
    fontSize: 12,
    color: "#9CA3AF",
    marginBottom: 2,
  },
  labelBold: {
    fontSize: 12,
    color: "#9CA3AF",
    marginBottom: 2,
    fontWeight: "600",
  },
  value: {
    fontSize: 14,
    color: "#111827",
    fontWeight: "600",
  },

  actionsRow: {
    flexDirection: "row",
    gap: 12,
    marginTop: 8,
    marginBottom: 20,
  },
  downloadButton: {
    width: 50,
    height: 50,
    borderRadius: 25,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    backgroundColor: "#FFFFFF",
    justifyContent: "center",
    alignItems: "center",
  },
  comprarButton: {
    flex: 1,
    backgroundColor: "#7355F7",
    borderRadius: 25,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 14,
  },
  comprarButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
  },

  sectionTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: "#111827",
    marginBottom: 12,
  },
  tableHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
    marginBottom: 12,
  },
  tableHeaderText: {
    fontSize: 12,
    color: "#9CA3AF",
    fontWeight: "500",
  },
  medicamentoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 24,
  },
  medicamentoLeft: {
    flex: 1,
    paddingRight: 12,
  },
  medicamentoName: {
    fontSize: 14,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 4,
  },
  medicamentoDesc: {
    fontSize: 12,
    color: "#6B7280",
    lineHeight: 16,
  },
  medicamentoPresentacion: {
    fontSize: 12,
    color: "#6B7280",
    textAlign: "right",
  },

  instruccionesTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: "#111827",
    marginBottom: 10,
  },
  instruccionesText: {
    fontSize: 13,
    color: "#00000080",
    lineHeight: 20,
    marginBottom: 32,
  },

  // Firma
  firmaContainer: {
    alignItems: "center",
    marginTop: 12,
  },
  firmaLinea: {
    width: 120,
    height: 1,
    backgroundColor: "#111827",
    marginBottom: 8,
  },
  firmaName: {
    fontSize: 12,
    color: "#111827",
    fontWeight: "600",
    marginBottom: 2,
  },
  firmaCedula: {
    fontSize: 11,
    color: "#9CA3AF",
  },
});