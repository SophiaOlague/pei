import { renderAuthEmail } from './auth-email-templates';
import { EmailDeliveryError, loadResendConfig, ResendEmailSender } from './resend-email-sender';

const URL = 'http://localhost:3000/api/auth/verify-email?token=tok-123&callbackURL=%2F';

describe('Correos de autenticación (DP-2, DT-9)', () => {
  it.each(['email_verification', 'password_reset'] as const)('[TC-M02-060][DP-2] plantilla %s: genérica, en español, con el enlace', (kind) => {
    const email = renderAuthEmail(kind, URL);
    expect(email.subject).toMatch(/PEI/);
    expect(email.text).toContain(URL);
    expect(email.html).toContain(URL.replace(/&/g, '&amp;'));
    expect(email.text).toContain('1 hora');
  });

  it('[TC-M02-061][RNF-10] la plantilla no tiene datos personales y escapa el enlace en HTML', () => {
    const email = renderAuthEmail('password_reset', 'http://x.test/r?a="><script>');
    const all = `${email.subject} ${email.text} ${email.html}`;
    expect(all).not.toMatch(/@|curp|nombre:/i);
    expect(email.html).not.toContain('<script>');
  });

  it('[TC-M02-062][DT-9] ResendEmailSender hace POST a la API REST con fetch (sin SDK)', async () => {
    const fetchMock = jest.fn().mockResolvedValue(new Response('{"id":"x"}', { status: 200 }));
    const sender = new ResendEmailSender({ apiKey: 're_test_dummy', from: 'PEI <no-reply@example.test>' }, fetchMock as typeof fetch);

    await sender.send({ kind: 'email_verification', to: 'paciente@example.test', url: URL });

    const [endpoint, init] = fetchMock.mock.calls[0];
    expect(endpoint).toBe('https://api.resend.com/emails');
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe('Bearer re_test_dummy');
    expect(JSON.parse(init.body)).toMatchObject({ from: 'PEI <no-reply@example.test>', to: ['paciente@example.test'], subject: 'Confirma tu correo en PEI' });
  });

  it('[TC-M02-063][DT-9] un error HTTP no expone la clave, el destinatario ni el enlace', async () => {
    const fetchMock = jest.fn().mockResolvedValue(new Response('{"message":"invalid"}', { status: 401 }));
    const sender = new ResendEmailSender({ apiKey: 're_test_dummy', from: 'no-reply@example.test' }, fetchMock as typeof fetch);

    const error = await sender.send({ kind: 'password_reset', to: 'paciente@example.test', url: URL }).catch((e) => e);
    expect(error).toBeInstanceOf(EmailDeliveryError);
    expect(error.message).toBe('No se pudo enviar el correo: HTTP 401');
  });

  it('[TC-M02-064][DT-9] sin RESEND_API_KEY o EMAIL_FROM no se envía nada', async () => {
    expect(loadResendConfig({})).toBeNull();
    const fetchMock = jest.fn();
    const sender = new ResendEmailSender(null, fetchMock as unknown as typeof fetch);
    await expect(sender.send({ kind: 'password_reset', to: 'a@example.test', url: URL })).rejects.toThrow(EmailDeliveryError);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
