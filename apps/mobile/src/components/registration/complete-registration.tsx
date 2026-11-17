import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Pressable,
  type PressableStateCallbackType,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  ApiError,
  acceptLegalDocuments,
  createPatientProfile,
  getCurrentLegalDocuments,
  type LegalDocument,
  type LegalDocumentType,
  type RegistrationStatus,
} from "@/lib/api";
import { validateProfile } from "@/lib/profile-validation";

// Qué hacer ante el error de una escritura (perfil o aceptación legal):
//   reload    → volver a pedir el estado. El backend ya tiene el dato (perfil existente, versión nueva) o la
//               sesión expiró (401): la compuerta ofrece entonces cerrar sesión.
//   ambiguous → sin respuesta o 5xx: la escritura pudo aplicarse. No se reintenta; se ofrece comprobar el
//               estado antes de volver a enviar.
//   show      → el backend rechazó los datos; se muestra su mensaje y se puede corregir.
type WriteErrorAction = "reload" | "ambiguous" | "show";

const RELOAD_ERRORS = new Set([
  "ProfileAlreadyExistsError",
  "LegalDocumentNotCurrentError",
]);

export function writeErrorAction(error: unknown): WriteErrorAction {
  if (!(error instanceof ApiError)) {
    return "ambiguous";
  }
  if (error.status === 401 || RELOAD_ERRORS.has(error.error ?? "")) {
    return "reload";
  }
  if (error.status === 0 || error.status >= 500) {
    return "ambiguous";
  }
  return "show";
}

const AMBIGUOUS_MESSAGE =
  "No sabemos si se guardó. Comprueba el estado antes de volver a enviar.";

const LEGAL_LABELS: Record<LegalDocumentType, string> = {
  doctor_terms: "Términos y Condiciones",
  patient_terms: "Términos y Condiciones",
  privacy_notice: "Aviso de Privacidad",
  privacy_policy: "Aviso de Privacidad",
  terms_and_conditions: "Términos y Condiciones",
};

// Texto de la casilla, con el artículo que corresponde a cada título.
const ACCEPT_LABELS: Record<LegalDocumentType, string> = {
  doctor_terms: "He leído y acepto los Términos y Condiciones",
  patient_terms: "He leído y acepto los Términos y Condiciones",
  privacy_notice: "He leído y acepto el Aviso de Privacidad",
  privacy_policy: "He leído y acepto el Aviso de Privacidad",
  terms_and_conditions: "He leído y acepto los Términos y Condiciones",
};

type Props = {
  step: "profile" | "legal";
  status: RegistrationStatus;
  // Vuelve a pedir el estado al backend: es la única fuente para decidir el siguiente paso.
  onChanged: () => void;
};

export function CompleteRegistration({ step, status, onChanged }: Props) {
  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView behavior="padding" style={styles.flex}>
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
          <Text style={styles.subtitle}>Completa tu registro</Text>
          <Text style={styles.stepText}>
            Paso {step === "profile" ? 1 : 2} de 2 ·{" "}
            {step === "profile" ? "Tus datos" : "Documentos legales"}
          </Text>
          {step === "profile" ? (
            <ProfileStep onChanged={onChanged} />
          ) : (
            <LegalStep onChanged={onChanged} status={status} />
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function ProfileStep({ onChanged }: { onChanged: () => void }) {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [curp, setCurp] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [mustCheck, setMustCheck] = useState(false);

  const handleSubmit = async () => {
    if (loading) {
      return;
    }
    setErrorMessage("");
    const result = validateProfile({ birthDate, curp, firstName, lastName });
    if (!result.ok) {
      setErrorMessage(result.message);
      return;
    }

    setLoading(true);
    try {
      await createPatientProfile(result.value);
      onChanged();
    } catch (error) {
      const action = writeErrorAction(error);
      if (action === "reload") {
        onChanged();
      } else if (action === "ambiguous") {
        setMustCheck(true);
        setErrorMessage(AMBIGUOUS_MESSAGE);
      } else {
        setErrorMessage((error as ApiError).message);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <View>
      <Text style={styles.description}>
        Estos datos identifican tu expediente y no podrás cambiarlos después.
        Escríbelos como aparecen en tu identificación oficial.
      </Text>
      <Field
        label="Nombre(s)"
        onChangeText={setFirstName}
        placeholder="Ingresa tus nombres"
        value={firstName}
      />
      <Field
        label="Apellidos"
        onChangeText={setLastName}
        placeholder="Ingresa tus apellidos"
        value={lastName}
      />
      <Field
        autoCapitalize="characters"
        label="CURP"
        maxLength={18}
        onChangeText={setCurp}
        placeholder="18 caracteres"
        value={curp}
      />
      <Field
        keyboardType="numbers-and-punctuation"
        label="Fecha de nacimiento"
        maxLength={10}
        onChangeText={setBirthDate}
        placeholder="AAAA-MM-DD"
        value={birthDate}
      />
      <Feedback error={errorMessage} />
      {mustCheck ? (
        <PrimaryButton label="Comprobar estado" onPress={onChanged} />
      ) : (
        <PrimaryButton
          disabled={loading}
          label="Continuar"
          loading={loading}
          loadingLabel="Guardando..."
          onPress={handleSubmit}
        />
      )}
    </View>
  );
}

function LegalStep({
  status,
  onChanged,
}: {
  status: RegistrationStatus;
  onChanged: () => void;
}) {
  const pendingIds = status.legal.pending.map((doc) => doc.documentId);
  const [documents, setDocuments] = useState<LegalDocument[] | null>(null);
  const [loadError, setLoadError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [mustCheck, setMustCheck] = useState(false);

  const hasPending = pendingIds.length > 0;
  // biome-ignore lint/correctness/useExhaustiveDependencies: reloadKey es el disparador de la recarga
  useEffect(() => {
    if (!hasPending) {
      return;
    }
    let active = true;
    getCurrentLegalDocuments()
      .then((current) => {
        if (active) {
          setDocuments(current);
        }
      })
      .catch((error: unknown) => {
        if (active) {
          setLoadError(
            error instanceof ApiError
              ? error.message
              : "No pudimos cargar los documentos."
          );
        }
      });
    return () => {
      active = false;
    };
  }, [hasPending, reloadKey]);

  const retryLoad = () => {
    setLoadError("");
    setDocuments(null);
    setReloadKey((key) => key + 1);
  };

  // Sin régimen publicado el backend no puede dar los legales por aceptados (falla cerrado).
  if (pendingIds.length === 0) {
    return (
      <Text style={styles.description}>
        Por ahora no hay documentos legales publicados, así que no es posible
        completar el registro. Intenta más tarde.
      </Text>
    );
  }
  if (loadError) {
    return (
      <View>
        <Feedback error={loadError} />
        <PrimaryButton label="Reintentar" onPress={retryLoad} />
      </View>
    );
  }
  if (!documents) {
    return <ActivityIndicator color="#7355F7" style={styles.loader} />;
  }

  // Solo los documentos que el backend indica como pendientes, con su id exacto.
  const pending = documents.filter((doc) => pendingIds.includes(doc.id));
  const documentsChanged = pending.length < pendingIds.length;
  const allChecked =
    !documentsChanged && pending.every((doc) => checked[doc.id]);

  const handleAccept = async () => {
    if (loading || !allChecked) {
      return;
    }
    setErrorMessage("");
    setLoading(true);
    try {
      await acceptLegalDocuments(pendingIds);
      onChanged();
    } catch (error) {
      const action = writeErrorAction(error);
      if (action === "reload") {
        onChanged();
      } else if (action === "ambiguous") {
        setMustCheck(true);
        setErrorMessage(AMBIGUOUS_MESSAGE);
      } else {
        setErrorMessage((error as ApiError).message);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <View>
      <Text style={styles.description}>
        Lee y acepta los documentos vigentes para terminar tu registro.
      </Text>
      {pending.map((doc) => (
        <View key={doc.id} style={styles.legalCard}>
          <Text style={styles.legalTitle}>{LEGAL_LABELS[doc.type]}</Text>
          <Text style={styles.legalVersion}>Versión {doc.version}</Text>
          <Pressable
            accessibilityRole="button"
            onPress={() =>
              setExpanded((prev) => ({ ...prev, [doc.id]: !prev[doc.id] }))
            }
          >
            <Text style={styles.link}>
              {expanded[doc.id] ? "Ocultar texto" : "Leer documento"}
            </Text>
          </Pressable>
          {expanded[doc.id] ? (
            <Text style={styles.legalContent}>{doc.content}</Text>
          ) : null}
          <Pressable
            accessibilityRole="checkbox"
            accessibilityState={{ checked: Boolean(checked[doc.id]) }}
            onPress={() =>
              setChecked((prev) => ({ ...prev, [doc.id]: !prev[doc.id] }))
            }
            style={styles.checkRow}
          >
            <View
              style={[styles.checkbox, checked[doc.id] && styles.checkboxOn]}
            >
              {checked[doc.id] ? <Text style={styles.checkMark}>✓</Text> : null}
            </View>
            <Text style={styles.checkLabel}>{ACCEPT_LABELS[doc.type]}</Text>
          </Pressable>
        </View>
      ))}
      <Feedback error={errorMessage} />
      {/* Documentos que cambiaron (el estado pide uno que /current ya no trae) o respuesta ambigua: se
          vuelve a pedir el estado. La compuerta desmonta este paso, así que los documentos se releen y
          las casillas vuelven a empezar desmarcadas; no se acepta nada automáticamente. */}
      {documentsChanged || mustCheck ? (
        <>
          {documentsChanged ? (
            <Feedback error="Los documentos vigentes cambiaron. Vuelve a cargarlos para revisarlos." />
          ) : null}
          <PrimaryButton
            label={documentsChanged ? "Volver a cargar" : "Comprobar estado"}
            onPress={onChanged}
          />
        </>
      ) : (
        <PrimaryButton
          disabled={!allChecked || loading}
          label="Aceptar y continuar"
          loading={loading}
          loadingLabel="Enviando..."
          onPress={handleAccept}
        />
      )}
    </View>
  );
}

type FieldProps = React.ComponentProps<typeof TextInput> & { label: string };

function Field({ label, ...inputProps }: FieldProps) {
  return (
    <View style={styles.inputContainer}>
      <Text style={styles.inputLabel}>{label}</Text>
      <TextInput
        placeholderTextColor="#9CA3AF"
        style={styles.input}
        {...inputProps}
      />
    </View>
  );
}

function Feedback({ error }: { error: string }) {
  if (!error) {
    return null;
  }
  return (
    <View style={styles.errorBox}>
      <Text style={styles.errorText}>{error}</Text>
    </View>
  );
}

const pressScale = (pressed: boolean) => ({
  transform: [{ scale: pressed ? 0.97 : 1 }],
});

function PrimaryButton({
  label,
  loadingLabel,
  loading = false,
  disabled = false,
  onPress,
}: {
  label: string;
  loadingLabel?: string;
  loading?: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  const style = ({ pressed }: PressableStateCallbackType) => [
    styles.primaryButton,
    pressScale(pressed),
    disabled && styles.buttonDisabled,
  ];
  return (
    <Pressable
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={style}
    >
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator color="#FFFFFF" size="small" />
          <Text style={styles.primaryButtonText}>{loadingLabel ?? label}</Text>
        </View>
      ) : (
        <Text style={styles.primaryButtonText}>{label}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  buttonDisabled: { opacity: 0.5 },
  checkbox: {
    alignItems: "center",
    borderColor: "#7355F7",
    borderRadius: 6,
    borderWidth: 2,
    height: 24,
    justifyContent: "center",
    width: 24,
  },
  checkboxOn: { backgroundColor: "#7355F7" },
  checkLabel: { color: "#1F2937", flex: 1, fontSize: 14 },
  checkMark: { color: "#FFFFFF", fontSize: 14, fontWeight: "700" },
  checkRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
    marginTop: 12,
  },
  container: { flex: 1 },
  description: {
    color: "#374151",
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 20,
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
  errorText: { color: "#B91C1C", fontSize: 14, textAlign: "center" },
  flex: { flex: 1 },
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
  inputContainer: { marginBottom: 20 },
  inputLabel: {
    color: "#374151",
    fontSize: 12,
    fontWeight: "600",
    marginBottom: 10,
    paddingHorizontal: 16,
  },
  legalCard: {
    backgroundColor: "#F4F4F6",
    borderRadius: 16,
    marginBottom: 16,
    padding: 16,
  },
  legalContent: {
    color: "#374151",
    fontSize: 13,
    lineHeight: 19,
    marginTop: 8,
  },
  legalTitle: { color: "#1F2937", fontSize: 16, fontWeight: "600" },
  legalVersion: { color: "#6B7280", fontSize: 12, marginBottom: 8 },
  link: { color: "#7355F7", fontSize: 14, fontWeight: "600" },
  loader: { marginVertical: 24 },
  loadingContainer: { alignItems: "center", flexDirection: "row", gap: 10 },
  logo: { height: 33.82, marginBottom: 15, marginTop: 10, width: 65 },
  primaryButton: {
    alignItems: "center",
    backgroundColor: "#7355F7",
    borderRadius: 50,
    marginTop: 10,
    paddingVertical: 16,
    width: "100%",
  },
  primaryButtonText: { color: "#FFFFFF", fontSize: 18, fontWeight: "600" },
  scrollContent: {
    flexGrow: 1,
    paddingBottom: 30,
    paddingHorizontal: 24,
    paddingTop: 10,
  },
  stepText: { color: "#6B7280", fontSize: 12, marginBottom: 16 },
  subtitle: {
    color: "#1F2937",
    fontSize: 20,
    fontWeight: "600",
    marginBottom: 4,
  },
});
