import { StreamableFile } from '@nestjs/common';
import type { Response } from 'express';
import type { StoredFile } from '../application/ports/document-storage';

// Imagen transmitida por el backend (DT-1, DT-7): sin URL de R2, sin caché y mostrada en línea.
export function privateImageResponse(res: Response, file: StoredFile & { contentType: string }): StreamableFile {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  return new StreamableFile(file.stream, {
    type: file.contentType,
    disposition: 'inline',
    length: file.contentLength ?? undefined,
  });
}
