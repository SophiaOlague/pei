# Evidencia académica de M07: Agenda médica de PEI

Gestinnovo es la empresa; PEI es la aplicación. Esta evidencia sale del código y de las pruebas reales de M07. Solo se
incluyen los entregables del documento de dualidad que M07 permite demostrar; no se agregó funcionalidad para cubrir
ejemplos académicos.

Fuentes:
- [registro de arquitectura y decisiones de M07](../arquitectura/M07-decisiones.md)
- [matriz de trazabilidad de M07](../testing/trazabilidad/M07-agenda.md)

## Estado de M07

| Aspecto | Estado (2026-11-07) |
|---|---|
| Implementación | **Terminada** en el árbol de trabajo (backend y web), RF-10 y RF-11; **sin commit** |
| Pruebas con dobles en memoria | En verde (sección 1, «Pruebas») |
| Validación de integración con PostgreSQL | **Pendiente**, con C2, cuando se reanude la infraestructura de pruebas (en pausa desde el 2026-11-06) |
| Evidencia formal (`pnpm test:evidence`) | No registrada |
| Migraciones | Ninguna: usa tablas existentes |
| `production` | Sin desplegar |

Distinción usada en todo el documento:
- **Implementado y probado con dobles**: el código y sus pruebas sin base de datos existen y pasan.
- **Validado**: incluye además la integración con PostgreSQL real, que todavía no se ha realizado.

M07 está implementado, pero su validación todavía no está completa.

---

## 1. Diseño técnico de M07

### Requisitos implementados

| Requisito | Qué cubre M07 |
|---|---|
| RF-10 | El médico define su horario semanal de atención y la duración de la consulta, y ve los horarios libres que resultan |
| RF-11 | El médico registra periodos no disponibles (días libres, vacaciones, ausencias) que bloquean esos horarios |

Las decisiones D-1 a D-6 los concretan: zona `America/Mexico_City`, `canOperate` obligatorio para modificar, duración de
15 a 120 minutos en múltiplos de 5, reemplazo transaccional con máximo 6 franjas por día, consultas de 31 días con un
horizonte de 90, y conservación de los periodos pasados. Detalle en el registro de decisiones.

### Funcionalidades terminadas

- Consulta de la agenda propia: zona horaria, habilitación, duración, horario y periodos vigentes.
- Reemplazo del horario semanal, incluido el horario que cruza la medianoche, con dos franjas.
- Cambio de la duración de la consulta.
- Alta y baja de periodos no disponibles. No se pueden borrar los ya terminados ni los de otro médico.
- Vista previa de los horarios libres. En la web abarca los próximos 14 días.
- Modo de solo lectura para el médico que todavía no está habilitado.

### Componentes

| Lado | Componentes |
|---|---|
| Backend (`apps/backend/src/modules/agenda/`) | Dominio puro (zona horaria, duración, horario semanal, periodos, generador de horarios), 6 casos de uso, `AgendaWriteGuard`, `AgendaService` para M08, `DrizzleAgendaRepository`, `MeAgendaController` (`/me/doctor/agenda`) y DTO |
| Web (`apps/web`) | Página `/profesionales/agenda` (`features/professionals/agenda/`), funciones de agenda en `lib/api.ts` (consumen los endpoints reales) y enlace «Gestionar mi agenda» en el portal del médico |
| Reutilizado | `DoctorOperationalPolicy` de M03, `UnitOfWork`, `Clock`, `AuditTrail`, guards de sesión y de rol |

### Reglas de negocio y concurrencia

- Cada escritura sigue este orden en una sola transacción:
  1. bloquear el perfil del médico (`FOR UPDATE`);
  2. comprobar la habilitación con la política de M03;
  3. modificar la agenda;
  4. registrar la auditoría.
- Si la auditoría falla, el cambio se revierte.
- Los horarios se generan en hora del centro de México y se entregan también en UTC. Solo cuentan los bloques
  completos, y se excluyen los que ya pasaron y los que se cruzan con un periodo no disponible.

### Pruebas

Ejecutadas el 2026-11-07 en el árbol de trabajo, sin base de datos (dobles en memoria):

| Suite | Resultado |
|---|---|
| Unitarias y de casos de uso del backend (`pnpm test`, toda la suite) | 832/832 PASS; 41 son de M07 (TC-M07-001 a 030) |
| E2E con dobles (`pnpm test:e2e`) | Las 7 de M07 PASS (TC-M07-040 a 046); 97/97 en total. Las 3 suites que requieren C2 (`app`, `me`, `audit-db`) no se ejecutan localmente, igual que antes de M07 |
| Arquitectura | RT-M07-01 y RT-M07-02 PASS |
| Web (Vitest) | 152/152 PASS; 6 de M07 (TC-M07-060 a 065). `tsc` y `next build` correctos |

**No ejecutado todavía:**
- Integración con PostgreSQL: el repositorio Drizzle, el valor `24:00:00` en `time`, los candados reales y la auditoría
  dentro de una transacción real.
- Evidencia formal.

Estos resultados no deben presentarse como validación completa.

---

## 2. Seguridad de la Información

- **Autenticación y rol:** todas las rutas exigen sesión y el rol `doctor`.
- **Origen del identificador:** el médico se identifica por la sesión; ninguna petición acepta un `doctorProfileId`.
- **Acceso a datos ajenos:** un periodo de otro médico responde 404, sin revelar que existe.
- **Asignación masiva:** las propiedades desconocidas se rechazan con 400 (OWASP API3).
- **Auditoría:** cada cambio se audita sin datos personales en el contexto.
- **Operaciones protegidas:** solo un médico habilitado (incluida la aceptación legal vigente, RN-140) modifica su agenda.

## 3. Arquitectura Orientada a Servicios

- M07 es un servicio con API REST propia y dependencia explícita y mínima de M03: solo la política operativa. Pruebas de
  arquitectura vigilan esa dependencia.
- Expone a M08 un contrato estable: `AgendaService.generateSlots` y el puerto `BUSY_INTERVALS_PROVIDER`. Gracias a él,
  M08 podrá sumar las citas ocupadas sin modificar M07.

## 4. Administración de Proyectos: seguimiento

| Tarea | Estado |
|---|---|
| Diseño de M07 y decisiones D-1 a D-6 | Aprobados (2026-11-07) |
| Implementación de backend y web | Terminada; sin commit |
| Pruebas con dobles | En verde |
| Revisión final acotada (conexiones, candados, auditoría, zona horaria, frontend, alcance) | Sin defectos funcionales |
| Validación de integración con PostgreSQL | **Pendiente** (C2 en pausa) |
| Commit | Pendiente de autorización |

**Ruta crítica:** M08 (citas) depende de `AgendaService` y debe sustituir `BUSY_INTERVALS_PROVIDER`. El cierre de M07
depende de la validación con PostgreSQL.

---

## 5. Expresión Oral y Escrita: documentación técnica

- [Registro de arquitectura y decisiones de M07](../arquitectura/M07-decisiones.md).
- [Matriz de trazabilidad de M07](../testing/trazabilidad/M07-agenda.md).
