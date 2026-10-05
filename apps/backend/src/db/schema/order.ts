import { sql } from 'drizzle-orm';
import { pgTable, uuid, varchar, text, integer, numeric, timestamp, index, uniqueIndex, check } from 'drizzle-orm/pg-core';
import { deliveryMethodEnum, orderStatusEnum, cancellationActorTypeEnum } from './enums';
import { userProfile } from './identity';
import { organization } from './organization';
import { patientProfile } from './patient';
import { medicationPresentation } from './inventory';
import { prescriptionItem } from './prescription';

export const cart = pgTable('cart', {
  id: uuid('id').primaryKey().defaultRandom(),
  patientId: uuid('patient_id').notNull().unique().references(() => patientProfile.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const cartItem = pgTable(
  'cart_item',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    cartId: uuid('cart_id').notNull().references(() => cart.id),
    prescriptionItemId: uuid('prescription_item_id').notNull().references(() => prescriptionItem.id),
    quantity: integer('quantity').notNull(),
    unitPrice: numeric('unit_price', { precision: 10, scale: 2 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('cart_item_cart_idx').on(t.cartId),
    index('cart_item_prescription_item_idx').on(t.prescriptionItemId),
    uniqueIndex('cart_item_cart_prescription_item_uq').on(t.cartId, t.prescriptionItemId),
    check('cart_item_quantity_chk', sql`${t.quantity} > 0`),
  ],
);

export const medicationOrder = pgTable(
  'medication_order',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    patientId: uuid('patient_id').notNull().references(() => patientProfile.id),
    deliveryMethod: deliveryMethodEnum('delivery_method').notNull(),
    organizationId: uuid('organization_id').references(() => organization.id),
    shippingAddress: text('shipping_address'),
    subtotal: numeric('subtotal', { precision: 10, scale: 2 }).notNull(),
    shippingCost: numeric('shipping_cost', { precision: 10, scale: 2 }).notNull().default('0'),
    total: numeric('total', { precision: 10, scale: 2 }).notNull(),
    currency: varchar('currency', { length: 3 }).notNull().default('MXN'),
    status: orderStatusEnum('status').notNull().default('order_received'),
    cancellationReason: text('cancellation_reason'),
    cancelledByType: cancellationActorTypeEnum('cancelled_by_type'),
    cancelledByUserProfileId: uuid('cancelled_by_user_profile_id').references(() => userProfile.id),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
    pickupExpiresAt: timestamp('pickup_expires_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('medication_order_patient_idx').on(t.patientId),
    index('medication_order_organization_idx').on(t.organizationId),
    index('medication_order_status_idx').on(t.status),
    index('medication_order_pickup_expires_idx').on(t.pickupExpiresAt),
    index('medication_order_created_at_idx').on(t.createdAt),
    check(
      'medication_order_delivery_chk',
      sql`(${t.deliveryMethod} = 'pickup' and ${t.organizationId} is not null) or (${t.deliveryMethod} = 'home_delivery' and ${t.shippingAddress} is not null)`,
    ),
  ],
);

export const medicationOrderItem = pgTable(
  'medication_order_item',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orderId: uuid('order_id').notNull().references(() => medicationOrder.id),
    prescriptionItemId: uuid('prescription_item_id').notNull().references(() => prescriptionItem.id),
    medicationPresentationId: uuid('medication_presentation_id')
      .notNull()
      .references(() => medicationPresentation.id),
    quantity: integer('quantity').notNull(),
    unitPrice: numeric('unit_price', { precision: 10, scale: 2 }).notNull(),
    subtotal: numeric('subtotal', { precision: 10, scale: 2 }).notNull(),
  },
  (t) => [
    index('medication_order_item_order_idx').on(t.orderId),
    index('medication_order_item_prescription_item_idx').on(t.prescriptionItemId),
    index('medication_order_item_presentation_idx').on(t.medicationPresentationId),
    check('medication_order_item_quantity_chk', sql`${t.quantity} > 0`),
  ],
);

export const orderStatusHistory = pgTable(
  'order_status_history',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orderId: uuid('order_id').notNull().references(() => medicationOrder.id),
    status: orderStatusEnum('status').notNull(),
    changedByType: cancellationActorTypeEnum('changed_by_type'),
    changedByUserProfileId: uuid('changed_by_user_profile_id').references(() => userProfile.id),
    reason: text('reason'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('order_status_history_order_idx').on(t.orderId),
    index('order_status_history_created_idx').on(t.createdAt),
  ],
);

// Sin estado propio: el estado vive en medication_order.status.
// redemption_code es el código QR de recogida del pedido.
export const treatmentDispensation = pgTable(
  'treatment_dispensation',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orderId: uuid('order_id').notNull().unique().references(() => medicationOrder.id),
    organizationId: uuid('organization_id').references(() => organization.id),
    deliveryMethod: deliveryMethodEnum('delivery_method').notNull(),
    redemptionCode: varchar('redemption_code').unique(),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    packedBy: uuid('packed_by').references(() => userProfile.id),
    shippedAt: timestamp('shipped_at', { withTimezone: true }),
    trackingNumber: varchar('tracking_number'),
    redeemedAt: timestamp('redeemed_at', { withTimezone: true }),
    deliveredAt: timestamp('delivered_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('dispensation_organization_idx').on(t.organizationId)],
);
