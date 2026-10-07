import { S3Client, S3ServiceException } from '@aws-sdk/client-s3';
import { Readable } from 'stream';
import { R2DocumentStorage, loadR2Config } from './r2-document-storage';
import { StoredFileNotFoundError } from '../../domain/identity.errors';

const KEY = 'identity/3f2b8c1e-5d4a-4b6c-9e8f-0a1b2c3d4e5f/9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d/front.jpg';
const CONFIG = { accountId: 'cuenta-de-prueba', accessKeyId: 'AKIA-PRUEBA', secretAccessKey: 'secreto-de-prueba', bucket: 'bucket-de-prueba' };

const s3Error = (name: string, status: number) =>
  new S3ServiceException({ name, $fault: 'client', $metadata: { httpStatusCode: status }, message: `${name} ${KEY} secreto-de-prueba` });

describe('R2DocumentStorage (DT-18)', () => {
  let send: jest.SpyInstance;

  beforeEach(() => {
    send = jest.spyOn(S3Client.prototype, 'send');
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('[TC-M02-087][DT-18] usa solo las variables del bucket privado; R2_PUBLIC_URL no interviene', () => {
    const env = { R2_ACCOUNT_ID: 'a', R2_ACCESS_KEY_ID: 'b', R2_SECRET_ACCESS_KEY: 'c', R2_BUCKET_NAME: 'pei-documents-dev', R2_PUBLIC_URL: 'https://pub.r2.dev' };
    expect(loadR2Config(env)).toEqual({ accountId: 'a', accessKeyId: 'b', secretAccessKey: 'c', bucket: 'pei-documents-dev' });
    expect(loadR2Config({ ...env, R2_BUCKET_NAME: '' })).toBeNull();
  });

  it('[TC-M02-088][DT-18] put, get y delete con el bucket configurado; no devuelve URLs', async () => {
    send.mockResolvedValueOnce({}).mockResolvedValueOnce({ Body: Readable.from(Buffer.from('x')), ContentLength: 1 }).mockResolvedValueOnce({});
    const storage = new R2DocumentStorage(CONFIG);

    await expect(storage.put(KEY, Buffer.from('x'), 'image/jpeg')).resolves.toBeUndefined();
    const file = await storage.openForRead(KEY);
    await expect(storage.delete(KEY)).resolves.toBeUndefined();

    expect(Object.keys(file).sort()).toEqual(['contentLength', 'stream']);
    const inputs = send.mock.calls.map(([command]) => command.input);
    expect(inputs[0]).toMatchObject({ Bucket: 'bucket-de-prueba', Key: KEY, ContentType: 'image/jpeg' });
    expect(inputs[1]).toEqual({ Bucket: 'bucket-de-prueba', Key: KEY });
    expect(inputs[2]).toEqual({ Bucket: 'bucket-de-prueba', Key: KEY });
  });

  it('[TC-M02-089][DT-18] rechaza claves que no generó PEI sin llamar a R2; sin configuración no opera', async () => {
    const storage = new R2DocumentStorage(CONFIG);
    for (const key of ['https://example.test/a.jpg', '../otro/front.jpg', 'patient-ine/a.jpeg']) {
      await expect(storage.put(key, Buffer.from('x'), 'image/jpeg')).rejects.toThrow('Clave de objeto con formato no permitido');
      await expect(storage.delete(key)).rejects.toThrow();
    }
    expect(send).not.toHaveBeenCalled();
    await expect(new R2DocumentStorage(null).put(KEY, Buffer.from('x'), 'image/jpeg')).rejects.toThrow('no está configurado');
  });

  it('[TC-M02-098][DT-18] NoSuchKey → StoredFileNotFoundError; otros errores sin clave ni credenciales', async () => {
    const storage = new R2DocumentStorage(CONFIG);
    send.mockRejectedValueOnce(s3Error('NoSuchKey', 404));
    await expect(storage.openForRead(KEY)).rejects.toThrow(StoredFileNotFoundError);

    send.mockRejectedValueOnce(s3Error('AccessDenied', 403));
    const error = await storage.delete(KEY).catch((e) => e);
    expect(error.message).toBe('Falló la operación delete del almacenamiento de documentos: AccessDenied (HTTP 403)');
    expect(error.message).not.toMatch(/identity\/|secreto|AKIA/);
  });
});
