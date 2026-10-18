import { contentTypeForObjectKey, isPrivateObjectKey } from './object-key';

const A = '3f2b8c1e-5d4a-4b6c-9e8f-0a1b2c3d4e5f';
const B = '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d';

describe('Claves del bucket privado: gramática compartida (R-11, DT-18)', () => {
  it('[RT-M03-03][R-11] acepta las claves que genera Identity', () => {
    expect(isPrivateObjectKey(`identity/${A}/${B}/front.jpg`)).toBe(true);
    expect(isPrivateObjectKey(`identity/${A}/${B}/back.png`)).toBe(true);
    expect(isPrivateObjectKey(`profile-photos/${A}/${B}.png`)).toBe(true);
  });

  it.each([
    ['una URL', 'https://example.test/a.jpg'],
    ['una ruta relativa', '../otro/front.jpg'],
    ['un espacio no registrado', `doctor-licenses/${A}/${B}.pdf`],
    ['un formato anterior a M02', 'patient-ine/a.jpeg'],
    ['una CURP', `identity/XEXX010101HNEXXXA4/${B}/front.jpg`],
    ['un UUID en mayúsculas', `identity/${A.toUpperCase()}/${B}/front.jpg`],
    ['una extensión no permitida', `identity/${A}/${B}/front.gif`],
    ['un nombre de archivo libre', `identity/${A}/${B}/ine-juan.jpg`],
  ])('[RT-M03-04][DT-18] rechaza %s', (_case, key) => {
    expect(isPrivateObjectKey(key)).toBe(false);
  });

  it('[RT-M03-05][DT-1] el tipo de contenido sale de la extensión', () => {
    expect(contentTypeForObjectKey(`identity/${A}/${B}/front.jpg`)).toBe('image/jpeg');
    expect(contentTypeForObjectKey(`profile-photos/${A}/${B}.png`)).toBe('image/png');
    expect(contentTypeForObjectKey(`x/${A}.pdf`)).toBe('application/pdf');
    expect(contentTypeForObjectKey('sin-extension')).toBe('application/octet-stream');
  });
});
