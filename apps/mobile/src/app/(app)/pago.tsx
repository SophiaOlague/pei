import {
  CardField,
  StripeProvider,
  useStripe,
} from "@stripe/stripe-react-native";
import { useLocalSearchParams } from "expo-router";
import * as SecureStore from "expo-secure-store";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from "react-native";
import {
  ApiError,
  type CardPaymentInput,
  getPatientAppointment,
  type PatientAppointment,
  type PatientPayment,
  payAppointment,
  syncAppointmentPayment,
} from "@/lib/api";
import {
  STRIPE_URL_SCHEME,
  stripePublishableKey,
  stripeReturnUrl,
} from "@/lib/stripe";

// F4 (móvil): pago de una consulta con Stripe, el mismo flujo que apps/web. CardField (SDK oficial
// @stripe/stripe-react-native) captura la tarjeta y crea el PaymentMethod (pm_…); la app envía SOLO esa referencia al
// backend de PEI con su sesión. El backend valida paciente y cita (CC-4), cobra el precio registrado en la cita, aplica
// la idempotencia, confirma el PaymentIntent con Stripe y confirma la cita con M08. El importe que se muestra viene del
// backend, no de los parámetros.
//
// 3-D Secure: si el banco exige autenticación, el backend responde processing con nextAction. El SDK muestra el reto y,
// al terminar (aprobado, rechazado o cancelado), se consulta el estado REAL en el backend. Completar el reto en el
// dispositivo nunca confirma la cita por sí mismo. El client_secret del reto solo vive en memoria.
//
// Idempotency-Key: una por cita, en SecureStore (solo la clave, nunca datos de la tarjeta). Se conserva ante errores de
// red o pagos pendientes y solo se renueva tras un rechazo o una cancelación.

export const idempotencyStorageKey = (appointmentId: string) =>
  `pei.payment.idempotency.${appointmentId}`;

// La clave solo debe ser única (no es un secreto). Hermes puede no exponer crypto.randomUUID: se usa una alternativa.
function newKey(): string {
  const uuid = globalThis.crypto?.randomUUID?.();
  if (uuid) {
    return `pay-${uuid}`;
  }
  const hex = Array.from({ length: 32 }, () =>
    Math.floor(Math.random() * 16).toString(16)
  ).join("");
  return `pay-${Date.now().toString(36)}-${hex}`;
}

async function currentKey(appointmentId: string): Promise<string> {
  const storageKey = idempotencyStorageKey(appointmentId);
  const stored = await SecureStore.getItemAsync(storageKey);
  if (stored) {
    return stored;
  }
  const key = newKey();
  await SecureStore.setItemAsync(storageKey, key);
  return key;
}

async function rotateKey(appointmentId: string): Promise<void> {
  await SecureStore.setItemAsync(
    idempotencyStorageKey(appointmentId),
    newKey()
  );
}

const formatMxn = (amount: string) => `$${Number(amount).toFixed(2)} MXN`;

export type PaymentMessage = {
  tone: "success" | "info" | "warning" | "error";
  title: string;
  detail: string;
  retry: boolean;
  sync: boolean;
};

// La consulta solo se muestra confirmada si M08 respondió confirmed o already_confirmed.
export function paymentMessage(p: PatientPayment): PaymentMessage {
  if (p.status === "succeeded") {
    if (p.appointmentConfirmed) {
      return {
        detail: `Cobramos ${formatMxn(p.amount)}.`,
        retry: false,
        sync: false,
        title: "Pago aprobado: tu consulta está confirmada",
        tone: "success",
      };
    }
    if (p.confirmation.result === "not_confirmable") {
      return {
        detail:
          "Tu consulta NO está confirmada. Revisaremos tu caso; si corresponde, el importe se reembolsará.",
        retry: false,
        sync: false,
        title: "Recibimos tu pago, pero no pudimos confirmar la consulta",
        tone: "warning",
      };
    }
    return {
      detail:
        "Tu consulta todavía no está confirmada. Consulta el estado en unos momentos.",
      retry: false,
      sync: true,
      title: "Recibimos tu pago; estamos confirmando tu consulta",
      tone: "info",
    };
  }
  if (p.status === "processing") {
    return {
      detail:
        "Tu consulta todavía no está confirmada. Consulta el estado en unos momentos.",
      retry: false,
      sync: true,
      title: "Tu pago se está procesando",
      tone: "info",
    };
  }
  if (p.status === "pending") {
    return {
      detail:
        "No recibimos la respuesta del procesador. Puedes reintentar: no se te cobrará dos veces.",
      retry: true,
      sync: false,
      title: "Tu pago está pendiente",
      tone: "warning",
    };
  }
  if (p.status === "failed") {
    return {
      detail: "No se realizó ningún cargo. Puedes intentar con otra tarjeta.",
      retry: true,
      sync: false,
      title: "Tu pago fue rechazado",
      tone: "error",
    };
  }
  if (p.status === "canceled") {
    return {
      detail: "No se realizó ningún cargo.",
      retry: true,
      sync: false,
      title: "El pago fue cancelado",
      tone: "error",
    };
  }
  return {
    detail: "Tu consulta no está confirmada. Contacta a soporte.",
    retry: false,
    sync: false,
    title: "El pago requiere revisión",
    tone: "warning",
  };
}

export default function PaymentScreen() {
  const { appointmentId } = useLocalSearchParams<{ appointmentId?: string }>();
  const publishableKey = stripePublishableKey();

  if (!appointmentId) {
    return <Notice text="Reserva un horario antes de pagar tu consulta." />;
  }
  if (!publishableKey) {
    return (
      <Notice text="El pago con tarjeta no está disponible en este momento." />
    );
  }
  return (
    <StripeProvider
      publishableKey={publishableKey}
      urlScheme={STRIPE_URL_SCHEME}
    >
      <AppointmentPayment appointmentId={appointmentId} />
    </StripeProvider>
  );
}

function AppointmentPayment({ appointmentId }: { appointmentId: string }) {
  const { createPaymentMethod, handleNextAction } = useStripe();
  const [appointment, setAppointment] = useState<PatientAppointment | null>(
    null
  );
  const [loadError, setLoadError] = useState<string | null>(null);
  const [payment, setPayment] = useState<PatientPayment | null>(null);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [cardError, setCardError] = useState<string | null>(null);
  const [authCanceled, setAuthCanceled] = useState(false);
  const [cardComplete, setCardComplete] = useState(false);
  const [busy, setBusy] = useState(false);
  // Cada intento nuevo vuelve a montar CardField: la referencia de la tarjeta es de un solo uso.
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    getPatientAppointment(appointmentId)
      .then(setAppointment)
      .catch((e: unknown) =>
        setLoadError(
          e instanceof ApiError ? e.message : "No se pudo cargar la cita."
        )
      );
  }, [appointmentId]);

  // Autenticación 3-D Secure, si el pago la requiere. Pase lo que pase en el reto, el resultado que se muestra es el que
  // informa el backend tras consultar a Stripe.
  const authenticate = useCallback(
    async (result: PatientPayment): Promise<PatientPayment> => {
      if (result.status !== "processing" || !result.nextAction) {
        return result;
      }
      try {
        const { error } = await handleNextAction(
          result.nextAction.clientSecret,
          stripeReturnUrl()
        );
        if (error?.code === "Canceled") {
          setAuthCanceled(true);
        }
      } catch {
        // Sin registrar el detalle: el estado real se consulta a continuación.
      }
      try {
        return await syncAppointmentPayment(result.paymentId);
      } catch {
        // No se pudo consultar ahora: el paciente puede hacerlo con «Consultar estado del pago».
        return { ...result, nextAction: undefined };
      }
    },
    [handleNextAction]
  );

  const submit = useCallback(
    async (card: CardPaymentInput) => {
      setRequestError(null);
      try {
        const result = await payAppointment(
          appointmentId,
          await currentKey(appointmentId),
          card
        );
        const settled = await authenticate(result);
        setPayment(settled);
        if (settled.status === "failed" || settled.status === "canceled") {
          await rotateKey(appointmentId);
        }
      } catch (e) {
        // Error de red o del servidor: se conserva la clave para reintentar sin duplicar el cobro.
        setRequestError(
          e instanceof ApiError
            ? e.message
            : "No se pudo completar el pago. Inténtalo de nuevo."
        );
      }
    },
    [appointmentId, authenticate]
  );

  const pay = useCallback(async () => {
    if (busy || !cardComplete) {
      return;
    }
    setBusy(true);
    setCardError(null);
    setAuthCanceled(false);
    try {
      const { paymentMethod, error } = await createPaymentMethod({
        paymentMethodType: "Card",
      });
      if (error || !paymentMethod) {
        // La tarjeta no se pudo tokenizar: no se llama al backend ni se cobra nada.
        setCardError(
          error?.localizedMessage ??
            error?.message ??
            "No se pudo leer la tarjeta. Revisa los datos."
        );
        return;
      }
      await submit({ token: paymentMethod.id });
      setAttempt((n) => n + 1);
      setCardComplete(false);
    } finally {
      setBusy(false);
    }
  }, [busy, cardComplete, createPaymentMethod, submit]);

  const onCardChange = useCallback((details: { complete: boolean }) => {
    setCardComplete(details.complete);
    setCardError(null);
  }, []);

  const sync = useCallback(async () => {
    if (!payment) {
      return;
    }
    setBusy(true);
    setRequestError(null);
    try {
      setPayment(await syncAppointmentPayment(payment.paymentId));
    } catch (e) {
      setRequestError(
        e instanceof ApiError
          ? e.message
          : "No se pudo consultar el estado del pago."
      );
    } finally {
      setBusy(false);
    }
  }, [payment]);

  if (loadError) {
    return <Notice text={loadError} />;
  }
  if (!appointment) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
        <Text>Cargando tu cita…</Text>
      </View>
    );
  }

  const message = payment ? paymentMessage(payment) : null;
  const payable = appointment.status === "pending_payment";
  const showForm = payable && (!message || message.retry);

  return (
    <View style={styles.container}>
      <StatusBar backgroundColor="#FFFFFF" barStyle="dark-content" />
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.title}>Pago de la consulta</Text>
        <Text accessibilityLabel="Importe de la consulta" style={styles.amount}>
          {formatMxn(appointment.price)}
        </Text>

        {message ? (
          <View style={[styles.box, TONE[message.tone]]}>
            <Text style={styles.boxTitle}>{message.title}</Text>
            <Text>{message.detail}</Text>
            {message.sync ? (
              <Pressable
                accessibilityRole="button"
                disabled={busy}
                onPress={sync}
                style={styles.button}
              >
                <Text style={styles.buttonText}>Consultar estado del pago</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}

        {authCanceled ? (
          <Text accessibilityRole="alert" style={styles.note}>
            Cancelaste la verificación de tu banco. El estado que ves es el que
            registró el pago.
          </Text>
        ) : null}
        {requestError ? (
          <Text accessibilityRole="alert" style={styles.error}>
            {requestError}
          </Text>
        ) : null}
        {payable || payment ? null : (
          <Text accessibilityRole="alert" style={styles.error}>
            Esta cita ya no admite pago. Si la retención venció, vuelve a
            reservar el horario.
          </Text>
        )}

        {showForm ? (
          <CardForm
            amount={appointment.price}
            attempt={attempt}
            busy={busy}
            cardComplete={cardComplete}
            cardError={cardError}
            onCardChange={onCardChange}
            onPay={pay}
          />
        ) : null}

        {busy ? <ActivityIndicator /> : null}
      </ScrollView>
    </View>
  );
}

function CardForm({
  amount,
  attempt,
  busy,
  cardComplete,
  cardError,
  onCardChange,
  onPay,
}: {
  amount: string;
  attempt: number;
  busy: boolean;
  cardComplete: boolean;
  cardError: string | null;
  onCardChange: (details: { complete: boolean }) => void;
  onPay: () => void;
}) {
  const disabled = busy || !cardComplete;
  return (
    <View style={styles.form}>
      <Text style={styles.label}>Datos de la tarjeta</Text>
      <CardField
        cardStyle={CARD_STYLE}
        key={attempt}
        onCardChange={onCardChange}
        postalCodeEnabled={false}
        style={styles.card}
        testID="stripe-card-field"
      />
      {cardError ? (
        <Text accessibilityRole="alert" style={styles.error}>
          {cardError}
        </Text>
      ) : null}
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled }}
        disabled={disabled}
        onPress={onPay}
        style={[styles.payButton, disabled ? styles.payButtonDisabled : null]}
      >
        <Text style={styles.payButtonText}>
          {busy ? "Procesando…" : `Pagar ${formatMxn(amount)}`}
        </Text>
      </Pressable>
    </View>
  );
}

function Notice({ text }: { text: string }) {
  return (
    <View style={styles.center}>
      <Text accessibilityRole="alert">{text}</Text>
    </View>
  );
}

// Estilos propios de CardField (no son estilos de React Native).
const CARD_STYLE = {
  backgroundColor: "#FFFFFF",
  borderColor: "#D1D5DB",
  borderRadius: 8,
  borderWidth: 1,
  textColor: "#111827",
};

const TONE = StyleSheet.create({
  error: { backgroundColor: "#FEF2F2", borderColor: "#FCA5A5" },
  info: { backgroundColor: "#EFF6FF", borderColor: "#93C5FD" },
  success: { backgroundColor: "#F0FDF4", borderColor: "#86EFAC" },
  warning: { backgroundColor: "#FFFBEB", borderColor: "#FCD34D" },
});

const styles = StyleSheet.create({
  amount: { color: "#7355F7", fontSize: 18, fontWeight: "700" },
  box: { borderRadius: 10, borderWidth: 1, gap: 6, padding: 14 },
  boxTitle: { fontWeight: "700" },
  button: {
    alignItems: "center",
    borderColor: "#7355F7",
    borderRadius: 8,
    borderWidth: 1,
    marginTop: 8,
    padding: 10,
  },
  buttonText: { color: "#7355F7", fontWeight: "600" },
  card: { height: 50, width: "100%" },
  center: {
    alignItems: "center",
    flex: 1,
    gap: 8,
    justifyContent: "center",
    padding: 20,
  },
  container: { backgroundColor: "#FFFFFF", flex: 1 },
  content: { gap: 12, padding: 20 },
  error: { color: "#B91C1C" },
  form: { gap: 10 },
  label: { color: "#374151", fontWeight: "600" },
  note: { color: "#92400E" },
  payButton: {
    alignItems: "center",
    backgroundColor: "#7355F7",
    borderRadius: 8,
    padding: 14,
  },
  payButtonDisabled: { opacity: 0.5 },
  payButtonText: { color: "#FFFFFF", fontWeight: "700" },
  title: { color: "#111827", fontSize: 20, fontWeight: "700" },
});
