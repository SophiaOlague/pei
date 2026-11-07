# Instrucciones académicas que sigue el proyecto PEI (dualidad)

Proyecto: **PEI**, app multiplataforma de Gestinnovo (la empresa). Alumna: Olague Solis Frida Sophia, matrícula
2303150107, grupo 9C. Ciclo de formación 3, cuatrimestre 9. Periodo: del 15 de septiembre al 7 de diciembre de 2026.
Versión de este documento: 2026-10-17.

Este documento resume **qué pide la parte académica** y **cómo se aplica al proyecto**. No define el comportamiento del
producto: eso lo define el Documento Maestro (`docs/arquitectura/Maestro-V2.3.md`).

## 1. Fuentes académicas y su papel

| Fuente | Archivo | Papel |
|---|---|---|
| Documento de dualidad | `Documento_Dualidad_SophiaOlague9C.pdf` (2026-09-02, 24 pp.) | Documento académico principal: introducción, objetivos, metodología, modelo de negocio, desarrollo por materias y anexos |
| Entregables por materia | `Entregables.pdf` (2026-10-07) | Objetivos del PE y entregables del proyecto, por materia y unidad |
| Plan de trabajo v2 | `Plan_de_trabajo_Dualidad_PEI_v2_backend_movil.md.pdf` (2026-09-17) | Calendario de 12 semanas, fases, 37 entregables con fecha, hitos y riesgos |
| Evidencia académica del repositorio | `docs/academico/` (M00, M01, M02, M03, M07 y `contradicciones-dualidad-maestro.md`) | Evidencia obtenida del código y de las pruebas reales, módulo por módulo |

**Versión vigente del documento de dualidad:** `Documento_Dualidad_SophiaOlague9C.pdf`, confirmada el 2026-10-17. Las
versiones anteriores (`Documento_Dualidad_SophiaOlague.pdf` y `… (1).pdf`) no se usan.

## 2. Reglas de trabajo entre lo académico y el producto

Proceden de `docs/academico/contradicciones-dualidad-maestro.md` y de las reglas del proyecto.

1. **El Documento Maestro manda sobre el producto. El documento de dualidad manda sobre los entregables académicos.**
2. Los documentos académicos son **evidencia**, nunca fuente funcional: no crean requisitos.
3. Si un ejemplo académico contradice el Maestro o la arquitectura real, el entregable se cumple **como análisis,
   comparación o propuesta**, no se implementa.
4. La evidencia académica sale del **código, las migraciones y las pruebas reales**. No se añade funcionalidad solo
   para cubrir un ejemplo.
5. Nombres: Gestinnovo es la empresa y **PEI** es la aplicación.
6. Datos: **sin datos reales** de pacientes. Los datasets de minería son sintéticos y su método de generación se
   documenta (RNF-20, RN-130).

## 3. Calendario y alcance (plan v2)

| Concepto | Fecha |
|---|---|
| Inicio | martes 15 de septiembre |
| Corte parcial 1 (H1) | viernes 9 de octubre: login desde el móvil contra el backend, 12 entregables |
| Corte parcial 2 (H2) | viernes 6 de noviembre: agendar, subir laboratorio y pagar desde el móvil, 26 entregables |
| H3 | 22 de noviembre: modelo de priorización expuesto por API, 32 entregables |
| Entrega del documento final (H4) | viernes 4 de diciembre: build de producción, 37 entregables |
| Presentación final (H5) | lunes 7 de diciembre: 12–15 min más demo en vivo |
| Días inhábiles | miércoles 16 de septiembre y lunes 16 de noviembre |

**Fases:**
- F1, cimientos: semanas 1–4.
- F2, núcleo: semanas 5–8.
- F3, datos: semanas 9–10.
- F4, cierre: semanas 11–12.

**Reparto del esfuerzo:** 55 % backend, 30 % móvil y 15 % documentación.

**Delimitación académica:**
- La app móvil cubre **solo la vista de paciente**; médico y administrador van en web.
- Minería de datos usa **un solo modelo** (clasificación de prioridad) sobre un dataset sintético.
- Stripe se usa en modo de prueba; pasar a producción queda fuera de alcance.

## 4. Entregables por materia (37 en total)

Los objetivos y el contenido proceden de `Entregables.pdf`; la semana y la fecha, del plan v2.

### Programación para móviles II (5)
| Entregable | Contenido exigido | Semana / fecha |
|---|---|---|
| Diagramas UML de clases | Entidades de la app y sus relaciones antes de pasar a código | 2 / 27 sep |
| Metodología de diseño de datos | Del requerimiento a tablas relacionales o documentos locales | 2 / 27 sep |
| Conectividad y topología de datos | Pérdida de señal, batería, latencia; cuadro comparativo de BD estática, dinámica, web y local; consumo de la API | 5 / 18 oct |
| Arquitectura de sincronización y persistencia | Ciclo de vida del dato frente al de la app; preferencias, archivos y datos estructurados; batería y almacenamiento | 8 / 8 nov |
| Guía de implementación y snippets | Entidades, interfaz DAO (insert, update, delete, query) e instanciación de la BD local, con el código real | 8 / 8 nov |

### Arquitectura orientada a servicios (6)
| Entregable | Contenido exigido | Semana / fecha |
|---|---|---|
| Glosario y estándares SOA | Servicio, orquestación, SOA, SOS, ESB; WS-*, SOAP, HTTP/SMTP | 3 / 4 oct |
| Propiedades de los servicios | Bajo acoplamiento, reusabilidad, autonomía y abstracción | 4 / 11 oct |
| Desglose del contrato de servicio | WSDL, XSD, XML y ESB (en PEI: OpenAPI, tipos y payload real) | 4 / 11 oct |
| Caracterización SaaS | Bajo demanda, suscripción, OpEx frente a CapEx, actualizaciones centralizadas | 7 / 1 nov |
| Diagnóstico de madurez SaaS | Los 4 niveles: ad hoc, configurable, multitenencia pura y escalable | 7 / 1 nov |
| Integración SaaS + SOA | Cómo se orquestan los servicios internos y de terceros sin romper la seguridad | 8 / 8 nov |

### Seguridad de la información (8)
| Entregable | Contenido exigido | Semana / fecha |
|---|---|---|
| Catálogo preventivo, detectivo y correctivo | Mecanismos con su implementación real | 3 / 4 oct |
| Aviso de privacidad integral y derechos ARCO | Redacción del aviso y del procedimiento ARCO sobre el expediente | 4 / 11 oct |
| Marco legal | LFPDPPP, LFDA, GDPR, HIPAA (buena práctica), registro ante INDAUTOR | 5 / 18 oct |
| Análisis de riesgos y controles | Activos, amenazas, impacto y controles | 6 / 25 oct |
| Criptografía y PKI | Simétrica frente a asimétrica, PKI y certificados, hashing, TLS | 6 / 25 oct |
| Checklist OWASP | API Security Top 10 y Mobile Top 10 con hallazgos | 7 / 1 nov |
| Código de conducta y ética | NDA, uso aceptable y denuncia anónima | 9 / 15 nov |
| Reporte de pruebas y servicios de seguridad | Confidencialidad, integridad, autenticación, autorización, no repudio, delegación y privacidad | 11 / 29 nov |

### Minería de datos (7)
| Entregable | Contenido exigido | Semana / fecha |
|---|---|---|
| Diseño del data warehouse | Data mart, OLAP, OLTP y análisis predictivo; diferencias con el sistema operacional | 9 / 15 nov |
| Queries SQL y data marts | Extracción que aísla variables demográficas y de agendamiento | 9 / 15 nov |
| Preprocesamiento y transformación | Nulos, codificación, normalización y balanceo | 10 / 22 nov |
| Datos atípicos | Citas falsas, ausentismo anómalo y picos | 10 / 22 nov |
| Modelos supervisados y no supervisados | Árboles, SVM y redes; elección por accuracy, recall e interpretabilidad | 10 / 22 nov |
| Agrupamiento y validación | Jerárquico, GMM, DBSCAN, cuadrículas y grafos | 11 / 29 nov |
| Cubos y operaciones OLAP | Drill-down, roll-up, slice, dice y pivot | 11 / 29 nov |

### Expresión oral y escrita II (5)
| Entregable | Contenido exigido | Semana / fecha |
|---|---|---|
| Guía de redacción del equipo | Planear, redactar, revisar y corregir, con ejemplos reales | 1 / 20 sep |
| Tabla de tipos de comunicación | Intrapersonal, interpersonal, grupal, colectiva, masiva y simultánea, mapeadas a la plataforma | 5 / 18 oct |
| Canales digitales y riesgos | Redes, comunidades y videollamadas, con sus riesgos de privacidad | 6 / 25 oct |
| Formato de citas APA | Leyes, normas, artículos y documentación técnica | 8 / 8 nov |
| Manual de usuario | Índice, títulos y resúmenes (app móvil) | 12 / 4 dic |

### Administración de proyectos (6)
| Entregable | Contenido exigido | Semana / fecha |
|---|---|---|
| Planteamiento del problema | Antecedentes, estado del arte (Doctoralia y telehealth) y justificación | 1 / 20 sep |
| Delimitación | Espacio, tiempo y funcionalidad (móvil solo para el paciente) | 1 / 20 sep |
| Operacionalización de variables | De «mejorar el servicio» a métricas medibles | 2 / 27 sep |
| WBS, Gantt y ruta crítica | Tareas, hitos, dependencias y ruta crítica | 3 / 4 oct |
| Costeo directo e indirecto | Horas-hombre, SSL; nube, licencias y servicios | 12 / 4 dic |
| Reporte EVM | Valor ganado: lo planeado frente a lo real | 12 / 4 dic |

## 5. Contradicciones conocidas entre lo académico y el producto

Tratamiento: se cumplen como análisis o propuesta, sin implementarse.

| Origen académico | Qué pide | Qué establece el Maestro o la arquitectura real | Tratamiento |
|---|---|---|---|
| AOS | WS-*, SOAP, WSDL, XSD, ESB | API REST y GraphQL selectivo | Análisis comparativo; sin SOAP ni ESB |
| Seguridad | SHA-256 para contraseñas | Better Auth y su propio hashing (RNF-01) | Explicar por qué un hash rápido no sirve |
| Seguridad | Permisos para una «secretaria» | RN-001: un solo rol de dominio | Analizar la delegación como concepto |
| Seguridad | 2FA, bloqueo por intentos, JWT corto, AES-256 en BD, biometría | No son requisitos del Maestro | Controles propuestos |
| Plan v2, semana 3 | «JWT corto + refresh token» | Sesiones de Better Auth (M00) | Documentar el mecanismo real |
| Plan v2, semana 7 | «Membresía del médico» con Stripe | El Maestro elimina la membresía | Solo análisis; no se implementa |
| Minería | Clustering por diagnóstico, zona o familia/seguro | RN-126, RN-129: sin datos clínicos ni de identidad | Segmentar por surtidos y asistencia con datos sintéticos |
| Minería | Ejemplos con «Cardiología» | Especialidades: Infectología, Psicología y Medicina general | Usar las especialidades reales |
| Móviles II | Room, Retrofit, SharedPreferences, CoreData, Firebase/Supabase | Expo / React Native | Documentar con la tecnología real |

Las dos filas del plan v2 (semanas 3 y 7) son **nuevas** respecto a `contradicciones-dualidad-maestro.md` y conviene
añadirlas a ese archivo.

## 6. Estado de la evidencia académica en el repositorio

| Módulo | Archivo | Estado |
|---|---|---|
| M00 Fundaciones | `docs/academico/M00-fundaciones.md` | Existe |
| M01 Auditoría | `docs/academico/M01-audit.md` | Existe |
| M02 Identidad | `docs/academico/M02-identity.md` | **Borrador**: depende de la etapa D (evidencia formal) |
| M03 Médicos | — | Pendiente |

**No verificado aquí:** cuáles de los 12 entregables del corte parcial 1 (9 de octubre) se entregaron, ni el avance
de los demás. No consta en el repositorio; habría que contrastarlo con lo que se entregó.
