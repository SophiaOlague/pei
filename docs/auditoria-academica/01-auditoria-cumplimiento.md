# Auditoría integral de cumplimiento académico PEI

**Fecha de revisión:** 16 de noviembre de 2026  
**Fecha objetivo académica:** 4 de diciembre de 2026  
**Alcance:** 44 entregables de seis materias, evaluados frente a los criterios de la matriz recibida, el PDF de entregables y evidencia inspeccionable del repositorio.

## 1. Fuentes, versiones y límites

| Fuente | Identificación comprobada | Uso y límite |
|---|---|---|
| Matriz | Archivo externo `Matriz_cumplimiento_academico_PEI.xlsx`, proporcionado por el usuario (fuera del repositorio); propiedades internas creada/modificada 2026-11-16 19:45 UTC; tres hojas; hoja principal con 44 entregables (filas 2–45) | Fuente de la unidad de evaluación y criterios resumidos. No está dentro del repositorio. Su hoja de notas la califica como inventario inicial, no certificación. |
| Entregables | Archivo externo `Entregables.pdf`, proporcionado por el usuario (fuera del repositorio); 14 páginas; fecha del archivo 2026-10-07 | Fuente primaria de los requisitos académicos. Se contrastaron las seis materias y sus especificaciones. |
| Documento Maestro | `docs/arquitectura/PEI_Documento_Maestro_V2.4_2026-10-28.docx` | El nombre indica 28-oct; el contenido identifica V2.4 consolidada, fecha de elaboración 20-oct y actualizaciones 28/30-oct, 11/15-nov; corte del estado 15-nov; borrador pendiente del visto bueno indicado en el propio documento. Se usa la copia exacta hallada, no V2.4 de 20-oct. |
| Bitácora | `docs/control/Bitacora_Control_Proyecto_PEI_V1.2.docx` (antes `Bitacora_Control_Proyecto_PEI_V1.0.docx`) | **Discrepancia resuelta el 16-nov-2026:** el archivo se renombró de V1.0 a V1.2 para coincidir con su contenido. Hallazgo original: **Discrepancia de versión:** aunque el nombre dice V1.0, la portada, control documental, historial y corte interno identifican V1.2, 15-nov-2026. Se usa el archivo proporcionado por el usuario como evidencia con esa discrepancia visible; no se infiere aprobación (el contenido dice “Pendiente”). |
| Referencia académica anterior | `docs/academico/instrucciones-academicas.md`, versión 2026-10-17 | Describe 37 entregables y un plan académico anterior; difiere de las 44 filas de la matriz actual. Se usa solo para aclarar alcance/contradicciones, nunca para sustituir la matriz. |

Las instrucciones de auditoría que aparecen dentro del texto pegado y los enunciados del PDF se trataron según su papel: el texto pegado describe el trabajo solicitado; el PDF y la matriz aportan criterios de evaluación. No se siguieron instrucciones documentales que implicaran modificar código, bases de datos, configuración o publicar resultados. Los resultados son documentación nueva bajo esta carpeta; no se cambió código ni se ejecutaron pruebas, migraciones o consultas a bases de datos.

## 2. Método y significado de los porcentajes

- **COMPLETO (100%)**: cada parte del criterio tiene un artefacto identificable y evidencia suficiente. Solo se concedió cuando el contenido documentado cubre todo el criterio, aunque el artefacto sea una sección de un documento mayor.
- **PARCIAL**: se acredita únicamente la fracción descrita en la fila; la cifra es el cociente de subcriterios verificables sobre el conjunto enumerado en la matriz/PDF, redondeado al múltiplo de cinco más cercano. No equivale a nota docente.
- **PENDIENTE (0%)**: tras revisar las áreas de código y documentación pertinentes no se encontró evidencia del producto académico solicitado. Una API o módulo relacionado no sustituye un informe, análisis, diagrama o prueba académica.
- **NO VERIFICABLE / NO APLICA**: 0 casos. No se asigna porcentaje a estos estados. No hay justificación para excluir entregables.

En los porcentajes parciales se puntúan piezas observables, no menciones. Ejemplos: en conectividad móvil se acredita cliente HTTP y consumo de API real, pero no la comparación de pérdida de señal/batería/latencia; en SOA se acredita una explicación de propiedades en M00, pero no un glosario de todos los estándares; en seguridad se acredita control técnico y pruebas, pero no los entregables teóricos/regulatorios que faltan. La matriz individual de abajo da la fracción y su motivo.

## 3. Diagnóstico general

El repositorio contiene una aplicación Expo/React Native, frontend web y backend NestJS/PostgreSQL con módulos de identidad, verificación de profesionales, agenda, citas, pagos y almacenamiento privado. Hay documentación técnica considerable y evidencia automatizada versionada de varios módulos. Eso prueba avance técnico real, pero los entregables académicos son principalmente productos documentales propios. La evidencia de programación móvil remota, controles de seguridad y propiedades SOA es reutilizable; no demuestra por sí misma el cumplimiento del PDF.

La app móvil **no está vacía**: tiene flujos de autenticación, perfil, verificación, agenda/citas/pago y consumo HTTP; Better Auth usa `expo-secure-store` para la sesión. No se encontró base local estructurada, DAO, funcionamiento offline, ni modelo de sincronización de datos. `apps/mobile/INTEGRACION.md` documenta etapas y límites, con varios flujos simulados. Por eso los entregables móviles de base de datos local y persistencia no se dieron por cumplidos.

El código y pruebas aportan evidencia útil de seguridad (sesión, roles, validación, límites de frecuencia, auditoría, almacenamiento privado, controles sobre archivos) y de diseño por servicios/modular. No se localizó documentación de los entregables de minería de datos, modelado académico SOA/SaaS ni la mayoría de materiales de expresión escrita. No se hallaron pruebas versionadas de OWASP Mobile Top 10, entrenamiento de ML, métricas, dataset ni artefactos de demostración de cada entregable académico.

El repositorio tiene cambios sin commit y el último commit observado es `46fae5d` (11-nov-2026); varios documentos/cambios locales son posteriores. La Bitácora interna señala que no hay evidencia de despliegues, y el corte de entregas H1/H2 queda por confirmar. El árbol de trabajo cambiante reduce la reproducibilidad del corte; esta auditoría no crea un commit ni supone que el contenido local esté aprobado.

**Actualización (16-nov-2026):** `origin/main` está en `cef7ce6` (merge de PR #14). Están integrados en Git: M08, M03 y herramientas C2 (PR #7); Payments con Stripe en modo TEST (PR #8); documentación de A.25 (PR #9); verificación de identidad del paciente y su revisión administrativa en la web (PR #10 y PR #11); reservas y pago web con Stripe (PR #12); pruebas de flujo de M03 (PR #13); y `.gitignore` (PR #14). Siguen fuera de Git: la aplicación móvil (`apps/mobile/`), la minería de datos (`src/`, `tests/`, `config/`, `data/`, `docs/mineria-datos/`), esta auditoría y la actualización del Maestro y de la Bitácora.

### 3.1 Conteo y porcentaje

| Materia | Entregables | Completos | Parciales | Pendientes | % sustentado |
|---|---:|---:|---:|---:|---:|
| Programación para móviles II | 10 | 0 | 7 | 3 | 18% |
| Arquitectura orientada a servicios | 6 | 0 | 3 | 3 | 16% |
| Seguridad de la información | 8 | 0 | 7 | 1 | 39% |
| Minería de datos | 8 | 0 | 0 | 8 | 0% |
| Expresión oral y escrita II | 5 | 0 | 1 | 4 | 11% |
| Administración de Proyectos | 7 | 1 | 5 | 1 | 45% |
| **Global (promedio por entregable, peso uniforme)** | **44** | **1** | **23** | **20** | **22%** |

Los porcentajes son promedio aritmético de los subcriterios puntuados en cada entregable, no promedio de avances de software. El caso completo es el cronograma/hitos/dependencias/ruta crítica documentado en el plan A01–A36 y Gantt del Maestro y seguido por la Bitácora interna V1.2. El promedio global usa 44 como denominador; no hay exclusiones.

### 3.2 Revisión tras los merges del 16-nov-2026

Se revisaron las 44 filas frente a los merges de los PR #7 a #14. **Ningún porcentaje cambia.** El método (sección 2) puntúa productos académicos observables. Los merges versionan evidencia técnica que esta auditoría ya había considerado en el árbol de trabajo (código, pruebas y documentación técnica de M03, M07, M08 y Payments), y no aportan ninguno de los productos académicos faltantes que se indican en cada fila. Lo que cambia es la verificabilidad: esa evidencia técnica ahora está en `main`. La evidencia citada de `apps/mobile/` sigue solo en el árbol de trabajo y no puede verificarse en Git hasta que se versione.

Recuento por fila de la sección 4 (16-nov-2026): 1 completo, 23 parciales y 20 pendientes; promedio 21.7 %, redondeado a 22 %. Coincide con la tabla 3.1.

## 4. Evaluación de los 44 entregables

Las estimaciones son esfuerzo de cierre de evidencia académica y validación, no tiempo para reescribir el producto. Alta prioridad significa riesgo alto para la entrega del 4-dic. “Pendiente” indica que no hay una parte verificable suficiente que puntúe, no que la funcionalidad de producto sea necesariamente necesaria.

### Programación para móviles II

| # | Entregable | Estado / % | Evidencia y cubierto | Faltante y acción de cierre | Dependencia | Prioridad / esfuerzo |
|---:|---|---|---|---|---|---|
| 1 | Diagramas UML de clases | PARCIAL / 20% | `apps/backend/src/db/schema/`; `docs/academico/M03-doctors.md` describe entidades y relaciones de M03. | Falta diagrama UML de las entidades móviles y relaciones conceptuales. Crear UML basado en modelo vigente; separar lo implementado de lo conceptual. | Modelo de dominio vigente. | Alta / 3 h |
| 2 | Metodología de diseño de datos | PARCIAL / 25% | Esquema Drizzle, migraciones y tablas ofrecen trazabilidad requerimiento-dato en backend. | Falta método explícito requerimiento → entidad → almacenamiento local/remoto, con decisiones y reglas. Redactar guía a partir del esquema real, sin fingir base local. | #1, esquema vigente. | Alta / 3 h |
| 3 | Guía/snippets de entidades y DAO | PARCIAL / 15% | Tipos y modelos de API en `apps/mobile/src/lib/api.ts`; repositorios backend en `apps/backend/src/modules/*/infrastructure/persistence/`. | No hay DAO móvil ni CRUD local; falta ejemplo ejecutable/documentado de Insert/Update/Delete/Query e instancia BD. Documentar límite y ofrecer snippet solo si se implementa una BD local mínima autorizada por alcance académico. | #2, decisión sobre persistencia local. | Alta / 5 h |
| 4 | Fundamentos de conectividad móvil | PENDIENTE / 0% | El cliente HTTP está en `apps/mobile/src/lib/api.ts`. | Sin análisis de pérdida de señal, latencia, consumo de batería, reintentos o efectos al usuario. Preparar análisis medible y distinguir mediciones de hipótesis. | #7 y versión de demo. | Alta / 3 h |
| 5 | Topología de datos móviles | PARCIAL / 20% | Cliente móvil → API REST/backend y PostgreSQL identificables en `apps/mobile/src/lib/api.ts` y `apps/backend/src/main.ts`. | Falta cuadro/diagramas comparando BD estática, dinámica, web y local y justificar la topología PEI. Documentar Expo/REST real y alternativas solo como comparación. | #2, #7. | Media / 3 h |
| 6 | Implementación de BD estática | PENDIENTE / 0% | No se encontró base pre-poblada de solo lectura en la app. | Falta guía paso a paso y evidencia de consulta. No añadir una base ficticia de producto; resolver con propuesta delimitada o ejemplo académico aislado y rotulado. | Decisión de alcance. | Media / 3 h |
| 7 | Implementación de BD dinámica/web | PARCIAL / 60% | `apps/mobile/src/lib/api.ts`, `src/lib/auth-client.ts`, `src/lib/config.ts`; pruebas `src/__tests__/api.test.ts`; módulos/controles backend y `apps/mobile/INTEGRACION.md`. Cliente usa API REST remota y sesión SecureStore. | Falta guía reproducible, topología y evidencia de una demo móvil integrada completa; pruebas unitarias usan servicios simulados en parte. Añadir pasos, contratos/rutas, captura y limitaciones. | Ambiente de demo funcional (#42). | Crítica / 4 h |
| 8 | Restricciones y ciclo de vida de datos | PARCIAL / 15% | SecureStore conserva cookie de sesión e idempotencia de pago; evidencia en `apps/mobile/src/lib/auth-client.ts`, `src/app/(app)/pago.tsx`. | No hay análisis de cierre, destrucción del proceso, reinicio, ciclo de vida de URI de imagen ni datos remotos; elaborar matriz de persistencia por dato y verificar supuestos. | #9, #10. | Alta / 3 h |
| 9 | Catálogo de mecanismos nativos | PARCIAL / 25% | Dependencia `expo-secure-store` y usos en `auth-client.ts`, `pago.tsx`, `editprofile.tsx`; `react-native-fs` está declarado. | Falta catálogo académico de preferencias/archivos/estructurados, límites, batería, decisión de no usar SQLite/Room/CoreData y validación de qué guarda realmente SecureStore. | #8. | Media / 3 h |
| 10 | Arquitectura de sincronización | PENDIENTE / 0% | REST remoto y persistencia de sesión acreditados; `apps/mobile/INTEGRACION.md`. | No se encontró sincronización offline/online de datos estructurados ni política de conflictos/colas/reintentos. Documentar arquitectura real síncrona y diferenciarla de una propuesta offline. | #7–9. | Alta / 3 h |

### Arquitectura orientada a servicios

| # | Entregable | Estado / % | Evidencia y cubierto | Faltante y acción de cierre | Dependencia | Prioridad / esfuerzo |
|---:|---|---|---|---|---|---|
| 11 | Estándares industriales SOA | PARCIAL / 15% | `docs/academico/M00-fundaciones.md` explica arquitectura modular/API; `apps/backend/src/main.ts`. | Falta glosario y justificación de WS-*, SOAP, HTTP/SMTP y SOS; distinguir lo usado (HTTP/REST, correo) de lo comparado/no implementado. | #13, arquitectura actual. | Alta / 3 h |
| 12 | Propiedades de los servicios | PARCIAL / 55% | `docs/academico/M00-fundaciones.md` contiene bajo acoplamiento, reusabilidad, autonomía y abstracción, con pruebas M00; `M02-identity.md`, `M03-doctors.md`, `M07-agenda.md` amplían módulos. | Falta consolidar evaluación de todos los servicios/limites de integración y mapear pruebas por propiedad en un informe único. | M00–M08 existentes. | Alta / 3 h |
| 13 | WSDL, XSD, XML y ESB | PARCIAL / 25% | API REST tipada/DTO y contratos internos en controllers; ejemplos de rutas en `apps/mobile/src/lib/api.ts` y documentación M03/M07/M08. | No existe WSDL/XSD/XML/ESB; falta explicar equivalentes reales (HTTP/JSON/OpenAPI/DTO), comparar SOAP/ESB y mostrar un request/response verdadero. No implementar SOAP/ESB. | #11, #12. | Alta / 4 h |
| 14 | Modelo SaaS | PENDIENTE / 0% | El Maestro describe plataforma web/móvil y servicios externos, no el modelo académico de entrega económica. | Falta demanda web, suscripción, OpEx/CapEx, actualizaciones centralizadas e instalaciones cliente; hacer análisis del modelo y aclarar qué no se cobra según el plan. | Maestro y decisiones de negocio. | Media / 3 h |
| 15 | Diagnóstico de madurez SaaS | PENDIENTE / 0% | No se halló clasificación de madurez SaaS. | Falta clasificar con los cuatro niveles pedidos por Entregables.pdf y justificar tenancy, configurabilidad, escalamiento y evidencia. | #14, arquitectura desplegada disponible. | Media / 3 h |
| 16 | Convivencia SaaS y sistemas locales | PENDIENTE / 0% | Se documentan API e integraciones con proveedores, pero no un ESB corporativo ni coexistencia local. | Falta diagrama/propuesta segura, límites de confianza y flujo API. Presentarlo como propuesta/contraste, sin añadir ESB al producto. | #13–15. | Media / 3 h |

### Seguridad de la información

| # | Entregable | Estado / % | Evidencia y cubierto | Faltante y acción de cierre | Dependencia | Prioridad / esfuerzo |
|---:|---|---|---|---|---|---|
| 17 | Mecanismos preventivos, detectivos y correctivos | PARCIAL / 60% | `docs/academico/M00-fundaciones.md`, `M01-audit.md`, `M02-identity.md`, `M03-doctors.md`, `M07-agenda.md`; guards, validation pipe, audit trail, rate-limit, pruebas. | Consolidar inventario, clasificar, mapear evidencia y brechas; no afirmar biometría/AES-256/backup automático sin evidencia. | Evidencia M00–M08. | Crítica / 4 h |
| 18 | Propuesta de seguridad (activos/amenazas/impacto/controles) | PARCIAL / 45% | `docs/academico/M02-identity.md` incluye activos/amenazas/impacto; riesgos en Maestro V2.4 y Bitácora interna. | Falta matriz completa y vigente para seis materias, riesgo inherente/residual, responsable, control y prueba. Consolidar sin datos personales. | #17, plan de riesgos. | Alta / 4 h |
| 19 | OWASP Mobile Top 10 y API Security | PARCIAL / 40% | `docs/academico/M00-fundaciones.md` mapea riesgos API2/3/5/8 e identifica API1 pendiente; validación y auth tests. | Falta lista Mobile Top 10, revisión control por control de API Top 10 actual y hallazgos/remediación verificables; no hay escaneo reportado integral. | #17, código/versión evaluados. | Crítica / 6 h |
| 20 | Seguridad física y lógica | PARCIAL / 30% | Controles lógicos de sesión, roles, CORS, almacenamiento privado y validación en `docs/arquitectura/seguridad-cors.md`, M00–M03. | No hay evidencia de controles físicos del sitio/centro de datos ni análisis completo de firewalls, VPN, 2FA. Documentar responsabilidad de proveedor/entorno y controles no aplicables o no verificados. | #18. | Media / 3 h |
| 21 | Criptografía simétrica/asimétrica, PKI y certificados | PARCIAL / 25% | Configuración HTTP/CORS y seguridad de API descritas; hashing/cookies Better Auth; ejemplos técnicos en backend. | Falta tratamiento académico de AES/RSA/PKI/CA/firmas y certificación del servidor; el ejemplo SHA-256 de PDF contradice el hashing de contraseñas real y se debe explicar, no copiar. | #19, docs de auth/deployment. | Alta / 4 h |
| 22 | Servicios de seguridad | PARCIAL / 60% | M00–M03 verifican autenticación, autorización, privacidad de logs, integridad del audit trail, manejo privado y validaciones. | Falta matriz explícita de confidencialidad, integridad, autenticación, autorización, no repudio, privacidad, confianza, delegación, credenciales e identidad; asociar cada fila a prueba. | #17–21. | Crítica / 4 h |
| 23 | Aspectos legales y privacidad / ARCO | PARCIAL / 50% | Maestro §§9–10, migraciones y flujos de aceptación legal por rol; `apps/web/dev-fixtures/legal/` son expresamente ficticios. | No se encontró aviso integral final ni procedimiento ARCO completo; verificar citas y alcance actual de leyes/GDPR/HIPAA/OMPI, y no presentar fixtures como aviso aprobado. | Legal review no disponible; Maestro §9–10. | Crítica / 6 h |
| 24 | Reglamento interno, confidencialidad y ética | PENDIENTE / 0% | No se halló NDA/código de conducta/uso aceptable/canal de denuncia para el equipo. | Preparar política académica con privacidad y ética; marcar responsable/aprobación pendientes y no inventar un canal operativo. | #18, límites de datos. | Alta / 4 h |

### Minería de datos

| # | Entregable | Estado / % | Evidencia y cubierto | Faltante y acción de cierre | Dependencia | Prioridad / esfuerzo |
|---:|---|---|---|---|---|---|
| 25 | Modelo supervisado de inasistencia | PENDIENTE / 0% | No hay notebook, dataset, entrenamiento ni endpoint analítico encontrado. Los estados/citas de producto no son un modelo predictivo. | Definir dataset sintético, target, partición, baseline, algoritmo, métricas y limitaciones; entrenar/evaluar y preservar artefactos. | #29–30; solo datos sintéticos. | Crítica / 8 h |
| 26 | Modelo no supervisado | PENDIENTE / 0% | No se halló pipeline de clustering. | Seleccionar variables no clínicas/de identidad, algoritmo permitido, validación e interpretación; documentar un experimento con datos sintéticos. | #29–31. | Alta / 6 h |
| 27 | Comparación y selección de algoritmos | PENDIENTE / 0% | No hay comparación de árboles, redes neuronales y SVM ni métricas en repo. | Comparar modelos sobre el mismo conjunto sintético; incluir Accuracy, Recall e interpretabilidad, límites de muestra y matriz de confusión. | #25 y dataset. | Crítica / 6 h |
| 28 | Estadística y detección de anomalías | PENDIENTE / 0% | No se localizaron scripts/consultas de detección analítica. | Definir anomalías de citas con datos no clínicos y ejemplo reproducible; separar detección de fraude de decisiones clínicas. | #29, #30. | Alta / 5 h |
| 29 | Dataset, Data Marts y SQL | PENDIENTE / 0% | PostgreSQL transaccional y migraciones existentes, pero no dataset analítico ni consultas Data Mart documentadas. | Diseñar mart sintético, SQL de extracción y diccionario de variables; no copiar datos reales de pacientes. | Esquema de citas; #30. | Crítica / 6 h |
| 30 | Preprocesamiento y transformación | PENDIENTE / 0% | No se hallaron notebooks/scripts de preparación de datos. | Documentar nulos, codificación, normalización, balanceo, fuga de datos y reproducibilidad; ejecutar pipeline. | #29 y #25. | Crítica / 5 h |
| 31 | Técnicas de agrupamiento y validación | PENDIENTE / 0% | No hay implementación/resultado de jerárquico, GMM, DBSCAN, cuadrículas o grafos. | Cubrir algoritmos requeridos como contraste teórico y seleccionar un caso seguro con datos sintéticos; mostrar métrica/validación y justificación de no usar diagnósticos/identidad. | #26 y dataset. | Alta / 7 h |
| 32 | Data Warehouse, OLAP/OLTP y cubos | PENDIENTE / 0% | El OLTP está representado por esquema de producto, sin DW, cubo ni reporte analítico. | Diagrama estrella, diferencia OLTP/OLAP, operaciones drill-down/roll-up/slice/dice/pivot y consultas/demostración pequeña. | #29; #42 para demo. | Alta / 6 h |

### Expresión oral y escrita II

| # | Entregable | Estado / % | Evidencia y cubierto | Faltante y acción de cierre | Dependencia | Prioridad / esfuerzo |
|---:|---|---|---|---|---|---|
| 33 | Tipos de comunicación en el proyecto | PENDIENTE / 0% | Hay funciones de chat/videollamada documentadas en la app, sin tabla de tipos de comunicación. | Crear tabla intrapersonal/interpersonal/grupal/colectiva/masiva/simultánea con ejemplo real o delimitado de PEI. | Features existentes; #34. | Media / 2 h |
| 34 | Canales digitales y privacidad | PENDIENTE / 0% | Maestro describe teleconsulta y población objetivo; controles de privacidad técnica en otros docs. | Falta análisis de redes, comunidades virtuales y videollamada con riesgos y medidas por canal; no exponer usuarios o casos. | #17–23. | Alta / 3 h |
| 35 | Guía de redacción del equipo | PENDIENTE / 0% | Hay documentos técnicos en estilo consistente, sin proceso formal planear/redactar/revisar/corregir. | Crear breve guía con ejemplo de aviso/correo no sensible y criterios de revisión. | Aviso/artefacto de ejemplo; #23. | Media / 2 h |
| 36 | Formato de citas APA | PENDIENTE / 0% | No se encontró guía APA del proyecto. | Preparar referencias de Entregables.pdf, leyes/normas y fuentes técnicas realmente usadas; verificar datos bibliográficos. | Fuentes citadas del paquete académico. | Media / 2 h |
| 37 | Estructura de documentos / manual | PARCIAL / 55% | Maestro V2.4 tiene control documental, índice, secciones y tablas; `apps/mobile/README.md` existe. | Falta muestra/guía de índice, títulos y resúmenes aplicada a manual de usuario; README móvil es plantilla Expo y no manual PEI. Elaborar índice/estructura y revisar manual. | Funcionalidades implementadas y capturas #42. | Alta / 4 h |

### Administración de Proyectos

| # | Entregable | Estado / % | Evidencia y cubierto | Faltante y acción de cierre | Dependencia | Prioridad / esfuerzo |
|---:|---|---|---|---|---|---|
| 38 | Estado del arte | PARCIAL / 25% | Maestro §§1–2 justifica contexto y problema; `docs/academico/instrucciones-academicas.md` identifica comparación con plataformas. | No hay comparación sustentada de tecnologías/plataformas, fuentes/fecha ni brechas. Añadir revisión breve con referencias y alcance. | APA #36. | Alta / 4 h |
| 39 | Justificación del proyecto | PARCIAL / 60% | Maestro §§1.2–1.5 expone problema, población y objetivos; funcionalidades PEI relacionadas. | Faltan indicadores cuantitativos basales/meta y sustento empírico del beneficio (p. ej. reducción de inasistencia); no inventar porcentajes. | #38, variables #40. | Alta / 3 h |
| 40 | Variables y métricas medibles | PARCIAL / 30% | Maestro define objetivos/requisitos y el plan tiene tareas/hitos; algunas métricas técnicas aparecen en pruebas. | No existe operacionalización académica completa con variable, fórmula, unidad, fuente, línea base/meta y periodo. Construir tabla usando datos disponibles o declarar base/meta no medida. | #39 y plan A01–A36. | Alta / 4 h |
| 41 | Delimitación: qué no se hará | PARCIAL / 75% | Maestro define alcance, roles, plan temporal al 4-dic y decisiones fuera de producto; `docs/academico/contradicciones-dualidad-maestro.md`. | Falta una pieza académica breve y explícita por espacio/tiempo/funcionalidad con exclusiones y supuestos acordados; integrar límites de app móvil solo paciente y datos sintéticos. | Maestro V2.4, plan. | Alta / 2 h |
| 42 | Cronograma, hitos, dependencias y ruta crítica | COMPLETO / 100% | Maestro V2.4 §§13–14 (A01–A36, fechas/dependencias/Gantt y ruta crítica); Bitácora interna V1.2 secciones 2–6 actualiza estados, cambios y contingencias al 15-nov. | El material cumple los cuatro elementos del criterio. Quedan hitos de entrega H1/H2 sin confirmar y aprobación documental pendiente; registrarlos como seguimiento, sin reabrir el entregable. | Fuente de plan confirmada; control de hitos. | Alta / 1 h |
| 43 | Costos directos e indirectos | PARCIAL / 25% | Modelo económico y decisiones de pagos/costos de proveedores en Maestro y `docs/arquitectura/Payments-decisiones.md`. | No hay costeo de horas-hombre, nube, licencias, certificados/servicios directos e indirectos con supuestos y total. Elaborar estimación y distinguir cotización de dato observado. | #40, tarifas actuales del proyecto. | Alta / 4 h |
| 44 | Gestión del Valor Ganado (EVM) | PENDIENTE / 0% | Bitácora mide actividades, retrasos, cambios y contingencias, pero eso no basta para EVM. | Faltan PV, EV, AC, CPI, SPI y reglas de medición/fecha; crear tabla de línea base/costo real desde registros confiables o declarar datos no disponibles. | A01–A36; #43; propietario de datos. | Alta / 4 h |

## 5. Diez faltantes de mayor riesgo

1. Minería de datos sin dataset sintético, entrenamiento, métricas, SQL ni artefactos de resultados (#25–32).
2. Hitos académicos H1/H2 con estado de entrega no confirmado en Bitácora interna V1.2.
3. OWASP Mobile Top 10 no revisado; el mapa API disponible es parcial y deja API1 como pendiente (#19).
4. Sin demo integral de app móvil respaldada por evidencia; existen flujos y pruebas, varias simuladas (#7).
5. Sin aviso integral/ARCO final validado; fixtures legales del web son ficticios (#23).
6. Sin prueba de seguridad física/controles de infraestructura del entorno (#20).
7. Sin controles de confidencialidad/ética de equipo ni evidencia de aprobación (#24).
8. Entregables SOA/SaaS incompletos: no hay clasificación SaaS, WSDL/XSD/XML/ESB ni propuesta de coexistencia (#11–16).
9. Sin mediciones de conectividad móvil ni diseño de sincronización/offline (#4, #8, #10).
10. Sin operacionalización de métricas, costeo consolidado ni EVM verificable (#40, #43–44).

## 6. Riesgos a 4 de diciembre

- **Carga documental y de analítica alta:** 20 entregables siguen pendientes y 23 parciales (recuento por fila de la sección 4; corregido el 16-nov-2026: antes decía 22 y 21); el trabajo estimado de cierre supera una sola semana.
- **Riesgo de integridad académica:** la matriz inicial conserva estados “por verificar”; la guía académica local es de 37 entregables y no coincide con el inventario actual de 44.
- **Riesgo de demostración:** tests con dobles prueban contratos/controles, pero no equivalen a ejecución de la app contra servicio real ni despliegue. La Bitácora no registra H1/H2 entregados.
- **Riesgo de fuentes/versiones:** el nombre de Bitácora V1.0 contiene texto interno V1.2; el Documento Maestro se llama fecha 28-oct pero tuvo actualizaciones hasta 15-nov. No confundir corte ni aprobación. **Actualización (16-nov-2026):** la Bitácora se renombró a V1.2. El Maestro conserva su nombre y su corte de estado del 15-nov, con notas fechadas el 16-nov (sección 11.4) que registran a Stripe como proveedor activo.
- **Riesgo de alcance:** implementar DAO/offline/SOAP/ESB/biometría solo para ejemplos académicos ampliaría el producto. La documentación académica puede describir contraste/propuesta sin incorporarlos al software.
- **Riesgo de privacidad:** minería debe usar datos sintéticos; no reutilizar datos clínicos/pacientes en datasets o reportes.
- **Riesgo de reproducibilidad:** hay cambios locales posteriores al último commit (11-nov); evidencia derivada del estado local debe congelarse/versionarse por el equipo después de revisión, sin que esta auditoría cree commits. **Actualización (16-nov-2026):** el código y la documentación técnica de M03, M07, M08 y Payments están en `main` (`cef7ce6`); siguen sin versionar la app móvil, la minería de datos y los documentos de control académico.

## 7. Referencias de evidencia técnica

- App móvil: `apps/mobile/src/app/`, `apps/mobile/src/lib/api.ts`, `auth-client.ts`, `config.ts`, `apps/mobile/src/__tests__/`, `apps/mobile/INTEGRACION.md`.
- Web: `apps/web/src/`, `apps/web/dev-fixtures/legal/` (ficticios; no publicación legal aprobada).
- Backend: `apps/backend/src/modules/`, `apps/backend/src/db/schema/`, `apps/backend/src/db/migrations/`.
- Académica/técnica: `docs/academico/M00-fundaciones.md`, `M01-audit.md`, `M02-identity.md` (borrador), `M03-doctors.md`, `M07-agenda.md`, `docs/academico/contradicciones-dualidad-maestro.md`.
- Pruebas guardadas: `docs/testing/ejecuciones/`, matrices `docs/testing/trazabilidad/`, reglas `docs/testing/README.md`.
- Arquitectura/documentación: `docs/arquitectura/PEI_Documento_Maestro_V2.4_2026-10-28.docx`, `M08-diseno.md`, `Payments-decisiones.md`, `seguridad-cors.md`, `auditoria.md`.

