import { corsAllowedOrigins, corsOptionsFor, InvalidCorsOriginError } from './cors';

describe('CORS con credenciales (orígenes explícitos)', () => {
  it('[TC-M00-244] solo los orígenes web de AUTH_TRUSTED_ORIGINS, sin duplicados; los esquemas no web se omiten', () => {
    expect(corsAllowedOrigins(['http://localhost:3000', 'gestinovo://', 'http://localhost:3001', 'http://localhost:3001'])).toEqual([
      'http://localhost:3000',
      'http://localhost:3001',
    ]);
    expect(corsOptionsFor(['https://app.example.test'])).toEqual({ origin: ['https://app.example.test'], credentials: true });
  });

  it('[TC-M00-245] «*» o un origen con ruta se rechazan al arrancar', () => {
    for (const bad of ['*', 'https://*.example.test', 'https://app.example.test/', 'https://app.example.test/panel']) {
      expect(() => corsAllowedOrigins([bad])).toThrow(InvalidCorsOriginError);
    }
  });

  it('[TC-M00-246] sin orígenes web configurados no se autoriza ningún origen (nunca un comodín)', () => {
    expect(corsOptionsFor(['gestinovo://'])).toEqual({ origin: [], credentials: true });
  });
});
