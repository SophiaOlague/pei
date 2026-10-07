import { ArgumentMetadata, BadRequestException } from '@nestjs/common';
import { createValidationPipe } from '../../../../common/validation/create-validation-pipe';
import {
  AcceptLegalDocumentsDto,
  ListPendingIdentityVerificationsQueryDto,
  RegisterPatientProfileDto,
  RejectIdentityVerificationDto,
  UpdatePatientProfileDto,
} from './identity.dto';

const pipe = createValidationPipe();
const validate = <T>(metatype: new () => T, value: unknown, type: ArgumentMetadata['type'] = 'body') =>
  pipe.transform(value, { type, metatype }) as Promise<T>;
const messages = async (metatype: new () => unknown, value: unknown) => {
  const error: any = await validate(metatype, value).catch((e: unknown) => e);
  expect(error).toBeInstanceOf(BadRequestException);
  return (error.getResponse() as { message: string[] }).message.join(' | ');
};

const VALID_PROFILE = { firstName: 'Ana', lastName: 'Sintética', curp: 'XEXX010101HNEXXXA4', birthDate: '1990-01-01' };

describe('DTOs de Identity con el ValidationPipe global (M00)', () => {
  it('[TC-M02-080][DT-22] la CURP llega normalizada a mayúsculas', async () => {
    const dto = await validate(RegisterPatientProfileDto, { ...VALID_PROFILE, curp: ' xexx010101hnexxxa4 ' });
    expect(dto.curp).toBe('XEXX010101HNEXXXA4');
  });

  it('[TC-M02-081][DT-22] CURP inválida o ausente → 400 sin repetir el valor', async () => {
    const message = await messages(RegisterPatientProfileDto, { ...VALID_PROFILE, curp: 'XBXX010101HNEXXXA4' });
    expect(message).toContain('curp no tiene un formato válido');
    expect(message).not.toContain('XBXX');
    expect(await messages(RegisterPatientProfileDto, { ...VALID_PROFILE, curp: undefined })).toContain('curp');
  });

  it('[TC-M02-082][DP-5] el alta del perfil no acepta un rol', async () => {
    expect(await messages(RegisterPatientProfileDto, { ...VALID_PROFILE, role: 'admin' })).toContain('property role should not exist');
  });

  it.each(['curp', 'firstName', 'lastName', 'birthDate', 'role', 'photoObjectKey'])(
    '[TC-M02-083][DP-12] PATCH /me/profile con %s → 400',
    async (field) => {
      expect(await messages(UpdatePatientProfileDto, { phone: '5551234567', [field]: 'x' })).toContain(`property ${field} should not exist`);
    },
  );

  it('[TC-M02-084][DP-12] PATCH acepta los cuatro campos editables y null para borrarlos', async () => {
    const dto = await validate(UpdatePatientProfileDto, { phone: ' 5551234567 ', address: null, emergencyContactName: 'Contacto', emergencyContactPhone: '5550000000' });
    expect(dto).toMatchObject({ phone: '5551234567', address: null });
  });

  it('[TC-M02-085][RF-03] documentIds: 1 o 2 UUID sin repetir', async () => {
    const a = '11111111-1111-4111-8111-111111111111';
    const b = '22222222-2222-4222-8222-222222222222';
    await expect(validate(AcceptLegalDocumentsDto, { documentIds: [a, b] })).resolves.toBeInstanceOf(AcceptLegalDocumentsDto);
    for (const documentIds of [[], [a, a], [a, b, '33333333-3333-4333-8333-333333333333'], ['no-uuid'], a]) {
      await messages(AcceptLegalDocumentsDto, { documentIds });
    }
  });

  it('[TC-M02-086][RF-07] motivo de rechazo de 10 a 500 caracteres; paginación con pageSize ≤ 50', async () => {
    expect((await validate(RejectIdentityVerificationDto, { reason: '  Imagen ilegible ' })).reason).toBe('Imagen ilegible');
    await messages(RejectIdentityVerificationDto, { reason: 'corto' });
    await messages(RejectIdentityVerificationDto, { reason: 'x'.repeat(501) });

    const query = await validate(ListPendingIdentityVerificationsQueryDto, { page: '2', pageSize: '50' }, 'query');
    expect(query).toMatchObject({ page: 2, pageSize: 50 });
    expect(await validate(ListPendingIdentityVerificationsQueryDto, {}, 'query')).toMatchObject({ page: 1, pageSize: 20 });
    await messages(ListPendingIdentityVerificationsQueryDto, { pageSize: '51' });
  });
});
