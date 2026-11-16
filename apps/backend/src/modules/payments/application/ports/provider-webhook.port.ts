import type { ProviderName } from './payment-provider.port';

// F3.3 (PAY-15): webhooks del proveedor. La aplicación solo conoce estos contratos; el formato de Mercado Pago (cabecera
// x-signature, query data.id, cuerpo) lo conoce únicamente su autenticador en infrastructure/mercadopago.
//
// Un webhook NUNCA prueba el pago: solo avisa de que algo cambió. El estado real se consulta siempre con la API del
// proveedor (PaymentProviderPort.getPayment) antes de aplicar cualquier transición.

export const PROVIDER_WEBHOOK_AUTHENTICATOR = Symbol('PROVIDER_WEBHOOK_AUTHENTICATOR');
export const PROVIDER_WEBHOOK_EVENT_REPOSITORY = Symbol('PROVIDER_WEBHOOK_EVENT_REPOSITORY');
export const WEBHOOK_EVENT_DISPATCHER = Symbol('WEBHOOK_EVENT_DISPATCHER');

// Petición HTTP tal como llegó. `url` incluye la query (p. ej. /webhooks/mercado-pago?data.id=1&type=payment).
export interface RawWebhookRequest {
  url: string;
  // Nombres en minúsculas (como los entrega Node).
  headers: Readonly<Record<string, string | string[] | undefined>>;
  body: unknown;
  // Bytes exactos del cuerpo tal como llegaron. Stripe firma el cuerpo: su autenticador lo exige y nunca usa `body`.
  rawBody?: Buffer;
}

// Notificación cuya firma se verificó. Solo `dataId` y `requestId` están cubiertos por la firma; `topic`, `action` y
// `payload` vienen del cuerpo o de la query sin firmar y nunca deciden el estado de un pago.
export interface AuthenticatedWebhookNotification {
  provider: ProviderName;
  topic: string;
  action: string | null;
  dataId: string;
  requestId: string;
  // Solo campos permitidos y acotados del cuerpo (sin cabeceras ni firma). Se guarda para auditoría.
  payload: Record<string, unknown>;
}

export type WebhookAuthenticationFailure =
  | 'not_configured' // falta el secreto de firma: se rechaza todo (falla cerrada)
  | 'missing_signature'
  | 'malformed_signature'
  | 'invalid_signature'
  | 'stale_timestamp'
  | 'missing_request_id'
  | 'missing_data_id'
  | 'data_id_mismatch' // el data.id del cuerpo no es el firmado (query)
  | 'missing_topic'
  | 'missing_raw_body' // el proveedor firma el cuerpo y no se conservaron sus bytes originales
  | 'malformed_payload' // el cuerpo firmado no es un evento con la forma esperada
  | 'environment_mismatch'; // evento de modo real en un entorno de prueba, o al revés

// Error de autenticación. El mensaje no incluye el secreto, la firma recibida ni la calculada.
export class WebhookAuthenticationError extends Error {
  constructor(readonly reason: WebhookAuthenticationFailure) {
    super(`Webhook rechazado: ${reason}`);
    this.name = 'WebhookAuthenticationError';
  }
}

export interface ProviderWebhookAuthenticator {
  readonly provider: ProviderName;
  // Lanza WebhookAuthenticationError si la petición no está firmada correctamente.
  authenticate(request: RawWebhookRequest): AuthenticatedWebhookNotification;
}

// Fila de provider_webhook_event (0017). Las filas con firma inválida no se registran (ver el caso de uso).
export type WebhookEventStatus = 'received' | 'processing' | 'processed' | 'failed' | 'ignored';

export interface WebhookEventRecord {
  id: string;
  provider: ProviderName;
  topic: string;
  action: string | null;
  dataId: string;
  requestId: string;
  status: WebhookEventStatus;
  paymentId: string | null;
  receivedAt: Date;
  processedAt: Date | null;
  processingAttempts: number;
  lastError: string | null;
}

export interface NewWebhookEvent {
  provider: ProviderName;
  topic: string;
  action: string | null;
  dataId: string;
  requestId: string;
  payload: Record<string, unknown>;
  status: 'received' | 'ignored';
  receivedAt: Date;
}

export interface WebhookEventOutcome {
  status: 'processed' | 'ignored' | 'failed';
  at: Date;
  // Se fija una sola vez (provider_webhook_event_guard); el repositorio no sobrescribe uno ya registrado.
  paymentId?: string | null;
  lastError?: string | null;
}

export interface ClaimOptions {
  now: Date;
  maxAttempts: number;
  // Si se indica, también se reclaman eventos `processing` recibidos antes de esta fecha (proceso caído a medias).
  reclaimProcessingReceivedBefore?: Date;
}

export interface RetryableQuery {
  maxAttempts: number;
  // Eventos `received` más antiguos que esto (el despacho inmediato no llegó a procesarlos).
  receivedBefore: Date;
  // Eventos `processing` más antiguos que esto.
  processingReceivedBefore: Date;
  limit: number;
  // H-6 etapa 2 (R-3): backoff. Índice = intentos ya hechos; un `failed` con n intentos solo es elegible si se recibió
  // antes de failedReceivedBefore[n]. Sin la lista (o sin entrada para n), sin espera.
  failedReceivedBefore?: readonly Date[];
  // H-6 etapa 2 (R-4): códigos de last_error que el barrido NO reintenta (errores permanentes).
  excludeFailures?: readonly { kind: 'exact' | 'prefix'; value: string }[];
}

export interface WebhookEventRepository {
  // Lanza UniqueConstraintViolationError (provider_webhook_event_uq) si el evento ya existe.
  insert(event: NewWebhookEvent): Promise<string>;
  findByKey(key: { provider: ProviderName; topic: string; dataId: string; requestId: string }): Promise<WebhookEventRecord | null>;
  // Reclama el evento de forma atómica (received | failed → processing, intentos + 1). null si no es reclamable:
  // ya procesado o ignorado, en proceso por otro, o sin intentos disponibles.
  claim(id: string, options: ClaimOptions): Promise<WebhookEventRecord | null>;
  // Cierra el intento. No modifica un evento ya `processed` o `ignored`.
  finish(id: string, outcome: WebhookEventOutcome): Promise<void>;
  findRetryable(query: RetryableQuery): Promise<string[]>;
}

// Entrega del evento al procesamiento en segundo plano (PAY-15: responder rápido). La implementación en proceso no es
// durable: si el proceso cae, el reintento periódico (RetryProviderWebhookEventsUseCase) lo recoge.
export interface WebhookEventDispatcher {
  dispatch(eventId: string): void;
}
