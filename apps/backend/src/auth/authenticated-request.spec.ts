import type { Request } from 'express';
import { extractRequestMetadata } from './authenticated-request';

const requestWith = (fields: { ip?: string; remoteAddress?: string; headers?: Record<string, unknown> }) =>
  ({
    ip: fields.ip,
    socket: { remoteAddress: fields.remoteAddress },
    headers: fields.headers ?? {},
  }) as unknown as Request;

describe('extractRequestMetadata (IP y user-agent)', () => {
  it('[TC-M00-060][RN-121] toma la IP de request.ip y el user-agent del header', () => {
    expect(extractRequestMetadata(requestWith({ ip: '203.0.113.9', headers: { 'user-agent': 'Mozilla/5.0' } }))).toEqual({
      ipAddress: '203.0.113.9',
      userAgent: 'Mozilla/5.0',
    });
  });

  it('[TC-M00-061][RN-121] normaliza IPv4 representada como IPv6', () => {
    expect(extractRequestMetadata(requestWith({ ip: '::ffff:127.0.0.1' })).ipAddress).toBe('127.0.0.1');
  });

  it('[TC-M00-062][RN-121] conserva IPv6 real', () => {
    expect(extractRequestMetadata(requestWith({ ip: '2001:db8::1' })).ipAddress).toBe('2001:db8::1');
  });

  it('[TC-M00-063][RN-121] sin request.ip usa la dirección del socket', () => {
    expect(extractRequestMetadata(requestWith({ remoteAddress: '::ffff:10.1.1.1' })).ipAddress).toBe('10.1.1.1');
  });

  it('[TC-M00-064][RN-121] sin IP ni user-agent → null en ambos', () => {
    expect(extractRequestMetadata(requestWith({}))).toEqual({ ipAddress: null, userAgent: null });
  });

  it('[TC-M00-065][RNF-10] ignora X-Forwarded-For: la IP no se toma de headers del cliente', () => {
    const metadata = extractRequestMetadata(
      requestWith({ ip: '127.0.0.1', headers: { 'x-forwarded-for': '6.6.6.6' } }),
    );
    expect(metadata.ipAddress).toBe('127.0.0.1');
  });

  it('[TC-M00-066][RNF-10] trunca user-agents de más de 512 caracteres', () => {
    const metadata = extractRequestMetadata(requestWith({ headers: { 'user-agent': 'x'.repeat(2000) } }));
    expect(metadata.userAgent).toHaveLength(512);
  });

  it('[TC-M00-067] user-agent vacío → null', () => {
    expect(extractRequestMetadata(requestWith({ headers: { 'user-agent': '' } })).userAgent).toBeNull();
  });
});
