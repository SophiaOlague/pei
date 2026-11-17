# Resumen ejecutivo — auditoría académica PEI

**Corte de auditoría:** 16 de noviembre de 2026  
**Fecha límite:** 4 de diciembre de 2026

## Diagnóstico

PEI tiene una base técnica sustancial: app Expo/React Native, web, backend modular NestJS, PostgreSQL, APIs, módulos de identidad, agenda, citas y pagos, además de pruebas unitarias, integración y E2E guardadas. El repositorio ofrece evidencia útil para explicar conectividad móvil, propiedades de servicios, mecanismos de seguridad, arquitectura y seguimiento del proyecto.

La evidencia técnica no completa automáticamente los productos académicos. Faltan documentos de análisis, comparaciones, diagramas, guías, evaluación OWASP integral, metodología de datos y evidencias de demostración para la mayoría de las 44 filas. Minería de datos es la brecha más amplia: no se encontró dataset, entrenamiento, métricas, consultas analíticas, clustering, Data Mart ni cubo OLAP.

## Cumplimiento sustentado

| Materia | Completo | Parcial | Pendiente | Cumplimiento sustentado |
|---|---:|---:|---:|---:|
| Programación para móviles II | 0 | 7 | 3 | 18% |
| Arquitectura orientada a servicios | 0 | 3 | 3 | 16% |
| Seguridad de la información | 0 | 7 | 1 | 39% |
| Minería de datos | 0 | 0 | 8 | 0% |
| Expresión oral y escrita II | 0 | 1 | 4 | 11% |
| Administración de Proyectos | 1 | 5 | 1 | 45% |
| **Global (44 entregables)** | **1** | **23** | **20** | **22%** |

Revisado el 16-nov-2026 tras los merges de los PR #7 a #14: sin cambios en estados ni porcentajes (sección 3.2 de [01-auditoria-cumplimiento.md](01-auditoria-cumplimiento.md)).

El promedio global asigna peso igual a cada entregable. Un parcial recibe solo el porcentaje de subcriterios que se pueden respaldar con artefactos concretos; pendiente es 0%. No hay entregables no verificables o no aplicables. Estos valores son un diagnóstico documental, no una calificación académica.

## Faltantes prioritarios

1. Ocho entregables de minería pendientes, desde dataset y SQL hasta modelos, métricas y OLAP.
2. Hitos H1/H2 sin registro de entrega confirmada en la Bitácora.
3. Checklist OWASP Mobile y revisión completa de OWASP API sin evidencia.
4. Aviso integral de privacidad y procedimiento ARCO final sin verificar; los ejemplos legales del web son ficticios.
5. Evidencia de demo móvil extremo a extremo: varios tests usan dobles y no equivalen a servicio real desplegado.
6. Conectividad (latencia/batería/señal), ciclo de vida de persistencia y sincronización móvil sin análisis suficiente.
7. Entregables de SOA/SaaS (glosario, madurez, contrato comparado, ESB) ausentes o parciales.
8. Sin código de conducta, NDA, uso aceptable o canal de denuncia verificable.
9. Sin métricas operacionales y costo total consolidados.
10. Sin cálculo EVM; el seguimiento de tareas no contiene PV/EV/AC, CPI o SPI.

## Riesgos para el 4 de diciembre

- El trabajo de cierre estimado por entregable suma aproximadamente **171 horas-persona**, antes de la integración final. Una sola persona tendría que dedicar alrededor de 9.5 horas por día natural durante los 18 días restantes; el plan requiere paralelizar o negociar alcance/prioridades.
- El estado de arte, analítica y pruebas/demostraciones implican fuentes y resultados que no se pueden inventar. Cualquier métrica no medida debe aparecer como no disponible.
- El documento académico local antiguo lista 37 entregables; la matriz actual tiene 44. El paquete final debe seguir la matriz y mantener trazabilidad fila por fila.
- La matriz y el PDF de entregables son archivos externos, fuera del repositorio. La Bitácora se renombró a V1.2 el 16-nov-2026 para coincidir con su contenido (antes se llamaba V1.0). El Maestro se llama 28-oct, pero contiene actualizaciones hasta 15-nov y sigue marcado como borrador pendiente de aprobación. Desde el 16-nov-2026 registra a Stripe como proveedor activo (sección 11.4).
- Código local posterior al último commit aumenta el riesgo de que una demo y el repositorio versionado no correspondan. La auditoría no fijó una versión de release ni corrió pruebas. **Actualización (16-nov-2026):** M03, M07, M08 y Payments ya están en `main` (`cef7ce6`); la app móvil y la minería de datos siguen fuera de Git, y para ellas el riesgo sigue vigente.

## Plan recomendado

1. Congelar el inventario de 44 requisitos y verificar las discrepancias de versión antes de redactar.
2. En paralelo: cerrar seguridad/privacidad, los documentos de móviles/SOA y la preparación de dataset sintético/modelo/OLAP.
3. Elaborar evidencias concretas y reproducibles; evitar ampliar el producto con SOAP, ESB, DAO/offline, biometría o funciones analíticas si basta con explicar el contraste académico.
4. Cerrar estructura/manual, referencias, costos y variables; preparar demo y paquete de pruebas verificable.
5. Integrar todos los documentos contra la matriz, marcar límites/pendientes y obtener revisión antes del 4-dic.

El plan detallado, dependencias, esfuerzo y fechas se encuentra en [03-plan-cierre-4-diciembre.md](03-plan-cierre-4-diciembre.md). El resultado por cada una de las 44 filas y su justificación está en [01-auditoria-cumplimiento.md](01-auditoria-cumplimiento.md); la relación de evidencia exacta está en [04-matriz-evidencias.md](04-matriz-evidencias.md).

