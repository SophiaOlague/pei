import { pgTable, uuid, text, varchar, date, timestamp, numeric } from 'drizzle-orm/pg-core';
import { roleEnum } from './enums';
import { user } from './auth';

export const userProfile = pgTable('user_profile', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: text('user_id').notNull().unique().references(() => user.id),
  role: roleEnum('role').notNull(),
  firstName: varchar('first_name').notNull(),
  lastName: varchar('last_name').notNull(),
  phone: varchar('phone'),
  birthDate: date('birth_date'),
  emergencyContactName: varchar('emergency_contact_name'),
  emergencyContactPhone: varchar('emergency_contact_phone'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const platformSetting = pgTable('platform_setting', {
  id: uuid('id').primaryKey().defaultRandom(),
  consultationPrice: numeric('consultation_price').notNull(),
  updatedBy: uuid('updated_by').notNull().references(() => userProfile.id),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// NUEVA: auditoría genérica para acciones sensibles sin campo dedicado (login, cambios de config, etc.)
export const auditLog = pgTable('audit_log', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => userProfile.id),
  action: varchar('action').notNull(), // ej. 'login', 'update_consultation_price', 'approve_doctor'
  entityType: varchar('entity_type'), // ej. 'doctor_profile', 'platform_setting'
  entityId: uuid('entity_id'),
  metadata: text('metadata'), // JSON serializado con detalle adicional si aplica
  createdAt: timestamp('created_at').notNull().defaultNow(),
});