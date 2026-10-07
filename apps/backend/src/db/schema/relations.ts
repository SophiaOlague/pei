import { relations } from 'drizzle-orm';
import { user, account, session } from './auth';
import { userProfile, auditLog } from './identity';
import { organization } from './organization';
import { patientProfile, patientIdentityVerification, patientHealthSummary } from './patient';
import { doctorProfile, doctorAvailability, doctorTimeOff } from './doctor';
import { medication, medicationPresentation, inventory, inventoryHold, inventoryMovement } from './inventory';
import { appointment, appointmentStatusHistory, meeting, meetingSessionEvent, review } from './appointment';
import { medicalRecord, medicalRecordEntry, labDocument } from './clinical-record';
import { prescription, prescriptionItem, prescriptionSignature, prescriptionItemFulfillment } from './prescription';
import {
  cart,
  cartItem,
  medicationOrder,
  medicationOrderItem,
  orderStatusHistory,
  treatmentDispensation,
} from './order';
import { stripeConnectAccount, stripePaymentMethod, payment, refund } from './payment';
import {
  consultationCommissionConfiguration,
  doctorPayout,
  doctorPayoutItem,
  doctorPayoutAdjustment,
  doctorPayoutAdjustmentApplication,
} from './payout';
import {
  cancellationPolicy,
  consultationPriceConfiguration,
  pickupConfiguration,
  appointmentReminderConfiguration,
} from './configuration';
import { pushNotificationToken, notification, notificationDelivery, notificationPreference } from './notification';
import { supportRequest } from './support';
import { appointmentNoShowPrediction, patientAdherenceSegment } from './analytics';
import { legalDocument, userLegalAcceptance, clinicalRecordConsent } from './consent';

// relationName solo es obligatorio cuando una tabla tiene más de una FK hacia la misma tabla
// (o hacia sí misma); en ese caso ambos lados de la relación deben usar el mismo nombre.

// ============================================================
// Auth
// ============================================================

export const userRelations = relations(user, ({ one, many }) => ({
  profile: one(userProfile),
  accounts: many(account),
  sessions: many(session),
}));

export const accountRelations = relations(account, ({ one }) => ({
  user: one(user, { fields: [account.userId], references: [user.id] }),
}));

export const sessionRelations = relations(session, ({ one }) => ({
  user: one(user, { fields: [session.userId], references: [user.id] }),
}));

// ============================================================
// Identidad
// ============================================================

export const userProfileRelations = relations(userProfile, ({ one, many }) => ({
  user: one(user, { fields: [userProfile.userId], references: [user.id] }),
  organization: one(organization),
  patientProfile: one(patientProfile),
  doctorProfile: one(doctorProfile, {
    fields: [userProfile.id],
    references: [doctorProfile.userProfileId],
    relationName: 'doctor_profile_user',
  }),
  reviewedDoctorProfiles: many(doctorProfile, { relationName: 'doctor_profile_reviewer' }),
  legalAcceptances: many(userLegalAcceptance),
  notifications: many(notification),
  pushNotificationTokens: many(pushNotificationToken),
  notificationPreferences: many(notificationPreference),
  auditLogs: many(auditLog),
}));

export const auditLogRelations = relations(auditLog, ({ one }) => ({
  actor: one(userProfile, { fields: [auditLog.actorUserProfileId], references: [userProfile.id] }),
}));

export const organizationRelations = relations(organization, ({ one, many }) => ({
  userProfile: one(userProfile, { fields: [organization.userProfileId], references: [userProfile.id] }),
  inventories: many(inventory),
  inventoryMovements: many(inventoryMovement),
  medicationOrders: many(medicationOrder),
  treatmentDispensations: many(treatmentDispensation),
}));

// ============================================================
// Paciente
// ============================================================

export const patientProfileRelations = relations(patientProfile, ({ one, many }) => ({
  userProfile: one(userProfile, { fields: [patientProfile.userProfileId], references: [userProfile.id] }),
  identityVerifications: many(patientIdentityVerification),
  healthSummary: one(patientHealthSummary),
  medicalRecord: one(medicalRecord),
  cart: one(cart),
  appointments: many(appointment),
  medicationOrders: many(medicationOrder),
  payments: many(payment),
  stripePaymentMethods: many(stripePaymentMethod),
  adherenceSegments: many(patientAdherenceSegment),
}));

export const patientIdentityVerificationRelations = relations(patientIdentityVerification, ({ one }) => ({
  patient: one(patientProfile, {
    fields: [patientIdentityVerification.patientId],
    references: [patientProfile.id],
  }),
  reviewer: one(userProfile, {
    fields: [patientIdentityVerification.reviewedBy],
    references: [userProfile.id],
  }),
}));

export const patientHealthSummaryRelations = relations(patientHealthSummary, ({ one }) => ({
  patient: one(patientProfile, { fields: [patientHealthSummary.patientId], references: [patientProfile.id] }),
}));

// ============================================================
// Médico
// ============================================================

export const doctorProfileRelations = relations(doctorProfile, ({ one, many }) => ({
  userProfile: one(userProfile, {
    fields: [doctorProfile.userProfileId],
    references: [userProfile.id],
    relationName: 'doctor_profile_user',
  }),
  reviewer: one(userProfile, {
    fields: [doctorProfile.reviewedBy],
    references: [userProfile.id],
    relationName: 'doctor_profile_reviewer',
  }),
  availability: many(doctorAvailability),
  timeOff: many(doctorTimeOff),
  appointments: many(appointment),
  medicalRecordEntries: many(medicalRecordEntry),
  prescriptions: many(prescription),
  prescriptionSignatures: many(prescriptionSignature),
  stripeConnectAccount: one(stripeConnectAccount),
  payments: many(payment),
  payouts: many(doctorPayout),
  payoutAdjustments: many(doctorPayoutAdjustment),
}));

export const doctorAvailabilityRelations = relations(doctorAvailability, ({ one }) => ({
  doctor: one(doctorProfile, { fields: [doctorAvailability.doctorId], references: [doctorProfile.id] }),
}));

export const doctorTimeOffRelations = relations(doctorTimeOff, ({ one }) => ({
  doctor: one(doctorProfile, { fields: [doctorTimeOff.doctorId], references: [doctorProfile.id] }),
}));

// ============================================================
// Catálogo e inventario
// ============================================================

export const medicationRelations = relations(medication, ({ many }) => ({
  presentations: many(medicationPresentation),
}));

export const medicationPresentationRelations = relations(medicationPresentation, ({ one, many }) => ({
  medication: one(medication, { fields: [medicationPresentation.medicationId], references: [medication.id] }),
  inventories: many(inventory),
  prescriptionItems: many(prescriptionItem),
  orderItems: many(medicationOrderItem),
}));

export const inventoryRelations = relations(inventory, ({ one, many }) => ({
  organization: one(organization, { fields: [inventory.organizationId], references: [organization.id] }),
  presentation: one(medicationPresentation, {
    fields: [inventory.medicationPresentationId],
    references: [medicationPresentation.id],
  }),
  holds: many(inventoryHold),
  movements: many(inventoryMovement),
}));

export const inventoryHoldRelations = relations(inventoryHold, ({ one }) => ({
  inventory: one(inventory, { fields: [inventoryHold.inventoryId], references: [inventory.id] }),
  order: one(medicationOrder, { fields: [inventoryHold.medicationOrderId], references: [medicationOrder.id] }),
  orderItem: one(medicationOrderItem, {
    fields: [inventoryHold.medicationOrderItemId],
    references: [medicationOrderItem.id],
  }),
}));

export const inventoryMovementRelations = relations(inventoryMovement, ({ one }) => ({
  inventory: one(inventory, { fields: [inventoryMovement.inventoryId], references: [inventory.id] }),
  order: one(medicationOrder, { fields: [inventoryMovement.medicationOrderId], references: [medicationOrder.id] }),
  orderItem: one(medicationOrderItem, {
    fields: [inventoryMovement.medicationOrderItemId],
    references: [medicationOrderItem.id],
  }),
  organization: one(organization, { fields: [inventoryMovement.organizationId], references: [organization.id] }),
  performer: one(userProfile, { fields: [inventoryMovement.performedBy], references: [userProfile.id] }),
}));

// ============================================================
// Agenda y citas
// ============================================================

export const appointmentRelations = relations(appointment, ({ one, many }) => ({
  patient: one(patientProfile, { fields: [appointment.patientId], references: [patientProfile.id] }),
  doctor: one(doctorProfile, { fields: [appointment.doctorId], references: [doctorProfile.id] }),
  cancellationPolicy: one(cancellationPolicy, {
    fields: [appointment.cancellationPolicyId],
    references: [cancellationPolicy.id],
  }),
  cancelledBy: one(userProfile, { fields: [appointment.cancelledByUserProfileId], references: [userProfile.id] }),
  rescheduledFrom: one(appointment, {
    fields: [appointment.rescheduledFromAppointmentId],
    references: [appointment.id],
    relationName: 'appointment_reschedule',
  }),
  reschedules: many(appointment, { relationName: 'appointment_reschedule' }),
  statusHistory: many(appointmentStatusHistory),
  meeting: one(meeting),
  review: one(review),
  clinicalRecordConsent: one(clinicalRecordConsent),
  medicalRecordEntries: many(medicalRecordEntry),
  prescriptions: many(prescription),
  payments: many(payment),
  supportRequests: many(supportRequest),
  noShowPredictions: many(appointmentNoShowPrediction),
}));

export const appointmentStatusHistoryRelations = relations(appointmentStatusHistory, ({ one }) => ({
  appointment: one(appointment, { fields: [appointmentStatusHistory.appointmentId], references: [appointment.id] }),
  changedBy: one(userProfile, {
    fields: [appointmentStatusHistory.changedByUserProfileId],
    references: [userProfile.id],
  }),
}));

export const meetingRelations = relations(meeting, ({ one, many }) => ({
  appointment: one(appointment, { fields: [meeting.appointmentId], references: [appointment.id] }),
  sessionEvents: many(meetingSessionEvent),
}));

export const meetingSessionEventRelations = relations(meetingSessionEvent, ({ one }) => ({
  meeting: one(meeting, { fields: [meetingSessionEvent.meetingId], references: [meeting.id] }),
}));

export const reviewRelations = relations(review, ({ one }) => ({
  appointment: one(appointment, { fields: [review.appointmentId], references: [appointment.id] }),
}));

// ============================================================
// Expediente clínico
// ============================================================

export const medicalRecordRelations = relations(medicalRecord, ({ one, many }) => ({
  patient: one(patientProfile, { fields: [medicalRecord.patientId], references: [patientProfile.id] }),
  entries: many(medicalRecordEntry),
  labDocuments: many(labDocument),
  prescriptions: many(prescription),
}));

export const medicalRecordEntryRelations = relations(medicalRecordEntry, ({ one }) => ({
  medicalRecord: one(medicalRecord, { fields: [medicalRecordEntry.medicalRecordId], references: [medicalRecord.id] }),
  appointment: one(appointment, { fields: [medicalRecordEntry.appointmentId], references: [appointment.id] }),
  author: one(doctorProfile, { fields: [medicalRecordEntry.authoredBy], references: [doctorProfile.id] }),
}));

export const labDocumentRelations = relations(labDocument, ({ one }) => ({
  medicalRecord: one(medicalRecord, { fields: [labDocument.medicalRecordId], references: [medicalRecord.id] }),
  uploadedBy: one(userProfile, { fields: [labDocument.uploadedByUserProfileId], references: [userProfile.id] }),
}));

// ============================================================
// Recetas
// ============================================================

export const prescriptionRelations = relations(prescription, ({ one, many }) => ({
  medicalRecord: one(medicalRecord, { fields: [prescription.medicalRecordId], references: [medicalRecord.id] }),
  doctor: one(doctorProfile, { fields: [prescription.doctorId], references: [doctorProfile.id] }),
  appointment: one(appointment, { fields: [prescription.appointmentId], references: [appointment.id] }),
  items: many(prescriptionItem),
  signature: one(prescriptionSignature),
}));

export const prescriptionItemRelations = relations(prescriptionItem, ({ one, many }) => ({
  prescription: one(prescription, { fields: [prescriptionItem.prescriptionId], references: [prescription.id] }),
  presentation: one(medicationPresentation, {
    fields: [prescriptionItem.medicationPresentationId],
    references: [medicationPresentation.id],
  }),
  fulfillments: many(prescriptionItemFulfillment),
  cartItems: many(cartItem),
  orderItems: many(medicationOrderItem),
}));

export const prescriptionSignatureRelations = relations(prescriptionSignature, ({ one }) => ({
  prescription: one(prescription, { fields: [prescriptionSignature.prescriptionId], references: [prescription.id] }),
  signedBy: one(doctorProfile, { fields: [prescriptionSignature.signedByDoctorId], references: [doctorProfile.id] }),
}));

export const prescriptionItemFulfillmentRelations = relations(prescriptionItemFulfillment, ({ one }) => ({
  prescriptionItem: one(prescriptionItem, {
    fields: [prescriptionItemFulfillment.prescriptionItemId],
    references: [prescriptionItem.id],
  }),
  orderItem: one(medicationOrderItem, {
    fields: [prescriptionItemFulfillment.medicationOrderItemId],
    references: [medicationOrderItem.id],
  }),
}));

// ============================================================
// Carrito y pedidos
// ============================================================

export const cartRelations = relations(cart, ({ one, many }) => ({
  patient: one(patientProfile, { fields: [cart.patientId], references: [patientProfile.id] }),
  items: many(cartItem),
}));

export const cartItemRelations = relations(cartItem, ({ one }) => ({
  cart: one(cart, { fields: [cartItem.cartId], references: [cart.id] }),
  prescriptionItem: one(prescriptionItem, {
    fields: [cartItem.prescriptionItemId],
    references: [prescriptionItem.id],
  }),
}));

export const medicationOrderRelations = relations(medicationOrder, ({ one, many }) => ({
  patient: one(patientProfile, { fields: [medicationOrder.patientId], references: [patientProfile.id] }),
  organization: one(organization, { fields: [medicationOrder.organizationId], references: [organization.id] }),
  cancelledBy: one(userProfile, {
    fields: [medicationOrder.cancelledByUserProfileId],
    references: [userProfile.id],
  }),
  items: many(medicationOrderItem),
  statusHistory: many(orderStatusHistory),
  dispensation: one(treatmentDispensation),
  inventoryHolds: many(inventoryHold),
  inventoryMovements: many(inventoryMovement),
  payments: many(payment),
  supportRequests: many(supportRequest),
}));

export const medicationOrderItemRelations = relations(medicationOrderItem, ({ one, many }) => ({
  order: one(medicationOrder, { fields: [medicationOrderItem.orderId], references: [medicationOrder.id] }),
  prescriptionItem: one(prescriptionItem, {
    fields: [medicationOrderItem.prescriptionItemId],
    references: [prescriptionItem.id],
  }),
  presentation: one(medicationPresentation, {
    fields: [medicationOrderItem.medicationPresentationId],
    references: [medicationPresentation.id],
  }),
  fulfillments: many(prescriptionItemFulfillment),
  inventoryHolds: many(inventoryHold),
  inventoryMovements: many(inventoryMovement),
}));

export const orderStatusHistoryRelations = relations(orderStatusHistory, ({ one }) => ({
  order: one(medicationOrder, { fields: [orderStatusHistory.orderId], references: [medicationOrder.id] }),
  changedBy: one(userProfile, {
    fields: [orderStatusHistory.changedByUserProfileId],
    references: [userProfile.id],
  }),
}));

export const treatmentDispensationRelations = relations(treatmentDispensation, ({ one }) => ({
  order: one(medicationOrder, { fields: [treatmentDispensation.orderId], references: [medicationOrder.id] }),
  organization: one(organization, {
    fields: [treatmentDispensation.organizationId],
    references: [organization.id],
  }),
  packer: one(userProfile, { fields: [treatmentDispensation.packedBy], references: [userProfile.id] }),
}));

// ============================================================
// Pagos y Stripe
// ============================================================

export const stripeConnectAccountRelations = relations(stripeConnectAccount, ({ one }) => ({
  doctor: one(doctorProfile, { fields: [stripeConnectAccount.doctorId], references: [doctorProfile.id] }),
}));

export const stripePaymentMethodRelations = relations(stripePaymentMethod, ({ one }) => ({
  patient: one(patientProfile, { fields: [stripePaymentMethod.patientId], references: [patientProfile.id] }),
}));

export const paymentRelations = relations(payment, ({ one, many }) => ({
  doctor: one(doctorProfile, { fields: [payment.doctorId], references: [doctorProfile.id] }),
  patient: one(patientProfile, { fields: [payment.patientId], references: [patientProfile.id] }),
  appointment: one(appointment, { fields: [payment.appointmentId], references: [appointment.id] }),
  medicationOrder: one(medicationOrder, { fields: [payment.medicationOrderId], references: [medicationOrder.id] }),
  refunds: many(refund),
  payoutItem: one(doctorPayoutItem),
  payoutAdjustments: many(doctorPayoutAdjustment),
}));

export const refundRelations = relations(refund, ({ one }) => ({
  payment: one(payment, { fields: [refund.paymentId], references: [payment.id] }),
  requestedBy: one(userProfile, {
    fields: [refund.requestedByUserProfileId],
    references: [userProfile.id],
    relationName: 'refund_requester',
  }),
  approver: one(userProfile, {
    fields: [refund.approvedBy],
    references: [userProfile.id],
    relationName: 'refund_approver',
  }),
}));

// ============================================================
// Liquidaciones al médico
// ============================================================

export const consultationCommissionConfigurationRelations = relations(
  consultationCommissionConfiguration,
  ({ one }) => ({
    createdBy: one(userProfile, {
      fields: [consultationCommissionConfiguration.createdBy],
      references: [userProfile.id],
    }),
  }),
);

export const doctorPayoutRelations = relations(doctorPayout, ({ one, many }) => ({
  doctor: one(doctorProfile, { fields: [doctorPayout.doctorId], references: [doctorProfile.id] }),
  items: many(doctorPayoutItem),
  sourcedAdjustments: many(doctorPayoutAdjustment),
  adjustmentApplications: many(doctorPayoutAdjustmentApplication),
}));

export const doctorPayoutItemRelations = relations(doctorPayoutItem, ({ one, many }) => ({
  payout: one(doctorPayout, { fields: [doctorPayoutItem.payoutId], references: [doctorPayout.id] }),
  payment: one(payment, { fields: [doctorPayoutItem.paymentId], references: [payment.id] }),
  adjustments: many(doctorPayoutAdjustment),
}));

export const doctorPayoutAdjustmentRelations = relations(doctorPayoutAdjustment, ({ one, many }) => ({
  doctor: one(doctorProfile, { fields: [doctorPayoutAdjustment.doctorId], references: [doctorProfile.id] }),
  sourcePayout: one(doctorPayout, {
    fields: [doctorPayoutAdjustment.sourcePayoutId],
    references: [doctorPayout.id],
  }),
  payoutItem: one(doctorPayoutItem, {
    fields: [doctorPayoutAdjustment.doctorPayoutItemId],
    references: [doctorPayoutItem.id],
  }),
  appointment: one(appointment, { fields: [doctorPayoutAdjustment.appointmentId], references: [appointment.id] }),
  payment: one(payment, { fields: [doctorPayoutAdjustment.paymentId], references: [payment.id] }),
  createdBy: one(userProfile, { fields: [doctorPayoutAdjustment.createdByUserId], references: [userProfile.id] }),
  applications: many(doctorPayoutAdjustmentApplication),
}));

export const doctorPayoutAdjustmentApplicationRelations = relations(doctorPayoutAdjustmentApplication, ({ one }) => ({
  adjustment: one(doctorPayoutAdjustment, {
    fields: [doctorPayoutAdjustmentApplication.adjustmentId],
    references: [doctorPayoutAdjustment.id],
  }),
  appliedPayout: one(doctorPayout, {
    fields: [doctorPayoutAdjustmentApplication.appliedPayoutId],
    references: [doctorPayout.id],
  }),
}));

// ============================================================
// Configuración
// ============================================================

export const cancellationPolicyRelations = relations(cancellationPolicy, ({ one, many }) => ({
  createdBy: one(userProfile, { fields: [cancellationPolicy.createdBy], references: [userProfile.id] }),
  appointments: many(appointment),
}));

export const consultationPriceConfigurationRelations = relations(consultationPriceConfiguration, ({ one }) => ({
  createdBy: one(userProfile, {
    fields: [consultationPriceConfiguration.createdBy],
    references: [userProfile.id],
  }),
}));

export const pickupConfigurationRelations = relations(pickupConfiguration, ({ one }) => ({
  createdBy: one(userProfile, { fields: [pickupConfiguration.createdBy], references: [userProfile.id] }),
}));

export const appointmentReminderConfigurationRelations = relations(appointmentReminderConfiguration, ({ one }) => ({
  createdBy: one(userProfile, {
    fields: [appointmentReminderConfiguration.createdBy],
    references: [userProfile.id],
  }),
}));

// ============================================================
// Notificaciones
// ============================================================

export const pushNotificationTokenRelations = relations(pushNotificationToken, ({ one, many }) => ({
  userProfile: one(userProfile, { fields: [pushNotificationToken.userProfileId], references: [userProfile.id] }),
  deliveries: many(notificationDelivery),
}));

export const notificationRelations = relations(notification, ({ one, many }) => ({
  recipient: one(userProfile, { fields: [notification.recipientUserProfileId], references: [userProfile.id] }),
  deliveries: many(notificationDelivery),
}));

export const notificationDeliveryRelations = relations(notificationDelivery, ({ one }) => ({
  notification: one(notification, { fields: [notificationDelivery.notificationId], references: [notification.id] }),
  pushNotificationToken: one(pushNotificationToken, {
    fields: [notificationDelivery.pushNotificationTokenId],
    references: [pushNotificationToken.id],
  }),
}));

export const notificationPreferenceRelations = relations(notificationPreference, ({ one }) => ({
  userProfile: one(userProfile, { fields: [notificationPreference.userProfileId], references: [userProfile.id] }),
}));

// ============================================================
// Soporte
// ============================================================

export const supportRequestRelations = relations(supportRequest, ({ one }) => ({
  medicationOrder: one(medicationOrder, {
    fields: [supportRequest.medicationOrderId],
    references: [medicationOrder.id],
  }),
  appointment: one(appointment, { fields: [supportRequest.appointmentId], references: [appointment.id] }),
  openedBy: one(userProfile, {
    fields: [supportRequest.openedByUserProfileId],
    references: [userProfile.id],
    relationName: 'support_request_opener',
  }),
  resolver: one(userProfile, {
    fields: [supportRequest.resolvedBy],
    references: [userProfile.id],
    relationName: 'support_request_resolver',
  }),
}));

// ============================================================
// Analítica
// ============================================================

export const appointmentNoShowPredictionRelations = relations(appointmentNoShowPrediction, ({ one }) => ({
  appointment: one(appointment, {
    fields: [appointmentNoShowPrediction.appointmentId],
    references: [appointment.id],
  }),
}));

export const patientAdherenceSegmentRelations = relations(patientAdherenceSegment, ({ one }) => ({
  patient: one(patientProfile, { fields: [patientAdherenceSegment.patientId], references: [patientProfile.id] }),
}));

// ============================================================
// Documentos legales y consentimiento
// ============================================================

export const legalDocumentRelations = relations(legalDocument, ({ many }) => ({
  acceptances: many(userLegalAcceptance),
}));

export const userLegalAcceptanceRelations = relations(userLegalAcceptance, ({ one }) => ({
  userProfile: one(userProfile, { fields: [userLegalAcceptance.userProfileId], references: [userProfile.id] }),
  legalDocument: one(legalDocument, {
    fields: [userLegalAcceptance.legalDocumentId],
    references: [legalDocument.id],
  }),
}));

export const clinicalRecordConsentRelations = relations(clinicalRecordConsent, ({ one }) => ({
  appointment: one(appointment, { fields: [clinicalRecordConsent.appointmentId], references: [appointment.id] }),
}));
