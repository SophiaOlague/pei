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
            name="detallecita"
            options={{
              contentStyle: {
                backgroundColor: "#ffffff",
              },
              headerShadowVisible: false,
              headerStyle: {
                backgroundColor: "#ffffff",
              },
              headerTintColor: "#000000",
              title: "DETALLE DE LA CITA",
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
              headerShown: false,
              presentation: "formSheet",
              sheetAllowedDetents: [0.4, 0.4],
              sheetCornerRadius: 28,
              sheetGrabberVisible: true,
              sheetInitialDetentIndex: 0,
            }}
          />
          <Stack.Screen
            name="deleteaccount"
            options={{
              contentStyle: { backgroundColor: "#FFFFFF" },
              headerShown: false,
              presentation: "formSheet",
              sheetAllowedDetents: [0.7, 0.7],
              sheetCornerRadius: 28,
              sheetGrabberVisible: true,
              sheetInitialDetentIndex: 0,
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
              title: "VIDEOCONSULTA",
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
        </Stack>
      </CartProvider>
    </RegistrationGate>
  );
}
