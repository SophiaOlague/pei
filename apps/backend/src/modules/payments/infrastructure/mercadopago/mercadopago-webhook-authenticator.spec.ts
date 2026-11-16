import { createHmac } from 'crypto';
import { WebhookAuthenticationError, type RawWebhookRequest } from '../../application/ports/provider-webhook.port';
import {
  computeSignature,
  MercadoPagoWebhookAuthenticator,
  parseSignatureHeader,
  sanitizeWebhookPayload,
  signatureManifest,
  UnconfiguredWebhookAuthenticator,
} from './mercadopago-webhook-authenticator';

// Firma x-signature de Mercado Pago con una clave sintética (sin red ni credenciales reales). La firma esperada se
// calcula aquí de forma independiente con createHmac, siguiendo el manifiesto documentado por Mercado Pago.
const SECRET = 'clave-secreta-sintetica-de-prueba-0001';
const NOW = new Date('2026-11-14T12:00:00Z');
const TS = String(NOW.getTime());
const REQUEST_ID = 'bb56a2f1-6aae-46ac-982e-9dcd3581d08e';

const hmac = (manifest: string, secret = SECRET) => createHmac('sha256', secret).update(manifest).digest('hex');

function request(over: { dataId?: string; requestId?: string | null; ts?: string; signature?: string | null; body?: unknown; query?: string } = {}): RawWebhookRequest {
  const dataId = over.dataId ?? '123456789';
  const requestId = over.requestId === undefined ? REQUEST_ID : over.requestId;
  const ts = over.ts ?? TS;
  const v1 = hmac(`id:${dataId.toLowerCase()};request-id:${requestId};ts:${ts};`);
  const headers: Record<string, string> = {};
  if (over.signature !== null) headers['x-signature'] = over.signature ?? `ts=${ts},v1=${v1}`;
  if (requestId !== null) headers['x-request-id'] = requestId;
  return {
    url: `/webhooks/mercado-pago?${over.query ?? `data.id=${dataId}&type=payment`}`,
    headers,
    body: over.body ?? { action: 'payment.updated', api_version: 'v1', data: { id: dataId }, date_created: '2026-11-14T12:00:00Z', id: 12345, live_mode: false, type: 'payment', user_id: 999 },
  };
}

const auth = (toleranceMs: number | null = null) => new MercadoPagoWebhookAuthenticator({ secret: SECRET, toleranceMs, now: () => NOW });
const reason = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(WebhookAuthenticationError);
    return (e as WebhookAuthenticationError).reason;
  }
  throw new Error('no lanzó');
};

describe('MercadoPagoWebhookAuthenticator · firma válida', () => {
  it('acepta una notificación firmada y devuelve solo los datos firmados y un payload acotado', () => {
    const n = auth().authenticate(request());
    expect(n).toEqual({
      provider: 'mercado_pago', topic: 'payment', action: 'payment.updated', dataId: '123456789', requestId: REQUEST_ID,
      payload: { data: { id: '123456789' }, id: '12345', type: 'payment', action: 'payment.updated', api_version: 'v1', date_created: '2026-11-14T12:00:00Z', live_mode: false },
    });
    // user_id (cuenta del cobrador) y cualquier campo no permitido no se guardan.
    expect(n.payload).not.toHaveProperty('user_id');
  });

  it('el manifiesto sigue el formato de Mercado Pago y usa data.id en minúsculas', () => {
    expect(signatureManifest('ABC123', REQUEST_ID, TS)).toBe(`id:abc123;request-id:${REQUEST_ID};ts:${TS};`);
    expect(computeSignature(SECRET, 'x')).toBe(hmac('x'));
    expect(auth().authenticate(request({ dataId: 'ABC123' })).dataId).toBe('ABC123');
  });

  it('acepta v1 en mayúsculas, espacios en la cabecera y ts en segundos', () => {
    const v1 = hmac(`id:1;request-id:${REQUEST_ID};ts:1763121600;`).toUpperCase();
    expect(auth().authenticate(request({ dataId: '1', ts: '1763121600', signature: ` ts=1763121600 , v1=${v1} ` })).dataId).toBe('1');
  });

  it('sin data.id en el cuerpo basta el de la query (firmado); el tema puede venir del cuerpo', () => {
    expect(auth().authenticate(request({ body: { type: 'payment' }, query: 'data.id=123456789' })).topic).toBe('payment');
  });
});

describe('MercadoPagoWebhookAuthenticator · rechazos', () => {
  it.each([
    ['firma calculada con otra clave', { signature: `ts=${TS},v1=${hmac(`id:123456789;request-id:${REQUEST_ID};ts:${TS};`, 'otra-clave-secreta-0000')}` }, 'invalid_signature'],
    ['v1 alterada', { signature: `ts=${TS},v1=${'0'.repeat(64)}` }, 'invalid_signature'],
    ['ts alterado (la firma cubre ts)', { signature: `ts=${Number(TS) + 1},v1=${hmac(`id:123456789;request-id:${REQUEST_ID};ts:${TS};`)}` }, 'invalid_signature'],
    ['sin x-signature (formato IPN)', { signature: null, query: 'topic=payment&id=123456789' }, 'missing_signature'],
    ['x-signature sin v1', { signature: `ts=${TS}` }, 'malformed_signature'],
    ['v1 que no es hexadecimal de 64', { signature: `ts=${TS},v1=abc` }, 'malformed_signature'],
    ['sin x-request-id', { requestId: null }, 'missing_request_id'],
    ['sin data.id en la query', { query: 'type=payment' }, 'missing_data_id'],
    ['data.id con caracteres no permitidos', { dataId: '12;ts:1' }, 'missing_data_id'],
  ])('%s', (_n, over, expected) => {
    expect(reason(() => auth().authenticate(request(over as Parameters<typeof request>[0])))).toBe(expected);
  });

  it('otra petición firmada no sirve para otro data.id (la firma cubre data.id y x-request-id)', () => {
    const signed = request({ dataId: '111' });
    expect(reason(() => auth().authenticate({ ...signed, url: '/webhooks/mercado-pago?data.id=222&type=payment' }))).toBe('invalid_signature');
    expect(reason(() => auth().authenticate({ ...signed, headers: { ...signed.headers, 'x-request-id': 'otro-request-id' } }))).toBe('invalid_signature');
  });

  it('el data.id del cuerpo (sin firmar) debe ser el firmado', () => {
    expect(reason(() => auth().authenticate(request({ body: { type: 'payment', data: { id: '999' } } })))).toBe('data_id_mismatch');
  });

  it('sin tema reconocible', () => {
    expect(reason(() => auth().authenticate(request({ query: 'data.id=123456789', body: {} })))).toBe('missing_topic');
  });

  it('tolerancia de ts: solo se comprueba si está configurada', () => {
    const old = String(NOW.getTime() - 10 * 60_000);
    const r = request({ ts: old });
    expect(auth().authenticate(r).dataId).toBe('123456789');
    expect(reason(() => auth(5 * 60_000).authenticate(r))).toBe('stale_timestamp');
    expect(auth(15 * 60_000).authenticate(r).dataId).toBe('123456789');
  });

  it('el error no contiene la clave ni las firmas', () => {
    try {
      auth().authenticate(request({ signature: `ts=${TS},v1=${'a'.repeat(64)}` }));
    } catch (e) {
      const text = `${(e as Error).message} ${JSON.stringify(e)}`;
      expect(text).not.toContain(SECRET);
      expect(text).not.toContain('a'.repeat(64));
      expect(text).not.toContain(hmac(`id:123456789;request-id:${REQUEST_ID};ts:${TS};`));
    }
  });

  it('sin clave secreta: el autenticador sin configurar rechaza todo y el real no se construye', () => {
    expect(reason(() => new UnconfiguredWebhookAuthenticator().authenticate())).toBe('not_configured');
    expect(() => new MercadoPagoWebhookAuthenticator({ secret: ' ' })).toThrow('falta la clave secreta');
  });
});

// Revisión contra la documentación oficial (2026-11-14): manifiesto `id:[data.id_url];request-id:[x-request-id_header];ts:[ts_header];`,
// data.id de la query y en minúsculas si es alfanumérico, HMAC-SHA256 en hexadecimal; ts «en milisegundos» aunque los
// ejemplos lo muestran en segundos; la tolerancia es opcional y sin valor recomendado; los reenvíos ocurren a los 15 min
// y luego con plazos crecientes (horas o días), sin constancia de que renueven ts.
describe('MercadoPagoWebhookAuthenticator · casos límite', () => {
  const signed = (dataId: string, ts: string, requestId = REQUEST_ID) => `ts=${ts},v1=${hmac(`id:${dataId.toLowerCase()};request-id:${requestId};ts:${ts};`)}`;

  it('data.id alfanumérico en mayúsculas (órdenes): se firma en minúsculas y se conserva tal cual', () => {
    const id = 'ORD01JQ4S4KY8HWQ6NA5PXB65B3D3';
    const n = auth().authenticate(request({ dataId: id, body: { type: 'order', data: { id } }, query: `data.id=${id}&type=order` }));
    expect(n).toMatchObject({ dataId: id, topic: 'order' });
    // Firmar con el data.id en mayúsculas NO es válido.
    const wrong = `ts=${TS},v1=${hmac(`id:${id};request-id:${REQUEST_ID};ts:${TS};`)}`;
    expect(reason(() => auth().authenticate(request({ dataId: id, signature: wrong, query: `data.id=${id}&type=order` })))).toBe('invalid_signature');
  });

  it('data.id codificado en la URL se decodifica antes de firmar', () => {
    expect(auth().authenticate(request({ dataId: 'abc-123', query: 'data.id=abc%2D123&type=payment' })).dataId).toBe('abc-123');
  });

  it('data.id repetido en la query: cuenta el primero (el firmado) y el cuerpo debe coincidir', () => {
    expect(auth().authenticate(request({ dataId: '1', query: 'data.id=1&data.id=2&type=payment', body: { type: 'payment' } })).dataId).toBe('1');
  });

  it('x-request-id forma parte de la firma tal cual (sin normalizar)', () => {
    const rid = 'BB56A2F1-6AAE-46AC-982E-9DCD3581D08E';
    expect(auth().authenticate(request({ requestId: rid })).requestId).toBe(rid);
    const lower = request({ requestId: rid });
    expect(reason(() => auth().authenticate({ ...lower, headers: { ...lower.headers, 'x-signature': signed('123456789', TS, rid.toLowerCase()) } }))).toBe('invalid_signature');
  });

  it('cabecera x-signature repetida (lista) o con claves extra y repetidas', () => {
    const r = request();
    expect(auth().authenticate({ ...r, headers: { ...r.headers, 'x-signature': [String(r.headers['x-signature']), 'ts=1,v1=00'] } }).dataId).toBe('123456789');
    expect(auth().authenticate({ ...r, headers: { ...r.headers, 'x-signature': `v2=zz,${String(r.headers['x-signature'])},extra` } }).dataId).toBe('123456789');
    // Clave repetida: vale la última; si es falsa, se rechaza.
    expect(reason(() => auth().authenticate({ ...r, headers: { ...r.headers, 'x-signature': `${String(r.headers['x-signature'])},v1=${'f'.repeat(64)}` } }))).toBe('invalid_signature');
  });

  it('ts no numérico o vacío: firma mal formada', () => {
    expect(reason(() => auth().authenticate(request({ signature: `ts=abc,v1=${'a'.repeat(64)}` })))).toBe('malformed_signature');
    expect(reason(() => auth().authenticate(request({ signature: `ts=,v1=${'a'.repeat(64)}` })))).toBe('malformed_signature');
  });

  it('sin tolerancia (configuración por defecto): un reenvío con el ts original de hace 4 días se acepta', () => {
    const old = String(NOW.getTime() - 96 * 3_600_000);
    expect(auth().authenticate(request({ ts: old })).dataId).toBe('123456789');
  });

  it('con tolerancia: el límite exacto se acepta y 1 ms más se rechaza, también hacia el futuro', () => {
    const tol = 5 * 60_000;
    expect(auth(tol).authenticate(request({ ts: String(NOW.getTime() - tol) })).dataId).toBe('123456789');
    expect(reason(() => auth(tol).authenticate(request({ ts: String(NOW.getTime() - tol - 1) })))).toBe('stale_timestamp');
    expect(reason(() => auth(tol).authenticate(request({ ts: String(NOW.getTime() + tol + 1) })))).toBe('stale_timestamp');
  });

  it('ts en segundos (10 dígitos) y en milisegundos (13 dígitos) se interpretan igual', () => {
    const seconds = String(Math.floor(NOW.getTime() / 1000));
    expect(auth(1_000).authenticate(request({ ts: seconds })).dataId).toBe('123456789');
    expect(auth(1_000).authenticate(request({ ts: String(NOW.getTime()) })).dataId).toBe('123456789');
  });

  it('la tolerancia se comprueba DESPUÉS de la firma: un ts falsificado no llega a evaluarse', () => {
    expect(reason(() => auth(1_000).authenticate(request({ signature: `ts=1,v1=${'a'.repeat(64)}` })))).toBe('invalid_signature');
  });

  it('notificación sin x-request-id: se rechaza (decisión: la clave única del evento lo exige), aunque la documentación permite omitirlo del manifiesto', () => {
    const r = request({ requestId: null });
    expect(reason(() => auth().authenticate({ ...r, headers: { 'x-signature': `ts=${TS},v1=${hmac(`id:123456789;ts:${TS};`)}` } }))).toBe('missing_request_id');
  });
});

describe('parseSignatureHeader y sanitizeWebhookPayload', () => {
  it('ignora partes desconocidas y exige ts y v1', () => {
    expect(parseSignatureHeader(`ts=1,v1=${'b'.repeat(64)},v2=x`)).toEqual({ ts: '1', v1: 'b'.repeat(64) });
    expect(() => parseSignatureHeader('v1=')).toThrow(WebhookAuthenticationError);
  });

  it('descarta campos no permitidos, demasiado largos o de tipo incorrecto, y fija data.id al firmado', () => {
    expect(sanitizeWebhookPayload({ status: 'approved', transaction_amount: 1, card: { number: '4' }, type: 'x'.repeat(65), live_mode: 'true', data: { id: 'otro' } }, '5'))
      .toEqual({ data: { id: '5' } });
    expect(sanitizeWebhookPayload(null, '5')).toEqual({ data: { id: '5' } });
  });
});
