import { Stack } from "expo-router/stack";

export default function RootLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen
        name="index"
        options={{
          contentStyle: {
            backgroundColor: "#7355F7",
          },
        }}
      />
      <Stack.Screen
        name="login"
        options={{
          contentStyle: {
            backgroundColor: "#7355F7",
          },
        }}
      />
      <Stack.Screen
        name="register"
        options={{
          contentStyle: {
            backgroundColor: "#ffffff",
          },
        }}
      />

      <Stack.Screen
        name="verificar-correo"
        options={{
          contentStyle: {
            backgroundColor: "#ffffff",
          },
        }}
      />
    </Stack>
  );
}
