# Matriz de evidencias por entregable

**Corte:** 16-nov-2026.  
**Convención:** `T` = implementación técnica; `D` = documentación académica/técnica; `P` = prueba guardada; `M` = demostración funcional. Un archivo `*.spec.ts` demuestra que existe una prueba, no que se haya ejecutado con éxito; para resultado se requiere artefacto en `docs/testing/ejecuciones/` o registro externo verificable. Ninguna referencia de código por sí sola acredita un entregable documental completo.

| # | Materia / entregable | Estado | Evidencia encontrada (rutas exactas) | Evidencia ausente / verificabilidad |
|---:|---|---|---|---|
| 1 | Móviles II — UML de clases | PARCIAL | D: `docs/academico/M03-doctors.md`; T: `apps/backend/src/db/schema/`, `apps/mobile/src/` | UML académico de clases móviles no localizado. |
| 2 | Móviles II — metodología de datos | PARCIAL | T: `apps/backend/src/db/schema/`, `apps/backend/src/db/migrations/`; D: `docs/arquitectura/PEI_Documento_Maestro_V2.4_2026-10-28.docx` §8 | Método requerimiento → entidad → tabla/local no localizado. |
| 3 | Móviles II — entidades y DAO | PARCIAL | T: `apps/mobile/src/lib/api.ts`, `apps/backend/src/modules/`; D: `apps/mobile/INTEGRACION.md` | No se encontraron DAO ni CRUD local/instancia de BD móvil. |
| 4 | Móviles II — conectividad móvil | PENDIENTE | T: `apps/mobile/src/lib/api.ts`, `apps/mobile/src/lib/config.ts` | No análisis de pérdida de señal, latencia o batería; sin reporte de medición. |
| 5 | Móviles II — topología de datos | PARCIAL | T: `apps/mobile/src/lib/api.ts`, `apps/backend/src/main.ts`; D: `apps/mobile/INTEGRACION.md` | Comparación/diagrama de bases estática, dinámica, web y local no localizado. |
| 6 | Móviles II — BD estática | PENDIENTE | No encontrada en `apps/mobile/src/` ni `apps/mobile/package.json`. | Guía paso a paso de base pre-cargada no localizada. |
| 7 | Móviles II — BD dinámica/web | PARCIAL | T: `apps/mobile/src/lib/api.ts`, `apps/mobile/src/lib/auth-client.ts`; P: `apps/mobile/src/__tests__/api.test.ts`; D: `apps/mobile/INTEGRACION.md`; backend en `apps/backend/src/modules/` | La prueba citada valida cliente con mocks; no basta como demo completa contra servicio. |
| 8 | Móviles II — ciclo de vida del dato | PARCIAL | T: `apps/mobile/src/lib/auth-client.ts`, `apps/mobile/src/app/(app)/pago.tsx`, `apps/mobile/src/app/(app)/editprofile.tsx` | Análisis de cierre de app, reinicio, borrado y persistencia por tipo de dato no localizado. |
| 9 | Móviles II — mecanismos nativos | PARCIAL | T: `apps/mobile/package.json` (`expo-secure-store`); `apps/mobile/src/lib/auth-client.ts`; `apps/mobile/src/app/(app)/pago.tsx`; `apps/mobile/src/app/(app)/editprofile.tsx` | Catálogo comparativo y límites de preferencias/archivos/SQLite y batería no localizado. |
| 10 | Móviles II — sincronización | PENDIENTE | T: `apps/mobile/src/lib/api.ts`; D: `apps/mobile/INTEGRACION.md` | No sincronización offline, colas/conflictos ni guía de política de sincronía. |
| 11 | AOS — estándares SOA | PARCIAL | D: `docs/academico/M00-fundaciones.md`, `docs/academico/contradicciones-dualidad-maestro.md`; T: `apps/backend/src/main.ts` | Glosario completo WS-*, SOAP, HTTP/SMTP/SOS no localizado. |
| 12 | AOS — propiedades de servicios | PARCIAL | D: `docs/academico/M00-fundaciones.md`; T/P: `apps/backend/src/common/`, `apps/backend/test/architecture.spec.ts`, ejecuciones en `docs/testing/ejecuciones/` | Cobertura consolidada de todos los módulos/servicios no localizada. |
| 13 | AOS — WSDL/XSD/XML/ESB | PARCIAL | T: controllers/DTO en `apps/backend/src/modules/`; rutas documentadas en `apps/mobile/src/lib/api.ts`; D: `docs/academico/M03-doctors.md`, `docs/academico/M07-agenda.md` | No WSDL/XSD/XML/ESB ni comparación didáctica completa localizada. |
| 14 | AOS — modelo SaaS | PENDIENTE | D: `docs/arquitectura/PEI_Documento_Maestro_V2.4_2026-10-28.docx` (contexto de plataforma) | Análisis demanda, suscripción, OpEx/CapEx e instalación cliente no localizado. |
| 15 | AOS — madurez SaaS | PENDIENTE | No localizado en `docs/` | Clasificación justificada de cuatro niveles no localizada. |
| 16 | AOS — SaaS y sistemas locales | PENDIENTE | T: APIs e integraciones en `apps/backend/src/modules/`, `docs/arquitectura/Payments-decisiones.md` | Diseño ESB/coexistencia SaaS-local y análisis de seguridad no localizado. |
| 17 | Seguridad — controles preventivos/detectivos/correctivos | PARCIAL | D: `docs/academico/M00-fundaciones.md`, `M01-audit.md`, `M02-identity.md`, `M03-doctors.md`, `M07-agenda.md`; T: `apps/backend/src/common/`, `apps/backend/src/modules/identity/`, `apps/backend/src/modules/private-storage/`; P: `docs/testing/ejecuciones/` | Matriz única cubriendo todo el criterio no localizada. |
| 18 | Seguridad — propuesta / riesgo | PARCIAL | D: `docs/academico/M02-identity.md` (borrador, amenazas/activos); Maestro V2.4 §§riesgos; Bitácora interna V1.2 §6 | Evaluación completa y actual de activos, probabilidad/impacto/control residual no localizada. |
| 19 | Seguridad — OWASP Mobile/API | PARCIAL | D: `docs/academico/M00-fundaciones.md` (mapeo API parcial); T/P: `apps/backend/test/auth-guards.e2e-spec.ts`, `auth-rate-limit.e2e-spec.ts`, pruebas de validación y seguridad M03 | Checklist API integral, OWASP Mobile Top 10, revisión de código/hallazgos de cliente no localizados. |
| 20 | Seguridad — física y lógica | PARCIAL | D: `docs/arquitectura/seguridad-cors.md`, M00–M03; T/P: guards, CORS, rate-limit, storage privado | Controles físicos, VPN/2FA de infraestructura y evidencia de proveedor no localizados. |
| 21 | Seguridad — cripto/PKI/certificados | PARCIAL | T: `apps/backend/src/modules/identity/`, config HTTP/CORS; D: `docs/arquitectura/seguridad-cors.md`, `docs/academico/M02-identity.md` | Desarrollo académico de AES/RSA/PKI/CA/firma y validación de certificado de servidor no localizado. |
| 22 | Seguridad — servicios de seguridad | PARCIAL | D/P: `docs/academico/M00-fundaciones.md`, `M01-audit.md`, `M02-identity.md`, `M03-doctors.md`; T: `apps/backend/src/modules/audit/`, `identity/`, `private-storage/` | Mapeo explícito de todos los conceptos requeridos a función/prueba no localizado. |
| 23 | Seguridad — ley, aviso, ARCO | PARCIAL | D: Maestro V2.4 §§9–10; T/P: `apps/backend/src/modules/identity/`, `apps/backend/test/legal-regime.e2e-spec.ts`; fixtures: `apps/web/dev-fixtures/legal/privacy_policy.ficticio.md`, `patient_terms.ficticio.md` | Aviso integral y procedimiento ARCO final no encontrados; los fixtures declaran ser ficticios. |
| 24 | Seguridad — reglamento, confidencialidad, ética | PENDIENTE | No se localizó NDA/código/denuncia en `docs/`, `apps/` o `packages/`. | Documento y política verificable ausentes. |
| 25 | Minería — modelo supervisado inasistencia | PENDIENTE | No se encontró notebook/script/modelo en `apps/`, `packages/`, `docs/`. | Dataset/entrenamiento/validación/métricas ausentes. |
| 26 | Minería — modelo no supervisado | PENDIENTE | No se encontró pipeline de clustering en `apps/`, `packages/`, `docs/`. | Datos, modelo, parámetros y validación ausentes. |
| 27 | Minería — comparación de algoritmos | PENDIENTE | No se encontró implementación ni reporte de algoritmos/métricas. | Árbol/SVM/red neuronal, Accuracy/Recall e interpretabilidad ausentes. |
| 28 | Minería — anomalías | PENDIENTE | No se encontraron scripts/queries analíticos de fraude/picos. | Definición, resultado y evaluación ausentes. |
| 29 | Minería — dataset/Data Mart/SQL | PENDIENTE | Esquema OLTP: `apps/backend/src/db/schema/`; migraciones: `apps/backend/src/db/migrations/` | No dataset analítico, Data Mart ni SQL de extracción aislada localizado. |
| 30 | Minería — preprocesamiento | PENDIENTE | No se localizaron notebooks/scripts de preparación de datos. | Nulos, codificación, normalización, balanceo y reproducibilidad ausentes. |
| 31 | Minería — clustering y validación | PENDIENTE | No se localizó evidencia en `apps/`, `packages/`, `docs/`. | Jerárquico/GMM/DBSCAN/cuadrículas/grafos y validación ausentes. |
| 32 | Minería — DW/OLAP/cubos | PENDIENTE | OLTP en `apps/backend/src/db/schema/`; no DW/cubos localizados. | Diseño dimensional y operaciones OLAP ausentes. |
| 33 | Expresión — tipos de comunicación | PENDIENTE | Funciones de comunicación/video existen en `apps/mobile/src/app/(auth)/call.tsx`, `apps/web/src/`; arquitectura en Maestro V2.4 | Tabla de seis tipos mapeados a PEI no localizada. |
| 34 | Expresión — canales y privacidad | PENDIENTE | D: Maestro V2.4, `docs/arquitectura/seguridad-cors.md`; T: call flows en `apps/mobile/src/app/` y web | Documento por canal/riesgo/medida no localizado. |
| 35 | Expresión — guía de redacción | PENDIENTE | Hay documentos técnicos estructurados en `docs/` | Proceso planear-redactar-revisar-corregir con ejemplos no localizado. |
| 36 | Expresión — APA | PENDIENTE | No se encontró guía de citas en `docs/`. | Formato y ejemplos de ley/norma/artículo ausentes. |
| 37 | Expresión — estructura/manual | PARCIAL | D: `docs/arquitectura/PEI_Documento_Maestro_V2.4_2026-10-28.docx`; `apps/mobile/README.md`; producto en `apps/mobile/src/app/` | README móvil es plantilla Expo; no manual PEI con índice/guía/resúmenes localizado. |
| 38 | Administración — estado del arte | PARCIAL | D: Maestro V2.4 §§1–2; `docs/academico/instrucciones-academicas.md` nombra comparación | No revisión comparativa con fuentes/fecha/hallazgos localizada. |
| 39 | Administración — justificación | PARCIAL | D: Maestro V2.4 §§1.2–1.5 y `docs/academico/contradicciones-dualidad-maestro.md` | Beneficio cuantificado con línea base y fuente no localizado. |
| 40 | Administración — variables/métricas | PARCIAL | D: Maestro V2.4, plan A01–A36; T/P: criterios y tiempos en `docs/testing/ejecuciones/` | Matriz formal de variable, definición, fórmula, fuente, meta/base no localizada. |
| 41 | Administración — delimitación | PARCIAL | D: Maestro V2.4, `docs/academico/instrucciones-academicas.md`, `docs/academico/contradicciones-dualidad-maestro.md` | Falta pieza académica que reúna límites espaciales, temporales y funcionales/exclusiones. |
| 42 | Administración — cronograma/hitos/dependencias/ruta crítica | COMPLETO | D: Maestro V2.4 §§13–14 (A01–A36 y Gantt); Bitácora interna V1.2 §§2–6 (estado/cambios/contingencias) | Plan cumple el criterio. H1/H2 no confirmados como entregados; eso es riesgo de control, no falta del artefacto cronograma. |
| 43 | Administración — costos | PARCIAL | D: Maestro V2.4 y `docs/arquitectura/Payments-decisiones.md` (modelo/servicios de pago) | Costeo integral horas-persona, certificados, nube, licencias y costos indirectos no localizado. |
| 44 | Administración — EVM | PENDIENTE | Bitácora interna V1.2 incluye seguimiento de actividades/cambios/contingencias | Sin PV/EV/AC/CPI/SPI ni criterio de cálculo; el avance por tareas no es EVM. |

## Ubicación de las fuentes de criterios

- Matriz: archivo externo `Matriz_cumplimiento_academico_PEI.xlsx`, proporcionado por el usuario (fuera del repositorio), hoja “Matriz de entregables”, filas 2–45.
- PDF: archivo externo `Entregables.pdf`, proporcionado por el usuario (fuera del repositorio), 14 páginas.
- Maestro: `docs/arquitectura/PEI_Documento_Maestro_V2.4_2026-10-28.docx` (V2.4, corte interno 15-nov).
- Bitácora: `docs/control/Bitacora_Control_Proyecto_PEI_V1.2.docx` (contenido interno V1.2, corte 15-nov). El archivo se llamaba `Bitacora_Control_Proyecto_PEI_V1.0.docx` hasta el 16-nov-2026, cuando se renombró para resolver la discrepancia de nombre.

