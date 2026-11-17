import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Image,
  Pressable,
  TextInput,
  ScrollView,
  StatusBar,
} from "react-native";
import { SymbolView } from "expo-symbols";

const CATEGORIAS = [
  { id: "atencion", label: "Atención excelente" },
  { id: "claridad", label: "Claridad" },
  { id: "trato", label: "Trato humano" },
  { id: "puntualidad", label: "Puntualidad" },
];

export default function CalificarCitaScreen() {
  const [rating, setRating] = useState(0);
  const [selectedCategoria, setSelectedCategoria] = useState<string>("");
  const [comentario, setComentario] = useState("");

  const handleEnviar = () => {
    console.log("Rating:", rating);
    console.log("Categoría:", selectedCategoria);
    console.log("Comentario:", comentario);
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.title}>Califica tu experiencia</Text>

        <View style={styles.avatarWrapper}>
          <Image
            source={{ uri: "" }}
            style={styles.avatar}
          />
        </View>

        <Text style={styles.doctorName}>
          Dra. Laura Josefa (Infectóloga)
        </Text>

        {/* Estrellas */}
        <View style={styles.starsRow}>
          {[1, 2, 3, 4, 5].map((star) => {
            const isActive = star <= rating;
            return (
              <Pressable
                key={star}
                onPress={() => setRating(star)}
                style={({ pressed }) => [
                  { transform: [{ scale: pressed ? 0.9 : 1 }] },
                ]}
              >
                <SymbolView
                  name={{
                    android: isActive ? "star" : "star_border",
                    ios: isActive ? "star.fill" : "star",
                  }}
                  size={36}
                  tintColor={isActive ? "#FBBF24" : "#D1D5DB"}
                  resizeMode="scaleAspectFit"
                />
              </Pressable>
            );
          })}
        </View>

        {/* Categorías */}
        <View style={styles.categoriasContainer}>
          {CATEGORIAS.map((cat) => {
            const isSelected = selectedCategoria === cat.id;
            return (
              <Pressable
                key={cat.id}
                onPress={() => setSelectedCategoria(cat.id)}
                style={({ pressed }) => [
                  styles.categoriaItem,
                  isSelected && styles.categoriaItemSelected,
                  { transform: [{ scale: pressed ? 0.98 : 1 }] },
                ]}
              >
                <Text
                  style={[
                    styles.categoriaText,
                    isSelected && styles.categoriaTextSelected,
                  ]}
                >
                  {cat.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <Text style={styles.commentsTitle}>
          Comentarios adicionales{"\n"}(opcionales)
        </Text>

        <TextInput
          style={styles.commentInput}
          placeholder="Agrega un comentario"
          placeholderTextColor="#9CA3AF"
          value={comentario}
          onChangeText={setComentario}
          multiline
          textAlignVertical="top"
        />

        <Pressable
          onPress={handleEnviar}
          style={({ pressed }) => [
            styles.enviarButton,
            { transform: [{ scale: pressed ? 0.97 : 1 }] },
          ]}
        >
          <Text style={styles.enviarButtonText}>Enviar comentarios</Text>
        </Pressable>
      </ScrollView>
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
    paddingBottom: 40,
  },
  title: {
    fontSize: 18,
    fontWeight: "700",
    color: "#111827",
    textAlign: "center",
    marginBottom: 24,
  },
  avatarWrapper: { 
    alignItems: "center", 
    marginBottom: 16,
  },
  avatar: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: "#F3F4F6",
  },
  doctorName: {
    fontSize: 15,
    fontWeight: "600",
    color: "#111827",
    textAlign: "center",
    marginBottom: 20,
  },
  starsRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 8,
    marginBottom: 28,
  },
  categoriasContainer: { gap: 12, marginBottom: 28 },
  categoriaItem: {
    backgroundColor: "#F5F5F7",
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 18,
  },
  categoriaItemSelected: {
    backgroundColor: "#F5F3FF",
    borderWidth: 1.5,
    borderColor: "#7355F7",
  },
  categoriaText: {
    fontSize: 14,
    color: "#374151",
    fontWeight: "500",
  },
  categoriaTextSelected: {
    color: "#7355F7",
    fontWeight: "600",
  },
  commentsTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 14,
    lineHeight: 22,
  },
  commentInput: {
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 24,
    paddingVertical: 14,
    paddingHorizontal: 18,
    fontSize: 14,
    color: "#1F2937",
    minHeight: 60,
    marginBottom: 24,
    backgroundColor: "#FFFFFF",
  },
  enviarButton: {
    backgroundColor: "#7355F7",
    paddingVertical: 16,
    borderRadius: 50,
    alignItems: "center",
  },
  enviarButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
  },
});