# Plan de cierre académico al 4 de diciembre de 2026

**Inicio del plan:** 16 de noviembre de 2026  
**Capacidad y riesgo:** el cierre fila por fila se estima en unos 171 h-persona, sin contar coordinación/integración. Para completarlo en el plazo conviene repartirlo entre tres frentes paralelos (documentación técnica, seguridad/proyecto y minería); los responsables no están definidos en la Bitácora. Si una sola persona ejecuta todo, el plan completo no cabe con una jornada sostenible y se debe acordar priorización de alcance con la responsable/docente.

## Secuencia y fechas propuestas

| Fechas | Frente | Actividades y entregables | Dependencias | Esfuerzo estimado | Salida verificable |
|---|---|---|---|---:|---|
| 16-nov | Integración | Congelar las 44 filas de la matriz; reconciliar nombres/versiones/cortes; marcar responsables, estado y ubicación exacta. | Fuentes recibidas | 3 h | Registro de fuentes y versión; lista de trabajo sin “por verificar” genérico. |
| 16–18 nov | Documental / Proyecto | Redactar brechas de estado del arte, justificación, variables, delimitación; completar costo y EVM con datos disponibles, dejando bases faltantes visibles. | Maestro V2.4, Bitácora interna V1.2, historial de tareas confiable | 13 h | Tablas de problema/variables/límites/costos y hoja EVM con PV/EV/AC solo donde existan datos. |
| 16–20 nov | Móvil / Técnica | UML, metodología, guía de cliente REST, topología, ciclo de vida, catálogo nativo y conectividad; documentar qué persiste realmente. | Esquema vigente, `apps/mobile/INTEGRACION.md`, endpoints | 25 h | Diagrama, secuencia de conexión, inventario de persistencia y guía con capturas/request-response. |
| 17–21 nov | Seguridad / Legal | Matriz preventiva-detectiva-correctiva, amenazas, API/Mobile Top 10, controles físicos/lógicos, cripto/PKI, servicios, privacidad/ARCO, conducta. | Evidencia M00–M08 y revisión de contenido legal | 35 h | Checklist con hallazgos y prueba/ruta por control; documentos legales marcados como borrador si no se aprueban. |
| 18–22 nov | SOA | Glosario, propiedades, comparación HTTP/REST-JSON con SOAP/WSDL/XSD/XML, modelo/madurez SaaS y convivencia. | Diagramas y contratos reales backend/móvil | 19 h | Documento con diagrama de arquitectura real y propuesta/contraste rotulados; sin agregar SOAP/ESB al código. |
| 19–27 nov | Minería / Analítica | Dataset sintético y diccionario, SQL/Data Mart, preprocesamiento, baseline supervisado, comparación, anomalías, clustering y cubo OLAP. | Esquema de citas y reglas de privacidad; equipo de analítica | 49 h | Scripts/notebook reproducible, dataset sintético versionable, métricas, gráficos/tablas y manual de interpretación. |
| 23–26 nov | Expresión escrita | Tabla de comunicación, canales/riesgos, guía de redacción, referencias APA y estructura/manual. | Flujos actuales, #23, capturas de demo | 13 h | Guías breves integradas y referencias comprobadas. |
| 26–30 nov | Pruebas y demostración | Revisar pruebas existentes, elegir rutas críticas móviles/web/API, ejecutar solo con ambiente autorizado, tomar evidencia no sensible; completar trazabilidad. | #7 móvil, #17–23 seguridad, #25–32 analítica | 12 h | Paquete de evidencias con fecha/versión/ambiente y pruebas reales separadas de dobles. |
| 1–3 dic | Integración / Revisión | Cotejar 44 filas con artefactos, verificar enlaces/rutas, cifras, referencias y consistencia entre documentos. | Entregables anteriores | 8 h | Informe final coherente con matriz; límites y pendientes explícitos. |
| 4-dic | Entrega | Exportar/entregar documentos académicos y respaldos requeridos; conservar copia de la matriz original. | Revisión del 1–3 dic | 4 h | Paquete de entrega indexado. |

**Total aproximado: 181 h-persona** (171 h de cierre por filas + 10 h para integración, revisión y entrega). Hay tareas paralelizables entre 16 y 26 de noviembre. La fecha de término deja tres días para control de calidad y no para iniciar modelos o redactar el aviso legal desde cero.

Avance al 16-nov-2026 (actividad de integración): se reconciliaron el nombre de la Bitácora (renombrada a V1.2) y el proveedor de pagos del Maestro (Stripe, sección 11.4). Los estados y porcentajes de las 44 filas no cambian.

## Priorización por tipo de trabajo

### Programación (solo lo necesario para evidencia)

- **16–20 nov, 8 h dentro del frente móvil:** verificar cliente API, sesión SecureStore, rutas disponibles y estado real del build; tomar evidencia de la demo integrada. Corregir el entorno únicamente si bloquea una ruta académica ya requerida.
- No ampliar el producto con SQLite/DAO offline, SOAP/ESB, biometría ni nueva analítica de producto para satisfacer ejemplos de clase. Si el docente exige implementación local, obtener una decisión de alcance y recalcular plazo antes de comenzar.

### Documentación

- **16–21 nov:** documentación móvil, SOA, seguridad, privacidad, análisis de proyecto y riesgos. Reutilizar estructuras técnicas existentes y anotar brechas sin atribuir aprobación legal o despliegue.
- **23–26 nov:** formatos de comunicación, guía de redacción, APA y estructura/manual de usuario.
- Citar todas las fuentes efectivamente consultadas y distinguir medición, estimación y propuesta.

### Analítica

- **19–27 nov:** diseñar un dataset sintético con trazabilidad, evitar identidad y variables clínicas; implementar al menos un baseline supervisado y un análisis de agrupamiento, explicar algoritmos restantes según lo exija el PDF, y generar métricas reproducibles.
- Bloquea el cierre de #25–32; si no hay capacidad antes del 22-nov, solicitar priorización académica, no presentar una API de producto como modelo entrenado.

### Pruebas

- **26–30 nov:** seleccionar pruebas ejecutadas ya registradas y distinguirlas de suites simuladas. No reportar una suite como aprobada sin artefacto de ejecución. No ejecutar pruebas con efectos persistentes sin destino/permiso documentado; no usar datos reales.
- OWASP es una revisión por control/hallazgo, no el conteo de tests existentes. Seguridad móvil requiere revisión específica del cliente.

### Integración

- **16-nov:** consolidar matriz y versiones.
- **1–3 dic:** verificación cruzada de rutas, porcentajes, redondeo, estado por fila y referencias.
- **4-dic:** generar el índice de entrega y conservar matriz original sin sobrescribirla.

## Hitos de control

| Fecha | Criterio de salida | Si no se cumple |
|---|---|---|
| 18-nov | Fuentes y plan aprobables; responsables/capacidad definidos | Reducir elementos de comparación teórica con la responsable; preservar analítica y seguridad como brechas críticas. |
| 22-nov | Documentos móvil/SOA/seguridad en borrador; dataset sintético y método acordados | Congelar funcionalidades no esenciales; pedir ajuste de alcance para los modelos pendientes. |
| 27-nov | Evidencia de minería reproducible y guías académicas redactadas | No afirmar cumplimiento; entregar limitación, prototipo reproducible parcial y estado real por fila. |
| 30-nov | Pruebas/demos seleccionadas y tabla de evidencias completa | No llamar “demo real” a pruebas con dobles; enumerar exactamente qué falta validar. |
| 3-dic | Revisión de los cuatro documentos contra las 44 filas | Corregir faltantes de trazabilidad/errores de cálculo antes de entregar. |
| 4-dic | Paquete de entrega consolidado | Registrar pendientes sin etiquetarlos como completos. |

