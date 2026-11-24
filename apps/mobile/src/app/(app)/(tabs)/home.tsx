import React from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  StatusBar,
  Image,
  Pressable,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { SymbolView } from "expo-symbols";
import { router } from "expo-router";
import { LineChart, BarChart } from "react-native-gifted-charts";
import Svg, { Circle } from "react-native-svg";

import { NextAppointment } from "@/components/appointments/next-appointment";

export default function HomeScreen() {
  const goToPorcentaje = () => {
    router.push("/displayresults");
  };

  const goToDetails = () => {
    router.push("/detailsrange"); 
  };

  const goToEmergency = () => {
    router.push("/(app)/fastdatetime");
  };

  const goToSchedule = () => {
    router.push("/(app)/seleccioncita");
  };

  const lineData = [
    { value: 0 },
    { value: 35 },
    { value: 15 },
    { value: 45 },
    { value: 50 },
    { value: 35 },
    { value: 40 },
    { value: 20 },
    { value: 0 },
  ];

  const lineData2 = [
    { value: 0 },
    { value: 15 },
    { value: 5 },
    { value: 25 },
    { value: 30 },
    { value: 15 },
    { value: 20 },
    { value: 0 },
  ];

  const barData = [
    { value: 28, frontColor: "#FFFFFF60" },
    { value: 61, frontColor: "#FFFFFF60" },
    { value: 92 },
    { value: 110 },
    { value: 82 },
    { value: 71, frontColor: "#FFFFFF60" },
    { value: 38, frontColor: "#FFFFFF60" },
    { value: 10, frontColor: "#FFFFFF60" },
  ];

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <Image
          source={require("@/assets/images/logoblack.png")}
          style={styles.logo}
          resizeMode="contain"
        />

        <NextAppointment />

        <Text style={styles.sectionTitle}>Niveles de salud</Text>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.carouselContent}
          style={styles.carouselContainer}
        >
          <Pressable
            onPress={goToPorcentaje}
            style={({ pressed }) => [
              styles.healthCard,
              styles.healthCardBeige,
              { opacity: pressed ? 0.9 : 1 },
            ]}
          >
            <View style={styles.healthCardHeader}>
              <Text style={styles.healthCardTitle}>Porcentaje semanal</Text>
              <SymbolView
                name={{ android: "stethoscope", ios: "stethoscope" }}
                size={14}
                tintColor="#4A4642"
                resizeMode="scaleAspectFit"
              />
            </View>
            <View style={styles.chartPlaceholder}>
              <Svg width={125} height={125} viewBox="0 0 100 100">
                <Circle 
                cx="50" 
                cy="50" 
                r="40" 
                stroke="#f5df65" 
                strokeWidth="8" fill="none" 
                strokeDasharray="83.78 167.55" 
                strokeDashoffset="0" 
                strokeLinecap="round" 
                />
                <Circle 
                cx="50" 
                cy="50" 
                r="40" 
                stroke="#f66063" 
                strokeWidth="8" 
                fill="none" 
                strokeDasharray="83.78 167.55" 
                strokeDashoffset="-83.78" 
                strokeLinecap="round" 
                />
                <Circle 
                cx="50" 
                cy="50" 
                r="40" 
                stroke="#64df91" 
                strokeWidth="8" 
                fill="none" 
                strokeDasharray="83.78 167.55" 
                strokeDashoffset="-167.55" 
                strokeLinecap="round" 
                />
              </Svg>
              <Text style={styles.circleChartText}>53</Text>
            </View>
          </Pressable>

          <Pressable
            onPress={goToDetails}
            style={({ pressed }) => [
              styles.healthCard,
              styles.healthCardGreen,
              { opacity: pressed ? 0.9 : 1 },
            ]}
          >
            <View style={styles.healthCardHeader}>
              <Text style={styles.healthCardTitle}>Niveles de colesterol</Text>
              <SymbolView
                name={{ android: "stethoscope", ios: "stethoscope" }}
                size={14}
                tintColor="#4A4642"
                resizeMode="scaleAspectFit"
              />
            </View>
            <View style={styles.lineChartWrapper}>
              <LineChart
                data={lineData}
                data2={lineData2}
                color1="#FFFFFF"
                color2="#FFFFFF70"
                thickness={2.5}
                curved
                hideDataPoints
                hideRules
                hideYAxisText
                hideAxesAndRules
                width={125}
                height={120}
                initialSpacing={0}
                endSpacing={0}
                adjustToWidth
              />
            </View>
          </Pressable>

          <Pressable
            onPress={goToDetails}
            style={({ pressed }) => [
              styles.healthCard,
              styles.healthCardPurple,
              { opacity: pressed ? 0.9 : 1 },
            ]}
          >
            <View style={styles.healthCardHeader}>
              <Text style={styles.healthCardTitle}>Triglicéridos</Text>
              <SymbolView
                name={{ android: "stethoscope", ios: "stethoscope" }}
                size={14}
                tintColor="#4A4642"
                resizeMode="scaleAspectFit"
              />
            </View>
            
            <View style={styles.barChartWrapper}>
              <BarChart
                data={barData}
                barWidth={7}
                barBorderRadius={10}
                frontColor={"#FFFFFF"}
                hideRules
                hideYAxisText
                hideAxesAndRules
                height={145}
                width={135}
                initialSpacing={2}
                spacing={10}
              />
            </View>
          </Pressable>
        </ScrollView>
      </ScrollView>

      <View style={styles.bottomSection}>
        <Text style={styles.sectionTitle}>Agenda una Cita</Text>
        <View style={styles.actionsRow}>
          <Pressable
            onPress={goToEmergency}
            style={({ pressed }) => [
              styles.actionCard,
              styles.actionCardWhite,
              { opacity: pressed ? 0.9 : 1 },
            ]}
          >
            <Text style={styles.actionCardTitle}>Cita de emergencia</Text>
            <Image
              resizeMode="contain"
              source={require("@/assets/images/emecall.png")}
              style={styles.actionCardImage}
            />
          </Pressable>

          <Pressable
            onPress={goToSchedule}
            style={({ pressed }) => [
              styles.actionCard,
              styles.actionCardPurple,
              { opacity: pressed ? 0.91 : 1 },
            ]}
          >
            <Text style={[styles.actionCardTitle, styles.textWhite]}>
              Cita médica
            </Text>
            <Image
              resizeMode="contain"
              source={require("@/assets/images/call.png")}
              style={styles.actionCardImage}
            />
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 40,
  },

  logo: {
    width: 65,
    height: 34,
    marginBottom: 20,
    marginTop: 8,
  },

  sectionTitle: {
    fontSize: 20,
    fontWeight: "600",
    color: "#000000",
    marginBottom: 14,
  },

  carouselContent: {
    gap: 10,
    paddingHorizontal: 20,
    marginBottom: 20,
  },
  carouselContainer: {
    marginHorizontal: -20,
  },
  healthCard: {
    width: 165,
    height: 220,
    borderRadius: 14,
    padding: 12,
  },
  healthCardBeige: {
    backgroundColor: "#F5E9DB",
  },
  healthCardGreen: {
    backgroundColor: "#CEEBA1",
  },
  healthCardPurple: {
    backgroundColor: "#B1A2F3",
  },

  healthCardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 8,
  },
  healthCardTitle: {
    fontSize: 11,
    fontWeight: "600",
    color: "#00000070",
    lineHeight: 14,
    flex: 1,
    paddingRight: 4,
  },
  textWhite: {
    color: "#FFFFFF",
  },

  chartPlaceholder: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  circleChartText: {
    position: "absolute",
    fontSize: 18,
    fontWeight: "700",
    color: "#4A4642",
  },

  lineChartWrapper: {
    flex: 1,
    justifyContent: "center",
    marginLeft: -10,
  },

  barChartWrapper: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    marginLeft: -10,
  },

  bottomSection: {
    paddingHorizontal: 20,
    paddingTop: 8,
  },
  actionCardImage: {
    width: "100%",
    height: 120,
    marginTop: 8,
    resizeMode: "contain",
  },
  actionsRow: {
    flexDirection: "row",
    gap: 12,
  },
  actionCard: {
    flex: 1,
    borderRadius: 14,
    padding: 14,
    height: 180,
    justifyContent: "space-between",
  },
  actionCardWhite: {
    backgroundColor: "#F8F8F8",
  },
  actionCardPurple: {
    backgroundColor: "#7355F7",
  },
  actionCardTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#616161",
    lineHeight: 20,
  },
});