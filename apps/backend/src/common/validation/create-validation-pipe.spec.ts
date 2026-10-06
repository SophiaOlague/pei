import { BadRequestException, type ArgumentMetadata } from '@nestjs/common';
import { IsInt, IsString, Min } from 'class-validator';
import { createValidationPipe } from './create-validation-pipe';

class SampleDto {
  @IsString()
  name!: string;

  @IsInt()
  @Min(1)
  quantity!: number;
}

const bodyOf = (metatype: ArgumentMetadata['metatype']): ArgumentMetadata => ({ type: 'body', metatype, data: '' });

async function validationMessages(promise: Promise<unknown>): Promise<string[]> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(BadRequestException);
    return ((error as BadRequestException).getResponse() as { message: string[] }).message;
  }
  throw new Error('Se esperaba BadRequestException');
}

describe('createValidationPipe', () => {
  const pipe = createValidationPipe();

  it('[TC-M00-030][RNF-10] payload válido → instancia del DTO', async () => {
    const result = await pipe.transform({ name: 'Truvada', quantity: 2 }, bodyOf(SampleDto));

    expect(result).toBeInstanceOf(SampleDto);
    expect(result).toEqual({ name: 'Truvada', quantity: 2 });
  });

  it('[TC-M00-031][RNF-10] propiedad no declarada → 400 (protección contra asignación masiva)', async () => {
    const messages = await validationMessages(
      pipe.transform({ name: 'Truvada', quantity: 2, role: 'admin' }, bodyOf(SampleDto)),
    );
    expect(messages).toContain('property role should not exist');
  });

  it.each([
    [{ name: 123, quantity: 2 }, 'name must be a string'],
    [{ name: 'Truvada', quantity: 1.5 }, 'quantity must be an integer number'],
    [{ name: 'Truvada', quantity: 0 }, 'quantity must not be less than 1'],
    [{ name: 'Truvada' }, 'quantity must be an integer number'],
  ])('[TC-M00-032][RNF-10] %j → 400 con "%s"', async (payload, expected) => {
    const messages = await validationMessages(pipe.transform(payload, bodyOf(SampleDto)));
    expect(messages).toContain(expected);
  });

  it('[TC-M00-033][RNF-10] un body tipado como objeto literal (sin clase DTO) no se valida: comportamiento previo de /me/complete-profile', async () => {
    const payload = { cualquier: 'cosa' };
    await expect(pipe.transform(payload, bodyOf(Object))).resolves.toBe(payload);
  });
});
