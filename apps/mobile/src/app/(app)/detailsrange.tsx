import { useLocalSearchParams } from "expo-router";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import Svg, { Circle, Rect, Text as SvgText, Line } from "react-native-svg";

import { ServiceLaboratorio, SubPruebaResultado } from "./lab-demo";

export default function DetallesRangoScreen() {
  const { loteId, subId } = useLocalSearchParams<{
    loteId?: string;
    subId?: string;
  }>();

  const [prueba, setPrueba] = useState<SubPruebaResultado | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function cargar() {
      try {
        setLoading(true);
        const res = await ServiceLaboratorio.obtenerPruebaEspecifica(
          loteId || "lote-pdf-001",
          subId || "sub-101"
        );
        setPrueba(res);
      } finally {
        setLoading(false);
      }
    }
    cargar();
  }, [loteId, subId]);

  if (loading || !prueba) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#7355F7" size="large" />
      </View>
    );
  }

  const { valor, minVal, maxVal, categoria } = prueba;
  const tieneMinimoReal = minVal > 0;
  const esFueraDeRango = valor > maxVal || categoria === "FUERA_RANGO";

  const Y_TOP = 25;
  const H_ROJO = 35;
  const H_AMARILLO = 40;
  const H_VERDE = 40;
  const H_GRIS = tieneMinimoReal ? 30 : 0;

  const y1_RojoTope = Y_TOP;
  const y2_RojoAmarillo = y1_RojoTope + H_ROJO;
  const y3_AmarilloVerde = y2_RojoAmarillo + H_AMARILLO;
  const y4_VerdeGris = y3_AmarilloVerde + H_VERDE;
  const y5_Base = y4_VerdeGris + H_GRIS;

  const valorIntermedio = Math.round((maxVal + minVal) / 2);

  const calcularCoordenadaY = (): number => {
    if (valor > maxVal || (categoria === "FUERA_RANGO" && valor >= maxVal * 1.05)) {
      return y1_RojoTope;
    }
    if (categoria === "FUERA_RANGO" && valor >= maxVal) {
      return y1_RojoTope + 6;
    }
    if (categoria === "FUERA_RANGO" && tieneMinimoReal && valor < minVal) {
      return y5_Base;
    }
    if (categoria === "SUFICIENTE") {
      return y2_RojoAmarillo + H_AMARILLO / 2;
    }
    return y3_AmarilloVerde + H_VERDE / 2;
  };

  const posY = calcularCoordenadaY();

  const X_INICIO = 15;
  const ANCHO_TABLA = 230;
  const X_FIN_TABLA = X_INICIO + ANCHO_TABLA;

  const posX = X_INICIO + ANCHO_TABLA / 2;

  const X_OPERATOR_COLUMN = X_FIN_TABLA + 12;
  const X_NUMBER_COLUMN = X_OPERATOR_COLUMN + 12;

  return (
    <View style={styles.container}>
      <Text style={styles.mainValue}>
        {prueba.valor} {prueba.unidad}
      </Text>
      <Text style={styles.categorySub}>
        {esFueraDeRango
          ? "Fuera del rango"
          : categoria === "OPTIMO"
          ? "Óptimo"
          : "Suficiente"}
      </Text>

      <View style={styles.chartBox}>
        <Svg height={220} viewBox="0 0 310 220" width="100%">
          <Rect fill="#f66063" 
          height={H_ROJO} 
          opacity={0.22} rx="6" 
          width={ANCHO_TABLA} 
          x={X_INICIO} 
          y={y1_RojoTope} />
          <Rect fill="#f5df65" 
          height={H_AMARILLO} 
          opacity={0.22} rx="6" 
          width={ANCHO_TABLA} 
          x={X_INICIO} 
          y={y2_RojoAmarillo} />
          <Rect fill="#64df91" 
          height={H_VERDE} 
          opacity={0.22} 
          rx="6" 
          width={ANCHO_TABLA} 
          x={X_INICIO} 
          y={y3_AmarilloVerde} />
          
          {tieneMinimoReal && (
            <Rect fill="#cec4cf" 
            height={H_GRIS} 
            opacity={0.18} 
            rx="6" 
            width={ANCHO_TABLA} 
            x={X_INICIO} 
            y={y4_VerdeGris}
             />
          )
          }
          <Line stroke="#9CA3AF" 
          strokeDasharray="4, 4" 
          strokeWidth="1" 
          x1={X_INICIO} 
          x2={X_FIN_TABLA} 
          y1={y1_RojoTope} 
          y2={y1_RojoTope} 
          />
          <Line stroke="#9CA3AF" 
          strokeDasharray="4, 4" 
          strokeWidth="1" 
          x1={X_INICIO} 
          x2={X_FIN_TABLA} 
          y1={y2_RojoAmarillo} 
          y2={y2_RojoAmarillo} 
          />
          <Line stroke="#9CA3AF" 
          strokeDasharray="4, 4" 
          strokeWidth="1" 
          x1={X_INICIO} 
          x2={X_FIN_TABLA} 
          y1={y3_AmarilloVerde} 
          y2={y3_AmarilloVerde} 
          />
          {tieneMinimoReal && (
            <Line stroke="#9CA3AF" 
            strokeDasharray="4, 4" 
            strokeWidth="1" 
            x1={X_INICIO} 
            x2={X_FIN_TABLA} 
            y1={y4_VerdeGris} 
            y2={y4_VerdeGris} 
            />
          )}
          <Line stroke="#9CA3AF" 
          strokeDasharray="4, 4" 
          strokeWidth="1" 
          x1={X_INICIO} 
          x2={X_FIN_TABLA} 
          y1={y5_Base} 
          y2={y5_Base} 
          />

          <SvgText fill="#6B7280"
           fontSize="10" 
           fontWeight="600" 
           textAnchor="start" 
           x={X_OPERATOR_COLUMN} 
           y={y1_RojoTope + 4}
           >
            &gt;
          </SvgText>
          <SvgText fill="#6B7280" 
          fontSize="10" 
          fontWeight="600" 
          textAnchor="start" 
          x={X_NUMBER_COLUMN} 
          y={y1_RojoTope + 4}
          >
            {Math.round(maxVal)}
          </SvgText>

          <SvgText fill="#6B7280" 
          fontSize="10" 
          fontWeight="600" 
          textAnchor="start" 
          x={X_NUMBER_COLUMN} 
          y={y2_RojoAmarillo + 4}
          >
            {Math.round(maxVal)}
          </SvgText>

          <SvgText fill="#6B7280" 
          fontSize="10" 
          fontWeight="600" 
          textAnchor="start" 
          x={X_NUMBER_COLUMN} 
          y={y3_AmarilloVerde + 4}
          >
            {valorIntermedio}
          </SvgText>

          <SvgText fill="#6B7280" 
          fontSize="10" 
          fontWeight="600" 
          textAnchor="start"
          x={X_NUMBER_COLUMN} 
          y={y4_VerdeGris + 4}
          >
            {Math.round(minVal)}
          </SvgText>

          {tieneMinimoReal && (
            <SvgText fill="#6B7280" 
            fontSize="10" 
            fontWeight="600" 
            textAnchor="start" 
            x={X_NUMBER_COLUMN} 
            y={y5_Base + 2}
            >
              0
            </SvgText>
          )}

          <Circle 
            cx={posX} 
            cy={posY} 
            fill="#111827" 
            r="7" 
            stroke="#FFFFFF" 
            strokeWidth="2"
             />
          <SvgText 
          fill="#111827" 
          fontSize="11" 
          fontWeight="bold" 
          x={posX + 12} 
          y={posY + 4}
          >
            {prueba.valor}
          </SvgText>
        </Svg>

        <View style={styles.legendRow}>
          <Text style={{ color: "#f66063", fontSize: 11 }}>— Fuera de rango</Text>
          <Text style={{ color: "#d5c256", fontSize: 11 }}>— Suficiente</Text>
          <Text style={{ color: "#64df91", fontSize: 11 }}>— Óptimo</Text>
        </View>
      </View>

      <View style={styles.descriptionCard}>
        <Text style={styles.descriptionText}>{prueba.explicacionClinica}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  categorySub: { 
    color: "#6B7280", 
    fontSize: 13, 
    marginBottom: 24 
  },
  center: { 
    alignItems: "center",
    flex: 1, 
    justifyContent: "center" 
  },
  chartBox: { 
    backgroundColor: "#FFFFFF", 
    borderRadius: 16, 
    marginBottom: 28, 
    paddingHorizontal: 12, 
    paddingVertical: 12 
  },
  container: { 
    flex: 1, 
    paddingHorizontal: 16, 
    paddingTop: 20 
  },
  descriptionCard: { 
    backgroundColor: "#F9FAFB", 
    borderRadius: 16, 
    padding: 18 
  },
  descriptionText: { 
    color: "#4B5563", 
    fontSize: 13, 
    lineHeight: 20 
  },
  legendRow: { 
    flexDirection: "row", 
    justifyContent: "space-around", 
    marginTop: 8 
  },
  mainValue: { 
    color: "#111827", 
    fontSize: 22, 
    fontWeight: "700" 
  },
});