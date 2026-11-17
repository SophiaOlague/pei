import { router } from "expo-router";
import { SymbolView } from "expo-symbols";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ApiError, getProfile, legalFullName } from "@/lib/api";
import { authClient } from "@/lib/auth-client";

// Nombre legal del perfil de paciente (GET /me/profile). ready con name null: el perfil no existe
// (403 PatientProfileRequiredError) o no tiene un nombre utilizable; entonces se usa el de la cuenta.
// error: no se pudo consultar (red, 5xx, 401); se avisa en lugar de presentarlo como perfil vacío.
type LegalNameState =
  | { kind: "loading" }
  | { kind: "ready"; name: string | null }
  | { kind: "error" };

function useLegalName() {
  const [state, setState] = useState<LegalNameState>({ kind: "loading" });
  const [reloadKey, setReloadKey] = useState(0);

  // biome-ignore lint/correctness/useExhaustiveDependencies: reloadKey es el disparador de la recarga
  useEffect(() => {
    let active = true;
    getProfile()
      .then((profile) => {
        if (active) {
          setState({ kind: "ready", name: legalFullName(profile) });
        }
      })
      .catch((error: unknown) => {
        if (!active) {
          return;
        }
        const noProfile =
          error instanceof ApiError &&
          error.error === "PatientProfileRequiredError";
        setState(noProfile ? { kind: "ready", name: null } : { kind: "error" });
      });
    return () => {
      active = false;
    };
  }, [reloadKey]);

  const retry = () => {
    setState({ kind: "loading" });
    setReloadKey((key) => key + 1);
  };

  return { retry, state };
}

export default function ProfileScreen() {
  const goBack = () => {
    router.back();
  };

  const handleEditInfo = () => router.push("/(app)/editprofile");
  const handlePayment = () => router.push("/(app)/(tabs)/options/metpagos");
  const handleAdvanced = () => router.push("/(app)/(tabs)/options/advconfig");
  const handlePrescriptions = () => router.push("/(app)/listrecipes");
  const handleIdentity = () => router.push("/(app)/verificacionidentidad");

  const handleLogout = async () => {
    await authClient.signOut({
      fetchOptions: {
        onSuccess: () => {
          router.push("/login");
        },
      },
    });
  };
  const { data: session, isPending } = authClient.useSession();
  const legalName = useLegalName();
  const accountName = session?.user?.name || "Sin nombre";

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.screenTitle}>MI PERFIL</Text>

        <View style={styles.avatarContainer}>
          <View style={styles.avatarCircle} />
        </View>

        {legalName.state.kind === "loading" ? (
          <ActivityIndicator
            accessibilityLabel="Cargando tu nombre"
            color="#7355F7"
            style={styles.nameLoader}
          />
        ) : (
          <Text style={styles.userName}>
            {(legalName.state.kind === "ready" && legalName.state.name) ||
              accountName}
          </Text>
        )}
        {legalName.state.kind === "error" ? (
          <View style={styles.nameError}>
            <Text style={styles.nameErrorText}>
              No pudimos cargar tu nombre legal.
            </Text>
            <Pressable accessibilityRole="button" onPress={legalName.retry}>
              <Text style={styles.nameRetry}>Reintentar</Text>
            </Pressable>
          </View>
        ) : null}
        <Text style={styles.userEmail}>
          {session?.user?.email ?? "Sin correo"}
        </Text>

        <View style={styles.menuContainer}>
          <MenuItem
            icon={{ android: "edit", ios: "pencil" }}
            label="Editar información"
            onPress={handleEditInfo}
          />

          <MenuItem
            icon={{ android: "badge", ios: "person.text.rectangle" }}
            label="Verificación de identidad"
            onPress={handleIdentity}
          />

          <MenuItem
            icon={{ android: "credit_card", ios: "creditcard" }}
            label="Métodos de pago"
            onPress={handlePayment}
          />

          <MenuItem
            icon={{ android: "settings", ios: "gearshape" }}
            label="Configuración avanzada"
            onPress={handleAdvanced}
          />

          <MenuItem
            icon={{ android: "description", ios: "doc.text" }}
            label="Mis recetas"
            onPress={handlePrescriptions}
          />

        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function MenuItem({
  icon,
  label,
  onPress,
}: {
  icon: any;
  label: string;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      activeOpacity={0.7}
      onPress={onPress}
      style={styles.menuItem}
    >
      <View style={styles.menuItemLeft}>
        <SymbolView
          name={icon}
          resizeMode="scaleAspectFit"
          size={20}
          tintColor="#6B7280"
        />
        <Text style={styles.menuItemText}>{label}</Text>
      </View>
      <SymbolView
        name={{
          android: "chevron_right",
          ios: "chevron.right",
        }}
        resizeMode="scaleAspectFit"
        size={26}
        tintColor="#9CA3AF"
      />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  avatarCircle: {
    backgroundColor: "#e9e8e8",
    borderColor: "transparent",
    borderRadius: 55,
    borderWidth: 2,
    height: 110,
    width: 110,
  },

  avatarContainer: {
    marginBottom: 16,
  },
  backButton: {
    alignItems: "center",
    height: 28,
    justifyContent: "center",
    width: 28,
  },
  container: {
    flex: 1,
  },

  header: {
    alignItems: "center",
    backgroundColor: "#1F1F1F",
    flexDirection: "row",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  headerTitle: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "500",
  },

  menuContainer: {
    gap: 10,
    width: "100%",
  },
  menuItem: {
    alignItems: "center",
    backgroundColor: "#F5F5F7",
    borderRadius: 14,
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  menuItemLeft: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
  },
  menuItemText: {
    color: "#374151",
    fontSize: 15,
    fontWeight: "500",
  },
  nameError: {
    alignItems: "center",
    flexDirection: "row",
    gap: 6,
    marginBottom: 4,
  },
  nameErrorText: {
    color: "#B91C1C",
    fontSize: 12,
  },
  nameLoader: {
    height: 22,
    marginBottom: 4,
  },
  nameRetry: {
    color: "#7355F7",
    fontSize: 12,
    fontWeight: "600",
  },
  screenTitle: {
    color: "#111827",
    fontSize: 20,
    fontWeight: "700",
    letterSpacing: 1,
    marginBottom: 24,
    paddingTop: 10,
  },

  scrollContent: {
    alignItems: "center",
    paddingBottom: 40,
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  userEmail: {
    color: "#9CA3AF",
    fontSize: 13,
    marginBottom: 28,
  },

  userName: {
    color: "#111827",
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 4,
  },
});
