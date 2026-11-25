import type { FetchLike, HttpResponseLike } from '../../src/modules/video/infrastructure/provider/realtimekit-video-provider';
import type { RealtimeKitSettings } from '../../src/modules/video/infrastructure/provider/realtimekit.config';

// Doble HTTP de la API de RealtimeKit para las pruebas: nunca llama a Cloudflare. Guarda reuniones y participantes en
// memoria y permite inyectar fallos por operación. Valores sintéticos, sin relación con ninguna cuenta real.

export const RTK_SETTINGS: RealtimeKitSettings = {
  accountId: '0123456789abcdef0123456789abcdef',
  appId: 'app-00000000-test',
  apiToken: 'test-api-token-not-real',
  presets: { doctor: 'preset_doctor_test', patient: 'preset_patient_test' },
  timeoutMs: 1000,
};

export interface RecordedRequest {
  method: string;
  path: string;
  headers: Record<string, string>;
  body: Record<string, unknown> | undefined;
}

type Override = (req: RecordedRequest) => HttpResponseLike | Promise<HttpResponseLike> | 'hang' | 'network';

export const respond = (status: number, payload: unknown): HttpResponseLike => ({ status, json: async () => payload });

export class FakeRealtimeKitApi {
  requests: RecordedRequest[] = [];
  meetings = new Set<string>();
  participants = new Map<string, { meetingId: string; preset: string; customId: string }>();
  overrides: { match: (req: RecordedRequest) => boolean; reply: Override; once: boolean }[] = [];
  private seq = 0;

  on(match: (req: RecordedRequest) => boolean, reply: Override, once = true): void {
    this.overrides.push({ match, reply, once });
  }

  readonly fetch: FetchLike = async (url, init) => {
    const prefix = `https://api.cloudflare.com/client/v4/accounts/${RTK_SETTINGS.accountId}/realtime/kit/${RTK_SETTINGS.appId}`;
    if (!url.startsWith(prefix)) return respond(404, { success: false, errors: [{ code: 7003, message: 'ruta' }] });
    const req: RecordedRequest = { method: init.method, path: url.slice(prefix.length), headers: init.headers, body: init.body ? JSON.parse(init.body) : undefined };
    this.requests.push(req);
    const override = this.overrides.find((o) => o.match(req));
    if (override) {
      if (override.once) this.overrides.splice(this.overrides.indexOf(override), 1);
      const reply = await override.reply(req);
      if (reply === 'network') throw new TypeError('fetch failed');
      if (reply === 'hang') {
        return new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(new Error('aborted'))));
      }
      return reply;
    }
    return this.route(req);
  };

  private route(req: RecordedRequest): HttpResponseLike {
    const id = () => `00000000-0000-4000-8000-${String(++this.seq).padStart(12, '0')}`;
    let m: RegExpMatchArray | null;
    if (req.method === 'POST' && req.path === '/meetings') {
      const meetingId = id();
      this.meetings.add(meetingId);
      return respond(201, { success: true, data: { id: meetingId, title: req.body?.title, status: 'ACTIVE' } });
    }
    if (req.method === 'POST' && (m = req.path.match(/^\/meetings\/([^/]+)\/participants$/))) {
      if (!this.meetings.has(m[1])) return respond(404, { success: false, errors: [{ code: 404, message: 'meeting' }] });
      const participantId = id();
      this.participants.set(participantId, { meetingId: m[1], preset: String(req.body?.preset_name), customId: String(req.body?.custom_participant_id) });
      return respond(201, { success: true, data: { id: participantId, token: `tok-${participantId}`, preset_name: req.body?.preset_name, custom_participant_id: req.body?.custom_participant_id } });
    }
    if (req.method === 'POST' && (m = req.path.match(/^\/meetings\/([^/]+)\/participants\/([^/]+)\/token$/))) {
      if (this.participants.get(m[2])?.meetingId !== m[1]) return respond(404, { success: false, errors: [{ code: 404, message: 'participant' }] });
      return respond(200, { success: true, data: { token: `tok-refreshed-${m[2]}-${++this.seq}` } });
    }
    if (req.method === 'DELETE' && (m = req.path.match(/^\/meetings\/([^/]+)\/participants\/([^/]+)$/))) {
      if (this.participants.get(m[2])?.meetingId !== m[1]) return respond(404, { success: false, errors: [{ code: 404, message: 'participant' }] });
      this.participants.delete(m[2]);
      return respond(200, { success: true, data: { custom_participant_id: 'x' } });
    }
    return respond(404, { success: false, errors: [{ code: 7003, message: 'ruta' }] });
  }
}
