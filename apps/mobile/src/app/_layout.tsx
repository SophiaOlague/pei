import { DarkTheme, DefaultTheme, ThemeProvider } from "expo-router";
import { Stack } from "expo-router/stack";
import { useState } from "react";
import { ActivityIndicator, useColorScheme } from "react-native";

import { AnimatedSplashOverlay } from "@/components/animated-icon";
import { authClient } from "@/lib/auth-client";

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const { data: session, isPending } = authClient.useSession();
  // Better Auth vuelve a consultar get-session cada vez que la app pasa a primer plano y, mientras no hay
  // sesión, marca isPending de nuevo. Solo la primera consulta bloquea la navegación: en las siguientes, los
  // guards usan la última sesión confirmada y las pantallas (con sus formularios) no se desmontan.
  const [initialSessionResolved, setInitialSessionResolved] = useState(false);
  if (!(initialSessionResolved || isPending)) {
    setInitialSessionResolved(true);
  }

  if (!initialSessionResolved) {
    return <ActivityIndicator />;
  }

  return (
    <ThemeProvider value={colorScheme === "dark" ? DarkTheme : DefaultTheme}>
      <AnimatedSplashOverlay />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Protected guard={session === null}>
          <Stack.Screen name="(auth)" />
        </Stack.Protected>

        <Stack.Protected guard={session !== null}>
          <Stack.Screen name="(app)" />
        </Stack.Protected>
      </Stack>
    </ThemeProvider>
  );
}
