import { type ReactNode, useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { CompleteRegistration } from "@/components/registration/complete-registration";
import {
  ApiError,
  getRegistrationStatus,
  pendingRegistrationStep,
  type RegistrationStatus,
} from "@/lib/api";
import { authClient } from "@/lib/auth-client";

type GateState =
  | { kind: "loading" }
  | { kind: "ready"; status: RegistrationStatus }
  | { kind: "error"; message: string; signOut: boolean };

// Con sesión, nada de la app se muestra hasta que el backend confirma que el perfil y los legales están
// completos (GET /me/registration-status). Es solo interfaz: la autorización real la hace el backend.
// El estado vive en este componente, que se desmonta al cerrar sesión: no pasa de una cuenta a otra.
export function RegistrationGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<GateState>({ kind: "loading" });
  const [reloadKey, setReloadKey] = useState(0);

  // biome-ignore lint/correctness/useExhaustiveDependencies: reloadKey es el disparador de la recarga
  useEffect(() => {
    let active = true;
    getRegistrationStatus()
      .then((status) => {
        if (active) {
          setState({ kind: "ready", status });
        }
      })
      .catch((error: unknown) => {
        if (!active) {
          return;
        }
        if (error instanceof ApiError && error.error === "NotAPatientError") {
          setState({
            kind: "error",
            message:
              "Esta aplicación es para pacientes. Usa la versión web con tu cuenta.",
            signOut: true,
          });
          return;
        }
        setState({
          kind: "error",
          message:
            error instanceof ApiError
              ? error.message
              : "No pudimos consultar tu registro. Intenta de nuevo.",
          signOut: error instanceof ApiError && error.status === 401,
        });
      });
    return () => {
      active = false;
    };
  }, [reloadKey]);

  const reload = useCallback(() => {
    setState({ kind: "loading" });
    setReloadKey((key) => key + 1);
  }, []);

  if (state.kind === "loading") {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#7355F7" />
      </View>
    );
  }

  if (state.kind === "error") {
    return (
      <SafeAreaView style={styles.center}>
        <Text style={styles.errorText}>{state.message}</Text>
        {state.signOut ? (
          <SignOutButton />
        ) : (
          <Pressable onPress={reload} style={styles.button}>
            <Text style={styles.buttonText}>Reintentar</Text>
          </Pressable>
        )}
      </SafeAreaView>
    );
  }

  const step = pendingRegistrationStep(state.status);
  if (step) {
    return (
      <CompleteRegistration
        onChanged={reload}
        status={state.status}
        step={step}
      />
    );
  }
  return children;
}

// Si el cierre de sesión tiene éxito, el Stack.Protected de _layout lleva a las pantallas de acceso.
// Better Auth devuelve los errores HTTP en { error } y los de red como excepción: se tratan igual.
function SignOutButton() {
  const [signingOut, setSigningOut] = useState(false);
  const [failed, setFailed] = useState(false);

  const handleSignOut = async () => {
    if (signingOut) {
      return;
    }
    setFailed(false);
    setSigningOut(true);
    try {
      const result = await authClient.signOut();
      if (result?.error) {
        setFailed(true);
      }
    } catch {
      setFailed(true);
    } finally {
      setSigningOut(false);
    }
  };

  return (
    <>
      {failed ? (
        <Text style={styles.signOutError}>
          No pudimos cerrar la sesión. Revisa tu conexión e intenta de nuevo.
        </Text>
      ) : null}
      <Pressable
        accessibilityState={{ disabled: signingOut }}
        disabled={signingOut}
        onPress={handleSignOut}
        style={styles.button}
      >
        {signingOut ? (
          <ActivityIndicator color="#FFFFFF" />
        ) : (
          <Text style={styles.buttonText}>
            {failed ? "Reintentar cerrar sesión" : "Cerrar sesión"}
          </Text>
        )}
      </Pressable>
    </>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: "center",
    backgroundColor: "#7355F7",
    borderRadius: 50,
    marginTop: 20,
    paddingVertical: 16,
    width: "100%",
  },
  buttonText: { color: "#FFFFFF", fontSize: 18, fontWeight: "600" },
  center: {
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  errorText: {
    color: "#374151",
    fontSize: 15,
    lineHeight: 22,
    textAlign: "center",
  },
  signOutError: {
    color: "#B91C1C",
    fontSize: 14,
    marginTop: 16,
    textAlign: "center",
  },
});
