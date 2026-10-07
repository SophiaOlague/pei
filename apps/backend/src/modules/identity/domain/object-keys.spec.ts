import { contentTypeForKey, identityDocumentKey, isManagedObjectKey, profilePhotoKey } from './object-keys';

const PATIENT = '3f2b8c1e-5d4a-4b6c-9e8f-0a1b2c3d4e5f';
const SUBMISSION = '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d';

describe('Claves de objetos del bucket privado (DT-3, DT-18)', () => {
  it('[TC-M02-040][DT-3] el servidor genera las claves solo con UUID, el lado y la extensión', () => {
    expect(identityDocumentKey(PATIENT, SUBMISSION, 'front', 'jpg')).toBe(`identity/${PATIENT}/${SUBMISSION}/front.jpg`);
    expect(identityDocumentKey(PATIENT, SUBMISSION, 'back', 'png')).toBe(`identity/${PATIENT}/${SUBMISSION}/back.png`);
    expect(profilePhotoKey(PATIENT, SUBMISSION, 'png')).toBe(`profile-photos/${PATIENT}/${SUBMISSION}.png`);
  });

  it.each([
    ['una CURP', 'XEXX010101HNEXXXA4'],
    ['un correo', 'paciente@example.test'],
    ['un nombre', 'Juan Pérez'],
    ['una ruta', '../otro-bucket'],
    ['un UUID en mayúsculas', PATIENT.toUpperCase()],
  ])('[TC-M02-041][DT-18] no se puede formar una clave con %s', (_case, value) => {
    expect(() => identityDocumentKey(value, SUBMISSION, 'front', 'jpg')).toThrow();
    expect(() => identityDocumentKey(PATIENT, value, 'front', 'jpg')).toThrow();
    expect(() => profilePhotoKey(value, SUBMISSION, 'jpg')).toThrow();
  });

  it('[TC-M02-042][DT-3] las URLs anteriores a M02 no son claves del bucket privado', () => {
    expect(isManagedObjectKey(identityDocumentKey(PATIENT, SUBMISSION, 'front', 'jpg'))).toBe(true);
    expect(isManagedObjectKey(profilePhotoKey(PATIENT, SUBMISSION, 'jpg'))).toBe(true);
    expect(isManagedObjectKey('https://example.test/patient-ine/a.jpg')).toBe(false);
    expect(isManagedObjectKey(`patient-ine/${SUBMISSION}.jpeg`)).toBe(false);
    expect(isManagedObjectKey(`identity/${PATIENT}/${SUBMISSION}/front.pdf`)).toBe(false);
  });

  it('[TC-M02-043][DT-1] el tipo de contenido sale de la extensión generada por el servidor', () => {
    expect(contentTypeForKey(`identity/${PATIENT}/${SUBMISSION}/front.jpg`)).toBe('image/jpeg');
    expect(contentTypeForKey(`identity/${PATIENT}/${SUBMISSION}/back.png`)).toBe('image/png');
  });
});
