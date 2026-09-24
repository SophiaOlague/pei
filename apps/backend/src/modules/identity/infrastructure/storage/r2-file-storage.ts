import { Injectable } from '@nestjs/common';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { randomUUID } from 'crypto';
import { r2Client } from '../../../../storage/r2-client';
import type { FileStorage } from '../../domain/ports/file-storage';

@Injectable()
export class R2FileStorage implements FileStorage {
  async upload(buffer: Buffer, folder: string, mimeType: string): Promise<string> {
    const extension = mimeType.split('/')[1] ?? 'bin';
    const key = `${folder}/${randomUUID()}.${extension}`;

    await r2Client.send(
      new PutObjectCommand({
        Bucket: process.env.R2_BUCKET_NAME!,
        Key: key,
        Body: buffer,
        ContentType: mimeType,
      }),
    );

    return `${process.env.R2_PUBLIC_URL}/${key}`;
  }
}