import { Redirect } from "expo-router";

// La ruta raíz de la app autenticada lleva a Inicio. Aquí estaba el prototipo de llamadas contra un servidor externo,
// que se retiró: la videoconsulta parte siempre de una cita real (Inicio → /joincall).
export default function AppIndex() {
  return <Redirect href="/home" />;
}
