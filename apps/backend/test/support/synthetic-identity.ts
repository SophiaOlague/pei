import { randomInt } from 'crypto';
import { curpCheckDigit } from '../../src/modules/identity/domain/curp';

// Datos SINTÉTICOS para las pruebas de Identity (M02). Nunca CURP ni INEs de personas reales.

// Imágenes falsas: solo la firma binaria y relleno.
export const syntheticJpeg = (size = 64) => Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(Math.max(0, size - 4), 1)]);
export const syntheticPng = (size = 64) =>
  Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(Math.max(0, size - 8), 2)]);
export const fakePdf = () => Buffer.from('%PDF-1.7\n% documento sintético que dice ser imagen\n');

// CURP con la forma genérica (X?XX ... XXX), fecha y diferenciador aleatorios y dígito verificador válido.
const VOWELS = 'AEIOUX';
const DIFFERENTIATORS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
export function syntheticCurp(): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const first17 =
    `X${VOWELS[randomInt(VOWELS.length)]}XX` +
    `${pad(randomInt(100))}${pad(randomInt(1, 13))}${pad(randomInt(1, 29))}` +
    `${'HMX'[randomInt(3)]}NEXXX${DIFFERENTIATORS[randomInt(DIFFERENTIATORS.length)]}`;
  return first17 + curpCheckDigit(first17);
}
