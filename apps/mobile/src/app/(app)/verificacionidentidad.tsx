import * as ImagePicker from "expo-image-picker";
import { router, useLocalSearchParams } from "expo-router";
import { SymbolView } from "expo-symbols";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useExclusiveOperation } from "@/hooks/use-exclusive-operation";
import {
  ApiError,
  getIdentityVerification,
  getRegistrationStatus,
  type IdentityDocumentImage,
  type IdentityVerification,
  submitIdentityVerification,
} from "@/lib/api";

// Verificación de identidad del paciente (RF-07): envío del INE (frente y reverso) y estado de la revisión.
//   GET  /me/identity-verification → not_submitted | pending | approved | rejected (con motivo).
//   POST /me/identity-verification → multipart front/back; el backend valida el archivo y lo guarda en su
//                                     almacenamiento privado. La app no guarda las imágenes: solo las mantiene en
//                                     memoria (URI temporal del selector) hasta enviarlas y no las registra.
// El estado mostrado SIEMPRE es el que devuelve el backend: tras un envío se vuelve a consultar; nunca se supone una
// aprobación. «Agendar» solo aparece cuando GET /me/registration-status confirma canBookAppointments.

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const PNG_URI = /\.png$/i;
const JPEG_URI = /\.jpe?g$/i;

type Side = "front" | "back";
const SIDE_LABEL: Record<Side, string> = {
  back: "Reverso de la INE",
  front: "Frente de la INE",
};
const PREVIEW_LABEL: Record<Side, string> = {
  back: "Vista previa del reverso",
  front: "Vista previa del frente",
};

type LoadState =
  | { kind: "loading" }
  | { kind: "ready"; verification: IdentityVerification }
  | { kind: "error"; message: string };

type SubmitFeedback =
  | { kind: "none" }
  | { kind: "received" }
  | { kind: "error"; message: string }
  | { kind: "ambiguous" };

const AMBIGUOUS_MESSAGE =
  "No pudimos confirmar si recibimos tus documentos. Consulta el estado antes de volver a enviarlos.";

function useIdentityVerification() {
  const [state, setState] = useState<LoadState>({ kind: "loading" });

  // Consulta sin pasar por «cargando»: la vista actual (y lo elegido en el formulario) se conserva mientras tanto.
  //   show → si falla, se muestra el error.   keep → si falla, no cambia nada (devuelve false).
  const fetchStatus = useCallback(
    async (onFailure: "show" | "keep"): Promise<boolean> => {
      try {
        const verification = await getIdentityVerification();
        setState({ kind: "ready", verification });
        return true;
      } catch (error) {
        if (onFailure === "show") {
          setState({
            kind: "error",
            message:
              error instanceof ApiError
                ? error.message
                : "No pudimos consultar tu verificación.",
          });
        }
        return false;
      }
    },
    []
  );

  const load = useCallback(async () => {
    setState({ kind: "loading" });
    await fetchStatus("show");
  }, [fetchStatus]);
  const refresh = useCallback(async () => {
    await fetchStatus("show");
  }, [fetchStatus]);
  const check = useCallback(() => fetchStatus("keep"), [fetchStatus]);

  useEffect(() => {
    load();
  }, [load]);

  return { check, load, refresh, state };
}

// Formato que acepta el backend (decide por la firma binaria; esto solo evita un envío que se rechazaría).
function imageMimeType(
  asset: ImagePicker.ImagePickerAsset
): IdentityDocumentImage["mimeType"] | null {
  const declared = asset.mimeType?.toLowerCase();
  if (declared === "image/jpeg" || declared === "image/jpg") {
    return "image/jpeg";
  }
  if (declared === "image/png") {
    return "image/png";
  }
  if (declared) {
    return null;
  }
  if (PNG_URI.test(asset.uri)) {
    return "image/png";
  }
  return JPEG_URI.test(asset.uri) ? "image/jpeg" : null;
}

type PickResult =
  | { kind: "image"; image: IdentityDocumentImage }
  | { kind: "invalid"; message: string }
  | { kind: "none" };

async function pickImage(source: "camera" | "library"): Promise<PickResult> {
  if (source === "camera") {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(
        "Permiso denegado",
        "Necesitamos acceso a la cámara para fotografiar tu INE."
      );
      return { kind: "none" };
    }
  }
  // Sin EXIF ni base64: solo la URI temporal del archivo.
  const options: ImagePicker.ImagePickerOptions = {
    allowsEditing: false,
    base64: false,
    exif: false,
    mediaTypes: ["images"],
    quality: 0.8,
  };
  const result =
    source === "camera"
      ? await ImagePicker.launchCameraAsync(options)
      : await ImagePicker.launchImageLibraryAsync(options);
  const asset = result.canceled ? undefined : result.assets[0];
  if (!asset) {
    return { kind: "none" };
  }
  const mimeType = imageMimeType(asset);
  if (!mimeType) {
    return {
      kind: "invalid",
      message: "La imagen debe ser JPEG o PNG.",
    };
  }
  if (typeof asset.fileSize === "number" && asset.fileSize > MAX_IMAGE_BYTES) {
    return {
      kind: "invalid",
      message: "Cada imagen debe pesar máximo 5 MB.",
    };
  }
  return { image: { mimeType, uri: asset.uri }, kind: "image" };
}

// null: resultado ambiguo (sin respuesta o 5xx): pudo haberse recibido.
function submitErrorMessage(error: unknown): string | null {
  if (
    !(error instanceof ApiError) ||
    error.status === 0 ||
    error.status >= 500
  ) {
    return null;
  }
  if (error.status === 413) {
    return "Cada imagen debe pesar máximo 5 MB.";
  }
  return error.message;
}

export default function IdentityVerificationScreen() {
  const { origen } = useLocalSearchParams<{ origen?: string }>();
  const fromBooking = origen === "reserva";
  const { state, load, refresh, check } = useIdentityVerification();
  const [feedback, setFeedback] = useState<SubmitFeedback>({ kind: "none" });

  const status = state.kind === "ready" ? state.verification.status : null;
  const canSubmit = status === "not_submitted" || status === "rejected";

  const goBack = () => router.back();

  const refreshPending = async () => {
    setFeedback((prev) => (prev.kind === "received" ? prev : { kind: "none" }));
    await refresh();
  };

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        contentInsetAdjustmentBehavior="automatic"
        showsVerticalScrollIndicator={false}
      >
        {state.kind === "loading" ? (
          <ActivityIndicator
            accessibilityLabel="Consultando tu verificación"
            color="#7355F7"
            style={styles.loader}
          />
        ) : null}

        {state.kind === "error" ? (
          <View style={styles.errorBox}>
            <Text accessibilityRole="alert" style={styles.errorText}>
              No pudimos consultar tu verificación. {state.message}
            </Text>
            <TouchableOpacity
              accessibilityRole="button"
              onPress={load}
              style={styles.retryButton}
            >
              <Text style={styles.retryText}>Reintentar</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {/* Confirmación de recepción: la dio el backend (201). El estado de la revisión es el que devuelve GET. */}
        {feedback.kind === "received" && !canSubmit ? (
          <View style={styles.successBox}>
            <Text style={styles.successText}>Recibimos tus documentos.</Text>
          </View>
        ) : null}

        {status === "pending" ? (
          <PendingView onRefresh={refreshPending} />
        ) : null}
        {status === "approved" ? (
          <ApprovedView fromBooking={fromBooking} />
        ) : null}
        {state.kind === "ready" && status === "rejected" ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorTitle}>
              Tu identificación fue rechazada
            </Text>
            <Text style={styles.errorText}>
              {state.verification.rejectionReason
                ? `Motivo: ${state.verification.rejectionReason}`
                : "No se indicó un motivo."}
            </Text>
            <Text style={styles.errorText}>
              Envía de nuevo el frente y el reverso de tu INE.
            </Text>
          </View>
        ) : null}

        {canSubmit ? (
          <DocumentsForm
            feedback={feedback}
            onCheck={check}
            onFeedback={setFeedback}
            onSubmitted={refresh}
            resubmission={status === "rejected"}
          />
        ) : null}

        <TouchableOpacity
          accessibilityRole="button"
          activeOpacity={0.8}
          onPress={goBack}
          style={styles.cancelButton}
        >
          <Text style={styles.cancelButtonText}>
            {fromBooking ? "Volver a la reserva" : "Volver"}
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

function PendingView({ onRefresh }: { onRefresh: () => Promise<void> }) {
  return (
    <View>
      <Text style={styles.sectionTitle}>En revisión</Text>
      <View style={styles.infoBox}>
        <Text style={styles.infoText}>
          Tu INE está en revisión. Podrás agendar consultas cuando tu identidad
          sea aprobada.
        </Text>
      </View>
      <TouchableOpacity
        accessibilityRole="button"
        activeOpacity={0.8}
        onPress={onRefresh}
        style={styles.saveButton}
      >
        <Text style={styles.saveButtonText}>Actualizar estado</Text>
      </TouchableOpacity>
    </View>
  );
}

// Aprobada: la reserva se ofrece solo si el backend confirma canBookAppointments (puede faltar otro requisito).
function ApprovedView({ fromBooking }: { fromBooking: boolean }) {
  const [canBook, setCanBook] = useState<boolean | null>(null);

  useEffect(() => {
    let active = true;
    getRegistrationStatus()
      .then((status) => {
        if (active) {
          setCanBook(status.canBookAppointments);
        }
      })
      .catch(() => {
        if (active) {
          setCanBook(false);
        }
      });
    return () => {
      active = false;
    };
  }, []);

  const book = useCallback(() => {
    if (fromBooking) {
      router.back();
      return;
    }
    router.push("/(app)/seleccioncita");
  }, [fromBooking]);

  return (
    <View>
      <Text style={styles.sectionTitle}>Identidad verificada</Text>
      <View style={styles.successBox}>
        <Text style={styles.successText}>Tu identidad fue aprobada.</Text>
      </View>
      {canBook === null ? (
        <ActivityIndicator color="#7355F7" style={styles.loader} />
      ) : null}
      {canBook ? (
        <TouchableOpacity
          accessibilityRole="button"
          activeOpacity={0.8}
          onPress={book}
          style={styles.saveButton}
        >
          <Text style={styles.saveButtonText}>
            {fromBooking ? "Continuar con la reserva" : "Agendar una cita"}
          </Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

function DocumentsForm({
  resubmission,
  feedback,
  onCheck,
  onFeedback,
  onSubmitted,
}: {
  resubmission: boolean;
  feedback: SubmitFeedback;
  onCheck: () => Promise<boolean>;
  onFeedback: (feedback: SubmitFeedback) => void;
  onSubmitted: () => Promise<void>;
}) {
  // Solo en memoria: se descartan al enviar con éxito o al salir de la pantalla.
  const [images, setImages] = useState<
    Record<Side, IdentityDocumentImage | null>
  >({ back: null, front: null });
  const [submitting, setSubmitting] = useState(false);
  const [checking, setChecking] = useState(false);
  // Guardia síncrona: dos toques en el mismo frame harían dos envíos (el backend solo admite uno pendiente).
  const exclusive = useExclusiveOperation();

  const choose = (side: Side, source: "camera" | "library") => async () => {
    try {
      const result = await pickImage(source);
      if (result.kind === "invalid") {
        onFeedback({ kind: "error", message: result.message });
        return;
      }
      if (result.kind === "image") {
        setImages((prev) => ({ ...prev, [side]: result.image }));
        onFeedback({ kind: "none" });
      }
    } catch {
      Alert.alert(
        "Error",
        source === "camera"
          ? "No se pudo abrir la cámara."
          : "No se pudo abrir la galería."
      );
    }
  };

  const openOptions = (side: Side) => () => {
    Alert.alert(SIDE_LABEL[side], "Selecciona una opción", [
      { onPress: choose(side, "camera"), text: "Cámara" },
      { onPress: choose(side, "library"), text: "Galería" },
      { style: "cancel", text: "Cancelar" },
    ]);
  };

  const handleSubmit = useCallback(async () => {
    const { front, back } = images;
    if (!(front && back) || exclusive.isBusy()) {
      return;
    }
    await exclusive.run(async () => {
      onFeedback({ kind: "none" });
      setSubmitting(true);
      try {
        await submitIdentityVerification(front, back);
        setImages({ back: null, front: null });
        onFeedback({ kind: "received" });
      } catch (error) {
        if (error instanceof ApiError && error.status === 409) {
          // Ya hay un envío pendiente o la identidad ya fue aprobada: se muestra el estado real.
          onFeedback({ kind: "error", message: error.message });
        } else {
          const message = submitErrorMessage(error);
          onFeedback(
            message ? { kind: "error", message } : { kind: "ambiguous" }
          );
          return;
        }
      } finally {
        setSubmitting(false);
      }
      await onSubmitted();
    });
  }, [exclusive, images, onFeedback, onSubmitted]);

  // Tras un resultado ambiguo: el backend dice si el envío quedó registrado. Si sigue sin poder confirmarse, se
  // mantiene el aviso ambiguo y las imágenes elegidas; si el envío no llegó, se pueden enviar otra vez.
  const handleCheck = useCallback(async () => {
    await exclusive.run(async () => {
      setChecking(true);
      try {
        if (await onCheck()) {
          onFeedback({ kind: "none" });
        }
      } finally {
        setChecking(false);
      }
    });
  }, [exclusive, onCheck, onFeedback]);

  const busy = submitting || checking;
  const ready = images.front !== null && images.back !== null;

  return (
    <View>
      <Text style={styles.sectionTitle}>
        {resubmission ? "Reenvía tu INE" : "Verifica tu identidad"}
      </Text>
      <Text style={styles.note}>
        Para agendar consultas necesitamos verificar tu identidad. Toma o elige
        una foto clara del frente y del reverso de tu INE (JPEG o PNG, máximo 5
        MB cada una).
      </Text>

      <DocumentSlot
        image={images.front}
        onPress={openOptions("front")}
        side="front"
      />
      <DocumentSlot
        image={images.back}
        onPress={openOptions("back")}
        side="back"
      />

      {feedback.kind === "error" ? (
        <View style={styles.errorBox}>
          <Text accessibilityRole="alert" style={styles.errorText}>
            {feedback.message}
          </Text>
        </View>
      ) : null}
      {feedback.kind === "ambiguous" ? (
        <View style={styles.errorBox}>
          <Text accessibilityRole="alert" style={styles.errorText}>
            {AMBIGUOUS_MESSAGE}
          </Text>
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
            <Text style={styles.saveButtonText}>Consultar estado</Text>
          )}
        </TouchableOpacity>
      ) : (
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityState={{ disabled: busy || !ready }}
          activeOpacity={0.8}
          disabled={busy || !ready}
          onPress={handleSubmit}
          style={[
            styles.saveButton,
            (busy || !ready) && styles.saveButtonDisabled,
          ]}
        >
          {submitting ? (
            <ActivityIndicator
              accessibilityLabel="Enviando"
              color="#FFFFFF"
              size="small"
            />
          ) : (
            <Text style={styles.saveButtonText}>
              {resubmission ? "Reenviar documentación" : "Enviar documentación"}
            </Text>
          )}
        </TouchableOpacity>
      )}
    </View>
  );
}

function DocumentSlot({
  side,
  image,
  onPress,
}: {
  side: Side;
  image: IdentityDocumentImage | null;
  onPress: () => void;
}) {
  return (
    <View style={styles.slotContainer}>
      <Text style={styles.fieldLabel}>{SIDE_LABEL[side]}</Text>
      <TouchableOpacity
        accessibilityLabel={SIDE_LABEL[side]}
        accessibilityRole="button"
        activeOpacity={0.7}
        onPress={onPress}
        style={styles.slot}
      >
        {image ? (
          <Image
            accessibilityLabel={PREVIEW_LABEL[side]}
            resizeMode="cover"
            source={{ uri: image.uri }}
            style={styles.preview}
          />
        ) : (
          <View style={styles.slotEmpty}>
            <SymbolView
              name={{ android: "photo_camera", ios: "camera" }}
              resizeMode="scaleAspectFit"
              size={26}
              tintColor="#9CA3AF"
            />
            <Text style={styles.slotHint}>Tomar o elegir foto</Text>
          </View>
        )}
      </TouchableOpacity>
      {image ? (
        <Text style={styles.slotChange}>Toca para cambiarla</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
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
  errorBox: {
    backgroundColor: "#FEE2E2",
    borderColor: "#FCA5A5",
    borderRadius: 12,
    borderWidth: 1,
    gap: 4,
    marginTop: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  errorText: {
    color: "#B91C1C",
    fontSize: 14,
    textAlign: "center",
  },
  errorTitle: {
    color: "#B91C1C",
    fontSize: 15,
    fontWeight: "700",
    textAlign: "center",
  },
  fieldLabel: {
    color: "#9CA3AF",
    fontSize: 12,
    marginBottom: 6,
    paddingHorizontal: 18,
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
  loader: {
    marginVertical: 24,
  },
  note: {
    color: "#6B7280",
    fontSize: 12,
    marginBottom: 16,
    paddingHorizontal: 18,
  },
  preview: {
    height: "100%",
    width: "100%",
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
  slot: {
    aspectRatio: 1.586,
    backgroundColor: "#F5F5F7",
    borderColor: "#E5E7EB",
    borderRadius: 14,
    borderWidth: 1,
    overflow: "hidden",
    width: "100%",
  },
  slotChange: {
    color: "#7355F7",
    fontSize: 12,
    marginTop: 6,
    paddingHorizontal: 18,
  },
  slotContainer: {
    marginBottom: 16,
  },
  slotEmpty: {
    alignItems: "center",
    flex: 1,
    gap: 8,
    justifyContent: "center",
  },
  slotHint: {
    color: "#6B7280",
    fontSize: 14,
    fontWeight: "500",
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
});
