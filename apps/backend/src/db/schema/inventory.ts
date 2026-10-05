import { sql } from 'drizzle-orm';
import {
  pgTable,
  uuid,
  varchar,
  text,
  integer,
  numeric,
  boolean,
  timestamp,
  index,
  uniqueIndex,
  check,
} from 'drizzle-orm/pg-core';
import { inventoryMovementTypeEnum } from './enums';
import { userProfile } from './identity';
import { organization } from './organization';
import { medicationOrder, medicationOrderItem } from './order';

export const medication = pgTable('medication', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name').notNull().unique(),
  description: text('description'),
  photoUrl: text('photo_url'),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const medicationPresentation = pgTable(
  'medication_presentation',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    medicationId: uuid('medication_id').notNull().references(() => medication.id),
    name: varchar('name').notNull(),
    dosageForm: varchar('dosage_form').notNull(),
    strength: varchar('strength'),
    unitCount: integer('unit_count'),
    unit: varchar('unit'),
    salePrice: numeric('sale_price', { precision: 10, scale: 2 }).notNull(),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('medication_presentation_medication_idx').on(t.medicationId),
    uniqueIndex('medication_presentation_name_uq').on(t.medicationId, t.name),
  ],
);

// organization_id NULL = inventario de la plataforma; con valor = inventario de esa organización.
// La unicidad se garantiza con dos índices únicos parciales.
export const inventory = pgTable(
  'inventory',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id').references(() => organization.id),
    medicationPresentationId: uuid('medication_presentation_id')
      .notNull()
      .references(() => medicationPresentation.id),
    quantityOnHand: integer('quantity_on_hand').notNull().default(0),
    quantityReserved: integer('quantity_reserved').notNull().default(0),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('inventory_presentation_idx').on(t.medicationPresentationId),
    index('inventory_owner_presentation_idx').on(t.organizationId, t.medicationPresentationId),
    uniqueIndex('inventory_platform_presentation_uq')
      .on(t.medicationPresentationId)
      .where(sql`${t.organizationId} is null`),
    uniqueIndex('inventory_organization_presentation_uq')
      .on(t.organizationId, t.medicationPresentationId)
      .where(sql`${t.organizationId} is not null`),
    check('inventory_quantity_on_hand_chk', sql`${t.quantityOnHand} >= 0`),
    check(
      'inventory_quantity_reserved_chk',
      sql`${t.quantityReserved} >= 0 and ${t.quantityReserved} <= ${t.quantityOnHand}`,
    ),
  ],
);

export const inventoryHold = pgTable(
  'inventory_hold',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    inventoryId: uuid('inventory_id').notNull().references(() => inventory.id),
    medicationOrderId: uuid('medication_order_id').references(() => medicationOrder.id),
    medicationOrderItemId: uuid('medication_order_item_id').references(() => medicationOrderItem.id),
    quantity: integer('quantity').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    releasedAt: timestamp('released_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('inventory_hold_inventory_idx').on(t.inventoryId),
    index('inventory_hold_order_idx').on(t.medicationOrderId),
    index('inventory_hold_expires_idx').on(t.expiresAt),
  ],
);

export const inventoryMovement = pgTable(
  'inventory_movement',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    inventoryId: uuid('inventory_id').notNull().references(() => inventory.id),
    type: inventoryMovementTypeEnum('type').notNull(),
    quantity: integer('quantity').notNull(),
    medicationOrderId: uuid('medication_order_id').references(() => medicationOrder.id),
    medicationOrderItemId: uuid('medication_order_item_id').references(() => medicationOrderItem.id),
    organizationId: uuid('organization_id').references(() => organization.id),
    performedBy: uuid('performed_by').references(() => userProfile.id),
    reason: text('reason'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('inventory_movement_inventory_idx').on(t.inventoryId),
    index('inventory_movement_order_idx').on(t.medicationOrderId),
    index('inventory_movement_created_idx').on(t.createdAt),
  ],
);
