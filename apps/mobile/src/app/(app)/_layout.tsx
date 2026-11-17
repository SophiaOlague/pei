import { Stack } from "expo-router";
import { RegistrationGate } from "@/components/registration/registration-gate";
import { CartProvider } from "./cartcontext";

export default function RootLayout() {
  return (
    <RegistrationGate>
      <CartProvider>
        <Stack>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen
            name="addcard"
            options={{
              contentStyle: { backgroundColor: "#FFFFFF" },
              headerShown: false,
              presentation: "formSheet",
              sheetAllowedDetents: [0.5, 0.5],
              sheetCornerRadius: 28,
              sheetGrabberVisible: true,
              sheetInitialDetentIndex: 0,
            }}
          />
          <Stack.Screen
            name="editprofile"
            options={{
              contentStyle: {
                backgroundColor: "#ffffff",
              },
              headerShadowVisible: false,
              headerStyle: {
                backgroundColor: "#FFFFFF",
              },
              headerTintColor: "#000000",
              title: "EDITAR INFORMACIÓN",
            }}
          />
          <Stack.Screen
            name="verificacionidentidad"
            options={{
              contentStyle: {
                backgroundColor: "#ffffff",
              },
              headerShadowVisible: false,
              headerStyle: {
                backgroundColor: "#FFFFFF",
              },
              headerTintColor: "#000000",
              title: "VERIFICACIÓN DE IDENTIDAD",
            }}
          />
          <Stack.Screen
            name="listrecipes"
            options={{
              contentStyle: {
                backgroundColor: "#ffffff",
              },
              headerShadowVisible: false,
              headerStyle: {
                backgroundColor: "#FFFFFF",
              },
              headerTintColor: "#000000",
              title: "MIS RECETAS",
            }}
          />
          <Stack.Screen
            name="seleccioncita"
            options={{
              contentStyle: {
                backgroundColor: "#ffffff",
              },
              headerShadowVisible: false,
              headerStyle: {
                backgroundColor: "#FFFFFF",
              },
              headerTintColor: "#000000",
              title: "SELECCIONA UN MÉDICO",
            }}
          />
          <Stack.Screen
            name="seleccionfecha"
            options={{
              contentStyle: {
                backgroundColor: "#7355F7",
              },
              headerShadowVisible: false,
              headerStyle: {
                backgroundColor: "#7355F7",
              },
              headerTintColor: "#FFFFFF",
              title: "SELECCIONA UNA FECHA",
            }}
          />
          <Stack.Screen
            name="pago"
            options={{
              contentStyle: {
                backgroundColor: "#ffffff",
              },
              headerShadowVisible: false,
              headerStyle: {
                backgroundColor: "#ffffff",
              },
              headerTintColor: "#000000",
              title: "DATOS DE TU COMPRA",
            }}
          />
          <Stack.Screen
            name="resultadoslab"
            options={{
              contentStyle: {
                backgroundColor: "#ffffff",
              },
              headerShadowVisible: false,
              headerStyle: {
                backgroundColor: "#FFFFFF",
              },
              headerTintColor: "#000000",
              title: "CARGAR MIS RESULTADOS",
            }}
          />
          <Stack.Screen
            name="logout"
            options={{
              contentStyle: { backgroundColor: "#FFFFFF" },
              presentation: "formSheet",
              headerShown: false,
              sheetGrabberVisible: true,
              sheetAllowedDetents: [0.4, 0.4],
              sheetInitialDetentIndex: 0,
              sheetCornerRadius: 28,
            }}
          />
          <Stack.Screen
            name="deleteaccount"
            options={{
              contentStyle: { backgroundColor: "#FFFFFF" },
              presentation: "formSheet",
              headerShown: false,
              sheetGrabberVisible: true,
              sheetAllowedDetents: [0.7, 0.7],
              sheetInitialDetentIndex: 0,
              sheetCornerRadius: 28,
            }}
          />
          <Stack.Screen
            name="fastdate"
            options={{
              contentStyle: {
                backgroundColor: "#7355F7",
              },
              headerShadowVisible: false,
              headerStyle: {
                backgroundColor: "#7355F7",
              },
              headerTintColor: "#FFFFFF",
              title: "CITA DE EMERGENCIA",
            }}
          />
          <Stack.Screen
            name="fastdatetime"
            options={{
              contentStyle: {
                backgroundColor: "#7355F7",
              },
              headerShadowVisible: false,
              headerStyle: {
                backgroundColor: "#7355F7",
              },
              headerTintColor: "#FFFFFF",
              title: "CITA DE EMERGENCIA",
            }}
          />
          <Stack.Screen
            name="displayresults"
            options={{
              contentStyle: {
                backgroundColor: "#ffffff",
              },
              headerShadowVisible: false,
              headerStyle: {
                backgroundColor: "#FFFFFF",
              },
              headerTintColor: "#000000",
              title: "MIS RESULTADOS",
            }}
          />
          <Stack.Screen
            name="detailsrange"
            options={{
              contentStyle: {
                backgroundColor: "#FFFFFF",
              },
              headerShadowVisible: false,
              headerStyle: {
                backgroundColor: "#FFFFFF",
              },
              headerTintColor: "#000000",
              title: "DETALLES DE RANGO",
            }}
          />
          <Stack.Screen
            name="agendadate"
            options={{
              contentStyle: {
                backgroundColor: "#FFFFFF",
              },
              headerShadowVisible: false,
              headerStyle: {
                backgroundColor: "#FFFFFF",
              },
              headerTintColor: "#000000",
              title: "AGENDA DE CITAS",
            }}
          />
          <Stack.Screen
            name="canceldate"
            options={{
              contentStyle: { backgroundColor: "#FFFFFF" },
              headerShown: false,
              presentation: "formSheet",
              sheetAllowedDetents: [0.5, 0.5],
              sheetCornerRadius: 28,
              sheetGrabberVisible: true,
              sheetInitialDetentIndex: 0,
            }}
          />
          <Stack.Screen
            name="joincall"
            options={{
              contentStyle: {
                backgroundColor: "#FFFFFF",
              },
              headerShadowVisible: false,
              headerStyle: {
                backgroundColor: "#FFFFFF",
              },
              headerTintColor: "#000000",
              title: "VIDEOLLAMADA",
            }}
          />
          <Stack.Screen
            name="califcita"
            options={{
              contentStyle: {
                backgroundColor: "#ffffff",
              },
              headerShadowVisible: false,
              headerStyle: {
                backgroundColor: "#FFFFFF",
              },
              headerTintColor: "#000000",
              title: "CALIFICA TU EXPERIENCIA",
            }}
          />
          <Stack.Screen
            name="detailscall"
            options={{
              contentStyle: { backgroundColor: "#FFFFFF" },
              headerShown: false,
              presentation: "formSheet",
              sheetAllowedDetents: [0.6, 0.6],
              sheetCornerRadius: 28,
              sheetGrabberVisible: true,
              sheetInitialDetentIndex: 0,
            }}
          />
          <Stack.Screen
            name="recipe"
            options={{
              contentStyle: {
                backgroundColor: "#ffffff",
              },
              headerShadowVisible: false,
              headerStyle: {
                backgroundColor: "#FFFFFF",
              },
              headerTintColor: "#000000",
              title: "RECETA GENERADA",
            }}
          />
          <Stack.Screen
            name="recibopago"
            options={{
              contentStyle: {
                backgroundColor: "#ffffff",
              },
              headerShadowVisible: false,
              headerStyle: {
                backgroundColor: "#FFFFFF",
              },
              headerTintColor: "#000000",
              title: "DATOS DE TU COMPRA",
            }}
          />
          <Stack.Screen
            name="verperfil"
            options={{
              contentStyle: {
                backgroundColor: "#ffffff",
              },
              headerShadowVisible: false,
              headerStyle: {
                backgroundColor: "#FFFFFF",
              },
              headerTintColor: "#000000",
              title: "VER PERFIL",
            }}
          />
          <Stack.Screen
            name="cartscreen"
            options={{
              contentStyle: {
                backgroundColor: "#ffffff",
              },
              headerShadowVisible: false,
              headerStyle: {
                backgroundColor: "#FFFFFF",
              },
              headerTintColor: "#000000",
              title: "MI CARRITO",
            }}
          />
          <Stack.Screen
            name="call"
            options={{
              headerShown: false,
            }}
          />
        </Stack>
      </CartProvider>
    </RegistrationGate>
  );
}
