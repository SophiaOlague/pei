import { router } from "expo-router";
import { SymbolView } from "expo-symbols";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { HistorialLabItem, ServiceLaboratorio } from "../lab-demo";

export default function HistorialLabScreen() {
  const [listaPruebas, setListaPruebas] = useState<HistorialLabItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function cargarHistorial() {
      try {
        setLoading(true);
        const lotesReales = await ServiceLaboratorio.obtenerHistorialResumido();

        const listaExtendida: HistorialLabItem[] = [
          ...lotesReales,
          { ...lotesReales[0], id: "lote-pdf-001-rep1" },
          { ...lotesReales[1 % lotesReales.length], id: "lote-pdf-002-rep1" },
          { ...lotesReales[2 % lotesReales.length], id: "lote-pdf-003-rep1" },
          { ...lotesReales[0], id: "lote-pdf-001-rep2" },
          { ...lotesReales[1 % lotesReales.length], id: "lote-pdf-002-rep2" },
        ];

        setListaPruebas(listaExtendida);
      } finally {
        setLoading(false);
      }
    }

    cargarHistorial();
  }, []);

  const handleAddPress = () => {
    router.push("/resultadoslab");
  };

  const handlePruebaPress = (prueba: HistorialLabItem) => {
    const loteIdReal = prueba.id.split("-rep")[0];

    router.push({
      pathname: "/displayresults",
      params: { loteId: loteIdReal },
    });
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#7355F7" size="large" />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />

      <View style={styles.header}>
        <Text style={styles.headerTitle}>HISTORIAL DEL LABORATORIO</Text>
        <Pressable
          onPress={handleAddPress}
          style={({ pressed }) => [
            styles.addButton,
            { opacity: pressed ? 0.6 : 1 },
          ]}
        >
          <SymbolView
            name={{ android: "add", ios: "plus" }}
            resizeMode="scaleAspectFit"
            size={26}
            tintColor="#111827"
          />
        </Pressable>
      </View>

      <FlatList
        ListFooterComponent={
          <Text style={styles.footerText}>
            Consulta tu historial completo de las pruebas de laboratorio.
          </Text>
        }
        contentContainerStyle={styles.listContent}
        data={listaPruebas}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => handlePruebaPress(item)}
            style={({ pressed }) => [
              styles.itemCard,
              { opacity: pressed ? 0.7 : 1 },
            ]}
          >
            <Text
              ellipsizeMode="tail"
              numberOfLines={1}
              style={styles.itemName}
            >
              {item.nombrePrueba}
            </Text>

            <View style={styles.itemRight}>
              <Text style={styles.itemDate}>{item.fecha}</Text>
              <SymbolView
                name={{ android: "chevron_right", ios: "chevron.right" }}
                resizeMode="scaleAspectFit"
                size={18}
                tintColor="#C7C7CC"
              />
            </View>
          </Pressable>
        )}
        showsVerticalScrollIndicator={false}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  addButton: {
    alignItems: "center",
    height: 32,
    justifyContent: "center",
    width: 32,
  },
  center: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
  },
  container: {
    backgroundColor: "#FFFFFF",
    flex: 1,
  },
  footerText: {
    color: "#9CA3AF",
    fontSize: 12,
    lineHeight: 18,
    marginTop: 24,
    paddingHorizontal: 16,
    textAlign: "center",
  },
  header: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
    justifyContent: "center",
    paddingBottom: 24,
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  headerTitle: {
    color: "#111827",
    fontSize: 20,
    fontWeight: "700",
    textAlign: "center",
  },
  itemCard: {
    alignItems: "center",
    backgroundColor: "#F7F7F9",
    borderRadius: 14,
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 12,
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  itemDate: {
    color: "#9CA3AF",
    fontSize: 13,
    fontWeight: "500",
  },
  itemName: {
    color: "#374151",
    flex: 1,
    fontSize: 15,
    fontWeight: "600",
    marginRight: 12,
  },
  itemRight: {
    alignItems: "center",
    flexDirection: "row",
    flexShrink: 0,
    gap: 8,
  },
  listContent: {
    paddingBottom: 60,
    paddingHorizontal: 16,
  },
});