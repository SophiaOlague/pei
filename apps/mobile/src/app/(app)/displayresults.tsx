import { router, useLocalSearchParams } from "expo-router";
import { SymbolView } from "expo-symbols";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  SectionList,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Svg, { Circle } from "react-native-svg";

import {
  type LoteLaboratorio,
  ServiceLaboratorio,
  type SubPruebaResultado,
} from "./lab-demo";

type CategoriaFiltro = "FUERA_RANGO" | "SUFICIENTE" | "OPTIMO";

export default function MisResultadosScreen() {
  const params = useLocalSearchParams<{ loteId?: string; id?: string }>();
  const loteId = params.id || params.loteId || "lote-pdf-001";
  const [lote, setLote] = useState<LoteLaboratorio | null>(null);
  const [loading, setLoading] = useState(true);
  const [filtrosActivos, setFiltrosActivos] = useState<
    Record<CategoriaFiltro, boolean>
  >({
    FUERA_RANGO: true,
    OPTIMO: true,
    SUFICIENTE: true,
  });

  const todosActivos =
    filtrosActivos.FUERA_RANGO &&
    filtrosActivos.SUFICIENTE &&
    filtrosActivos.OPTIMO;
  const todosInactivos = !(
    filtrosActivos.FUERA_RANGO ||
    filtrosActivos.SUFICIENTE ||
    filtrosActivos.OPTIMO
  );
  const mostrarTodo = todosActivos || todosInactivos;

  useEffect(() => {
    async function cargarDatos() {
      try {
        setLoading(true);
        const data = await ServiceLaboratorio.obtenerLotePorId(loteId);
        setLote(data);
      } finally {
        setLoading(false);
      }
    }
    cargarDatos();
  }, [loteId]);

  if (loading || !lote) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#7355F7" size="large" />
      </View>
    );
  }

  const seccionesMap = {
    FUERA_RANGO: {
      data: [] as SubPruebaResultado[],
      key: "FUERA_RANGO" as CategoriaFiltro,
      title: "Fuera del rango",
    },
    OPTIMO: {
      data: [] as SubPruebaResultado[],
      key: "OPTIMO" as CategoriaFiltro,
      title: "Óptimo",
    },
    SUFICIENTE: {
      data: [] as SubPruebaResultado[],
      key: "SUFICIENTE" as CategoriaFiltro,
      title: "Suficiente",
    },
  };

  lote.pruebas.forEach((p) => {
    if (seccionesMap[p.categoria]) {
      seccionesMap[p.categoria].data.push(p);
    }
  });

  const seccionesFiltradas = Object.values(seccionesMap).filter(
    (sec) => sec.data.length > 0 && (mostrarTodo || filtrosActivos[sec.key])
  );

  const totalPruebas = lote.pruebas.length;
  const fueraRangoCount = lote.pruebas.filter(
    (p) => p.categoria === "FUERA_RANGO"
  ).length;
  const suficienteCount = lote.pruebas.filter(
    (p) => p.categoria === "SUFICIENTE"
  ).length;
  const optimoCount = lote.pruebas.filter(
    (p) => p.categoria === "OPTIMO"
  ).length;

  const circumference = 251.32;
  const lenFuera =
    totalPruebas > 0 ? (fueraRangoCount / totalPruebas) * circumference : 0;
  const lenSuficiente =
    totalPruebas > 0 ? (suficienteCount / totalPruebas) * circumference : 0;
  const lenOptimo =
    totalPruebas > 0 ? (optimoCount / totalPruebas) * circumference : 0;

  const offsetFuera = 0;
  const offsetSuficiente = -lenFuera;
  const offsetOptimo = -(lenFuera + lenSuficiente);

  const toggleFiltro = (cat: CategoriaFiltro) => {
    setFiltrosActivos((prev) => ({
      ...prev,
      [cat]: !prev[cat],
    }));
  };

  const irADetalle = (subId: string) => {
    router.push({
      params: { loteId, subId },
      pathname: "/detailsrange",
    });
  };

  const obtenerPosicionBarra = (item: SubPruebaResultado) => {
    if (typeof item.posicionPorcentaje === "number") {
      return item.posicionPorcentaje;
    }
    const { valor, minVal, maxVal } = item;
    if (valor > maxVal) return 85;
    if (valor < minVal) return 15;
    const rango = maxVal - minVal;
    if (rango <= 0) return 50;
    return Math.round(33 + ((valor - minVal) / rango) * 34);
  };

  return (
    <View style={styles.container}>
      <SectionList
        contentContainerStyle={styles.listContent}
        keyExtractor={(item) => item.subId}
        sections={seccionesFiltradas}
        ListHeaderComponent={
          <>
            <View style={styles.summaryCard}>
              <View style={styles.legendContainer}>
                <View style={styles.legendRow}>
                  <View style={[styles.badge, { backgroundColor: "#dcf9e6" }]}>
                    <Text style={{ color: "#166534", fontSize: 11 }}>
                      ✓ Óptimo {optimoCount}
                    </Text>
                  </View>
                </View>

                <View style={styles.legendRow}>
                  <View style={[styles.badge, { backgroundColor: "#fdf7d4" }]}>
                    <Text style={{ color: "#8a7811", fontSize: 11 }}>
                      • Suficiente {suficienteCount}
                    </Text>
                  </View>
                </View>

                <View style={styles.legendRow}>
                  <View style={[styles.badge, { backgroundColor: "#fadcdc" }]}>
                    <Text style={{ color: "#b32729", fontSize: 11 }}>
                      ! Fuera de rango {fueraRangoCount}
                    </Text>
                  </View>
                </View>

                <Text style={styles.dateText}>
                  Última actualización: {lote.fechaActualizacion}
                </Text>
              </View>

              <View style={styles.chartWrapper}>
                <Svg
                  height={110}
                  style={{ transform: [{ rotate: "-90deg" }] }}
                  viewBox="0 0 100 100"
                  width={110}
                >
                  <Circle
                    cx="50"
                    cy="50"
                    fill="none"
                    r="40"
                    stroke="#E5E7EB"
                    strokeWidth="8"
                  />
                  {lenFuera > 0 && (
                    <Circle
                      cx="50"
                      cy="50"
                      fill="none"
                      r="40"
                      stroke="#f66063"
                      strokeDasharray={`${lenFuera} ${circumference - lenFuera}`}
                      strokeDashoffset={offsetFuera}
                      strokeWidth="7"
                    />
                  )}
                  {lenSuficiente > 0 && (
                    <Circle
                      cx="50"
                      cy="50"
                      fill="none"
                      r="40"
                      stroke="#f5df65"
                      strokeDasharray={`${lenSuficiente} ${circumference - lenSuficiente}`}
                      strokeDashoffset={offsetSuficiente}
                      strokeWidth="7"
                    />
                  )}
                  {lenOptimo > 0 && (
                    <Circle
                      cx="50"
                      cy="50"
                      fill="none"
                      r="40"
                      stroke="#64df91"
                      strokeDasharray={`${lenOptimo} ${circumference - lenOptimo}`}
                      strokeDashoffset={offsetOptimo}
                      strokeWidth="7"
                    />
                  )}
                </Svg>
                <Text style={styles.scoreText}>{totalPruebas}</Text>
              </View>
            </View>

            <View style={styles.chipsContainer}>
              <Pressable
                onPress={() => toggleFiltro("FUERA_RANGO")}
                style={[
                  styles.chip,
                  filtrosActivos.FUERA_RANGO && styles.chipActiveRed,
                ]}
              >
                <Text
                  style={[
                    styles.chipText,
                    filtrosActivos.FUERA_RANGO && styles.chipTextActive,
                  ]}
                >
                  Fuera de rango
                </Text>
              </Pressable>

              <Pressable
                onPress={() => toggleFiltro("SUFICIENTE")}
                style={[
                  styles.chip,
                  filtrosActivos.SUFICIENTE && styles.chipActiveYellow,
                ]}
              >
                <Text
                  style={[
                    styles.chipText,
                    filtrosActivos.SUFICIENTE && styles.chipTextActive,
                  ]}
                >
                  Suficiente
                </Text>
              </Pressable>

              <Pressable
                onPress={() => toggleFiltro("OPTIMO")}
                style={[
                  styles.chip,
                  filtrosActivos.OPTIMO && styles.chipActiveGreen,
                ]}
              >
                <Text
                  style={[
                    styles.chipText,
                    filtrosActivos.OPTIMO && styles.chipTextActive,
                  ]}
                >
                  Óptimo
                </Text>
              </Pressable>
            </View>
          </>
        }
        renderItem={({ item }) => {
          const pct = obtenerPosicionBarra(item);

          return (
            <Pressable
              onPress={() => irADetalle(item.subId)}
              style={styles.itemCard}
            >
              <Text style={styles.itemTitle}>{item.nombreAnalisis}</Text>
              <View style={styles.itemRow}>
                <Text style={styles.itemValue}>
                  {item.valor} {item.unidad}
                </Text>
                <View style={styles.rangeBarTrack}>
                  <View
                    style={[
                      styles.segment,
                      styles.segmentFirst,
                      { backgroundColor: "#64df91", flex: 1 },
                    ]}
                  />
                  <View
                    style={[
                      styles.segment,
                      { backgroundColor: "#f5df65", flex: 1 },
                    ]}
                  />
                  <View
                    style={[
                      styles.segment,
                      styles.segmentLast,
                      { backgroundColor: "#f66063", flex: 1 },
                    ]}
                  />
                  <View
                    style={[
                      styles.markerTriangle,
                      { left: `${pct}%` },
                    ]}
                  />
                </View>
                <SymbolView
                  name={{ android: "chevron_right", ios: "chevron.right" }}
                  size={18}
                  tintColor="#A0A0A0"
                />
              </View>
            </Pressable>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  center: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
  },
  chartWrapper: {
    alignItems: "center",
    height: 90,
    justifyContent: "center",
    width: 90,
  },
  chip: {
    backgroundColor: "#F3F4F6",
    borderColor: "#E5E7EB",
    borderRadius: 20,
    borderWidth: 0,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  chipActiveGreen: {
    backgroundColor: "#dcf9e6",
  },
  chipActiveRed: {
    backgroundColor: "#fadcdc",
  },
  chipActiveYellow: {
    backgroundColor: "#fdf7d4",
  },
  chipText: {
    color: "#6B7280",
    fontSize: 12,
    fontWeight: "500",
  },
  chipTextActive: {
    color: "#111827",
    fontWeight: "700",
  },
  chipsContainer: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 12,
  },
  container: {
    flex: 1,
  },
  dateText: {
    color: "#9CA3AF",
    fontSize: 10,
    marginTop: 6,
  },
  itemCard: {
    backgroundColor: "#F9FAFB",
    borderRadius: 12,
    justifyContent: "center",
    marginBottom: 10,
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  itemRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  itemTitle: {
    color: "#6B7280",
    fontSize: 13,
    marginBottom: 8,
  },
  itemValue: {
    color: "#111827",
    fontSize: 14,
    fontWeight: "700",
    width: 80,
  },
  legendContainer: {
    flex: 1,
    gap: 6,
  },
  legendRow: {
    flexDirection: "row",
  },
  listContent: {
    paddingBottom: 40,
    paddingHorizontal: 20,
    paddingTop: 4,
  },
  markerTriangle: {
    borderLeftColor: "transparent",
    borderLeftWidth: 4,
    borderRightColor: "transparent",
    borderRightWidth: 4,
    borderTopColor: "#111827",
    borderTopWidth: 6,
    height: 0,
    marginLeft: -4,
    position: "absolute",
    top: -7,
    width: 0,
  },
  rangeBarTrack: {
    borderRadius: 30,
    flex: 1,
    flexDirection: "row",
    height: 6,
    marginHorizontal: 10,
    overflow: "visible",
    position: "relative",
  },
  scoreText: {
    color: "#1F2937",
    fontSize: 20,
    fontWeight: "700",
    position: "absolute",
  },
  segment: {
    height: "100%",
  },
  segmentFirst: {
    borderBottomLeftRadius: 3,
    borderTopLeftRadius: 3,
  },
  segmentLast: {
    borderBottomRightRadius: 3,
    borderTopRightRadius: 3,
  },
  summaryCard: {
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 12,
    padding: 14,
  },
});