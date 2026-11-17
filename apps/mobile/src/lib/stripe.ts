import * as Linking from "expo-linking";

// Stripe en la app (mismo flujo que apps/web): el SDK oficial @stripe/stripe-react-native crea el PaymentMethod (pm_…)
// con la tarjeta capturada en CardField y la app envía SOLO esa referencia al backend de PEI, que crea y confirma el
// PaymentIntent en el servidor. La app nunca recibe ni guarda una clave secreta.

// Clave PUBLICABLE desde EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY (pk_test_… en el periodo académico). EXPO_PUBLIC_* se inserta
// en el bundle: una clave secreta o restringida (sk_…, rk_…) nunca debe llegar aquí; si se configura por error, el pago
// queda deshabilitado.
const PUBLISHABLE_KEY = /^pk_(test|live)_[A-Za-z0-9]+$/;

export function stripePublishableKey(
  value: string | undefined = process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY
): string | null {
  const key = (value ?? "").trim();
  return PUBLISHABLE_KEY.test(key) ? key : null;
}

// Esquema de la app (app.json: "gestinovo"). Stripe vuelve aquí tras un reto 3-D Secure que abre el navegador.
export const STRIPE_URL_SCHEME = "gestinovo";

export function stripeReturnUrl(): string {
  return Linking.createURL("stripe-redirect");
}
