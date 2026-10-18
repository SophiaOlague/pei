import { StreamableFile } from '@nestjs/common';
import type { Response } from 'express';
import type { StoredObject } from '../application/ports/private-object-storage';

type FileToSend = StoredObject & { contentType: string };

function noStore(res: Response): void {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('X-Content-Type-Options', 'nosniff');
}

// Imagen transmitida por el backend (DT-1, DT-7): sin URL de R2, sin caché y mostrada en línea.
export function privateImageResponse(res: Response, file: FileToSend): StreamableFile {
  noStore(res);
  return new StreamableFile(file.stream, {
    type: file.contentType,
    disposition: 'inline',
    length: file.contentLength ?? undefined,
  });
}

// PDF transmitido por el backend (M03 H.3): se descarga en lugar de mostrarse, y la política `sandbox`
// impide que un contenido activo del PDF se ejecute con el origen de PEI.
export function privatePdfResponse(res: Response, file: FileToSend): StreamableFile {
  noStore(res);
  res.setHeader('Content-Security-Policy', 'sandbox');
  return new StreamableFile(file.stream, {
    type: file.contentType,
    disposition: 'attachment',
    length: file.contentLength ?? undefined,
  });
}
