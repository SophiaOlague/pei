import { FileFieldsInterceptor, FileInterceptor } from '@nestjs/platform-express';
import type { MulterOptions } from '@nestjs/platform-express/multer/interfaces/multer-options.interface';
import { MAX_IMAGE_BYTES } from '../../private-storage/domain/file-signature';

// Multer en memoria (sin disco) con el límite de 5 MB por archivo (DT-4): un archivo mayor responde 413.
// Campos o archivos no esperados responden 400. El tipo MIME declarado no se usa: decide la firma binaria.
const limits = (files: number): MulterOptions['limits'] => ({ fileSize: MAX_IMAGE_BYTES, files, fields: 0, parts: files });

export const IdentityDocumentsUpload = () =>
  FileFieldsInterceptor(
    [
      { name: 'front', maxCount: 1 },
      { name: 'back', maxCount: 1 },
    ],
    { limits: limits(2) },
  );

export const ProfilePhotoUpload = () => FileInterceptor('photo', { limits: limits(1) });
