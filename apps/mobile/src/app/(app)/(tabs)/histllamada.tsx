import { router } from "expo-router";
import { SymbolView } from "expo-symbols";
import {
  Image,
  Pressable,
  SectionList,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

type Llamada = {
  id: string;
  doctorName: string;
  hora: string;
  duracion: string;
  doctorAvatar: string;
};
type SeccionLlamadas = {
  title: string;
  data: Llamada[];
};
const SECCIONES: SeccionLlamadas[] = [
  {
    data: [
      {
        doctorAvatar: "",
        doctorName: "Consulta Dra Castro",
        duracion: "45 min",
        hora: "2:20 pm",
        id: "1",
      },
    ],
    title: "Hoy",
  },
  {
    data: [
      {
        doctorAvatar: "",
        doctorName: "Consulta Dr Zuñiga",
        duracion: "30 min",
        hora: "5:40 pm",
        id: "2",
      },
    ],
    title: "Ayer",
  },
  {
    data: [
      {
        doctorAvatar: "",
        doctorName: "Consulta Dr Torres",
        duracion: "1 hr 15 min",
        hora: "3:15 pm",
        id: "3",
      },
      {
        doctorAvatar: "",
        doctorName: "Consulta Dra García",
        duracion: "15 min",
        hora: "10:40 am",
        id: "4",
      },
    ],
    title: "25 de agosto del 2026",
  },
  {
    data: [
      {
        doctorAvatar: "",
        doctorName: "Consulta Dra Josefa",
        duracion: "45 min",
        hora: "6:15 pm",
        id: "5",
      },
    ],
    title: "24 de agosto del 2026",
  },
  {
    data: [
      {
        doctorAvatar: "",
        doctorName: "Consulta Dr Torres",
        duracion: "1 hr 15 min",
        hora: "3:15 pm",
        id: "6",
      },
    ],
    title: "23 de agosto del 2026",
  },
  {
    data: [
      {
        doctorAvatar: "",
        doctorName: "Consulta Dr Torres",
        duracion: "35 min",
        hora: "1:45 pm",
        id: "7",
      },
    ],
    title: "22 de agosto del 2026",
  },
  {
    data: [
      {
        doctorAvatar: "",
        doctorName: "Consulta Dr García",
        duracion: "15 min",
        hora: "11:10 am",
        id: "8",
      },
    ],
    title: "21 de agosto del 2026",
  },
];

export default function CallHistoryScreen() {
  const handleLlamadaPress = (llamada: Llamada) => {
    router.push({ pathname: "/detailscall", params: { id: llamada.id } });
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />

      <SectionList
        contentContainerStyle={styles.listContent}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={
          <Text style={styles.title}>HISTORIAL DE VIDEOLLAMADAS</Text>
        }
        renderItem={({ item, index, section }) => (
          <Pressable
            onPress={() => handleLlamadaPress(item)}
            style={({ pressed }) => [
              styles.itemCard,
              { opacity: pressed ? 0.7 : 1 },
              index === section.data.length - 1 && styles.itemCardLast,
            ]}
          >
            <Image source={{ uri: item.doctorAvatar }} style={styles.avatar} />

            <View style={styles.itemInfo}>
              <Text style={styles.doctorName}>{item.doctorName}</Text>
              <View style={styles.metaRow}>
                <Text style={styles.timeText}>{item.hora}</Text>
                <Text style={styles.durationText}>{item.duracion}</Text>
              </View>
            </View>

            <SymbolView
              name={{ android: "chevron_right", ios: "chevron.right" }}
              resizeMode="scaleAspectFit"
              size={20}
              tintColor="#C7C7CC"
            />
          </Pressable>
        )}
        renderSectionHeader={({ section: { title } }) => (
          <Text style={styles.sectionHeader}>{title}</Text>
        )}
        sections={SECCIONES}
        showsVerticalScrollIndicator={false}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  avatar: {
    backgroundColor: "#F3F4F6",
    borderRadius: 22,
    height: 44,
    width: 44,
  },
  container: {
    backgroundColor: "#FFFFFF",
    flex: 1,
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 24,
  },
  doctorName: {
    color: "#111827",
    fontSize: 15,
    fontWeight: "600",
    marginBottom: 4,
  },
  durationText: {
    color: "#6B7280",
    fontSize: 13,
  },
  headerRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 24,
    paddingTop: 20,
  },
  itemCard: {
    alignItems: "center",
    borderBottomColor: "#F3F4F6",
    borderBottomWidth: 1,
    flexDirection: "row",
    gap: 12,
    paddingVertical: 12,
  },
  itemCardLast: {
    borderBottomWidth: 0,
    paddingBottom: 4,
  },
  itemInfo: {
    flex: 1,
  },
  listContent: {
    paddingBottom: 40,
    paddingHorizontal: 24,
    paddingTop: 20,
  },
  metaRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 24,
  },
  sectionHeader: {
    color: "#9CA3AF",
    fontSize: 13,
    marginBottom: 8,
    marginTop: 20,
  },
  timeText: {
    color: "#6B7280",
    fontSize: 13,
  },
  title: {
    color: "#111827",
    fontSize: 20,
    fontWeight: "700",
    marginBottom: 24,
    textAlign: "center",
  },
  
});
