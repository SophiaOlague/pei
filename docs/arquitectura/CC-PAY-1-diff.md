# CC-PAY-1: diff aplicado al Documento Maestro V2.4 (2026-11-11)

Archivo: docs/arquitectura/PEI_Documento_Maestro_V2.4_2026-10-28.docx. §N = índice de párrafo. SUB = el texto anterior se conserva tachado con «[Sustituido por CC-PAY-1]»; ADD = texto añadido; ROW/NEW = filas y párrafos nuevos.

### ADD §66
- Consolidación completa V2.2 + V2.3; Drizzle ORM en lugar de Prisma; arquitectura, modelo de datos y seguridad vigentes; marco normativo verificado; estado al 20-oct-2026; plan de trabajo y Gantt. Actualización del 28-oct-2026: C-21 (la CURP y el nombre legal no los edita el propio usuario)
+ Consolidación completa V2.2 + V2.3; Drizzle ORM en lugar de Prisma; arquitectura, modelo de datos y seguridad vigentes; marco normativo verificado; estado al 20-oct-2026; plan de trabajo y Gantt. Actualización del 28-oct-2026: C-21 (la CURP y el nombre legal no los edita el propio usuario) Actualización del 11-nov-2026: C-23 (CC-PAY-1, sustitución de Stripe por Mercado Pago).

### SUB §109
- Implementar pagos, reembolsos y liquidaciones a médicos con Stripe y Stripe Connect (RF-46 a RF-50).
+ Implementar pagos de consulta y de medicamentos con Mercado Pago (Checkout Bricks, Card Payment Brick), reembolsos y liquidaciones internas a médicos con transferencia manual en la primera versión (RF-46 a RF-50; CC-PAY-1).

### SUB §120
- Stripe se usa en modo de prueba; el paso a producción queda fuera del periodo (delimitación académica).
+ Mercado Pago se usa solo en sandbox durante el periodo académico; no se habilitan operaciones reales (PAY-23).

### SUB §133
- Registro con verificación por el administrador, agenda, videoconsulta, aportaciones clínicas, recetas, recepción de pagos mediante Stripe Connect y consulta de ingresos/liquidaciones
+ Registro con verificación por el administrador, agenda, videoconsulta, aportaciones clínicas, recetas, consulta de su saldo (retenido, disponible y liquidado), liquidaciones y transferencias registradas por PEI

### SUB §144
- Beneficiarios indirectos: el sistema de salud (atención de un problema de salud pública con datos centralizados) y las organizaciones civiles (trazabilidad de la entrega). Partes interesadas secundarias: Gestinnovo (desarrolla y da soporte, no opera), el líder técnico, el comité evaluador de dualidad y los proveedores externos (Stripe, Neon, Cloudflare, Resend y el proveedor de video).
+ Beneficiarios indirectos: el sistema de salud (atención de un problema de salud pública con datos centralizados) y las organizaciones civiles (trazabilidad de la entrega). Partes interesadas secundarias: Gestinnovo (desarrolla y da soporte, no opera), el líder técnico, el comité evaluador de dualidad y los proveedores externos (Mercado Pago, Neon, Cloudflare, Resend y el proveedor de video)

### SUB §150
- El médico no paga membresía. Recibe un porcentaje del pago por consulta; la plataforma conserva el resto
+ El médico no paga membresía. Recibe el precio de la consulta menos la comisión fija de PEI; PEI absorbe la comisión de Mercado Pago (PAY-04, PAY-07)

### SUB §154
- El administrador configura porcentaje médico, porcentaje plataforma y periodicidad semanal, quincenal o mensual, y dispara la liquidación de cada periodo
+ El administrador configura la comisión fija de PEI (pei_fee_configuration) y, por separado, la periodicidad semanal, quincenal o mensual (payout_schedule_configuration), y dispara la liquidación de cada periodo

### SUB §158
- Sin Stripe Connect habilitado, el importe puede ser elegible y entrar al ciclo de payout, pendiente de transferencia
+ Sin cuenta de destino registrada, el importe puede ser elegible y entrar al ciclo de payout, pendiente de transferencia manual (PAY-05)

### SUB §161
- Stripe y tarjetas
+ Mercado Pago y tarjetas

### SUB §162
- Stripe para pagos; Stripe Connect Express para médicos. Se guardan referencias/tokens y metadatos no sensibles, nunca PAN/CVV. Los eventos de webhook se conservan para auditoría e idempotencia
+ Mercado Pago (Checkout Bricks, Card Payment Brick). La tarjeta solo se captura y tokeniza en el Brick; PEI no almacena PAN, CVV ni datos de tarjeta (PAY-12). Se guardan identificadores del proveedor y metadatos no sensibles. Los eventos de webhook se conservan para auditoría e idempotencia (PAY-14)

### SUB §667
- Cada reembolso tiene estado propio (requested, pending, processing, succeeded, failed, canceled) y referencia de Stripe; el acumulado no supera el monto del pago.
+ Cada reembolso tiene estado propio (requested, pending, processing, succeeded, failed, canceled) y referencia del proveedor; el acumulado no supera el monto del pago; es idempotente; los parciales requieren aprobación administrativa y se distribuyen a prorrata entre la comisión fija de PEI y el neto del médico; la comisión de Mercado Pago no devuelta es costo de PEI; los reembolsos que ordena M08 se aplican sobre el pago de la cita raíz (AP-27a) (PAY-17, PAY-18).

### SUB §675
- El administrador autorizado define porcentaje médico/plataforma (suman 100%) y periodicidad semanal, quincenal o mensual.
+ El administrador autorizado define la comisión fija de PEI por consulta, con importes y vigencias, sin valor predeterminado, y por separado la periodicidad semanal, quincenal o mensual. La tarifa del procesador es configurable y versionada (PAY-04, PAY-06, PAY-08).

### SUB §683
- El pago conserva porcentajes y montos históricos; los cambios futuros no lo recalculan.
+ El pago conserva el bruto, la comisión fija de PEI, el neto del médico, la comisión de Mercado Pago estimada y real, el neto recibido, la fecha de liberación y el estado del proveedor; los cambios futuros no lo recalculan.

### SUB §691
- El administrador dispara la liquidación del periodo. Entran los importes eligible cuyo eligible_at cae en el periodo de corte, cada uno una sola vez; on_hold no entra. Un importe liberado tras un incidente entra al siguiente payout disponible si el de su periodo ya se ejecutó. Sin Stripe Connect habilitado, el importe entra al ciclo y queda pendiente de transferencia.
+ El administrador dispara la liquidación del periodo. Entran los importes eligible cuyo eligible_at cae en el periodo de corte, cada uno una sola vez; on_hold no entra. Un importe liberado tras un incidente entra al siguiente payout disponible si el de su periodo ya se ejecutó. eligible_at respeta la liberación de fondos del proveedor. La transferencia es manual en la primera versión, mediante PayoutPort, con referencia, método, responsable y evidencia; sin cuenta de destino, el importe queda pendiente de transferencia (PAY-05, PAY-09).

### ADD §699
- Ajustes en doctor_payout_adjustment (refund_reversal, chargeback, correction, other) con el payout de origen; cada compensación es una aplicación sobre uno o varios payouts; lo no aplicado es saldo pendiente; importe con signo; ajustes automáticos creados por el sistema con referencia externa; el payout histórico no se modifica ni elimina.
+ Ajustes en doctor_payout_adjustment (refund_reversal, chargeback, correction, other) con el payout de origen; cada compensación es una aplicación sobre uno o varios payouts; lo no aplicado es saldo pendiente; importe con signo; ajustes automáticos creados por el sistema con referencia externa; el payout histórico no se modifica ni elimina. [Ampliado por CC-PAY-1] Los contracargos se retienen (on_hold) durante la disputa y se registran como ajuste chargeback; el reparto del riesgo entre PEI y el médico está pendiente (PAY-19). Cada ajuste tiene un asiento en el ledger del médico (PAY-09).

### SUB §889
- Porcentajes y montos quedan históricos en payment.
+ La comisión fija de PEI, el neto del médico y las comisiones de Mercado Pago (estimada y real) quedan históricos en payment (RF-48).

### SUB §937
- stripe_webhook_event.stripe_event_id es único; un evento repetido no se procesa dos veces. Se conserva el payload y el estado de procesamiento.
+ provider_webhook_event es único por proveedor y evento; un evento repetido no se procesa dos veces. Se valida la firma, se conserva el payload y el estado de procesamiento, y el estado del pago se verifica con la API del proveedor (PAY-14, PAY-15).

### SUB §943
- Solo referencias/tokens de Stripe y metadatos no sensibles; nunca PAN ni CVV.
+ Solo identificadores del proveedor y metadatos no sensibles; nunca PAN, CVV ni tarjetas guardadas (PAY-12).

### SUB §1144
- En consultas, el pago se divide entre porcentaje del médico y de la plataforma según la configuración vigente al momento del pago.
+ En consultas, el neto del médico es el bruto menos la comisión fija de PEI vigente al crear el pago, y no puede ser negativo; la comisión de Mercado Pago es costo de PEI (PAY-07, PAY-10).

### SUB §1147
- El administrador autorizado configura ambos porcentajes; deben sumar 100%.
+ El administrador autorizado configura la comisión fija de PEI con vigencias; al publicarla se valida que no produzca un neto negativo con el precio vigente.

### SUB §1150
- Porcentajes y montos aplicados se conservan como snapshot en el pago; la configuración es histórica.
+ La comisión fija, el neto del médico y las comisiones de Mercado Pago aplicados se conservan como snapshot en el pago; la configuración es histórica.

### SUB §1159
- El administrador dispara la liquidación; la plataforma envía los fondos mediante Stripe Connect.
+ El administrador dispara la liquidación; la transferencia al médico es manual en la primera versión y se registra con su referencia (PAY-05).

### SUB §1198
- No hay periodo de espera adicional; eligible_at se registra en doctor_payout_item cuando el importe se vuelve potencialmente elegible.
+ eligible_at se registra en doctor_payout_item cuando el importe se vuelve potencialmente elegible y no es anterior a la fecha de liberación de fondos del proveedor (referencia: 14 días, pendiente de confirmación contractual, PAY-08).

### SUB §1201
- doctor_payout_item puede existir antes de asociarse a un doctor_payout (payout_id nulo); su amount es el importe bruto del médico.
+ doctor_payout_item puede existir antes de asociarse a un doctor_payout (payout_id nulo); su amount es el neto del médico (bruto menos comisión fija de PEI).

### SUB §1207
- Sin Stripe Connect habilitado, el importe puede ser elegible y formar parte del ciclo de payout, pendiente de transferencia; la falta de onboarding no elimina la elegibilidad.
+ Sin cuenta de destino registrada, el importe puede ser elegible y formar parte del ciclo de payout, pendiente de transferencia manual; la falta de esa cuenta no elimina la elegibilidad.

### SUB §1394
- Los webhooks de Stripe tienen su propio registro auditable e idempotente.
+ Los webhooks de Mercado Pago tienen su propio registro auditable e idempotente; se procesan de forma asíncrona y no se consideran prueba de pago sin verificar con la API (PAY-15).

### SUB §1571
- Aprobado; aún no se envía a Stripe
+ Aprobado; aún no se envía al proveedor

### SUB §1573
- Stripe lo está procesando
+ El proveedor lo está procesando

### SUB §1692
- Stripe y Stripe Connect Express (modo prueba)
+ Mercado Pago, Checkout Bricks y Card Payment Brick (sandbox)

### SUB §1731
- Stripe, proveedor de video (pendientes)
+ Mercado Pago, proveedor de video (pendientes)

### SUB §1792
- Stripe / Stripe Connect
+ Mercado Pago

### SUB §1793
- Pagos de consulta y medicamento; onboarding y transferencias a médicos; webhooks idempotentes
+ Pagos de consulta y de medicamento (sandbox); webhooks firmados e idempotentes; reembolsos. Transferencias a médicos manuales, fuera del proveedor

### ADD §1814
- doctor_profile, specialty, doctor_identity_verification, doctor_license_verification, doctor_availability, doctor_time_off, stripe_connect_account
+ doctor_profile, specialty, doctor_identity_verification, doctor_license_verification, doctor_availability, doctor_time_off, stripe_connect_account (eliminación aprobada en PAY-03; pendiente de la Fase 1)

### ADD §1815
- Implementado (agenda y Stripe Connect pendientes)
+ Implementado (agenda y Stripe Connect pendientes) [CC-PAY-1: Stripe Connect no se implementa]

### ADD §1835
- payment, refund, stripe_payment_method, stripe_webhook_event
+ payment, refund, stripe_payment_method, stripe_webhook_event (PAY-02/PAY-03: referencias genéricas del proveedor y eliminación de stripe_payment_method; pendiente de la Fase 1)

### ADD §1838
- consultation_commission_configuration, doctor_payout, doctor_payout_item, doctor_payout_adjustment, doctor_payout_adjustment_application
+ consultation_commission_configuration, doctor_payout, doctor_payout_item, doctor_payout_adjustment, doctor_payout_adjustment_application (sustitución por pei_fee_configuration y payout_schedule_configuration aprobada en PAY-04; pendiente de la Fase 1)

### ADD §1953
- audit_log append-only; medical_record_entry inmutable con locked_at; coherencia paciente/médico entre entrada y cita; stripe_webhook_event.stripe_event_id único.
+ audit_log append-only; medical_record_entry inmutable con locked_at; coherencia paciente/médico entre entrada y cita; stripe_webhook_event.stripe_event_id único. (sustitución por provider_webhook_event aprobada en PAY-14; pendiente de la Fase 1)

### SUB §2000
- Stripe
+ Mercado Pago

### SUB §2071
- Seguridad de integraciones (webhooks firmados, Stripe Connect)
+ Seguridad de integraciones (webhooks firmados de Mercado Pago, idempotencia)

### SUB §2207
- Stripe sin suscripciones
+ Mercado Pago sin suscripciones (CC-PAY-1)

### ADD §2362
- Próximos identificadores libres: RF-66, RNF-22, RN-141, C-23
+ C-23 → C-24

### ADD §2371
- V2.2: RF-01–RF-64, RNF-01–RNF-20, RN-001–RN-137. V2.3: C-1–C-15, RF-65, RNF-21, RN-138, RN-139. V2.4: C-16–C-22, RN-140
+ V2.2: RF-01–RF-64, RNF-01–RNF-20, RN-001–RN-137. V2.3: C-1–C-15, RF-65, RNF-21, RN-138, RN-139. V2.4: C-16–C-22, RN-140, C-23 (CC-PAY-1)

### SUB §2668
- Citas, retención y pago de consulta con Stripe en modo prueba (RF-12–RF-16; RNF-15, RNF-16)
+ Citas, retención y pago de consulta con Mercado Pago en sandbox (RF-12–RF-16; RNF-15, RNF-16)

### SUB §3192
- Citas, retención y pago de consulta con Stripe en modo prueb…
+ Pago de consulta con Mercado Pago en sandbox

### ADD §3474
- RF-10–RF-16 con pruebas unitarias, de integración y E2E PASS; pagos en modo prueba con webhooks idempotentes
+ RF-10–RF-16 con pruebas unitarias, de integración y E2E PASS; pagos en modo prueba con webhooks idempotentes [CC-PAY-1: Mercado Pago en sandbox]

### ADD §3648
- Delimitación pendiente
+ Delimitación pendiente; pagos (RF-46–RF-50): C-23 / CC-PAY-1, PAY-01–PAY-25

### ADD §3672
- Revisar y aprobar V2.4, incluidos C-21 y C-22. C-1 a C-15 ya aprobados (V2.3)
+ Revisar y aprobar V2.4, incluidos C-21 y C-22. C-1 a C-15 ya aprobados (V2.3) y C-23 (CC-PAY-1)

### ROW §C-23
+ C-23 | 1, 2, 3.8, 5, 6.4, 7, 8, 9, 11.3, 13–18 | CC-PAY-1: sustitución de Stripe por Mercado Pago (Checkout Bricks); comisión fija de PEI; PEI absorbe la comisión de Mercado Pago; ledger del médico; transferencias manuales; checkout de medicamentos y PrEP solo en sandbox; AP-27a (PAY-01–PAY-25) | Modificación | Pendiente: aprobada documentalmente el 11-nov-2026; Fase 1 sin autorizar

### NEW §11.3
+ 11.3 CC-PAY-1: sustitución de Stripe por Mercado Pago (C-23, 11-nov-2026)

### NEW §11.3
+ Decisión anterior: Stripe para pagos y Stripe Connect Express para médicos (V2.2, V2.4). Se conserva tachada en cada sección con la marca «Sustituido por CC-PAY-1». Nueva decisión: Mercado Pago con Checkout Bricks y Card Payment Brick; medio de pago: tarjeta; moneda: MXN. Aprobada documentalmente por la responsable del producto el 11-nov-2026. La matriz completa PAY-01 a PAY-25, el ledger, los signos y el redondeo están en docs/arquitectura/Payments-decisiones.md. Nada de este cambio está implementado; el esquema vigente sigue siendo el de 0000–0016.

### NEW §11.3
+ Comisiones: el paciente paga el precio publicado; Mercado Pago cobra su comisión y PEI la absorbe al 100 % como costo propio, separada de la comisión fija de PEI, con importe estimado y real conciliable. Neto del médico = bruto − comisión fija de PEI, nunca negativo. La comisión fija es configurable, con vigencias y sin importe predeterminado (pendiente). Referencia tarifaria: 3.19 % + $4 MXN + IVA, con liberación a 14 días; la proporcionó el asistente de Mercado Pago, no es tarifa contractual verificada y se mantiene configurable y versionada.

### NEW §11.3
+ Pagos y estados: estados internos pending, processing, succeeded, failed, canceled, refunded, partially_refunded, charged_back e in_dispute, con el estado del proveedor aparte. Webhooks firmados, registrados, procesados de forma asíncrona y verificados con la API; conciliación periódica. Idempotencia en creación de pagos, eventos, reembolsos y asientos; un solo pago activo por cita raíz. AP-27a: RootPaymentLookup busca el pago de la raíz en el conjunto capturado (succeeded, partially_refunded, refunded, in_dispute, charged_back); pertenecer a ese conjunto no implica elegibilidad para liquidación ni permite confirmar una cita.

### NEW §11.3
+ Reembolsos y contracargos: reembolsos totales y parciales (estos con aprobación administrativa), idempotentes y limitados al pago. Los parciales se distribuyen a prorrata entre la comisión fija de PEI y el neto del médico, con redondeo acumulativo al centavo; la comisión de Mercado Pago no devuelta es costo de PEI y no se descuenta al médico. Contracargos: retención durante la disputa y ajuste; el reparto del riesgo entre PEI y el médico queda pendiente hasta antes de la Fase 6 (PAY-19).

### NEW §11.3
+ Liquidaciones: doctor_ledger_entry será el diario inmutable con signo; doctor_payout_item y doctor_payout_adjustment siguen siendo las unidades de liquidación, con una invariante de conciliación. Periodicidad semanal, quincenal o mensual en payout_schedule_configuration. Transferencia manual en la primera versión mediante PayoutPort; sin Marketplace, cuentas vinculadas ni dispersión automática.

### NEW §11.3
+ Separación financiera: los pagos de medicamentos y PrEP son 100 % de PEI, no generan movimientos en el ledger de médicos y no envían información clínica a Mercado Pago. El checkout de medicamentos y PrEP se desarrolla y prueba solo en sandbox: desarrollarlo y probarlo no significa que PEI tenga autorización para vender medicamentos o PrEP.

### NEW §11.3
+ Requisitos para producción (pendientes): RP-1 confirmación de Mercado Pago del modelo de cuenta y de la tarifa y liberación contractuales; RP-2 clasificación comercial y MCC de telemedicina y de venta de medicamentos, sin asignar códigos sin confirmación; RP-3 autorización expresa y por escrito de Mercado Pago para vender medicamentos y PrEP; RP-4 validaciones legales y sanitarias aplicables; RP-5 revisión fiscal y contable por un contador (cobros, comisiones absorbidas, comisión fija, importes y liquidaciones de médicos, reembolsos, comisiones no devueltas, contracargos, medicamentos, CFDI y retenciones); RP-6 revisión legal de la recepción y transferencia de fondos a terceros.

### NEW §11.3
+ Seguridad y tarjetas: la tarjeta solo se captura en Card Payment Brick; PEI no almacena PAN, CVV ni tarjetas. El formulario actual de apps/mobile (pago.tsx) se sustituye y nunca se conecta a un procesamiento real.

### NEW §11.3
+ Fases de Payments: F0 decisiones y documentación; F1 adaptación del esquema; F2 dominio y adaptador de Mercado Pago; F3 pago de consultas con M08 (RootPaymentLookup, AP-27a); F4 Checkout Bricks web y móvil; F5 reembolsos (RF-46); F6 ledger y liquidaciones (RF-47 a RF-50); F7 checkout de medicamentos y PrEP en sandbox; F8 automatización futura de liquidaciones. Ninguna fase posterior a F0 está autorizada.

### NEW §18
+ PAY-06: importe comercial de la comisión fija de PEI.

### NEW §18
+ PAY-19: reparto del riesgo económico de los contracargos entre PEI y el médico (antes de la Fase 6).

### NEW §18
+ C-4 de Payments: unidad de liquidación para un reembolso parcial antes de cualquier payout (decisión al aprobar la Fase 1).

### NEW §18
+ RP-1 a RP-6 de CC-PAY-1: confirmaciones de Mercado Pago, autorizaciones legales y sanitarias para medicamentos y PrEP, y revisión fiscal y contable.

