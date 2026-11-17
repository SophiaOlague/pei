import { router, Stack } from "expo-router";
import { SymbolView } from "expo-symbols";
import { TouchableOpacity } from "react-native";
import { Text } from "react-native";

export default function RootLayout() {
  return (
    <Stack>
      <Stack.Screen
        name="options"
        options={{
          contentStyle: {
            backgroundColor: "#ffffff",
          },
          headerShown: false,
        }}
      />
      <Stack.Screen
        name="profile"
        options={{
          contentStyle: {
            backgroundColor: "#ffffff",
          },
          headerShown: false,
        }}
      />
      <Stack.Screen
        name="advconfig"
        options={{
          contentStyle: {
            backgroundColor: "#ffffff",
          },
          headerShadowVisible: false,
          headerStyle: {
            backgroundColor: "#FFFFFF",
          },
          headerTintColor: "#000000",
          headerTitle: () => (
            <Text style={{ textAlign: "left", fontWeight: "bold", fontSize: 20, color: "#000000" }}>
              {"CONFIGURACIÓN AVANZADA"}
            </Text>
          ),
        }}
      />
      <Stack.Screen
        name="metpagos"
        options={{
          contentStyle: {
            backgroundColor: "#ffffff",
          },
          headerRight: () => (
            <TouchableOpacity
              onPress={() => router.push("/(app)/addcard")}
              style={{ paddingHorizontal: 16 }}
            >
              <SymbolView
                name={{ android: "add", ios: "plus" }}
                resizeMode="scaleAspectFit"
                size={22}
                tintColor="#2F2F2F"
              />
            </TouchableOpacity>
          ),
          headerShadowVisible: false,
          headerStyle: {
            backgroundColor: "#FFFFFF",
          },
          headerTintColor: "#000000",
          title: "MÉTODOS DE PAGO",
        }}
      />
    </Stack>
  );
}
