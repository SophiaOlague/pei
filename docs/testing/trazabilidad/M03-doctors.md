# Trazabilidad M03: Médicos (registro y verificación) de PEI (EN CURSO)

> **En curso.** M03 no está implementado completo: solo el incremento controlado de M02 (fases A1–A3). Ninguna prueba
> de esta página tiene todavía **evidencia formal** (corrida de `pnpm test:evidence` versionada). Los resultados
> documentados proceden de pruebas unitarias locales sin BD, E2E locales con dobles, la integración en la BD configurada
> en `.env` durante A2 y la **validación interna** posterior en una rama temporal de Neon, `rama` (`br-autumn-sun-b52qoep4`), creada a
> partir de `production` (ver «Ejecución»).

Gestinnovo es la empresa; PEI es la aplicación.
Decisiones: [registro de decisiones de M03](../../arquitectura/M03-decisiones.md). Incremento sobre M02: [M02](M02-identity.md#incremento-controlado-a1a3-posterior-a-la-etapa-a).

## Alcance y límites

M03 cubre el registro y la verificación del **médico**: INE, CURP, cédula, especialidad, aceptación legal por rol,
revisión por el administrador y estado derivado. Fuera de alcance:
- agenda y duración de la consulta (M07);
- citas, ocupación y consecuencias de volver a `pending` (M08);
- directorio, perfil público y búsqueda de médicos (D-36).

| Fase | Contenido | Commit | Estado |
|---|---|---|---|
| A1 | Almacenamiento privado compartido (R-11, M02-5) | `a176934` | Implementada |
| A2 | Legales por rol y aceptación auditada (D-32, N1, R-8, R-13; M02-3, M02-4); migración `0006` | `b40058f` | Implementada; `0006` aplicada en la BD configurada en `.env` (rama `production` de Neon; entorno por confirmar) |
| A3 | CURP en `user_profile`, única entre roles; conflicto genérico (R-12, D-20/D-35, D-17; M02-1, M02-2); migración `0007` | `779b13b` | Implementada; `0007` aplicada en la rama temporal `rama` (`br-autumn-sun-b52qoep4`, 2026-10-14) y en `production` (`br-royal-recipe-b54s5hnn`, 2026-10-17; Q1–Q9 PASS verificadas en esa BD; entorno por confirmar) |
| A4 | Coherencia de rol (R-10, `0008`) y `/me` por rol (M02-6, M02-7) | — | Pendiente |
| B | Módulo de médicos (especialidades, revisiones, estado del médico; `0009`–`0012`) | — | Pendiente |

## Fuentes funcionales

**Documento Maestro V2.2 (PDF, 03-10-2026)**, numeración del PDF (R-1). Requisitos relacionados con M03:

| ID | Contenido (resumen) |
|---|---|
| RF-01 | Registro y autenticación con Better Auth; al registrarse se crea el perfil de dominio |
| RF-02 | Cada usuario tiene un único rol y un único perfil de dominio; permisos según el rol |
| RF-03, RF-04 | Aceptación legal en el registro y reaceptación ante una versión nueva |
| RF-05 | El médico se registra, carga su cédula y queda `pending` para revisión |
| RF-06 | El administrador cambia el estado a `approved`/`rejected` y puede registrar el motivo; el médico no recibe citas hasta ser aprobado. (La obligatoriedad del motivo procede de D-25, no del Maestro) |
| RF-09 | Perfil y foto según el rol |
| RN-001, RN-002 | Un único rol de dominio; un único `user_profile` |
| RN-004 | Un médico no atiende nuevas citas hasta ser aprobado |
| RN-005 | La verificación de cédula es manual en esta fase |

Revisión **textual, no visual**: extracción del texto del PDF en el orden del flujo del documento (`pdftotext -raw`),
que alinea cada identificador con su texto. Páginas comprobadas: 4 (RF-01), 5 (RF-02 a RF-09) y 10 (RN-001 a RN-006).
La comprobación visual de esas páginas sigue pendiente.
**La CURP no aparece en el PDF V2.2**: su obligatoriedad, formato y unicidad provienen de decisiones (DT-22 de M02,
D-1, D-20/D-35, R-12), no de un requisito del Maestro.

## Matriz

Estado: **Interna** = pasó en ejecuciones locales o en la rama temporal, sin evidencia formal. **Formal** = corrida de
evidencia versionada (ninguna todavía).

| Requisito o decisión | Fase | Implementación | Pruebas | Evidencia | Estado |
|---|---|---|---|---|---|
| R-11 (RNF-09, RNF-10) | A1 | `src/modules/private-storage/**` (puerto `PRIVATE_OBJECT_STORAGE`, `R2PrivateObjectStorage`, firma de archivo, gramática de claves, respuesta privada) | Etiquetadas `[R-11]`: RT-M03-01 a 03 y 07 a 10. Asociación inferida por módulo: RT-M03-04 (`[DT-18]`), 05 y 06 (`[DT-1]`) | Unitarias locales; `probar` en la rama temporal | Interna |
| DC-1 | A1 | Errores y comportamiento HTTP de M02 sin cambios | Asociación inferida: TC-M02-088, 089, 098 (modificadas en A1; etiqueta `[DT-18]`) | Ídem | Interna |
| RF-04, D-32, N1 (RF-03 sin prueba etiquetada) | A2 | `legal-requirements.ts`, `legal-documents.use-cases.ts`, `0006` | TC-M03-002 a 012, 014 a 016, 019 a 025, 030, 031, 040 a 042 (etiquetas `[N1]`, `[D-32]` y, en 005, 008, 019, 031 y 041, `[RF-04]`). Ninguna prueba lleva `[RF-03]` | Integración en la BD configurada en `.env` (rama `production` de Neon; entorno por confirmar) durante A2, y `probar` | Interna |
| R-8 | A2 | Aceptación y publicación auditadas en la misma UoW | TC-M03-001, 013, 018, 026, 028, 029, 032, 043, 044, 046 a 049 | Ídem | Interna |
| R-13 | A2 | Versión nueva invalida la aceptación anterior | TC-M03-022, 027, 045 | Ídem | Interna |
| RF-02 | A2 | Solo paciente y médico aceptan documentos legales | TC-M03-017 | Ídem | Interna |
| DC-2, DC-3, DC-4 | A2 | Puerto diferido; una versión nueva por publicación; ids duplicados → 400 | Asociación inferida por contenido: DC-3 → TC-M03-022 (`[R-13]`); DC-4 → TC-M03-029, 048, 049 (`[R-8]`) | Ídem | Interna (DC-2 sin prueba: diferida a B5) |
| R-12 | A3 | `0007`, `src/db/schema/identity.ts`, `src/db/schema/patient.ts`, repositorios Drizzle | Etiquetadas `[R-12]`: TC-M03-055, 059. Asociación inferida: TC-M02-101 (`[DT-22][D-17]`), 116 (`[DT-22]`) | `post` Q1–Q9 y `probar` en la rama temporal; `post` Q1–Q9 en `production` (2026-10-17) | Interna |
| D-20, D-35 (RF-02, RN-001) | A3 | `user_profile_curp_unique`; `existsByCurp` en `RegisterPatientProfileUseCase` | TC-M03-053, 056 (`[D-20][D-35]`); 058 (`[D-20]`; D-35 inferida) | `probar` | Interna |
| D-1 | A3 | `user_profile_curp_required_chk` | TC-M03-057 | `probar` | Interna |
| D-17 | A3 | `RegistrationDataConflictError`, filtro de dominio | Etiquetadas `[D-17]`: TC-M03-050, 051, 054; TC-M02-101. Asociación inferida: TC-M02-074, 224 (`[DT-22]`) | `probar` | Interna |
| P2 (M01 D2) | A3 | Log `warn` sin datos; sin evento de auditoría | TC-M03-052 (`[D-17][M01-D2]`; P2 no figura como etiqueta) | `probar` | Interna |
| Concurrencia (23505 → 409) | A3 | Caso de uso de registro | Asociación inferida: TC-M02-102 (`[DT-22]`) | `probar` | Interna |
| `0007` (F1–F10, V1–V5, transaccional) | A3 | `src/db/migrations/0007_m02_user_profile_curp.sql` | Ensayo C2 en la rama temporal `rama` (`br-autumn-sun-b52qoep4`) (fallos provocados, introspección, inverso) | Resultados C2 fuera del repositorio (ensayo e inverso solo en `rama`); aplicación en `production` verificada con el registro de migración y Q1–Q9 PASS | Interna |
| RF-05, RF-06, RF-09, RN-004, RN-005, D-3 a D-36, R-2, R-4 a R-6, R-10, R-14, Z-1, Z-2 | A4/B | — | — | — | Pendiente de implementar |

## Casos de prueba

62 casos: 52 TC-M03 (001–032 y 040–059; los números 033–039 no existen) y 10 RT-M03. Por fase y suite: A1, 10
unitarios; A2, 30 unitarios, 8 de integración y 4 E2E; A3, 4 unitarios, 5 de integración y 1 E2E.

**Ejecución:**
- **Unitarias locales (sin BD):** `pnpm test`, 305/305 en `779b13b`.
- **E2E locales con dobles:** las E2E con dobles (`audit`, `auth-flows`, `auth-guards`, `auth-rate-limit`, `identity`
  y `legal-regime`) importan `AuthModule`, directamente o a través de sus módulos de apoyo, y `AuthModule` importa
  `db`; las pruebas sustituyen con dobles los proveedores que usan la BD (ver
  [M02](M02-identity.md#incremento-controlado-a1a3-posterior-a-la-etapa-a), «Estado de `0007`»). En la corrida local
  con el código de A3, ejecutada con la configuración de `.env` presente en el entorno (BD sin `0007`) pero con los
  proveedores de acceso a datos sustituidos por dobles (no se afirma que consultaran ni escribieran en esa BD), cinco de ellas (`audit`, `auth-flows`, `auth-guards`,
  `auth-rate-limit` e `identity`, que incluye TC-M03-054) pasaron 61/61 (evidencia interna no versionada).
  `test/legal-regime.e2e-spec.ts` (TC-M03-030, 031, 032 y 049) **no se ejecutó en esa corrida**: el patrón de exclusión
  `me.e2e` lo excluyó. Constan en la validación interna en la rama temporal. La corrida de A2 dio E2E 82/82 en total (mensaje del commit
  `b40058f`), pero el mensaje no desglosa suites: que incluyera `legal-regime.e2e-spec.ts` queda **pendiente de
  revisión**.
- **Integración en la BD configurada en `.env` durante A2** (rama `production` de Neon; entorno por confirmar):
  integración 64/64 con rollback, según el mensaje del commit `b40058f`. El mensaje no indica la BD: que fuera la de
  `.env` se deduce de la configuración de pruebas de entonces. Salida no versionada.
- **Validación interna en la rama temporal** de Neon `rama` (`br-autumn-sun-b52qoep4`; creada a partir de `production`,
  la rama principal marcada como `Default`, entorno por confirmar), con `0007` aplicada, el 2026-10-14:
  unitarias 305/305, integración 69/69 (9 suites) y E2E 83/83 (9 suites), con residuos idénticos antes y después.
  Salida conservada fuera del repositorio; no generada con `pnpm test:evidence`.
- **Evidencia formal:** pendiente (procedimiento seguro en la rama temporal por autorizar).

Los resultados disponibles son **totales por suite** de cada corrida (sin fallos ni pruebas omitidas por Jest dentro
de las suites ejecutadas; el código no contiene `.skip`, `.only` ni `todo`). No todas las suites se ejecutaron en
todas las corridas: `legal-regime.e2e-spec.ts` se excluyó de la corrida local de E2E con dobles, y su resultado
consta en la validación interna en la rama temporal (su inclusión en la corrida de A2 está pendiente de revisión). La salida no lista cada caso, así que
ningún caso está acreditado individualmente.

Rutas relativas a `apps/backend`; la línea es la del primer uso del identificador en `779b13b`.

| Caso | Fase | Suite | Archivo | Etiquetas | Descripción |
|---|---|---|---|---|---|
| RT-M03-01 | A1 | Unitaria | `src/modules/private-storage/domain/file-signature.spec.ts:41` | [R-11] | PDF, JPEG y PNG se reconocen por su firma; otros formatos no |
| RT-M03-02 | A1 | Unitaria | `src/modules/private-storage/domain/file-signature.spec.ts:49` | [R-11] | la regla fija los formatos y el tamaño; el mensaje es el de la regla |
| RT-M03-03 | A1 | Unitaria | `src/modules/private-storage/domain/object-key.spec.ts:7` | [R-11] | acepta las claves que genera Identity |
| RT-M03-04 | A1 | Unitaria | `src/modules/private-storage/domain/object-key.spec.ts:22` | [DT-18] | rechaza %s |
| RT-M03-05 | A1 | Unitaria | `src/modules/private-storage/domain/object-key.spec.ts:26` | [DT-1] | el tipo de contenido sale de la extensión |
| RT-M03-06 | A1 | Unitaria | `src/modules/private-storage/presentation/private-file-response.spec.ts:14` | [DT-1] | imagen: inline, sin caché y nosniff |
| RT-M03-07 | A1 | Unitaria | `src/modules/private-storage/presentation/private-file-response.spec.ts:22` | [R-11] | PDF: attachment, CSP sandbox, sin caché y nosniff |
| RT-M03-08 | A1 | Unitaria | `test/architecture.spec.ts:26` | [R-11] | solo el adaptador de private-storage importa el SDK de AWS |
| RT-M03-09 | A1 | Unitaria | `test/architecture.spec.ts:34` | [R-11] | ningún módulo importa el adaptador R2 directamente; solo el módulo private-storage lo registra |
| RT-M03-10 | A1 | Unitaria | `test/architecture.spec.ts:42` | [R-11] | private-storage no depende de identity |
| TC-M03-001 | A2 | Unitaria | `src/modules/identity/application/identity-audit-events.spec.ts:54` | [R-8] | legal_document.published con actor sistema, tipo y versión |
| TC-M03-002 | A2 | Unitaria | `src/modules/identity/domain/legal-requirements.spec.ts:24` | [D-32] | %s |
| TC-M03-003 | A2 | Unitaria | `src/modules/identity/domain/legal-requirements.spec.ts:29` | [N1] | antes de publicar el régimen nuevo, el paciente con v1 aceptado sigue completo |
| TC-M03-004 | A2 | Unitaria | `src/modules/identity/domain/legal-requirements.spec.ts:34` | [N1] | una publicación parcial no cambia nada: privacy_policy sin patient_terms no se exige |
| TC-M03-005 | A2 | Unitaria | `src/modules/identity/domain/legal-requirements.spec.ts:39` | [N1][RF-04] | con el régimen nuevo publicado, el paciente debe aceptarlo; el legado ya no cuenta |
| TC-M03-006 | A2 | Unitaria | `src/modules/identity/domain/legal-requirements.spec.ts:51` | [D-32] | el médico sin régimen publicado no cumple (falla cerrado) y no tiene pendientes que aceptar |
| TC-M03-007 | A2 | Unitaria | `src/modules/identity/domain/legal-requirements.spec.ts:56` | [D-32] | el médico solo cuenta privacy_policy + doctor_terms; patient_terms no le afecta |
| TC-M03-008 | A2 | Unitaria | `src/modules/identity/domain/registration-status.spec.ts:63` | [N1][RF-04] | al publicarse el régimen nuevo, el paciente con v1 aceptado queda con missing legal |
| TC-M03-009 | A2 | Unitaria | `src/modules/identity/domain/registration-status.spec.ts:76` | [N1] | doctor_terms publicado no afecta al paciente |
| TC-M03-010 | A2 | Unitaria | `src/modules/identity/application/use-cases/legal-documents.use-cases.spec.ts:57` | [N1] | antes de publicar: el paciente ve el legado v1 y el médico no tiene documentos (409) |
| TC-M03-011 | A2 | Unitaria | `src/modules/identity/application/use-cases/legal-documents.use-cases.spec.ts:65` | [N1] | después de publicar cada conjunto, cada rol ve solo los documentos de su régimen |
| TC-M03-012 | A2 | Unitaria | `src/modules/identity/application/use-cases/legal-documents.use-cases.spec.ts:75` | [N1] | una publicación futura todavía no cambia el régimen |
| TC-M03-013 | A2 | Unitaria | `src/modules/identity/application/use-cases/legal-documents.use-cases.spec.ts:86` | [R-8] | el paciente acepta el legado vigente: guarda la evidencia y un evento por documento nuevo |
| TC-M03-014 | A2 | Unitaria | `src/modules/identity/application/use-cases/legal-documents.use-cases.spec.ts:101` | [N1] | después de la transición, un id de legado ya no es vigente para el paciente (409) |
| TC-M03-015 | A2 | Unitaria | `src/modules/identity/application/use-cases/legal-documents.use-cases.spec.ts:112` | [D-32] | el médico acepta privacy_policy + doctor_terms; patient_terms no le corresponde (409) |
| TC-M03-016 | A2 | Unitaria | `src/modules/identity/application/use-cases/legal-documents.use-cases.spec.ts:127` | [D-32] | sin régimen del médico publicado, su aceptación responde 409 |
| TC-M03-017 | A2 | Unitaria | `src/modules/identity/application/use-cases/legal-documents.use-cases.spec.ts:134` | [RF-02] | admin o una cuenta sin perfil no aceptan documentos legales |
| TC-M03-018 | A2 | Unitaria | `src/modules/identity/application/use-cases/legal-documents.use-cases.spec.ts:142` | [R-8] | si la transacción falla, no queda ni la aceptación ni el evento (misma UoW) |
| TC-M03-019 | A2 | Unitaria | `src/modules/identity/application/use-cases/legal-documents.use-cases.spec.ts:203` | [RF-04] | una versión inexistente u obsoleta invalida toda la petición |
| TC-M03-020 | A2 | Unitaria | `src/modules/identity/application/use-cases/legal-documents.use-cases.spec.ts:217` | [N1] | publica el conjunto completo del paciente con un published_at común y un evento por documento |
| TC-M03-021 | A2 | Unitaria | `src/modules/identity/application/use-cases/legal-documents.use-cases.spec.ts:244` | [N1] | rechaza %s sin escribir nada |
| TC-M03-022 | A2 | Unitaria | `src/modules/identity/application/use-cases/legal-documents.use-cases.spec.ts:273` | [R-13] | con el régimen vigente, se puede publicar una sola versión nueva (p. ej., doctor_terms v2) |
| TC-M03-023 | A2 | Unitaria | `src/modules/identity/application/use-cases/legal-documents.use-cases.spec.ts:284` | [N1] | el médico puede omitir privacy_policy si ya está vigente |
| TC-M03-024 | A2 | Unitaria | `src/cli/legal-publish.args.spec.ts:4` | [N1] | interpreta el rol, los documentos tipo@versión=ruta y la fecha común |
| TC-M03-025 | A2 | Unitaria | `src/cli/legal-publish.args.spec.ts:27` | [N1] | rechaza argumentos mal formados: %p |
| TC-M03-026 | A2 | Unitaria | `src/modules/identity/application/use-cases/legal-documents.use-cases.spec.ts:152` | [R-8] | si la auditoría falla, la aceptación tampoco se guarda (misma UoW) |
| TC-M03-027 | A2 | Unitaria | `src/modules/identity/application/use-cases/legal-documents.use-cases.spec.ts:162` | [R-13][RF-04] | una versión nueva de doctor_terms invalida la aceptación anterior del médico |
| TC-M03-028 | A2 | Unitaria | `src/modules/identity/application/use-cases/legal-documents.use-cases.spec.ts:257` | [R-8] | si la auditoría falla, no se publica ningún documento |
| TC-M03-029 | A2 | Unitaria | `src/modules/identity/application/use-cases/legal-documents.use-cases.spec.ts:178` | [R-8] | ids duplicados → 400 sin abrir la transacción, sin aceptaciones ni eventos |
| TC-M03-030 | A2 | E2E | `test/legal-regime.e2e-spec.ts:50` | [N1] | antes de publicar: el paciente ve y acepta el legado v1; el médico no tiene documentos |
| TC-M03-031 | A2 | E2E | `test/legal-regime.e2e-spec.ts:76` | [N1][RF-04] | después de publicar el conjunto del paciente: requisitos nuevos, historia intacta |
| TC-M03-032 | A2 | E2E | `test/legal-regime.e2e-spec.ts:95` | [D-32][R-8] | después de publicar doctor_terms, el médico acepta su régimen y cada aceptación queda auditada |
| TC-M03-040 | A2 | Integración | `test/integration/legal-regime.int-spec.ts:51` | [N1] | sin documentos nuevos, el paciente con legado aceptado sigue completo y el médico no tiene régimen |
| TC-M03-041 | A2 | Integración | `test/integration/legal-regime.int-spec.ts:63` | [N1][RF-04] | al publicar privacy_policy + patient_terms, el paciente pasa a missing legal; al aceptar vuelve a completo; v1 |
| TC-M03-042 | A2 | Integración | `test/integration/legal-regime.int-spec.ts:85` | [N1] | una publicación parcial (solo privacy_policy) o futura no cambia los requisitos del paciente |
| TC-M03-043 | A2 | Integración | `test/integration/legal-regime.int-spec.ts:96` | [D-32][R-8] | el médico acepta privacy_policy + doctor_terms y cada aceptación queda en audit_log |
| TC-M03-044 | A2 | Integración | `test/integration/legal-regime.int-spec.ts:119` | [N1][R-8] | PublishLegalDocumentsUseCase (núcleo de legal:publish): mismo published_at, content_hash y evento de sistema;  |
| TC-M03-045 | A2 | Integración | `test/integration/legal-regime.int-spec.ts:144` | [R-13][RF-04] | una versión nueva de doctor_terms invalida la aceptación anterior del médico |
| TC-M03-046 | A2 | Integración | `test/integration/legal-acceptance-audit.int-spec.ts:28` | [R-8] | si la auditoría falla, el SAVEPOINT de la UoW revierte también la aceptación |
| TC-M03-047 | A2 | Integración | `test/integration/legal-acceptance-audit.int-spec.ts:48` | [R-8] | con la auditoría real, la aceptación y su evento se guardan juntos |
| TC-M03-048 | A2 | Unitaria | `src/modules/identity/application/use-cases/legal-documents.use-cases.spec.ts:189` | [R-8] | aunque el repositorio devolviera ids repetidos, cada documento genera a lo más un evento |
| TC-M03-049 | A2 | E2E | `test/legal-regime.e2e-spec.ts:66` | [R-8] | ids duplicados → 400 en el límite HTTP, sin aceptaciones ni eventos |
| TC-M03-050 | A3 | Unitaria | `src/common/filters/domain-exception.filter.spec.ts:112` | [D-17] | RegistrationDataConflictError: la respuesta es idéntica para cualquier causa y no la revela |
| TC-M03-051 | A3 | Unitaria | `src/modules/identity/domain/registration-data-conflict.spec.ts:4` | [D-17] | la causa es interna: no es enumerable, no está en details ni en la serialización |
| TC-M03-052 | A3 | Unitaria | `src/modules/identity/application/use-cases/identity-use-cases.spec.ts:112` | [D-17][M01-D2] | el conflicto se registra solo en un log warn sin datos personales; nada en audit_log |
| TC-M03-053 | A3 | Unitaria | `src/modules/identity/application/use-cases/identity-use-cases.spec.ts:133` | [D-20][D-35] | la CURP es única entre roles: la de un médico existente bloquea el registro de un paciente |
| TC-M03-054 | A3 | E2E | `test/identity.e2e-spec.ts:270` | [D-17] | el 409 por CURP duplicada es genérico: sin la causa ni el valor en el cuerpo |
| TC-M03-055 | A3 | Integración | `test/integration/curp-user-profile.int-spec.ts:47` | [R-12] | el registro guarda la CURP en user_profile y patient_profile ya no tiene la columna |
| TC-M03-056 | A3 | Integración | `test/integration/curp-user-profile.int-spec.ts:59` | [D-20][D-35] | una CURP de médico bloquea el registro de un paciente: 409 genérico, sin escribir ni auditar |
| TC-M03-057 | A3 | Integración | `test/integration/curp-user-profile.int-spec.ts:79` | [D-1] | paciente o médico sin CURP → 23514 user_profile_curp_required_chk |
| TC-M03-058 | A3 | Integración | `test/integration/curp-user-profile.int-spec.ts:84` | [D-20] | CURP repetida entre roles → 23505 user_profile_curp_unique |
| TC-M03-059 | A3 | Integración | `test/integration/curp-user-profile.int-spec.ts:95` | [R-12] | admin sin CURP se acepta, y varios NULL no chocan con la unicidad |

Todos los casos: estado **Interna** (incluidos en suites que terminaron sin fallos en las ejecuciones descritas
arriba; acreditación agregada, no individual); evidencia formal **pendiente**.

## Riesgos y decisiones pendientes

| # | Tema | Estado |
|---|---|---|
| 1 | `0007` se aplicó el 2026-10-17 (05:10–05:11 UTC) en la rama `production` de Neon (branch ID `br-royal-recipe-b54s5hnn`, endpoint `ep-wandering-bonus-b5kxacor`; la BD configurada en `.env`; entorno por confirmar); Q1–Q9 PASS verificadas en esa BD. La recuperación sigue sin cerrarse: el inverso lógico solo se validó en `rama` y la viabilidad de una restauración de Neon no está confirmada. Desplegar HEAD requiere una autorización aparte | Pendiente: P1 |
| 2 | Evidencia formal en la rama temporal sin usar la BD de `.env` | Procedimiento propuesto, pendiente de autorización |
| 3 | Enumeración de CURP: el 409 genérico revela que una CURP existe en cualquier rol, también de médicos | Pendiente de aceptación explícita del riesgo |
| 4 | Rama temporal `rama` (`br-autumn-sun-b52qoep4`) con `0007` aplicada | Pendiente: conservar o eliminar |
| 5 | Las fuentes originales de diseño están fuera del repositorio; el registro de decisiones conserva sus identificadores y su estado | Mitigado por el registro de decisiones |
| 6 | Las etiquetas de decisión de las pruebas (D-, R-, N-, M01-D2) no están en las convenciones de `docs/testing/README.md` | Pendiente de decidir |
