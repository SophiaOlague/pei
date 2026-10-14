import { sql } from 'drizzle-orm';
import { pgTable, uuid, text, varchar, date, timestamp, jsonb, index, check } from 'drizzle-orm/pg-core';
import { roleEnum, auditActorTypeEnum } from './enums';
import { user } from './auth';

// Estructura de la CURP (RENAPO): 4 letras (la 2.ª, vocal o X), fecha AAMMDD, sexo, entidad federativa,
// 3 consonantes internas, diferenciador y dígito verificador. La BD valida el formato; el dígito verificador
// lo valida la aplicación (M02, DT-22).
export const CURP_PATTERN =
  '^[A-Z][AEIOUX][A-Z]{2}[0-9]{2}(0[1-9]|1[0-2])(0[1-9]|[12][0-9]|3[01])[HMX]' +
  '(AS|BC|BS|CC|CL|CM|CS|CH|DF|DG|GT|GR|HG|JC|MC|MN|MS|NT|NL|OC|PL|QT|QR|SP|SL|SR|TC|TS|TL|VZ|YN|ZS|NE)' +
  '[B-DF-HJ-NP-TV-Z]{3}[A-Z0-9][0-9]$';

// M03 R-12: la CURP vive aquí y es única entre todos los roles (D-20, D-35). Paciente y médico la requieren;
// admin y organización no la tienen.
export const userProfile = pgTable(
  'user_profile',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id').notNull().unique().references(() => user.id),
    role: roleEnum('role').notNull(),
    firstName: varchar('first_name').notNull(),
    lastName: varchar('last_name').notNull(),
    curp: varchar('curp').unique(),
    phone: varchar('phone'),
    birthDate: date('birth_date'),
    emergencyContactName: varchar('emergency_contact_name'),
    emergencyContactPhone: varchar('emergency_contact_phone'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check('user_profile_curp_upper_chk', sql`${t.curp} = upper(${t.curp})`),
    check('user_profile_curp_format_chk', sql`${t.curp} ~ ${sql.raw(`'${CURP_PATTERN}'`)}`),
    check('user_profile_curp_required_chk', sql`${t.role} not in ('patient', 'doctor') or ${t.curp} is not null`),
  ],
);

// Append-only desde la aplicación; proteger contra UPDATE/DELETE en la base de datos.
// La BD fija created_at y protege contra UPDATE, DELETE y TRUNCATE (triggers en migraciones SQL).
// actor_user_id identifica al usuario aunque aún no tenga user_profile (M01, RN-120).
export const auditLog = pgTable(
  'audit_log',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    actorType: auditActorTypeEnum('actor_type').notNull(),
    actorUserId: text('actor_user_id').references(() => user.id),
    actorUserProfileId: uuid('actor_user_profile_id').references(() => userProfile.id),
    action: varchar('action').notNull(),
    entityType: varchar('entity_type'),
    entityId: uuid('entity_id'),
    metadata: jsonb('metadata'),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('audit_actor_idx').on(t.actorUserProfileId),
    index('audit_entity_idx').on(t.entityId),
    index('audit_created_at_idx').on(t.createdAt),
    index('audit_action_idx').on(t.action),
    // RN-120: un actor usuario se identifica siempre; el sistema no tiene usuario ni perfil.
    check(
      'audit_log_actor_chk',
      sql`(${t.actorType} = 'user' and ${t.actorUserId} is not null) or (${t.actorType} = 'system' and ${t.actorUserId} is null and ${t.actorUserProfileId} is null)`,
    ),
    // entity_id solo tiene sentido junto con su entity_type.
    check('audit_log_entity_chk', sql`${t.entityId} is null or ${t.entityType} is not null`),
  ],
);
