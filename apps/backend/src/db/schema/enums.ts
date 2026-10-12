import { pgEnum } from 'drizzle-orm/pg-core';

// ============================================================
// Identidad
// ============================================================

export const roleEnum = pgEnum('role_enum', ['patient', 'doctor', 'admin', 'organization']);

export const specialtyEnum = pgEnum('specialty_enum', ['infectologia', 'psicologia', 'medicina_general']);

export const doctorVerificationStatusEnum = pgEnum('doctor_verification_status_enum', [
  'pending',
  'approved',
  'rejected',
]);

export const identityVerificationStatusEnum = pgEnum('identity_verification_status_enum', [
  'pending',
  'approved',
  'rejected',
]);

export const riskLevelEnum = pgEnum('risk_level_enum', ['low', 'medium', 'high']);

export const organizationTypeEnum = pgEnum('organization_type_enum', [
  'casa_arcoiris',
  'institucion_publica',
  'otro',
]);

export const smokingStatusEnum = pgEnum('smoking_status_enum', [
  'non_smoker',
  'occasional',
  'regular',
  'former_smoker',
]);

export const alcoholConsumptionEnum = pgEnum('alcohol_consumption_enum', ['none', 'occasional', 'frequent']);

export const physicalActivityEnum = pgEnum('physical_activity_enum', [
  'none',
  'one_two_per_week',
  'three_four_per_week',
  'five_or_more_per_week',
]);

// ============================================================
// Citas
// ============================================================

export const appointmentTypeEnum = pgEnum('appointment_type_enum', ['scheduled', 'emergency']);

export const appointmentStatusEnum = pgEnum('appointment_status_enum', [
  'pending_payment',
  'expired',
  'confirmed',
  'completed',
  'canceled',
  'no_show_patient',
  'no_show_doctor',
  'no_show_both',
]);

export const cancellationActorTypeEnum = pgEnum('cancellation_actor_type_enum', [
  'patient',
  'doctor',
  'admin',
  'system',
]);

export const meetingStatusEnum = pgEnum('meeting_status_enum', ['scheduled', 'active', 'ended']);

export const meetingParticipantEnum = pgEnum('meeting_participant_enum', ['patient', 'doctor']);

export const meetingSessionEventTypeEnum = pgEnum('meeting_session_event_type_enum', ['joined', 'left']);

// ============================================================
// Recetas e inventario
// ============================================================

export const prescriptionStatusEnum = pgEnum('prescription_status_enum', [
  'draft',
  'active',
  'expired',
  'canceled',
  'exhausted',
]);

export const prescriptionSignatureStatusEnum = pgEnum('prescription_signature_status_enum', [
  'pending',
  'signed',
  'failed',
  'revoked',
]);

export const prescriptionFulfillmentStatusEnum = pgEnum('prescription_fulfillment_status_enum', [
  'reserved',
  'dispensed',
  'canceled',
]);

export const inventoryMovementTypeEnum = pgEnum('inventory_movement_type_enum', [
  'receipt',
  'adjustment_in',
  'adjustment_out',
  'reservation',
  'reservation_release',
  'dispensation',
  'return_pending',
  'return_accepted',
  'transfer_in',
  'transfer_out',
  'expiration',
]);

// ============================================================
// Pedidos
// ============================================================

export const deliveryMethodEnum = pgEnum('delivery_method_enum', ['pickup', 'home_delivery']);

export const orderStatusEnum = pgEnum('order_status_enum', [
  'order_received',
  'preparing',
  'ready_for_pickup',
  'shipped',
  'delivery_failed',
  'delivered',
  'picked_up',
  'pickup_expired',
  'canceled',
]);

// ============================================================
// Pagos y liquidaciones
// ============================================================

export const paymentTypeEnum = pgEnum('payment_type_enum', ['consultation', 'medication']);

export const paymentStatusEnum = pgEnum('payment_status_enum', [
  'pending',
  'requires_action',
  'succeeded',
  'failed',
  'canceled',
]);

export const refundStatusEnum = pgEnum('refund_status_enum', [
  'requested',
  'pending',
  'processing',
  'succeeded',
  'failed',
  'canceled',
]);

export const refundReasonEnum = pgEnum('refund_reason_enum', [
  'patient_cancellation',
  'doctor_cancellation',
  'admin_cancellation',
  'exceptional_refund',
  'pickup_expired',
  'payment_error',
  'other',
]);

export const stripeConnectStatusEnum = pgEnum('stripe_connect_status_enum', [
  'pending',
  'onboarding',
  'restricted',
  'enabled',
  'disabled',
]);

export const stripePaymentMethodStatusEnum = pgEnum('stripe_payment_method_status_enum', ['active', 'detached']);

export const payoutFrequencyEnum = pgEnum('payout_frequency_enum', ['weekly', 'biweekly', 'monthly']);

export const payoutStatusEnum = pgEnum('payout_status_enum', [
  'pending',
  'processing',
  'paid',
  'failed',
  'canceled',
]);

export const doctorPayoutItemEligibilityEnum = pgEnum('doctor_payout_item_eligibility_enum', [
  'eligible',
  'on_hold',
  'revoked',
]);

export const doctorPayoutAdjustmentTypeEnum = pgEnum('doctor_payout_adjustment_type_enum', [
  'refund_reversal',
  'chargeback',
  'correction',
  'other',
]);

// ============================================================
// Soporte
// ============================================================

export const supportRequestStatusEnum = pgEnum('support_request_status_enum', [
  'open',
  'in_review',
  'resolved',
  'rejected',
]);

export const supportIncidentCauseEnum = pgEnum('support_incident_cause_enum', [
  'platform_fault',
  'doctor_fault',
  'patient_fault',
  'undetermined',
]);

// ============================================================
// Notificaciones
// ============================================================

export const notificationChannelEnum = pgEnum('notification_channel_enum', ['in_app', 'push']);

export const notificationDeliveryStatusEnum = pgEnum('notification_delivery_status_enum', [
  'pending',
  'sent',
  'delivered',
  'failed',
]);

export const notificationTypeEnum = pgEnum('notification_type_enum', [
  'appointment_confirmed',
  'appointment_reminder',
  'appointment_canceled',
  'appointment_rescheduled',
  'appointment_waiting',
  'appointment_completed',
  'order_confirmed',
  'order_canceled',
  'order_preparing',
  'order_ready_for_pickup',
  'order_shipped',
  'order_delivered',
  'order_pickup_expiring',
  'order_pickup_expired',
  'payment_succeeded',
  'payment_failed',
  'refund_processing',
  'refund_succeeded',
  'refund_failed',
  'payout_processing',
  'payout_succeeded',
  'payout_failed',
  'prescription_issued',
  'prescription_canceled',
  'prescription_expiring',
  'prescription_expired',
  'lab_result_available',
  'security_event',
  'order_delivery_failed',
  'support_request_updated',
]);

// ============================================================
// Auditoría y documentos legales
// ============================================================

export const auditActorTypeEnum = pgEnum('audit_actor_type_enum', ['user', 'system']);

// privacy_notice y terms_and_conditions: tipos de legado (M02), conservados por las filas históricas (N1).
// privacy_policy, patient_terms y doctor_terms: requisitos por rol (M03 D-32).
export const legalDocumentTypeEnum = pgEnum('legal_document_type_enum', [
  'privacy_notice',
  'terms_and_conditions',
  'privacy_policy',
  'patient_terms',
  'doctor_terms',
]);
