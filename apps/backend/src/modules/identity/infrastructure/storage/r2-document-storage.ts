import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client, S3ServiceException } from '@aws-sdk/client-s3';
import { Readable } from 'stream';
import type { DocumentStorage, StoredFile } from '../../application/ports/document-storage';
import { isManagedObjectKey } from '../../domain/object-keys';
import { StoredFileNotFoundError } from '../../domain/identity.errors';

// Cloudflare R2 (API S3) para el bucket PRIVADO de documentos de PEI (DT-18).
// - Solo usa R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY y R2_BUCKET_NAME. Nunca R2_PUBLIC_URL:
//   no construye URLs públicas ni firmadas; el contenido sale solo transmitido por el backend.
// - Solo acepta claves con el formato que genera PEI (sin datos personales).
// - Los errores no incluyen claves, credenciales ni detalles del proveedor.

export interface R2Config {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
}

export class DocumentStorageError extends Error {
  constructor(operation: string, cause?: unknown) {
    const reason = cause instanceof S3ServiceException ? `${cause.name} (HTTP ${cause.$metadata?.httpStatusCode ?? '?'})` : 'error';
    super(`Falló la operación ${operation} del almacenamiento de documentos: ${reason}`);
    this.name = 'DocumentStorageError';
  }
}

export function loadR2Config(env: NodeJS.ProcessEnv = process.env): R2Config | null {
  const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME } = env;
  if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET_NAME) return null;
  return { accountId: R2_ACCOUNT_ID, accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY, bucket: R2_BUCKET_NAME };
}

function assertManagedKey(key: string): void {
  if (!isManagedObjectKey(key)) throw new Error('Clave de objeto con formato no permitido');
}

// Se registra con useFactory (su configuración no es un proveedor de Nest).
export class R2DocumentStorage implements DocumentStorage {
  private client: S3Client | null = null;

  constructor(private readonly config: R2Config | null = loadR2Config()) {}

  // El cliente se crea al primer uso: la aplicación arranca aunque el almacenamiento no esté configurado,
  // pero ninguna operación se ejecuta sin configuración.
  private s3(): { client: S3Client; bucket: string } {
    if (!this.config) throw new Error('El almacenamiento de documentos (R2) no está configurado');
    this.client ??= new S3Client({
      region: 'auto',
      endpoint: `https://${this.config.accountId}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId: this.config.accessKeyId, secretAccessKey: this.config.secretAccessKey },
    });
    return { client: this.client, bucket: this.config.bucket };
  }

  async put(key: string, bytes: Buffer, contentType: string): Promise<void> {
    assertManagedKey(key);
    const { client, bucket } = this.s3();
    try {
      await client.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: bytes, ContentType: contentType }));
    } catch (error) {
      throw new DocumentStorageError('put', error);
    }
  }

  async openForRead(key: string): Promise<StoredFile> {
    assertManagedKey(key);
    const { client, bucket } = this.s3();
    try {
      const result = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
      if (!result.Body) throw new StoredFileNotFoundError();
      return { stream: result.Body as Readable, contentLength: result.ContentLength ?? null };
    } catch (error) {
      if (error instanceof StoredFileNotFoundError) throw error;
      if (error instanceof S3ServiceException && (error.name === 'NoSuchKey' || error.$metadata?.httpStatusCode === 404)) {
        throw new StoredFileNotFoundError();
      }
      throw new DocumentStorageError('get', error);
    }
  }

  // DeleteObject es idempotente en S3/R2: un objeto inexistente responde 204.
  async delete(key: string): Promise<void> {
    assertManagedKey(key);
    const { client, bucket } = this.s3();
    try {
      await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
    } catch (error) {
      throw new DocumentStorageError('delete', error);
    }
  }
}
