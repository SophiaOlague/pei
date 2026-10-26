import {
  freeFieldEffects,
  identityChangeEffects,
  identitySubmissionEffects,
  licenseSubmission,
  specialtyChangeEffects,
} from './sensitive-change';
import type { LineStatus } from './doctor-status';

// M03 B4 (diseño v3 §E.3; plan v2 §7bis.1 y §7ter): matriz de efectos de cada cambio.

describe('Matriz de efectos (diseño v3 §E.3)', () => {
  it('[TC-M03-121][D-28] CURP: identidad +1 y su pendiente a superseded; la línea profesional no cambia', () => {
    expect(identityChangeEffects({ curp: true, legalName: false }, 'approved')).toEqual({
      identityRevisionBump: 1, professionalRevisionBump: 0, supersedeIdentityPending: true, supersedeLicensePending: false, automaticLicenseReview: null,
    });
  });

  it.each(['approved', 'pending'] as LineStatus[])('[TC-M03-122][7ter] nombre legal con la cédula %s: ambas +1, ambos pendientes a superseded y revisión legal_name_changed', (before) => {
    expect(identityChangeEffects({ curp: false, legalName: true }, before)).toEqual({
      identityRevisionBump: 1, professionalRevisionBump: 1, supersedeIdentityPending: true, supersedeLicensePending: true, automaticLicenseReview: 'legal_name_changed',
    });
  });

  it.each(['rejected', 'required'] as LineStatus[])('[TC-M03-123][7bis.1] nombre legal con la cédula %s: sin revisión automática (no se reutiliza un documento rechazado o inexistente)', (before) => {
    expect(identityChangeEffects({ curp: false, legalName: true }, before).automaticLicenseReview).toBeNull();
  });

  it('[TC-M03-124][7ter.2] CURP y nombre juntos: la identidad sube una sola vez; sin cambios no hay efectos', () => {
    expect(identityChangeEffects({ curp: true, legalName: true }, 'approved')).toMatchObject({ identityRevisionBump: 1, professionalRevisionBump: 1, automaticLicenseReview: 'legal_name_changed' });
    expect(identityChangeEffects({ curp: false, legalName: false }, 'approved')).toEqual(freeFieldEffects());
  });

  it('[TC-M03-125][D-33][7bis.1] especialidad: profesional +1, pendiente a superseded y specialty_changed solo si reutiliza', () => {
    expect(specialtyChangeEffects('approved', true)).toEqual({
      identityRevisionBump: 0, professionalRevisionBump: 1, supersedeIdentityPending: false, supersedeLicensePending: true, automaticLicenseReview: 'specialty_changed',
    });
    expect(specialtyChangeEffects('rejected', true).automaticLicenseReview).toBeNull();
    // Sin ningún envío previo de cédula solo cambia el perfil.
    expect(specialtyChangeEffects('required', false)).toEqual({ ...freeFieldEffects(), professionalRevisionBump: 1 });
  });

  it('[TC-M03-126][E.1][D-9] INE nueva: sin versiones y pendiente a superseded; bio, foto y teléfono sin efectos', () => {
    expect(identitySubmissionEffects()).toEqual({ ...freeFieldEffects(), supersedeIdentityPending: true });
    expect(freeFieldEffects()).toEqual({ identityRevisionBump: 0, professionalRevisionBump: 0, supersedeIdentityPending: false, supersedeLicensePending: false, automaticLicenseReview: null });
  });
});

describe('Envío de cédula del médico: motivo deducido (plan v2 §7bis.1)', () => {
  const base = { hasLicenseHistory: true, profileLicenseNumber: '1234567', submittedLicenseNumber: '1234567' };

  it('[TC-M03-127][D-1] sin envíos previos → initial; fijar el primer número sube la versión', () => {
    expect(licenseSubmission({ ...base, hasLicenseHistory: false, professionalBefore: 'required', profileLicenseNumber: null })).toEqual({
      reason: 'initial', effects: expect.objectContaining({ professionalRevisionBump: 1, supersedeLicensePending: false }),
    });
  });

  it('[TC-M03-128][D-4] tras un rechazo → resubmission sin versión nueva si el número es el mismo; con otro número, +1', () => {
    expect(licenseSubmission({ ...base, professionalBefore: 'rejected' })).toEqual({ reason: 'resubmission', effects: expect.objectContaining({ professionalRevisionBump: 0 }) });
    expect(licenseSubmission({ ...base, professionalBefore: 'rejected', submittedLicenseNumber: 'NUEVO1' }).effects.professionalRevisionBump).toBe(1);
    // required con historial (la versión subió por otro cambio y no se reutilizó el documento): también es un reenvío.
    expect(licenseSubmission({ ...base, professionalBefore: 'required' }).reason).toBe('resubmission');
  });

  it.each(['pending', 'approved'] as LineStatus[])('[TC-M03-129][D-21] con la línea %s: número distinto → license_number_changed; mismo → license_document_changed; ambos +1', (before) => {
    const changed = licenseSubmission({ ...base, professionalBefore: before, submittedLicenseNumber: 'NUEVO1' });
    const document = licenseSubmission({ ...base, professionalBefore: before });
    expect([changed.reason, document.reason]).toEqual(['license_number_changed', 'license_document_changed']);
    expect([changed.effects.professionalRevisionBump, document.effects.professionalRevisionBump]).toEqual([1, 1]);
    expect(changed.effects.supersedeLicensePending).toBe(before === 'pending');
  });
});
