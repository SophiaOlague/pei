import React from "react";
import {
  View,
  Text,
  StyleSheet,
  StatusBar,
  Pressable,
  FlatList,
} from "react-native";
import { SymbolView } from "expo-symbols";
import { router } from "expo-router";

// 👇 Tipo de dato para una receta
type Receta = {
  id: string;
  nombre: string;
  fecha: string;
};

const RECETAS: Receta[] = [
  { id: "1", nombre: "Truvada", fecha: "15 de mayo del 2026" },
  { id: "2", nombre: "Truvada", fecha: "15 de mayo del 2026" },
  { id: "3", nombre: "Truvada", fecha: "15 de mayo del 2026" },
  { id: "4", nombre: "Truvada", fecha: "15 de mayo del 2026" },
  { id: "5", nombre: "Truvada", fecha: "15 de mayo del 2026" },
  { id: "6", nombre: "Truvada", fecha: "15 de mayo del 2026" },
  { id: "7", nombre: "Truvada", fecha: "15 de mayo del 2026" },
  { id: "8", nombre: "Truvada", fecha: "15 de mayo del 2026" },
];

export default function RecipesScreen() {
  const handleRecetaPress = (receta: Receta) => {
    //console.log("Receta seleccionada:", receta);
    router.push({ pathname: "/recipe", params: { id: receta.id } });
  };

  if (RECETAS.length === 0) {
    return (
      <View style={styles.container}>
        <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
        <View style={styles.content}>

          <View style={styles.emptyState}>
            <SymbolView
              name={{ android: "description", ios: "doc.text" }}
              size={56}
              tintColor="#D1D5DB"
              resizeMode="scaleAspectFit"
            />
            <Text style={styles.emptyText}>No hay recetas disponibles</Text>
            <Text style={styles.emptySubtext}>
              Cuando tengas recetas disponibles aparecerán aquí
            </Text>
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      <FlatList
        data={RECETAS}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => handleRecetaPress(item)}
            style={({ pressed }) => [
              styles.itemCard,
              { opacity: pressed ? 0.7 : 1 },
            ]}
          >
            <Text style={styles.itemName}>{item.nombre}</Text>
            <View style={styles.itemRight}>
              <Text style={styles.itemDate}>{item.fecha}</Text>
              <SymbolView
                name={{ android: "chevron_right", ios: "chevron.right" }}
                size={20}
                tintColor="#C7C7CC"
                resizeMode="scaleAspectFit"
              />
            </View>
          </Pressable>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 24,
  },
  listContent: {
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 40,
  },

  itemCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#F7F7F9",
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 18,
    marginBottom: 12,
  },
  itemName: {
    fontSize: 15,
    fontWeight: "600",
    color: "#374151",
  },
  itemRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  itemDate: {
    fontSize: 14,
    color: "#9CA3AF",
  },

  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingBottom: 80,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#6B7280",
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: 13,
    color: "#9CA3AF",
    marginTop: 6,
    textAlign: "center",
    paddingHorizontal: 20,
  },
});