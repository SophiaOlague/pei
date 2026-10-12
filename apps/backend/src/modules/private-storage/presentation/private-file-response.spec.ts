import { Readable } from 'stream';
import type { Response } from 'express';
import { privateImageResponse, privatePdfResponse } from './private-file-response';

function fakeResponse() {
  const headers: Record<string, string> = {};
  const res = { setHeader: (name: string, value: string) => (headers[name.toLowerCase()] = value) } as unknown as Response;
  return { res, headers };
}

const file = (contentType: string) => ({ stream: Readable.from(Buffer.from('x')), contentLength: 1, contentType });

describe('Respuestas de archivos privados (DT-1, DT-7, M03 H.3)', () => {
  it('[RT-M03-06][DT-1] imagen: inline, sin caché y nosniff', () => {
    const { res, headers } = fakeResponse();
    const streamable = privateImageResponse(res, file('image/jpeg'));
    expect(headers).toMatchObject({ 'cache-control': 'no-store', pragma: 'no-cache', 'x-content-type-options': 'nosniff' });
    expect(headers['content-security-policy']).toBeUndefined();
    expect(streamable.getHeaders()).toMatchObject({ type: 'image/jpeg', disposition: 'inline', length: 1 });
  });

  it('[RT-M03-07][R-11] PDF: attachment, CSP sandbox, sin caché y nosniff', () => {
    const { res, headers } = fakeResponse();
    const streamable = privatePdfResponse(res, file('application/pdf'));
    expect(headers).toMatchObject({
      'cache-control': 'no-store',
      pragma: 'no-cache',
      'x-content-type-options': 'nosniff',
      'content-security-policy': 'sandbox',
    });
    expect(streamable.getHeaders()).toMatchObject({ type: 'application/pdf', disposition: 'attachment', length: 1 });
  });
});
