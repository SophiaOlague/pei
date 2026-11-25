import { Logger } from '@nestjs/common';
import type { Participant } from '../../domain/presence';
import { VideoProviderUnavailableError } from '../../domain/video.errors';
import type { VideoProvider } from '../../application/ports/video.ports';
import type { RealtimeKitSettings } from './realtimekit.config';

// Adaptador de Cloudflare RealtimeKit (API REST v4). Solo transporta audio y video desde la admisión: nunca decide un
// resultado (decisión 3). Endpoints usados (base https://api.cloudflare.com/client/v4/accounts/{account}/realtime/kit/{app}):
//   POST   /meetings                                         crear la reunión (sala del proveedor)
//   POST   /meetings/{meeting}/participants                  alta del participante con su preset; devuelve su token
//   POST   /meetings/{meeting}/participants/{participant}/token  token nuevo para un participante existente (reconexión)
//   DELETE /meetings/{meeting}/participants/{participant}    baja del participante al finalizar (decisión 7)
//
// Revocación: se elimina al participante y no solo su token. «Revoke participant token» invalida un único token y
// Cloudflare documenta que los demás tokens del participante siguen válidos; tras la baja, ninguno sirve para volver a
// entrar. La documentación no dice si la baja expulsa a quien ya está conectado: hay que comprobarlo con una llamada
// real (por eso el cliente del médico debe además expulsar a todos con el SDK).
//
// Cualquier fallo (red, tiempo agotado, HTTP no 2xx, `success: false`, respuesta sin los campos esperados) se traduce
// a VideoProviderUnavailableError. Los logs solo incluyen la operación, el código HTTP y los códigos de error de
// Cloudflare: nunca el token de la API ni los tokens de los participantes.

export interface HttpResponseLike {
  status: number;
  json(): Promise<unknown>;
}
export type FetchLike = (
  url: string,
  init: { method: string; headers: Record<string, string>; body?: string; signal: AbortSignal },
) => Promise<HttpResponseLike>;

const BASE_URL = 'https://api.cloudflare.com/client/v4';
const DISPLAY_NAME: Record<Participant, string> = { doctor: 'Médico', patient: 'Paciente' };

type Operation = 'create_meeting' | 'add_participant' | 'refresh_token' | 'delete_participant';

class RealtimeKitCallError extends Error {
  constructor(
    readonly operation: Operation,
    readonly httpStatus: number | null,
    readonly reason: string,
  ) {
    super(`RealtimeKit ${operation}: ${reason}`);
  }
}

export class RealtimeKitVideoProvider implements VideoProvider {
  readonly name = 'realtimekit';
  private readonly logger = new Logger('RealtimeKitVideoProvider');

  // Campos privados de JavaScript: no aparecen al serializar ni al inspeccionar el objeto (el token nunca sale en un log).
  readonly #settings: RealtimeKitSettings;
  readonly #fetchFn: FetchLike;

  constructor(settings: RealtimeKitSettings, fetchFn: FetchLike = (url, init) => fetch(url, init)) {
    this.#settings = settings;
    this.#fetchFn = fetchFn;
  }

  async createRoom(input: { appointmentId: string }): Promise<{ roomId: string }> {
    return this.guard(async () => {
      // El título solo lleva el id de la cita: ningún dato personal sale hacia el proveedor.
      const data = await this.call('create_meeting', 'POST', '/meetings', { title: `PEI ${input.appointmentId}` });
      return { roomId: requiredString(data, 'id', 'create_meeting') };
    });
  }

  async issueToken(input: {
    roomId: string;
    participant: Participant;
    customParticipantId: string;
    existingParticipantId: string | null;
  }): Promise<{ token: string; participantId: string }> {
    return this.guard(async () => {
      if (input.existingParticipantId) {
        try {
          const data = await this.call(
            'refresh_token',
            'POST',
            `/meetings/${seg(input.roomId)}/participants/${seg(input.existingParticipantId)}/token`,
            {},
          );
          return { token: requiredString(data, 'token', 'refresh_token'), participantId: input.existingParticipantId };
        } catch (error) {
          // El participante ya no existe en el proveedor (por ejemplo, se eliminó a mano): se da de alta de nuevo.
          if (!(error instanceof RealtimeKitCallError && error.httpStatus === 404)) throw error;
        }
      }
      const data = await this.call('add_participant', 'POST', `/meetings/${seg(input.roomId)}/participants`, {
        custom_participant_id: input.customParticipantId,
        preset_name: this.#settings.presets[input.participant],
        name: DISPLAY_NAME[input.participant],
      });
      return { token: requiredString(data, 'token', 'add_participant'), participantId: requiredString(data, 'id', 'add_participant') };
    });
  }

  async revokeAccess(input: { roomId: string; participantId: string }): Promise<void> {
    return this.guard(async () => {
      try {
        await this.call('delete_participant', 'DELETE', `/meetings/${seg(input.roomId)}/participants/${seg(input.participantId)}`);
      } catch (error) {
        // Ya no existe: el acceso está revocado.
        if (error instanceof RealtimeKitCallError && error.httpStatus === 404) return;
        throw error;
      }
    });
  }

  private async guard<T>(action: () => Promise<T>): Promise<T> {
    try {
      return await action();
    } catch (error) {
      if (error instanceof RealtimeKitCallError) {
        this.logger.warn(`Fallo de RealtimeKit en ${error.operation} (HTTP ${error.httpStatus ?? 'sin respuesta'}): ${error.reason}`);
      } else {
        this.logger.warn('Fallo inesperado del adaptador de RealtimeKit');
      }
      throw new VideoProviderUnavailableError();
    }
  }

  private async call(operation: Operation, method: string, path: string, body?: unknown): Promise<Record<string, unknown>> {
    const { accountId, appId, apiToken, timeoutMs } = this.#settings;
    const url = `${BASE_URL}/accounts/${seg(accountId)}/realtime/kit/${seg(appId)}${path}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let response: HttpResponseLike;
    try {
      response = await this.#fetchFn(url, {
        method,
        headers: { Authorization: `Bearer ${apiToken}`, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: controller.signal,
      });
    } catch {
      throw new RealtimeKitCallError(operation, null, controller.signal.aborted ? `tiempo agotado (${timeoutMs} ms)` : 'error de red');
    } finally {
      clearTimeout(timer);
    }
    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new RealtimeKitCallError(operation, response.status, 'respuesta que no es JSON');
    }
    if (response.status < 200 || response.status >= 300) {
      throw new RealtimeKitCallError(operation, response.status, `respuesta no exitosa${errorCodes(payload)}`);
    }
    if (!isRecord(payload) || payload.success !== true) {
      throw new RealtimeKitCallError(operation, response.status, `success distinto de true${errorCodes(payload)}`);
    }
    if (!isRecord(payload.data)) throw new RealtimeKitCallError(operation, response.status, 'respuesta sin data');
    return payload.data;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requiredString(data: Record<string, unknown>, field: string, operation: Operation): string {
  const value = data[field];
  if (typeof value !== 'string' || value.trim() === '') throw new RealtimeKitCallError(operation, 200, `respuesta sin ${field}`);
  return value;
}

// Solo los códigos numéricos de Cloudflare: los mensajes podrían repetir datos de la petición.
function errorCodes(payload: unknown): string {
  if (!isRecord(payload) || !Array.isArray(payload.errors)) return '';
  const codes = payload.errors.map((e) => (isRecord(e) && typeof e.code === 'number' ? e.code : null)).filter((c): c is number => c !== null);
  return codes.length > 0 ? ` (códigos ${codes.join(', ')})` : '';
}

const seg = (value: string) => encodeURIComponent(value);
