import { FileFieldsInterceptor, FileInterceptor } from '@nestjs/platform-express';
import type { MulterOptions } from '@nestjs/platform-express/multer/interfaces/multer-options.interface';
import { MAX_DOCTOR_IMAGE_BYTES, MAX_LICENSE_BYTES } from '../domain/object-keys';

// Multer en memoria (sin disco). Un archivo mayor al límite responde 413; campos o archivos no esperados, 400. El tipo
// MIME declarado no se usa: decide la firma binaria (R-5, R-14).
const limits = (fileSize: number, files: number, fields = 0): MulterOptions['limits'] => ({ fileSize, files, fields, parts: files + fields });

// INE del médico: frente y reverso, 5 MB cada uno.
export const DoctorIdentityDocumentsUpload = () =>
  FileFieldsInterceptor(
    [
      { name: 'front', maxCount: 1 },
      { name: 'back', maxCount: 1 },
    ],
    { limits: limits(MAX_DOCTOR_IMAGE_BYTES, 2) },
  );

// Cédula: un campo `licenseNumber` y el archivo `document` (10 MB).
export const DoctorLicenseUpload = () => FileInterceptor('document', { limits: limits(MAX_LICENSE_BYTES, 1, 1) });

export const DoctorPhotoUpload = () => FileInterceptor('photo', { limits: limits(MAX_DOCTOR_IMAGE_BYTES, 1) });
