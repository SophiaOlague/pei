import { router } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  type PressableStateCallbackType,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { authClient } from "@/lib/auth-client";
import { authErrorMessage, classifyAuthError } from "@/lib/auth-errors";
import { getPendingVerificationEmail } from "@/lib/pending-verification";

// Tras el registro o un inicio de sesión con el correo sin verificar (403 EMAIL_NOT_VERIFIED).
// El enlace del correo se abre en el navegador; después la persona vuelve e inicia sesión aquí.
export default function VerifyEmailScreen() {
  const [email] = useState(getPendingVerificationEmail);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [infoMessage, setInfoMessage] = useState("");

  const handleResend = async () => {
    if (loading || !email) {
      return;
    }
    setErrorMessage("");
    setInfoMessage("");
    setLoading(true);
    try {
      // Sin callbackURL: ver INTEGRACION.md («Enlaces profundos»).
      const { error } = await authClient.sendVerificationEmail({ email });
      if (error) {
        setErrorMessage(authErrorMessage(classifyAuthError(error)));
        return;
      }
      // Respuesta idéntica exista o no la cuenta.
      setInfoMessage(
        "Si tu cuenta está pendiente de verificar, te enviamos un nuevo enlace."
      );
    } catch {
      setErrorMessage(authErrorMessage("network"));
    } finally {
      setLoading(false);
    }
  };

  const goToLogin = () => {
    router.replace("/login");
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <Image
          resizeMode="contain"
          source={require("@/assets/images/logoblack.png")}
          style={styles.logo}
        />

        <Text style={styles.subtitle}>Revisa tu correo</Text>
        {email ? (
          <Text style={styles.description}>
            Enviamos un enlace de verificación a{" "}
            <Text style={styles.email}>{email}</Text>. Ábrelo para activar tu
            cuenta y después inicia sesión.
          </Text>
        ) : (
          <Text style={styles.description}>
            Abre el enlace de verificación que enviamos a tu correo y después
            inicia sesión.
          </Text>
        )}
        <Text style={styles.hint}>
          El enlace vence en una hora. Si no lo encuentras, revisa la carpeta de
          spam.
        </Text>

        {errorMessage ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{errorMessage}</Text>
          </View>
        ) : null}

        {infoMessage ? (
          <View style={styles.infoBox}>
            <Text style={styles.infoText}>{infoMessage}</Text>
          </View>
        ) : null}

        <Pressable onPress={goToLogin} style={primaryButtonStyle}>
          <Text style={styles.primaryButtonText}>Ir a iniciar sesión</Text>
        </Pressable>

        {email ? (
          <Pressable
            accessibilityState={{ disabled: loading }}
            disabled={loading}
            onPress={handleResend}
            style={
              loading ? secondaryButtonDisabledStyle : secondaryButtonStyle
            }
          >
            {loading ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator color="#7355F7" size="small" />
                <Text style={styles.secondaryButtonText}>Enviando...</Text>
              </View>
            ) : (
              <Text style={styles.secondaryButtonText}>Reenviar enlace</Text>
            )}
          </Pressable>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

// Misma escala al presionar que el resto de botones de la app.
const pressScale = (pressed: boolean) => ({
  transform: [{ scale: pressed ? 0.97 : 1 }],
});

function primaryButtonStyle({ pressed }: PressableStateCallbackType) {
  return [styles.primaryButton, pressScale(pressed)];
}

function secondaryButtonStyle({ pressed }: PressableStateCallbackType) {
  return [styles.secondaryButton, pressScale(pressed)];
}

function secondaryButtonDisabledStyle({ pressed }: PressableStateCallbackType) {
  return [styles.secondaryButton, pressScale(pressed), styles.buttonDisabled];
}

const styles = StyleSheet.create({
  buttonDisabled: { opacity: 0.7 },
  container: {
    flex: 1,
  },
  description: {
    color: "#374151",
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 12,
  },
  email: {
    fontWeight: "600",
  },
  errorBox: {
    backgroundColor: "#FEE2E2",
    borderColor: "#fe5c5c",
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 15,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  errorText: {
    color: "#B91C1C",
    fontSize: 14,
    textAlign: "center",
  },
  hint: {
    color: "#6B7280",
    fontSize: 12,
    marginBottom: 24,
  },
  infoBox: {
    backgroundColor: "#E6F9F9",
    borderColor: "#0BC0BE",
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 15,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  infoText: {
    color: "#0F5F5E",
    fontSize: 14,
    textAlign: "center",
  },
  loadingContainer: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
  },
  logo: {
    height: 33.82,
    marginBottom: 15,
    marginTop: 10,
    width: 65,
  },
  primaryButton: {
    alignItems: "center",
    backgroundColor: "#7355F7",
    borderRadius: 50,
    marginTop: 10,
    paddingVertical: 16,
    width: "100%",
  },
  primaryButtonText: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "600",
  },
  scrollContent: {
    flexGrow: 1,
    paddingBottom: 30,
    paddingHorizontal: 24,
    paddingTop: 10,
  },
  secondaryButton: {
    alignItems: "center",
    backgroundColor: "transparent",
    borderColor: "#7355F7",
    borderRadius: 50,
    borderWidth: 1,
    marginTop: 12,
    paddingVertical: 12,
    width: "100%",
  },
  secondaryButtonText: {
    color: "#7355F7",
    fontSize: 18,
    fontWeight: "600",
  },
  subtitle: {
    color: "#1F2937",
    fontSize: 20,
    fontWeight: "600",
    marginBottom: 12,
  },
});
