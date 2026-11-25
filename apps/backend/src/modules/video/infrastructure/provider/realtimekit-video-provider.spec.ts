import { Logger } from '@nestjs/common';
import { FakeRealtimeKitApi, respond, RTK_SETTINGS } from '../../../../../test/support/realtimekit-fake';
import { VideoProviderUnavailableError } from '../../domain/video.errors';
import { RealtimeKitVideoProvider } from './realtimekit-video-provider';
import { loadRealtimeKitConfig, RealtimeKitConfigError } from './realtimekit.config';
import { createVideoProvider } from './video-provider.factory';
import { UnconfiguredVideoProvider } from './unconfigured-video-provider';

// Adaptador de RealtimeKit con HTTP simulado: ninguna prueba llama a Cloudflare.

const room = { appointmentId: '11111111-1111-4111-8111-111111111111' };
const tokenInput = (roomId: string, participant: 'doctor' | 'patient', existingParticipantId: string | null = null) => ({
  roomId, participant, customParticipantId: `${room.appointmentId}:${participant}`, existingParticipantId,
});

function setup() {
  const api = new FakeRealtimeKitApi();
  const provider = new RealtimeKitVideoProvider(RTK_SETTINGS, api.fetch);
  const logs: string[] = [];
  jest.spyOn(Logger.prototype, 'warn').mockImplementation((m: unknown) => void logs.push(String(m)));
  jest.spyOn(Logger.prototype, 'error').mockImplementation((m: unknown) => void logs.push(String(m)));
  return { api, provider, logs };
}

afterEach(() => jest.restoreAllMocks());

describe('RealtimeKitVideoProvider · operaciones', () => {
  it('[TC-RTK-001] crea la reunión con el token de la API en la cabecera y sin datos personales', async () => {
    const { api, provider } = setup();
    const { roomId } = await provider.createRoom(room);
    expect(api.meetings.has(roomId)).toBe(true);
    expect(api.requests[0]).toMatchObject({ method: 'POST', path: '/meetings', body: { title: `PEI ${room.appointmentId}` } });
    expect(api.requests[0].headers.Authorization).toBe(`Bearer ${RTK_SETTINGS.apiToken}`);
  });

  it('[TC-RTK-002] da de alta a cada participante con el preset de su rol y devuelve su token individual', async () => {
    const { api, provider } = setup();
    const { roomId } = await provider.createRoom(room);
    const doctor = await provider.issueToken(tokenInput(roomId, 'doctor'));
    const patient = await provider.issueToken(tokenInput(roomId, 'patient'));
    expect(api.participants.get(doctor.participantId)).toMatchObject({ preset: 'preset_doctor_test', customId: `${room.appointmentId}:doctor` });
    expect(api.participants.get(patient.participantId)).toMatchObject({ preset: 'preset_patient_test', customId: `${room.appointmentId}:patient` });
    expect(doctor.token).not.toBe(patient.token);
    expect(api.requests[1].body).toEqual({ custom_participant_id: `${room.appointmentId}:doctor`, preset_name: 'preset_doctor_test', name: 'Médico' });
  });

  it('[TC-RTK-003] la reconexión renueva el token del participante existente sin crear otro', async () => {
    const { api, provider } = setup();
    const { roomId } = await provider.createRoom(room);
    const first = await provider.issueToken(tokenInput(roomId, 'patient'));
    const again = await provider.issueToken(tokenInput(roomId, 'patient', first.participantId));
    expect(again.participantId).toBe(first.participantId);
    expect(again.token).not.toBe(first.token);
    expect(api.participants.size).toBe(1);
    expect(api.requests.at(-1)).toMatchObject({ method: 'POST', path: `/meetings/${roomId}/participants/${first.participantId}/token` });
  });

  it('[TC-RTK-004] si el participante ya no existe en el proveedor, se da de alta de nuevo', async () => {
    const { api, provider } = setup();
    const { roomId } = await provider.createRoom(room);
    const issued = await provider.issueToken(tokenInput(roomId, 'patient', 'participante-borrado'));
    expect(issued.participantId).not.toBe('participante-borrado');
    expect(api.participants.has(issued.participantId)).toBe(true);
  });

  it('[TC-RTK-005] la revocación elimina al participante (todos sus tokens) y es idempotente', async () => {
    const { api, provider } = setup();
    const { roomId } = await provider.createRoom(room);
    const p = await provider.issueToken(tokenInput(roomId, 'patient'));
    await provider.revokeAccess({ roomId, participantId: p.participantId });
    expect(api.participants.has(p.participantId)).toBe(false);
    expect(api.requests.at(-1)).toMatchObject({ method: 'DELETE', path: `/meetings/${roomId}/participants/${p.participantId}` });
    await expect(provider.revokeAccess({ roomId, participantId: p.participantId })).resolves.toBeUndefined();
  });
});

describe('RealtimeKitVideoProvider · errores (falla cerrado)', () => {
  const cases: [string, (api: FakeRealtimeKitApi) => void][] = [
    ['HTTP 500', (api) => api.on(() => true, () => respond(500, { success: false, errors: [{ code: 10000, message: 'x' }] }))],
    ['HTTP 401 (token inválido)', (api) => api.on(() => true, () => respond(401, { success: false, errors: [{ code: 10000, message: 'auth' }] }))],
    ['HTTP 429', (api) => api.on(() => true, () => respond(429, { success: false }))],
    ['success: false con HTTP 200', (api) => api.on(() => true, () => respond(200, { success: false, errors: [] }))],
    ['respuesta sin data', (api) => api.on(() => true, () => respond(200, { success: true }))],
    ['data sin id', (api) => api.on(() => true, () => respond(200, { success: true, data: { title: 'x' } }))],
    ['id vacío', (api) => api.on(() => true, () => respond(200, { success: true, data: { id: '' } }))],
    ['cuerpo que no es JSON', (api) => api.on(() => true, () => ({ status: 200, json: async () => { throw new SyntaxError('bad'); } }))],
    ['respuesta que es un arreglo', (api) => api.on(() => true, () => respond(200, [1, 2]))],
    ['error de red', (api) => api.on(() => true, () => 'network')],
    ['tiempo agotado', (api) => api.on(() => true, () => 'hang')],
  ];

  it.each(cases)('[TC-RTK-010] crear la reunión con %s lanza VideoProviderUnavailableError', async (_label, arrange) => {
    const { api, provider } = setup();
    arrange(api);
    await expect(provider.createRoom(room)).rejects.toThrow(VideoProviderUnavailableError);
  });

  it('[TC-RTK-011] un alta sin token no devuelve credencial', async () => {
    const { api, provider } = setup();
    const { roomId } = await provider.createRoom(room);
    api.on((r) => r.path.endsWith('/participants'), () => respond(201, { success: true, data: { id: 'p-1' } }));
    await expect(provider.issueToken(tokenInput(roomId, 'doctor'))).rejects.toThrow(VideoProviderUnavailableError);
  });

  it('[TC-RTK-012] un fallo al renovar que no es 404 no crea otro participante', async () => {
    const { api, provider } = setup();
    const { roomId } = await provider.createRoom(room);
    const p = await provider.issueToken(tokenInput(roomId, 'patient'));
    api.on((r) => r.path.endsWith('/token'), () => respond(503, { success: false }));
    await expect(provider.issueToken(tokenInput(roomId, 'patient', p.participantId))).rejects.toThrow(VideoProviderUnavailableError);
    expect(api.participants.size).toBe(1);
  });

  it('[TC-RTK-013] una revocación fallida (no 404) se informa como fallo', async () => {
    const { api, provider } = setup();
    api.on((r) => r.method === 'DELETE', () => respond(500, { success: false }));
    await expect(provider.revokeAccess({ roomId: 'r', participantId: 'p' })).rejects.toThrow(VideoProviderUnavailableError);
  });

  it('[TC-RTK-014] los logs no incluyen el token de la API ni los tokens de los participantes', async () => {
    const { api, provider, logs } = setup();
    const { roomId } = await provider.createRoom(room);
    const issued = await provider.issueToken(tokenInput(roomId, 'doctor'));
    api.on(() => true, () => respond(401, { success: false, errors: [{ code: 10000, message: `token ${RTK_SETTINGS.apiToken}` }] }));
    await expect(provider.createRoom(room)).rejects.toThrow(VideoProviderUnavailableError);
    expect(logs.length).toBeGreaterThan(0);
    for (const line of logs) {
      expect(line).not.toContain(RTK_SETTINGS.apiToken);
      expect(line).not.toContain(issued.token);
    }
    expect(logs.join('\n')).toContain('10000');
  });
});

describe('Configuración de RealtimeKit', () => {
  const full = {
    CLOUDFLARE_ACCOUNT_ID: RTK_SETTINGS.accountId,
    CLOUDFLARE_REALTIME_APP_ID: RTK_SETTINGS.appId,
    CLOUDFLARE_API_TOKEN: RTK_SETTINGS.apiToken,
    CLOUDFLARE_REALTIME_PRESET_DOCTOR: 'preset_doctor_test',
    CLOUDFLARE_REALTIME_PRESET_PATIENT: 'preset_patient_test',
  };

  it('[TC-RTK-020] sin variables no hay configuración; completa, se lee con el tiempo por omisión', () => {
    expect(loadRealtimeKitConfig({})).toBeNull();
    expect(loadRealtimeKitConfig(full)).toEqual({ ...RTK_SETTINGS, timeoutMs: 8000 });
    expect(loadRealtimeKitConfig({ ...full, CLOUDFLARE_REALTIME_TIMEOUT_MS: '3000' })?.timeoutMs).toBe(3000);
  });

  it.each([
    ['falta un preset', { ...full, CLOUDFLARE_REALTIME_PRESET_PATIENT: '' }, 'CLOUDFLARE_REALTIME_PRESET_PATIENT'],
    ['faltan los presets', { ...full, CLOUDFLARE_REALTIME_PRESET_PATIENT: '', CLOUDFLARE_REALTIME_PRESET_DOCTOR: ' ' }, 'CLOUDFLARE_REALTIME_PRESET_DOCTOR'],
    ['falta el token', { ...full, CLOUDFLARE_API_TOKEN: '' }, 'CLOUDFLARE_API_TOKEN'],
    ['cuenta inválida', { ...full, CLOUDFLARE_ACCOUNT_ID: 'abc' }, 'CLOUDFLARE_ACCOUNT_ID'],
    ['token con espacios', { ...full, CLOUDFLARE_API_TOKEN: 'a b' }, 'espacios'],
    ['presets iguales', { ...full, CLOUDFLARE_REALTIME_PRESET_PATIENT: 'preset_doctor_test' }, 'distintos'],
    ['tiempo fuera de rango', { ...full, CLOUDFLARE_REALTIME_TIMEOUT_MS: '60000' }, 'TIMEOUT'],
  ])('[TC-RTK-021] %s es una configuración inválida que no expone valores', (_label, env, expected) => {
    expect(() => loadRealtimeKitConfig(env)).toThrow(RealtimeKitConfigError);
    try {
      loadRealtimeKitConfig(env);
    } catch (error) {
      expect((error as Error).message).toContain(expected);
      expect((error as Error).message).not.toContain(RTK_SETTINGS.apiToken);
    }
  });

  it('[TC-RTK-022] la fábrica usa RealtimeKit solo con la configuración completa; si no, falla cerrado', () => {
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const error = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    expect(createVideoProvider(full).name).toBe('realtimekit');
    expect(createVideoProvider({})).toBeInstanceOf(UnconfiguredVideoProvider);
    expect(createVideoProvider({ ...full, CLOUDFLARE_REALTIME_PRESET_DOCTOR: '' })).toBeInstanceOf(UnconfiguredVideoProvider);
    expect(String(error.mock.calls[0][0])).toContain('CLOUDFLARE_REALTIME_PRESET_DOCTOR');
    expect(String(error.mock.calls[0][0])).not.toContain(RTK_SETTINGS.apiToken);
  });
});

describe('RealtimeKitVideoProvider · el objeto no expone credenciales', () => {
  it('[TC-RTK-015] serializar o inspeccionar el adaptador no muestra el token de la API', () => {
    const provider = new RealtimeKitVideoProvider(RTK_SETTINGS, new FakeRealtimeKitApi().fetch);
    expect(JSON.stringify(provider)).not.toContain(RTK_SETTINGS.apiToken);
    expect(require('util').inspect(provider, { depth: 5 })).not.toContain(RTK_SETTINGS.apiToken);
  });
});
