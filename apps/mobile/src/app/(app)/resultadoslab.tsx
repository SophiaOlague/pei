import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Pressable,
  ScrollView,
  StatusBar,
  Platform,
} from "react-native";
import { SymbolView } from "expo-symbols";

export default function UploadResultsScreen() {
  const [analysisName, setAnalysisName] = useState("");
  const [analysisDate, setAnalysisDate] = useState("");
  const [analysisTime, setAnalysisTime] = useState("");
  const [fileName, setFileName] = useState("");
  const [fileSize, setFileSize] = useState("");

  const formatDate = (text: string) => {
    const cleaned = text.replace(/\D/g, "").slice(0, 8);
    let formatted = cleaned;
    if (cleaned.length > 2) {
      formatted = cleaned.slice(0, 2) + "/" + cleaned.slice(2);
    }
    if (cleaned.length > 4) {
      formatted =
        cleaned.slice(0, 2) + "/" + cleaned.slice(2, 4) + "/" + cleaned.slice(4);
    }
    setAnalysisDate(formatted);
  };

  const formatTime = (text: string) => {
    const cleaned = text.replace(/\D/g, "").slice(0, 4);
    let formatted = cleaned;
    if (cleaned.length > 2) {
      formatted = cleaned.slice(0, 2) + ":" + cleaned.slice(2);
    }
    setAnalysisTime(formatted);
  };

  const handleChangeFile = () => {
    console.log("Cambiar archivo");
  };

  const handleConfirm = () => {
    console.log("Confirmar");
    console.log("Nombre:", analysisName);
    console.log("Fecha:", analysisDate);
    console.log("Hora:", analysisTime);
    console.log("Archivo:", fileName, fileSize);
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content"/>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >

        <Text style={styles.description}>Ingresa detalles de tus pruebas para que tu médico pueda realizar un análisis.</Text>

        <Text style={styles.fieldLabel}>Nombre del análisis:</Text>
        <TextInput
          style={styles.input}
          value={analysisName}
          onChangeText={setAnalysisName}
          placeholder=""
          placeholderTextColor="#9CA3AF"
        />

        <Text style={styles.fieldLabel}>Fecha del análisis:</Text>
        <TextInput
          style={styles.input}
          value={analysisDate}
          onChangeText={formatDate}
          keyboardType="number-pad"
          placeholder=""
          placeholderTextColor="#9CA3AF"
          maxLength={10}
        />

        <Text style={styles.fieldLabel}>Hora del análisis:</Text>
        <TextInput
          style={styles.input}
          value={analysisTime}
          onChangeText={formatTime}
          keyboardType="number-pad"
          placeholder=""
          placeholderTextColor="#9CA3AF"
          maxLength={5}
        />

        <Text style={styles.fieldLabel}>Carga tus resultados aquí:</Text>

          
          <View style={styles.fileInfo}>
            <Text style={styles.fileName}>{fileName}</Text>
            <Text style={styles.fileSize}>{fileSize}</Text>
          </View>

        <Pressable
          onPress={handleChangeFile}
          style={({ pressed }) => [
            styles.changeFileButton,
            { transform: [{ scale: pressed ? 0.98 : 1 }] },
          ]}
        >
          <Text style={styles.changeFileText}>Subir archivo</Text>
        </Pressable>
      </ScrollView>

      <View style={styles.bottomContainer}>
        <Pressable
          onPress={handleConfirm}
          style={({ pressed }) => [
            styles.confirmButton,
            { transform: [{ scale: pressed ? 0.97 : 1 }] },
          ]}
        >
          <Text style={styles.confirmButtonText}>Confirmar</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 120,
  },

  description: {
    fontSize: 14,
    color: "#00000080",
    lineHeight: 20,
    marginBottom: 24,
  },

  fieldLabel: {
    fontSize: 13,
    color: "#6B7280",
    marginBottom: 8,
    marginTop: 4,
    paddingHorizontal: 18,

  },
  input: {
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 50,
    paddingVertical: 14,
    paddingHorizontal: 18,
    fontSize: 14,
    color: "#1F2937",
    marginBottom: 16,
  },

  fileRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F9FAFB",
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    gap: 12,
  },
  fileIconText: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "700",
  },
  fileInfo: {
    flex: 1,
  },
  fileName: {
    fontSize: 14,
    fontWeight: "600",
    color: "#111827",
    marginBottom: 2,
  },
  fileSize: {
    fontSize: 12,
    color: "#9CA3AF",
  },

  changeFileButton: {
    backgroundColor: "#F3F4F6",
    paddingVertical: 14,
    borderRadius: 50,
    alignItems: "center",
    marginBottom: 24,
  },
  changeFileText: {
    fontSize: 14,
    color: "#4B5563",
    fontWeight: "500",
  },

  bottomContainer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 24,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#FFFFFF",
    marginBottom: 20,
  },
  confirmButton: {
    backgroundColor: "#7355F7",
    paddingVertical: 15,
    borderRadius: 50,
    alignItems: "center",
  },
  confirmButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "500",
  },
});