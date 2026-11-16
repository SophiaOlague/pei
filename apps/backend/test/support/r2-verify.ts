import { ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3';
import type { R2Config } from '../../src/modules/private-storage/infrastructure/r2-private-object-storage';

// Comprobación FINAL de los specs de R2: cuántos objetos quedan bajo los prefijos de la ejecución. Solo lectura y solo
// prefijos de la ejecución; nunca decide qué borrar (eso lo hace cleanupRunObjects con el manifiesto).
export async function countObjectsUnder(config: R2Config, prefixes: readonly string[]): Promise<Record<string, number>> {
  const client = new S3Client({
    region: 'auto',
    endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
  });
  const counts: Record<string, number> = {};
  try {
    for (const prefix of prefixes) {
      const result = await client.send(new ListObjectsV2Command({ Bucket: config.bucket, Prefix: prefix, MaxKeys: 1000 }));
      counts[prefix] = result.KeyCount ?? 0;
    }
  } finally {
    client.destroy();
  }
  return counts;
}
