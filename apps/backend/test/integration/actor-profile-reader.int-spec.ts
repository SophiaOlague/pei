import { db } from '../../src/db';
import { DrizzleActorProfileReader } from '../../src/auth/drizzle-actor-profile.reader';
import { testTag, withRollback } from '../support/with-rollback';
import { insertUserWithProfile } from '../support/fixtures';
import { countM00Residue } from '../support/residue';
import { assertC2BranchTarget } from '../support/c2-target-guard';

// Salvaguarda de destino: solo contra la rama temporal mediante C2. Ejecutado de otra forma, src/db usaría el
// DATABASE_URL del .env (rama `production`): falla al cargar el módulo, antes de cualquier consulta.
assertC2BranchTarget();

describe('DrizzleActorProfileReader (BD de desarrollo, siempre con rollback)', () => {
  const reader = new DrizzleActorProfileReader();
  let residueBefore: Record<string, number>;

  beforeAll(async () => {
    residueBefore = await countM00Residue();
  });

  afterAll(async () => {
    expect(await countM00Residue()).toEqual(residueBefore);
    await db.$client.end();
  });

  it.each(['patient', 'doctor', 'admin', 'organization'] as const)(
    '[TC-M00-150][RF-02][RN-001][RN-002] devuelve el user_profile y el único rol de un usuario %s',
    async (role) => {
      await withRollback(async (tx) => {
        const { user, profile } = await insertUserWithProfile(tx, role);

        await expect(reader.findByUserId(user.id)).resolves.toEqual({ userProfileId: profile.id, role });
      });
    },
  );

  it('[TC-M00-151][RN-002] usuario sin perfil de dominio → null', async () => {
    await expect(reader.findByUserId(testTag())).resolves.toBeNull();
  });
});
