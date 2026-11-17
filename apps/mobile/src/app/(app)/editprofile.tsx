import * as ImagePicker from "expo-image-picker";
import { router } from "expo-router";
import * as SecureStore from "expo-secure-store";
import { SymbolView } from "expo-symbols";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useExclusiveOperation } from "@/hooks/use-exclusive-operation";
import {
  ApiError,
  diffEditableProfile,
  EDITABLE_PROFILE_LIMITS,
  type EditableProfileDraft,
  type EditableProfileField,
  getProfile,
  legalFullName,
  type PatientProfile,
  updateProfile,
  validateEditableProfile,
} from "@/lib/api";
import { authClient } from "@/lib/auth-client";
import { formatIsoDateForDisplay } from "@/lib/date-format";

const PROFILE_IMAGE_KEY = "user_profile_image";

// Los datos del paciente salen de GET /me/profile, no de session.user (que solo tiene la cuenta de Better Auth).
// Los cuatro campos editables se guardan con PATCH /me/profile (ver ProfileForm).
//   loading    → indicador dentro del formulario; el encabezado no muestra ningún nombre.
//   ready      → nombre legal y datos reales.
//   no_profile → 403 PatientProfileRequiredError: la cuenta aún no tiene perfil; nombre de la cuenta.
//   error      → red, 5xx o 401: nombre de la cuenta, aviso y «Reintentar». No se presenta como perfil vacío.
type ProfileState =
  | { kind: "loading" }
  | { kind: "ready"; profile: PatientProfile }
  | { kind: "no_profile" }
  | { kind: "error"; message: string };

function usePatientProfile() {
  const [state, setState] = useState<ProfileState>({ kind: "loading" });
  const [reloadKey, setReloadKey] = useState(0);

  // biome-ignore lint/correctness/useExhaustiveDependencies: reloadKey es el disparador de la recarga
  useEffect(() => {
    let active = true;
    getProfile()
      .then((profile) => {
        if (active) {
          setState({ kind: "ready", profile });
        }
      })
      .catch((error: unknown) => {
        if (!active) {
          return;
        }
        if (
          error instanceof ApiError &&
          error.error === "PatientProfileRequiredError"
        ) {
          setState({ kind: "no_profile" });
          return;
        }
        setState({
          kind: "error",
          message:
            error instanceof ApiError
              ? error.message
              : "No pudimos cargar tus datos.",
        });
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

export default function EditProfileScreen() {
  // La sesión solo aporta el correo, el id y el nombre de respaldo. No se bloquea la pantalla mientras Better Auth
  // revalida la sesión: el estado del perfil vive aparte y no se pierde.
  const { data: session } = authClient.useSession();
  const { state, retry } = usePatientProfile();
  const [profileImage, setProfileImage] = useState<string | null>(null);

  const accountName = session?.user?.name || "Sin nombre";
  const legalName =
    state.kind === "ready" ? legalFullName(state.profile) : null;
  const displayName =
    state.kind === "loading" ? null : (legalName ?? accountName);

  useEffect(() => {
    const loadImage = async () => {
      try {
        const saved = await SecureStore.getItemAsync(PROFILE_IMAGE_KEY);
        if (saved) setProfileImage(saved);
      } catch (error) {
        console.error("Error al cargar la imagen:", error);
      }
    };
    loadImage;
  }, []);

  const handlePickImage = async () => {
    try {
      const permissionResult =
        await ImagePicker.requestCameraPermissionsAsync();

      if (!permissionResult.granted) {
        Alert.alert(
          "Permiso denegado",
          "Necesitamos acceso a tu galería para cambiar la foto de perfil."
        );
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.7,
      });

      if (!result.canceled && result.assets[0]) {
        const uri = result.assets[0].uri;
        await SecureStore.setItemAsync(PROFILE_IMAGE_KEY, uri);
        setProfileImage(uri);
      }
    } catch (error) {
      console.error("Error al seleccionar la imagen:", error);
      Alert.alert("Error", "No se pudo abrir la galería.");
    }
  };

  const handleTakePhoto = async () => {
    try {
      const permissionResult =
        await ImagePicker.requestCameraPermissionsAsync();

      if (!permissionResult.granted) {
        Alert.alert(
          "Permiso denegado",
          "Se necesita acceso a la cámara para tomar la foto de perfil."
        );
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.7,
      });

      if (!result.canceled && result.assets[0]) {
        const uri = result.assets[0].uri;
        await SecureStore.setItemAsync(PROFILE_IMAGE_KEY, uri);
        setProfileImage(uri);
      }
    } catch (error) {
      console.error("Error al tomar la foto:", error);
      Alert.alert("Error", "No se pudo abrir la cámara.");
    }
  };

  const handleAvatarPress = () => {
    Alert.alert("Foto de perfil", "Selecciona una opción", [
      { text: "Cámara", onPress: handleTakePhoto },
      { text: "Galería", onPress: handlePickImage },
      {
        text: "Eliminar foto",
        style: "destructive",
        onPress: async () => {
          await SecureStore.deleteItemAsync(PROFILE_IMAGE_KEY);
          setProfileImage(null);
        },
      },
      { text: "Cancelar", style: "cancel" },
    ]);
  };

  const goBack = () => router.back();

  return (
    <View style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 20}
        style={styles.keyboardView}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          contentInsetAdjustmentBehavior="automatic"
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.userHeader}>
            <View style={styles.avatarWrapper}>
              <View style={styles.avatarCircle}>
                {profileImage ? (
                  <Image
                    source={{ uri: profileImage }}
                    style={styles.avatarImage}
                  />
                ) : (
                  <Text style={styles.avatarInitial}>
                    {displayName?.charAt(0)?.toUpperCase() ?? ""}
                  </Text>
                )}
              </View>

              <TouchableOpacity
                activeOpacity={0.7}
                onPress={handleAvatarPress}
                style={styles.editAvatarButton}
              >
                <SymbolView
                  name={{ android: "edit", ios: "pencil" }}
                  resizeMode="scaleAspectFit"
                  size={14}
                  tintColor="#FFFFFF"
                />
              </TouchableOpacity>
            </View>

            <View style={styles.userInfo}>
              {displayName ? (
                <Text style={styles.userName}>{displayName}</Text>
              ) : (
                <ActivityIndicator
                  accessibilityLabel="Cargando tus datos"
                  color="#7355F7"
                  style={styles.nameLoader}
                />
              )}
              <Text style={styles.userEmail}>
                {session?.user?.email ?? "Sin correo"}
              </Text>
              <Text style={styles.userId}>
                ID: {session?.user?.id?.slice(0, 8) ?? "..."}
              </Text>
              <View style={styles.badge}>
                <Text style={styles.badgeText}>Paciente</Text>
              </View>
            </View>
          </View>

          {state.kind === "loading" ? (
            <ActivityIndicator color="#7355F7" style={styles.formLoader} />
          ) : null}

          {state.kind === "error" ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>
                No pudimos cargar tus datos. {state.message}
              </Text>
              <TouchableOpacity
                accessibilityRole="button"
                onPress={retry}
                style={styles.retryButton}
              >
                <Text style={styles.retryText}>Reintentar</Text>
              </TouchableOpacity>
            </View>
          ) : null}

          {state.kind === "no_profile" ? (
            <View style={styles.infoBox}>
              <Text style={styles.infoText}>
                Aún no tienes un perfil de paciente.
              </Text>
            </View>
          ) : null}

          {state.kind === "ready" ? (
            <ProfileForm profile={state.profile} />
          ) : null}

          <TouchableOpacity
            activeOpacity={0.8}
            onPress={goBack}
            style={styles.cancelButton}
          >
            <Text style={styles.cancelButtonText}>Volver</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

// Formulario del perfil. Nombre y fecha de nacimiento: solo lectura. Los cuatro campos editables se guardan con
// PATCH /me/profile, enviando solo lo que cambió (vaciar un campo envía null para borrarlo).
//   Éxito → mensaje solo tras la respuesta correcta del backend; los valores guardados pasan a ser la nueva base.
//   4xx   → mensaje para la persona; se conservan los valores escritos.
//   Red/5xx (ambiguo: pudo guardarse) → no se reintenta. «Comprobar estado» vuelve a pedir GET /me/profile y lo
//   compara con lo escrito antes de permitir otro envío.
type SaveFeedback =
  | { kind: "none" }
  | { kind: "success"; message: string }
  | { kind: "error"; message: string }
  | { kind: "ambiguous" };

const AMBIGUOUS_MESSAGE =
  "No pudimos confirmar si se guardaron los cambios. Comprueba el estado antes de volver a intentarlo.";

function draftFrom(profile: PatientProfile): EditableProfileDraft {
  return {
    address: profile.address ?? "",
    emergencyContactName: profile.emergencyContactName ?? "",
    emergencyContactPhone: profile.emergencyContactPhone ?? "",
    phone: profile.phone ?? "",
  };
}

// null: resultado ambiguo (sin respuesta o 5xx).
function saveErrorMessage(error: unknown): string | null {
  if (
    !(error instanceof ApiError) ||
    error.status === 0 ||
    error.status >= 500
  ) {
    return null;
  }
  if (error.status === 401) {
    return "Tu sesión expiró. Inicia sesión de nuevo para guardar.";
  }
  return `No pudimos guardar los cambios. ${error.message}`;
}

function ProfileForm({ profile }: { profile: PatientProfile }) {
  // Base contra la que se calculan los cambios: el perfil cargado y, después, lo confirmado por el backend.
  const [baseline, setBaseline] = useState<PatientProfile>(profile);
  const [draft, setDraft] = useState<EditableProfileDraft>(() =>
    draftFrom(profile)
  );
  const [saving, setSaving] = useState(false);
  const [checking, setChecking] = useState(false);
  const [feedback, setFeedback] = useState<SaveFeedback>({ kind: "none" });
  // Guardar y comprobar comparten una guardia síncrona: saving/checking solo cambian en el siguiente render, así
  // que dos toques en el mismo frame los verían en false y lanzarían dos peticiones (dos PATCH = dos eventos de
  // auditoría). La guardia se toma antes del primer await y se libera en finally.
  const exclusive = useExclusiveOperation();

  const setField = (field: EditableProfileField) => (value: string) => {
    setDraft((prev) => ({ ...prev, [field]: value }));
  };

  const handleSave = async () => {
    // biome-ignore lint/suspicious/noUnnecessaryConditions: isBusy lee un ref que cambia entre llamadas
    if (exclusive.isBusy()) {
      return;
    }
    const invalid = validateEditableProfile(draft);
    if (invalid) {
      setFeedback({ kind: "error", message: invalid });
      return;
    }
    const patch = diffEditableProfile(baseline, draft);
    if (Object.keys(patch).length === 0) {
      setFeedback({ kind: "error", message: "No hay cambios para guardar." });
      return;
    }
    await exclusive.run(async () => {
      setFeedback({ kind: "none" });
      setSaving(true);
      try {
        await updateProfile(patch);
        setBaseline((prev) => ({ ...prev, ...patch }));
        setFeedback({ kind: "success", message: "Cambios guardados." });
      } catch (error) {
        const message = saveErrorMessage(error);
        setFeedback(
          message ? { kind: "error", message } : { kind: "ambiguous" }
        );
      } finally {
        setSaving(false);
      }
    });
  };

  // Tras un resultado ambiguo: el backend decide si los cambios quedaron guardados. Lo escrito se conserva.
  const handleCheck = async () => {
    await exclusive.run(async () => {
      setChecking(true);
      try {
        const current = await getProfile();
        setBaseline(current);
        const pending = diffEditableProfile(current, draft);
        setFeedback(
          Object.keys(pending).length === 0
            ? {
                kind: "success",
                message: "Se confirmó que los cambios están guardados.",
              }
            : {
                kind: "error",
                message:
                  "Los cambios no se guardaron. Puedes intentarlo de nuevo.",
              }
        );
      } catch {
        // Sigue sin poder confirmarse: se mantiene el estado ambiguo.
        setFeedback({ kind: "ambiguous" });
      } finally {
        setChecking(false);
      }
    });
  };

  const busy = saving || checking;

  return (
    <View>
      <Text style={styles.sectionTitle}>Información personal</Text>
      <Text style={styles.readOnlyNote}>
        El nombre y la fecha de nacimiento no se pueden modificar desde esta
        pantalla.
      </Text>
      <ReadOnlyField label="Nombre:" value={legalFullName(profile)} />
      <ReadOnlyField
        label="Fecha de nacimiento:"
        value={formatIsoDateForDisplay(profile.birthDate)}
      />
      <Field
        keyboardType="phone-pad"
        label="Número:"
        maxLength={EDITABLE_PROFILE_LIMITS.phone}
        onChangeText={setField("phone")}
        placeholder="Tu teléfono"
        value={draft.phone}
      />
      <Field
        label="Dirección:"
        maxLength={EDITABLE_PROFILE_LIMITS.address}
        onChangeText={setField("address")}
        placeholder="Tu dirección"
        value={draft.address}
      />

      <Text style={styles.sectionTitle}>Contacto de emergencia</Text>
      <Field
        label="Nombre del contacto:"
        maxLength={EDITABLE_PROFILE_LIMITS.emergencyContactName}
        onChangeText={setField("emergencyContactName")}
        placeholder="Nombre completo"
        value={draft.emergencyContactName}
      />
      <Field
        keyboardType="phone-pad"
        label="Número de teléfono:"
        maxLength={EDITABLE_PROFILE_LIMITS.emergencyContactPhone}
        onChangeText={setField("emergencyContactPhone")}
        placeholder="Teléfono del contacto"
        value={draft.emergencyContactPhone}
      />

      {feedback.kind === "error" ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{feedback.message}</Text>
        </View>
      ) : null}
      {feedback.kind === "ambiguous" ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{AMBIGUOUS_MESSAGE}</Text>
        </View>
      ) : null}
      {feedback.kind === "success" ? (
        <View style={styles.successBox}>
          <Text style={styles.successText}>{feedback.message}</Text>
        </View>
      ) : null}

      {feedback.kind === "ambiguous" ? (
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityState={{ disabled: busy }}
          activeOpacity={0.8}
          disabled={busy}
          onPress={handleCheck}
          style={[styles.saveButton, busy && styles.saveButtonDisabled]}
        >
          {checking ? (
            <ActivityIndicator color="#FFFFFF" size="small" />
          ) : (
            <Text style={styles.saveButtonText}>Comprobar estado</Text>
          )}
        </TouchableOpacity>
      ) : (
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityState={{ disabled: busy }}
          activeOpacity={0.8}
          disabled={busy}
          onPress={handleSave}
          style={[styles.saveButton, busy && styles.saveButtonDisabled]}
        >
          {saving ? (
            <ActivityIndicator
              accessibilityLabel="Guardando"
              color="#FFFFFF"
              size="small"
            />
          ) : (
            <Text style={styles.saveButtonText}>Guardar cambios</Text>
          )}
        </TouchableOpacity>
      )}
    </View>
  );
}

function ReadOnlyField({
  label,
  value,
}: {
  label: string;
  value: string | null;
}) {
  return (
    <View style={styles.fieldContainer}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        editable={false}
        placeholder="Sin registrar"
        placeholderTextColor="#9CA3AF"
        style={[styles.fieldInput, styles.fieldInputReadOnly]}
        value={value ?? ""}
      />
    </View>
  );
}

function Field({
  label,
  value,
  onChangeText,
  keyboardType,
  placeholder,
  maxLength,
}: {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  keyboardType?: React.ComponentProps<typeof TextInput>["keyboardType"];
  placeholder?: string;
  maxLength?: number;
}) {
  return (
    <View style={styles.fieldContainer}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        autoCapitalize="sentences"
        keyboardType={keyboardType}
        maxLength={maxLength}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#9CA3AF"
        style={styles.fieldInput}
        value={value}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  avatarCircle: {
    alignItems: "center",
    backgroundColor: "#F3F4F6",
    borderColor: "#E5E7EB",
    borderRadius: 40,
    borderWidth: 2,
    height: 80,
    justifyContent: "center",
    width: 80,
    overflow: "hidden",
  },
  avatarImage: {
    width: "100%",
    height: "100%",
  },
  avatarInitial: {
    color: "#7355F7",
    fontSize: 32,
    fontWeight: "700",
  },
  avatarWrapper: {
    position: "relative",
  },
  backButton: {
    alignItems: "center",
    height: 40,
    justifyContent: "center",
    left: 20,
    position: "absolute",
    top: 50,
    width: 40,
    zIndex: 10,
  },
  badge: {
    alignSelf: "flex-start",
    backgroundColor: "#EDE9FE",
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  badgeText: {
    color: "#7355F7",
    fontSize: 11,
    fontWeight: "600",
  },

  cancelButton: {
    alignItems: "center",
    marginTop: 8,
    paddingVertical: 14,
  },
  cancelButtonText: {
    color: "#6B7280",
    fontSize: 15,
    fontWeight: "500",
  },
  container: {
    flex: 1,
  },
  editAvatarButton: {
    alignItems: "center",
    backgroundColor: "#7355F7",
    borderColor: "#FFFFFF",
    borderRadius: 13,
    borderWidth: 2,
    bottom: 0,
    height: 26,
    justifyContent: "center",
    position: "absolute",
    right: 0,
    width: 26,
  },

  errorBox: {
    backgroundColor: "#FEE2E2",
    borderColor: "#FCA5A5",
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  errorText: {
    color: "#B91C1C",
    fontSize: 14,
    textAlign: "center",
  },

  fieldContainer: {
    marginBottom: 16,
  },
  fieldInput: {
    backgroundColor: "transparent",
    borderColor: "#E5E7EB",
    borderRadius: 50,
    borderWidth: 1,
    color: "#1F2937",
    fontSize: 15,
    paddingHorizontal: 18,
    paddingVertical: 14,
  },
  fieldInputReadOnly: {
    backgroundColor: "#F9FAFB",
  },
  fieldLabel: {
    color: "#9CA3AF",
    fontSize: 12,
    marginBottom: 6,
    paddingHorizontal: 18,
  },
  formLoader: {
    marginVertical: 24,
  },
  infoBox: {
    backgroundColor: "#EDE9FE",
    borderRadius: 12,
    marginTop: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  infoText: {
    color: "#5B21B6",
    fontSize: 14,
    textAlign: "center",
  },
  keyboardView: {
    flex: 1,
  },

  nameLoader: {
    alignSelf: "flex-start",
    marginBottom: 2,
  },
  readOnlyNote: {
    color: "#6B7280",
    fontSize: 12,
    marginBottom: 12,
    paddingHorizontal: 18,
  },
  retryButton: {
    alignSelf: "center",
    marginTop: 8,
  },
  retryText: {
    color: "#7355F7",
    fontSize: 14,
    fontWeight: "600",
  },
  saveButton: {
    alignItems: "center",
    backgroundColor: "#7355F7",
    borderRadius: 50,
    marginTop: 24,
    paddingVertical: 16,
  },
  saveButtonDisabled: {
    opacity: 0.7,
  },
  saveButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
  },
  screenTitle: {
    color: "#111827",
    fontSize: 20,
    fontWeight: "700",
    letterSpacing: 0.5,
    textAlign: "center",
  },
  scrollContent: {
    paddingBottom: 40,
    paddingHorizontal: 24,
    paddingTop: 10,
  },

  sectionTitle: {
    color: "#111827",
    fontSize: 20,
    fontWeight: "700",
    marginBottom: 16,
    marginTop: 12,
    paddingHorizontal: 18,
  },
  successBox: {
    backgroundColor: "#D1FAE5",
    borderColor: "#6EE7B7",
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  successText: {
    color: "#065F46",
    fontSize: 14,
    textAlign: "center",
  },
  userEmail: {
    color: "#6B7280",
    fontSize: 12,
    marginBottom: 2,
  },
  userHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: 16,
    marginBottom: 28,
  },
  userId: {
    color: "#9CA3AF",
    fontSize: 12,
    marginBottom: 6,
  },
  userInfo: {
    flex: 1,
  },
  userName: {
    color: "#000000",
    fontSize: 15,
    fontWeight: "700",
    marginBottom: 2,
  },
});
