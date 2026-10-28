import {
  freeFieldEffects,
  identitySubmissionEffects,
  licenseSubmission,
  specialtyChangeEffects,
} from './sensitive-change';
import type { LineStatus } from './doctor-status';

// M03 B4 (diseño v3 §E.3; plan v2 §7bis.1 y §7ter): matriz de efectos de cada cambio.

describe('Matriz de efectos (diseño v3 §E.3)', () => {
  // TC-M03-121..124 retirados (C-16, RN-138): el médico ya no cambia su CURP ni su nombre legal, así que no existen
  // efectos de un cambio de identidad.

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
