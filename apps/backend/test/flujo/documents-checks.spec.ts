import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { R2PrivateObjectStorage } from '../../src/modules/private-storage/infrastructure/r2-private-object-storage';
import {
  DOCUMENTS_AUDIT_BY_ADMIN, documentStateFailures, EXPECTED_DOCUMENT_STATES, EXPECTED_DOCUMENTS_AUDIT, exposesStorageDetails, type DocumentStage, imageHeaderFailures, pdfHeaderFailures, unexpectedDeletions,
} from './documents-checks';
import { installR2Traps, R2TrapError } from './r2-traps';

describe('M03 documentos del admin: comprobaciones del recorrido (documents-checks, r2-traps)', () => {
  it('[TC-M03-205][D-22][R-8] los eventos esperados sobre el médico existente: 3 lecturas de INE, 3 de cédula, rechazo, aprobación, 3 reenvíos y una vuelta a pending', () => {
    const count = (a: string) => EXPECTED_DOCUMENTS_AUDIT.filter((x) => x === a).length;
    expect(EXPECTED_DOCUMENTS_AUDIT).toHaveLength(12);
    expect(count('doctor.identity_document.viewed')).toBe(3);
    expect(count('doctor.license_document.viewed')).toBe(3);
    expect(count('doctor.identity_verification.submitted')).toBe(2);
    expect(count('doctor.status.returned_to_pending')).toBe(1);
    for (const a of ['doctor.profile.created', 'doctor.registration.completed', 'identity.legal_document.accepted', 'doctor.license_number.changed']) {
      expect(EXPECTED_DOCUMENTS_AUDIT).not.toContain(a);
    }
    expect([...EXPECTED_DOCUMENTS_AUDIT]).toEqual([...EXPECTED_DOCUMENTS_AUDIT].sort());
    expect(DOCUMENTS_AUDIT_BY_ADMIN.every((a) => EXPECTED_DOCUMENTS_AUDIT.includes(a))).toBe(true);
  });

  it('[TC-M03-217][Z-1][D-13] estados por etapa: solo el inicial opera; tras los reenvíos y al final queda pending con la cédula 3 pendiente', () => {
    for (const stage of Object.keys(EXPECTED_DOCUMENT_STATES) as DocumentStage[]) {
      expect(documentStateFailures(stage, { ...EXPECTED_DOCUMENT_STATES[stage] })).toEqual([]);
    }
    expect(documentStateFailures('final', { ...EXPECTED_DOCUMENT_STATES.final, canOperate: true }).length).toBe(1);
    expect(documentStateFailures('tras_rechazo', { ...EXPECTED_DOCUMENT_STATES.tras_rechazo, status: 'rejected' }).length).toBe(1);
    expect(documentStateFailures('inicial', {}).length).toBe(4);
  });

  const image = { 'content-type': 'image/jpeg', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' };
  const pdf = { 'content-type': 'application/pdf', 'content-disposition': 'attachment; filename="cedula.pdf"', 'content-security-policy': 'sandbox', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' };

  it('[TC-M03-206][H.3] cabeceras: imagen en línea y PDF attachment con sandbox, ambos no-store y nosniff', () => {
    expect(imageHeaderFailures(image, 'image/jpeg')).toEqual([]);
    expect(pdfHeaderFailures(pdf)).toEqual([]);
  });

  it.each([
    ['imagen en caché', () => imageHeaderFailures({ ...image, 'cache-control': 'private' }, 'image/jpeg')],
    ['imagen sin nosniff', () => imageHeaderFailures({ ...image, 'x-content-type-options': undefined }, 'image/jpeg')],
    ['imagen como attachment', () => imageHeaderFailures({ ...image, 'content-disposition': 'attachment' }, 'image/jpeg')],
    ['otro tipo de imagen', () => imageHeaderFailures(image, 'image/png')],
    ['PDF en línea', () => pdfHeaderFailures({ ...pdf, 'content-disposition': 'inline' })],
    ['PDF sin sandbox', () => pdfHeaderFailures({ ...pdf, 'content-security-policy': undefined })],
  ])('[TC-M03-207][H.3] falla si %s', (_name, run) => {
    expect(run().length).toBeGreaterThan(0);
  });

  it('[TC-M03-208][R-7] detecta claves de objetos y URLs de R2 en cabeceras o cuerpos', () => {
    expect(exposesStorageDetails({ status: 'approved' })).toBe(false);
    expect(exposesStorageDetails('attachment; filename="cedula.pdf"')).toBe(false);
    expect(exposesStorageDetails('doctor-identity/0f8e1c2a-0000-4000-8000-000000000000/front.jpg')).toBe(true);
    expect(exposesStorageDetails({ u: 'https://a.r2.cloudflarestorage.com/b?X-Amz-Signature=1' })).toBe(true);
  });

  it('[TC-M03-209][D-19] solo se admiten como borradas las claves previstas', () => {
    expect(unexpectedDeletions(['doctor-identity/a', 'doctor-identity/b'], ['doctor-identity/a', 'doctor-identity/b'])).toEqual([]);
    expect(unexpectedDeletions(['doctor-identity/a', 'identity/c'], ['doctor-identity/a'])).toEqual(['borrada de más: identity']);
    expect(unexpectedDeletions([], ['doctor-identity/a'])).toEqual(['no borrada: doctor-identity']);
  });

  it('[TC-M03-210][DT-3] las trampas de R2 cuentan y lanzan antes de abrir la red; restore las retira', async () => {
    const traps = installR2Traps();
    try {
      const client = new S3Client({ region: 'auto', endpoint: 'https://example.invalid', credentials: { accessKeyId: 'x', secretAccessKey: 'y' } });
      await expect(Promise.resolve().then(() => client.send(new PutObjectCommand({ Bucket: 'b', Key: 'k' })))).rejects.toBeInstanceOf(R2TrapError);
      const storage = new R2PrivateObjectStorage(null);
      const calls: (() => Promise<unknown>)[] = [() => storage.put('k', Buffer.alloc(1), 'image/jpeg'), () => storage.openForRead('k'), () => storage.delete('k')];
      for (const call of calls) await expect(Promise.resolve().then(call)).rejects.toBeInstanceOf(R2TrapError);
      expect(traps.calls()).toBe(4);
    } finally {
      traps.restore();
    }
    expect((S3Client.prototype as unknown as { send: { name: string } }).send.name).not.toBe('trappedR2Call');
    expect((R2PrivateObjectStorage.prototype as unknown as { delete: { name: string } }).delete.name).not.toBe('trappedR2Call');
  });
});
