import { router } from "expo-router";
import { SymbolView } from "expo-symbols";
import { useState } from "react";
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { authClient } from "@/lib/auth-client";
import {
  authErrorMessage,
  classifyAuthError,
  isValidEmail,
} from "@/lib/auth-errors";
import { setPendingVerificationEmail } from "@/lib/pending-verification";

export default function LoginScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const handleLogin = async () => {
    if (loading) {
      return;
    }
    setErrorMessage("");
    const trimmedEmail = email.trim();

    if (!(trimmedEmail && password)) {
      setErrorMessage("Completa todos los campos para continuar.");
      return;
    }

    if (!isValidEmail(trimmedEmail)) {
      setErrorMessage("Ingresa un correo electrónico válido.");
      return;
    }

    setLoading(true);
    try {
      // Sin callbackURL: el esquema de la app aún no está entre los orígenes de confianza del backend.
      const { error } = await authClient.signIn.email({
        email: trimmedEmail,
        password,
      });
      if (!error) {
        // La navegación la hace el Stack.Protected de _layout cuando get-session confirma la sesión.
        return;
      }
      const kind = classifyAuthError(error);
      if (kind === "email_not_verified") {
        // El backend ya reenvió el enlace (sendOnSignIn).
        setPendingVerificationEmail(trimmedEmail);
        router.push("/verificar-correo");
        return;
      }
      setErrorMessage(authErrorMessage(kind));
    } catch {
      setErrorMessage(authErrorMessage("network"));
    } finally {
      setLoading(false);
    }
  };

  const goToRegister = () => {
    router.push("/register");
  };

  return (
    <View style={styles.mainContainer}>
      <KeyboardAvoidingView behavior="padding" style={styles.keyboardView}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.backgroundLayer}>
            <Image
              resizeMode="cover"
              source={require("@/assets/images/noise.png")}
              style={styles.overlay}
            />
            <Image
              resizeMode="contain"
              source={require("@/assets/images/back1.png")}
              style={styles.backElement1}
            />
            <Image
              resizeMode="contain"
              source={require("@/assets/images/back2.png")}
              style={styles.backElement2}
            />
            <Image
              resizeMode="contain"
              source={require("@/assets/images/star.png")}
              style={styles.backElement3}
            />
            <Image
              resizeMode="contain"
              source={require("@/assets/images/star2.png")}
              style={styles.backElement4}
            />
          </View>

          <SafeAreaView edges={["top"]} style={styles.topSafeArea}>
            <View style={styles.topContent}>
              <Image
                resizeMode="contain"
                source={require("@/assets/images/logo.png")}
                style={styles.logo}
              />
              <View style={styles.subtitleContainer}>
                <Text style={styles.subtitle}>Tu salud.</Text>
                <Text style={styles.subtitle}>Tu protección.</Text>
                <Text style={styles.subtitle}>Nuestra prioridad.</Text>
              </View>
            </View>
          </SafeAreaView>

          <View style={styles.whiteCard}>
            <Text style={styles.welcomeTitle}>Bienvenido de nuevo</Text>
            <Text style={styles.welcomeSubtitle}>
              Inicia sesión en tu cuenta
            </Text>

            <View style={styles.inputContainer}>
              <Text style={styles.inputLabel}>Correo</Text>
              <TextInput
                autoCapitalize="none"
                autoComplete="email"
                keyboardType="email-address"
                onChangeText={setEmail}
                placeholder="Introduce tu correo"
                placeholderTextColor="#9CA3AF"
                style={styles.input}
                value={email}
              />
            </View>

            <View style={styles.inputContainer}>
              <Text style={styles.inputLabel}>Contraseña</Text>
              <View style={styles.passwordContainer}>
                <TextInput
                  onChangeText={setPassword}
                  placeholder="Introduce tu contraseña"
                  placeholderTextColor="#9CA3AF"
                  secureTextEntry={!showPassword}
                  style={[styles.input, styles.passwordInput]}
                  value={password}
                />
                <TouchableOpacity
                  activeOpacity={0.7}
                  onPress={() => setShowPassword(!showPassword)}
                  style={styles.eyeButton}
                >
                  <SymbolView
                    name={{
                      android: showPassword ? "visibility" : "visibility_off",
                      ios: showPassword ? "eye" : "eye.slash",
                    }}
                    size={24}
                    tintColor="#6B7280"
                  />
                </TouchableOpacity>
              </View>
            </View>

            {errorMessage ? (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>{errorMessage}</Text>
              </View>
            ) : null}

            <Pressable
              disabled={loading}
              onPress={handleLogin}
              style={({ pressed }) => [
                styles.loginButton,
                { transform: [{ scale: pressed ? 0.97 : 1 }] },
                loading && styles.loginButtonDisabled,
              ]}
            >
              {loading ? (
                <View style={styles.loadingContainer}>
                  <ActivityIndicator color="#FFFFFF" size="small" />
                  <Text style={styles.loginButtonText}>Iniciando...</Text>
                </View>
              ) : (
                <Text style={styles.loginButtonText}>Iniciar sesión</Text>
              )}
            </Pressable>

            <View style={styles.registerContainer}>
              <Text style={styles.registerText}>¿No tienes una cuenta?</Text>
              <Pressable
                onPress={goToRegister}
                style={({ pressed }) => [
                  styles.signUpButton,
                  { transform: [{ scale: pressed ? 0.97 : 1 }] },
                ]}
              >
                <Text style={styles.signUpButtonText}>Registrarme</Text>
              </Pressable>
            </View>

            <Text style={styles.securityText}>
              Tu información es 100% segura y confidencial
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  backElement1: {
    position: "absolute",
    right: 10,
    top: 40,
  },
  backElement2: {
    left: -20,
    position: "absolute",
    top: 215,
  },
  backElement3: {
    left: 308,
    position: "absolute",
    top: 200,
  },
  backElement4: {
    left: 140,
    position: "absolute",
    top: 110,
  },
  backgroundLayer: {
    bottom: 0,
    left: 0,
    position: "absolute",
    right: 0,
    top: 0,
    zIndex: 0,
  },
  errorBox: {
    backgroundColor: "#FEE2E2",
    borderColor: "#FCA5A5",
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
  eyeButton: {
    position: "absolute",
    right: 16,
    top: "50%",
    transform: [{ translateY: -12 }],
  },
  input: {
    backgroundColor: "transparent",
    borderColor: "#C9C9C9",
    borderRadius: 50,
    borderWidth: 1,
    color: "#000000",
    fontSize: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  inputContainer: {
    marginBottom: 20,
  },
  inputLabel: {
    color: "#374151",
    fontSize: 12,
    fontWeight: "600",
    marginBottom: 6,
    paddingHorizontal: 16,
  },
  keyboardView: {
    flex: 1,
  },
  loadingContainer: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
  },
  loginButton: {
    alignItems: "center",
    backgroundColor: "#7355F7",
    borderRadius: 50,
    elevation: 0,
    marginTop: 8,
    paddingVertical: 16,
    width: "100%",
  },
  loginButtonDisabled: { opacity: 0.7 },
  loginButtonText: {
    color: "#ffffff",
    fontSize: 18,
    fontWeight: "600",
  },
  logo: {
    height: 33.82,
    marginBottom: 10,
    marginLeft: 2,
    marginTop: 10,
    width: 65,
  },
  mainContainer: {
    backgroundColor: "#7355F7",
    flex: 1,
  },
  overlay: {
    bottom: 0,
    height: "100%",
    left: 0,
    position: "absolute",
    right: 0,
    top: 0,
    width: "100%",
  },
  passwordContainer: {
    position: "relative",
  },
  passwordInput: {
    paddingRight: 50,
  },
  registerContainer: {
    alignItems: "center",
    marginBottom: 16,
    marginTop: 24,
    width: "100%",
  },
  registerText: {
    color: "#6B7280",
    fontSize: 15,
    marginBottom: 8,
  },
  scrollContent: {
    flexGrow: 1,
    position: "relative",
  },
  securityText: {
    color: "#9CA3AF",
    fontSize: 13,
    marginTop: 4,
    textAlign: "center",
  },
  signUpButton: {
    alignItems: "center",
    backgroundColor: "transparent",
    borderColor: "#7355F7",
    borderRadius: 50,
    borderWidth: 1,
    elevation: 0,
    justifyContent: "center",
    paddingVertical: 12,
    width: "100%",
  },
  signUpButtonText: {
    color: "#7355F7",
    fontSize: 18,
    fontWeight: "600",
  },
  subtitle: {
    color: "#FFFFFF",
    fontSize: 32,
    fontWeight: "600",
    lineHeight: 40,
  },
  subtitleContainer: { marginBottom: 12 },
  topContent: {
    paddingBottom: 10,
    paddingHorizontal: 24,
    paddingTop: 20,
  },
  topSafeArea: { backgroundColor: "transparent", zIndex: 1 },
  welcomeSubtitle: {
    color: "#6B7280",
    fontSize: 12,
    lineHeight: 20,
    marginBottom: 24,
  },
  welcomeTitle: {
    color: "#1F2937",
    fontSize: 20,
    fontWeight: "700",
    lineHeight: 20,
    marginBottom: 4,
  },
  whiteCard: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    flex: 1,
    marginTop: 10,
    paddingBottom: 20,
    paddingHorizontal: 24,
    paddingTop: 28,
    zIndex: 2,
  },
});
