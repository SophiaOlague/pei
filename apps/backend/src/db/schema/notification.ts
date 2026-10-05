import { pgTable, uuid, varchar, text, boolean, timestamp, jsonb, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { notificationChannelEnum, notificationDeliveryStatusEnum, notificationTypeEnum } from './enums';
import { userProfile } from './identity';

export const pushNotificationToken = pgTable(
  'push_notification_token',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userProfileId: uuid('user_profile_id').notNull().references(() => userProfile.id),
    token: text('token').notNull().unique(),
    platform: varchar('platform'),
    appIdentifier: varchar('app_identifier'),
    isActive: boolean('is_active').notNull().default(true),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('push_token_user_idx').on(t.userProfileId), index('push_token_active_idx').on(t.isActive)],
);

export const notification = pgTable(
  'notification',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    recipientUserProfileId: uuid('recipient_user_profile_id').notNull().references(() => userProfile.id),
    type: notificationTypeEnum('type').notNull(),
    title: varchar('title').notNull(),
    body: text('body').notNull(),
    data: jsonb('data'),
    isCritical: boolean('is_critical').notNull().default(false),
    readAt: timestamp('read_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('notification_recipient_idx').on(t.recipientUserProfileId),
    index('notification_type_idx').on(t.type),
    index('notification_read_idx').on(t.readAt),
    index('notification_created_idx').on(t.createdAt),
  ],
);

export const notificationDelivery = pgTable(
  'notification_delivery',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    notificationId: uuid('notification_id').notNull().references(() => notification.id),
    channel: notificationChannelEnum('channel').notNull(),
    status: notificationDeliveryStatusEnum('status').notNull().default('pending'),
    deliveryKey: varchar('delivery_key').notNull().unique(),
    pushNotificationTokenId: uuid('push_notification_token_id').references(() => pushNotificationToken.id),
    providerMessageId: varchar('provider_message_id'),
    sentAt: timestamp('sent_at', { withTimezone: true }),
    deliveredAt: timestamp('delivered_at', { withTimezone: true }),
    failedAt: timestamp('failed_at', { withTimezone: true }),
    error: text('error'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('notification_delivery_notification_idx').on(t.notificationId),
    index('notification_delivery_status_idx').on(t.status),
  ],
);

export const notificationPreference = pgTable(
  'notification_preference',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userProfileId: uuid('user_profile_id').notNull().references(() => userProfile.id),
    notificationType: notificationTypeEnum('notification_type').notNull(),
    inAppEnabled: boolean('in_app_enabled').notNull().default(true),
    pushEnabled: boolean('push_enabled').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('notification_preference_uq').on(t.userProfileId, t.notificationType)],
);
