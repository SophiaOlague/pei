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
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
} from "@/lib/auth-errors";
import { setPendingVerificationEmail } from "@/lib/pending-verification";

export default function RegisterScreen() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const handleRegister = async () => {
    if (loading) {
      return;
    }
    setErrorMessage("");
    const trimmedName = name.trim();
    const trimmedEmail = email.trim();

    if (!(trimmedName && trimmedEmail && password && confirmPassword)) {
      setErrorMessage("Completa todos los campos para continuar.");
      return;
    }

    if (!isValidEmail(trimmedEmail)) {
      setErrorMessage("Ingresa un correo electrónico válido.");
      return;
    }

    if (
      password.length < PASSWORD_MIN_LENGTH ||
      password.length > PASSWORD_MAX_LENGTH
    ) {
      setErrorMessage(
        `La contraseña debe tener entre ${PASSWORD_MIN_LENGTH} y ${PASSWORD_MAX_LENGTH} caracteres.`
      );
      return;
    }

    if (password !== confirmPassword) {
      setErrorMessage("Las contraseñas no coinciden.");
      return;
    }

    setLoading(true);
    try {
      // La verificación es obligatoria: el registro no abre sesión. Con un correo ya registrado el backend
      // responde igual (no revela la cuenta), así que ambos casos van a la pantalla de verificación.
      const { error } = await authClient.signUp.email({
        email: trimmedEmail,
        name: trimmedName,
        password,
      });
      if (error) {
        setErrorMessage(authErrorMessage(classifyAuthError(error)));
        return;
      }
      setPassword("");
      setConfirmPassword("");
      setPendingVerificationEmail(trimmedEmail);
      router.replace("/verificar-correo");
    } catch {
      setErrorMessage(authErrorMessage("network"));
    } finally {
      setLoading(false);
    }
  };

  const goToLogin = () => {
    router.push("/login");
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView behavior="padding" style={styles.keyboardView}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Image
            resizeMode="contain"
            source={require("@/assets/images/logoblack.png")}
            style={styles.logo}
          />

          <Text style={styles.subtitle}>Crea tu cuenta</Text>
          <Text style={styles.description}>
            Únete a PEI y toma control de tu salud
          </Text>

          <View style={styles.inputContainer}>
            <Text style={styles.inputLabel}>Nombre(s)</Text>
            <TextInput
              autoCapitalize="words"
              onChangeText={setName}
              placeholder="Ingresa tus nombres"
              placeholderTextColor="#9CA3AF"
              style={styles.input}
              value={name}
            />
          </View>

          <View style={styles.inputContainer}>
            <Text style={styles.inputLabel}>E-mail</Text>
            <TextInput
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              onChangeText={setEmail}
              placeholder="Ingresa tu email"
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
                placeholder="Crea una contraseña"
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
                  resizeMode="scaleAspectFit"
                  size={24}
                  tintColor="#6B7280"
                />
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.inputContainer}>
            <Text style={styles.inputLabel}>Confirmar Contraseña</Text>
            <View style={styles.passwordContainer}>
              <TextInput
                onChangeText={setConfirmPassword}
                placeholder="Confirma tu contraseña"
                placeholderTextColor="#9CA3AF"
                secureTextEntry={!showConfirmPassword}
                style={[styles.input, styles.passwordInput]}
                value={confirmPassword}
              />
              <TouchableOpacity
                activeOpacity={0.7}
                onPress={() => setShowConfirmPassword(!showConfirmPassword)}
                style={styles.eyeButton}
              >
                <SymbolView
                  name={{
                    android: showConfirmPassword
                      ? "visibility"
                      : "visibility_off",
                    ios: showConfirmPassword ? "eye" : "eye.slash",
                  }}
                  resizeMode="scaleAspectFit"
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
            onPress={handleRegister}
            style={({ pressed }) => [
              styles.registerButton,
              { transform: [{ scale: pressed ? 0.97 : 1 }] },
              loading && styles.registerButtonDisabled,
            ]}
          >
            {loading ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator color="#FFFFFF" size="small" />
                <Text style={styles.loadingText}>Creando cuenta...</Text>
              </View>
            ) : (
              <Text style={styles.registerButtonText}>Crear cuenta</Text>
            )}
          </Pressable>

          <View style={styles.loginContainer}>
            <Text style={styles.loginText}>¿Ya tienes una cuenta? </Text>
            <Pressable onPress={goToLogin}>
              <Text style={styles.loginLinkText}>Iniciar Sesión</Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  description: {
    color: "#6B7280",
    fontSize: 12,
    marginBottom: 24,
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
    color: "#1F2937",
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
    marginBottom: 10,
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
  loadingText: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "600",
  },
  loginContainer: {
    flexDirection: "row",
    justifyContent: "center",
    marginTop: 20,
  },
  loginLink: {
    paddingVertical: 4,
  },
  loginLinkText: {
    color: "#6B7280",
    fontSize: 15,
    fontWeight: "600",
    textDecorationLine: "underline",
  },
  loginText: {
    color: "#6B7280",
    fontSize: 15,
  },
  logo: {
    height: 33.82,
    marginBottom: 15,
    marginTop: 10,
    width: 65,
  },
  passwordContainer: {
    position: "relative",
  },
  passwordInput: {
    paddingRight: 50,
  },
  registerButton: {
    alignItems: "center",
    backgroundColor: "#7355F7",
    borderRadius: 50,
    marginTop: 10,
    paddingVertical: 16,
    width: "100%",
  },
  registerButtonDisabled: { opacity: 0.7 },
  registerButtonText: {
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
  subtitle: {
    color: "#1F2937",
    fontSize: 20,
    fontWeight: "600",
    marginBottom: 4,
  },
});
