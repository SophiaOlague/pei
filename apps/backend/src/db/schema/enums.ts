import { pgEnum } from 'drizzle-orm/pg-core';

export const roleEnum = pgEnum('role_enum', ['patient', 'doctor', 'admin', 'organization']);

export const specialtyEnum = pgEnum('specialty_enum', ['infectologia', 'psicologia', 'medicina_general']);

export const membershipStatusEnum = pgEnum('membership_status_enum', ['active', 'past_due', 'canceled']);

export const doctorVerificationStatusEnum = pgEnum('doctor_verification_status_enum', [
  'pending',
  'approved',
  'rejected',
]);

export const organizationTypeEnum = pgEnum('organization_type_enum', [
  'casa_arcoiris',
  'institucion_publica',
  'otro',
]);

export const appointmentTypeEnum = pgEnum('appointment_type_enum', ['scheduled', 'emergency']);

export const appointmentStatusEnum = pgEnum('appointment_status_enum', [
  'pending_payment',
  'confirmed',
  'completed',
  'canceled',
  'no_show',
]);

export const labStatusEnum = pgEnum('lab_status_enum', ['optimal', 'sufficient', 'out_of_range']);

export const deliveryMethodEnum = pgEnum('delivery_method_enum', ['pickup', 'home_delivery']);

export const dispensationStatusEnum = pgEnum('dispensation_status_enum', [
  'pending',
  'packed',
  'shipped',
  'ready_for_pickup',
  'redeemed',
  'delivered',
  'expired',
  'out_of_stock',
]);

export const redemptionStatusEnum = pgEnum('redemption_status_enum', [
  'pending',
  'redeemed',
  'expired',
  'canceled',
  'not_applicable',
]);

export const paymentTypeEnum = pgEnum('payment_type_enum', ['membership', 'consultation', 'medication']);

export const paymentStatusEnum = pgEnum('payment_status_enum', ['pending', 'succeeded', 'failed', 'refunded']);

export const riskLevelEnum = pgEnum('risk_level_enum', ['low', 'medium', 'high']);

export const meetingStatusEnum = pgEnum('meeting_status_enum', ['scheduled', 'active', 'ended']);