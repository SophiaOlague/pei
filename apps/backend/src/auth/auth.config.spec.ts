import { memoryAdapter } from 'better-auth/adapters/memory';
import { AUTH_RATE_LIMIT, CLIENT_IP_HEADER, createAuth, loadAuthConfig } from './auth.config';

describe('Configuración de Better Auth (M02, DP-2, DT-8, DT-11)', () => {
  it('[TC-M02-008][DT-10] orígenes confiables desde AUTH_TRUSTED_ORIGINS; por defecto el web local y el esquema histórico', () => {
    expect(loadAuthConfig({}).trustedOrigins).toEqual(['http://localhost:3000', 'gestinovo://']);
    expect(loadAuthConfig({ AUTH_TRUSTED_ORIGINS: 'https://app.example.test, gestinovo://' }).trustedOrigins).toEqual([
      'https://app.example.test',
      'gestinovo://',
    ]);
  });

  it('[TC-M02-009][DP-2][DT-8][DT-11] verificación obligatoria, tokens de 1 h, contraseña 8–128, rutas desactivadas y rate limit siempre activo', () => {
    const auth = createAuth({
      database: memoryAdapter({ user: [], session: [], account: [], verification: [] }),
      emailSender: { send: async () => {} },
      config: { baseURL: 'http://localhost:3000', secret: 'secreto-solo-para-pruebas-unitarias-0123456789', trustedOrigins: [] },
    });
    const { emailAndPassword, emailVerification, rateLimit, disabledPaths, advanced } = auth.options;

    expect(emailAndPassword).toMatchObject({
      requireEmailVerification: true,
      minPasswordLength: 8,
      maxPasswordLength: 128,
      resetPasswordTokenExpiresIn: 3600,
      revokeSessionsOnPasswordReset: true,
    });
    expect(emailVerification).toMatchObject({ sendOnSignUp: true, autoSignInAfterVerification: true, expiresIn: 3600 });
    expect(disabledPaths).toEqual(['/update-user', '/change-email']);
    expect(rateLimit).toMatchObject({ enabled: true, storage: 'memory', window: 10, max: 100 });
    expect(rateLimit?.customRules).toEqual(AUTH_RATE_LIMIT.customRules);
    expect(advanced?.ipAddress?.ipAddressHeaders).toEqual([CLIENT_IP_HEADER]);
  });
});
