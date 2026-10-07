import { detectImageExtension, MAX_IMAGE_BYTES, validateImage } from './image-file';
import { InvalidDocumentFileError } from './identity.errors';

import { syntheticJpeg, syntheticPng } from '../../../../test/support/synthetic-identity';

describe('Imágenes de Identity: firma binaria y tamaño (DT-4, DT-7)', () => {
  it('[TC-M02-030][DT-4] JPEG y PNG se reconocen por su firma binaria', () => {
    expect(validateImage(syntheticJpeg())).toMatchObject({ extension: 'jpg', contentType: 'image/jpeg' });
    expect(validateImage(syntheticPng())).toMatchObject({ extension: 'png', contentType: 'image/png' });
  });

  it.each([
    ['PDF', Buffer.from('%PDF-1.7\n...')],
    ['texto', Buffer.from('hola, no soy una imagen')],
    ['GIF', Buffer.from('GIF89a......')],
    ['JPEG truncado', Buffer.from([0xff, 0xd8])],
  ])('[TC-M02-031][DT-4] %s → rechazado', (_case, bytes) => {
    expect(detectImageExtension(bytes)).toBeNull();
    expect(() => validateImage(bytes)).toThrow(InvalidDocumentFileError);
  });

  it('[TC-M02-032][DT-4] el tipo MIME declarado no interviene: solo cuentan los bytes', () => {
    // validateImage no recibe el MIME del cliente; un PDF "declarado" como image/png sigue siendo un PDF.
    expect(validateImage.length).toBe(1);
    expect(() => validateImage(Buffer.from('%PDF-1.7 declarado como image/png'))).toThrow(InvalidDocumentFileError);
  });

  it('[TC-M02-033][DT-4] 5 MB exactos se aceptan; un byte más se rechaza', () => {
    expect(validateImage(syntheticJpeg(MAX_IMAGE_BYTES)).bytes.length).toBe(5 * 1024 * 1024);
    expect(() => validateImage(syntheticJpeg(MAX_IMAGE_BYTES + 1))).toThrow(InvalidDocumentFileError);
  });

  it.each([[undefined], [Buffer.alloc(0)]])('[TC-M02-034][DT-4] archivo faltante o vacío (%p) → rechazado', (bytes) => {
    expect(() => validateImage(bytes)).toThrow(InvalidDocumentFileError);
  });
});
