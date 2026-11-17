// Stripe.js v3 para el navegador. Stripe exige cargarlo desde su dominio oficial (no se empaqueta ni se aloja en PEI),
// así que se carga en el cliente, sin dependencia npm adicional. Solo recibe la clave PUBLICABLE (pk_…): la clave
// secreta vive en el backend.

export const STRIPE_SDK_URL = "https://js.stripe.com/v3";

export interface StripeError {
  // Mensaje para el usuario, ya localizado por Stripe (p. ej. «El número de tu tarjeta está incompleto»).
  message?: string;
  code?: string;
  type?: string;
}

export interface StripeCardElement {
  mount: (container: HTMLElement) => void;
  unmount: () => void;
  destroy?: () => void;
  on: (
    event: "ready" | "change",
    handler: (event: { complete?: boolean; error?: StripeError }) => void,
  ) => void;
}

export interface StripeElements {
  create: (
    type: "card",
    options?: { hidePostalCode?: boolean; disableLink?: boolean },
  ) => StripeCardElement;
}

export interface StripeInstance {
  elements: (options?: { locale?: string }) => StripeElements;
  // Tokeniza la tarjeta en Stripe y devuelve solo la referencia (pm_…).
  createPaymentMethod: (params: {
    type: "card";
    card: StripeCardElement;
  }) => Promise<{ paymentMethod?: { id: string }; error?: StripeError }>;
  // Completa la autenticación 3-D Secure de un pago que la requiere.
  handleNextAction: (params: {
    clientSecret: string;
  }) => Promise<{ paymentIntent?: { status: string }; error?: StripeError }>;
}

export type StripeFactory = (
  publishableKey: string,
  options?: { locale?: string },
) => StripeInstance;

declare global {
  interface Window {
    Stripe?: StripeFactory;
  }
}

let loading: Promise<StripeFactory> | null = null;

// Carga el script una sola vez por página.
export function loadStripe(): Promise<StripeFactory> {
  if (typeof window === "undefined")
    return Promise.reject(new Error("Stripe solo se carga en el navegador"));
  if (window.Stripe) return Promise.resolve(window.Stripe);
  loading ??= new Promise<StripeFactory>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = STRIPE_SDK_URL;
    script.async = true;
    script.onload = () =>
      window.Stripe
        ? resolve(window.Stripe)
        : reject(new Error("SDK de Stripe no disponible"));
    script.onerror = () => {
      loading = null;
      reject(new Error("No se pudo cargar el SDK de Stripe"));
    };
    document.head.appendChild(script);
  });
  return loading;
}

const instances = new Map<string, StripeInstance>();

// Una sola instancia por clave: el formulario y la autenticación 3-D Secure usan la misma.
export async function getStripe(
  publishableKey: string,
): Promise<StripeInstance> {
  const existing = instances.get(publishableKey);
  if (existing) return existing;
  const factory = await loadStripe();
  const instance = factory(publishableKey, { locale: "es-419" });
  instances.set(publishableKey, instance);
  return instance;
}

// Solo para pruebas: olvida las instancias creadas.
export function resetStripeForTests(): void {
  instances.clear();
  loading = null;
}

// Clave PUBLICABLE del cliente (pk_test_… en el periodo académico). Una clave secreta o restringida (sk_…, rk_…) nunca
// debe llegar al navegador: si se configura por error, el pago queda deshabilitado.
export function stripePublishableKey(
  env: Record<string, string | undefined> = {
    key: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,
  },
): string | null {
  const key = (env.key ?? "").trim();
  return /^pk_(test|live)_[A-Za-z0-9]+$/.test(key) ? key : null;
}
