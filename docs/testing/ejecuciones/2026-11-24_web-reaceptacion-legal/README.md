# Validación web: reaceptación legal (D-37, RN-140)

Fecha: 2026-11-24. Rama de trabajo: `chore/ignore-zed-config`, **sin commit**. Base de datos de las pruebas en navegador:
rama Neon temporal `br-ancient-butterfly-b58749hb` (endpoint `ep-winter-heart-b5fklk5w`), copia de desarrollo creada
por la responsable del proyecto. No se usaron C2, desarrollo ni producción.

## Alcance

La web distingue al paciente que todavía no completa su registro inicial del que ya lo completó y solo tiene pendiente
aceptar una versión nueva de los documentos legales. Usa `legal.reacceptanceRequired` de
`GET /me/registration-status`; no recalcula nada en el cliente.

| Situación | Comportamiento |
|---|---|
| Registro inicial incompleto | Igual que antes: redirige a `/completar-registro`, sin opción de posponer |
| Reaceptación pendiente | Muestra el panel y las citas con un aviso («Revisar y aceptar» / «Ahora no») |
| Inicio de sesión con reaceptación pendiente | Llega a `/landing-inicio`, donde aparece el aviso |
| «Revisar y aceptar» | Abre `/completar-registro?revisar=1` con el paso legal existente y «Ahora no» |
| Agendar con la aceptación pendiente | Bloqueado: aviso con enlace a la revisión; la API sigue rechazando la reserva |
| Aceptar la versión vigente | Desaparece el aviso y se recupera el acceso a la reserva |

## Archivos modificados (solo `apps/web`)

| Archivo | Cambio |
|---|---|
| `src/lib/api.ts` | Campo `legal.reacceptanceRequired` (opcional: sin él, se bloquea) e `isReacceptancePending` |
| `src/features/components/require-registration.tsx` | Excepción de reaceptación con aviso; `REVIEW_LEGAL_PATH` (`/completar-registro?revisar=1`) |
| `src/features/registration/complete-registration.tsx` | Título y «Ahora no» en reaceptación; sin `?revisar=1`, redirige al panel |
| `src/features/booking/booking-flow.tsx` | Mensaje de aceptación pendiente con enlace a la revisión, también si la API rechaza la reserva por `legal` |
| `src/features/components/guards.test.tsx`, `src/features/registration/complete-registration.test.tsx`, `src/features/booking/booking.test.tsx` | Pruebas |

`RequireRegistration` conserva el bloqueo del registro inicial y la redirección por rol; las validaciones de reserva del
backend no cambian.

## Pruebas automáticas (2026-11-24)

| Comprobación | Resultado |
|---|---|
| `pnpm test` (web, suite completa) | PASS 255/255, 17 archivos |
| `pnpm exec tsc --noEmit` | 0 errores |
| Biome sobre los 7 archivos modificados | Sin hallazgos |

Pruebas específicas: TC-WEB-REG-001, 001b, 002, 003 (guard y «Mis citas» detrás del guard), 004 y 005 (reserva),
006, 007, 008, 009 y 010 (flujo legal, posponer, aceptar, inicio de sesión frente a revisión explícita).

## Pruebas en navegador (backend y web locales contra la rama temporal)

Antes de arrancar el backend, su lanzador verificó en una transacción de solo lectura la identidad
`br-ancient-butterfly-b58749hb / ep-winter-heart-b5fklk5w`. Resend estaba desactivado: no hubo envíos ni errores en el
registro del backend.

| # | Escenario | Resultado | Evidencia |
|---|---|---|---|
| 1 | Registro inicial incompleto (paciente A) | PASA | Tras iniciar sesión: `/completar-registro`, paso 1 (perfil), sin «Ahora no». `/mis-citas` devuelve a `/completar-registro` |
| 2 | Reaceptación pendiente: acceso al panel (paciente B) | PASA | Tras iniciar sesión: `/landing-inicio` con el aviso (después del ajuste del destino posterior al inicio de sesión) |
| 3 | Acceso a citas existentes | PASA | `/mis-citas`: «Próximas (1)», Médica Prueba Reaceptación, 26-nov-2026 09:00, Confirmada, con el aviso |
| 4 | «Revisar y aceptar» abre el flujo legal | PASA | `/completar-registro?revisar=1` con las casillas, «Aceptar y continuar» y «Ahora no» |
| 5 | «Ahora no» vuelve al panel sin aceptar | PASA | En la página legal regresa a `/landing-inicio`; en el aviso lo oculta y las citas siguen visibles; no se registró aceptación |
| 6a | Agendar con la aceptación pendiente | PASA | `/agendar-cita` muestra «Para agendar necesitas aceptar la versión vigente…» con enlace a `?revisar=1`. Con médico, horario y motivo, la reserva no se envía (sin `POST /me/patient/appointments`) ni se llega al pago |
| 6b | Aceptar y recuperar el acceso | PASA (parcial) | Tras aceptar: panel sin aviso; `/agendar-cita` sin bloqueo; `GET /me/registration-status` → `accepted: true`, `reacceptanceRequired: false`, `canBookAppointments: true`, `missing: []` |

El escenario 2 se ejecutó dos veces: en la primera (antes del ajuste) el inicio de sesión llevaba a la página legal en
modo reaceptación; se corrigió el destino y se repitió con una segunda versión sintética (`reac-test-2`).

## Limitaciones

- No se envió la reserva final (6b) para no crear una retención `pending_payment` adicional: el acceso se comprobó con
  el estado del backend y la ausencia del bloqueo. El rechazo de la API por `legal` se comprobó en C2 (TC-M02-311).
- El escenario 1 no se repitió después del ajuste del destino; ese camino no cambió y lo cubren TC-WEB-REG-008 y 010.
- Sin pruebas en otros navegadores ni con el despliegue real.

## Datos de la rama temporal

Todos con el prefijo `reac-test` (usuarios, correos `@reac-test.invalid`, nombres, motivo de cita y versiones):
administrador, médica habilitada con horario, paciente A (sin registro), paciente B (registro completo, INE aprobada,
una cita confirmada con pago simulado), `patient_terms@reac-test-1` y `@reac-test-2` publicados con `legal:publish`, y
las aceptaciones de B hechas en la prueba. Los datos heredados de desarrollo no se modificaron; dentro de la copia, sus
pacientes también quedaron con la versión nueva pendiente. La rama y sus datos **se conservan**; eliminarla es una
acción pendiente de la responsable del proyecto. Conexión y credenciales de prueba: `C:\pei-reac\` (fuera del
repositorio).
