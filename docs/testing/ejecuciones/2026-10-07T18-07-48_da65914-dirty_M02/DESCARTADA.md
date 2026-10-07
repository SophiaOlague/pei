# Etapa C: corrida descartada (diagnóstico): NO es evidencia definitiva de M02

- **Resultado:** 373/374. Unitarias 240/240, integración 55/56, E2E 78/78 (TC-M01-204 pasó).
- **Fallo:** TC-M02-117 (`test/integration/identity.int-spec.ts`) superó el límite de 60 s después de 4 aserciones
  correctas. Ninguna aserción falló.
- **Diagnóstico posterior** (solo lectura):
  - BD sin cambios, sin sesiones abiertas, sin bloqueos y con el servidor Neon sano (consulta simple en 0,24 ms).
  - Latencia de red elevada desde el equipo de pruebas: unos 222 ms por consulta.
  - TC-M02-117 aislada pasó 5/5, pero tardó entre 17,7 y 42,7 s, contra 2,6 s el día anterior.
- **Acción:** ninguna sobre el código ni la configuración. La tercera corrida queda pendiente de una red con latencia normal.

Se conserva por decisión de cierre de M02. Detalle en
[`../2026-10-07_M02-validacion/resumen-de-evidencia.md`](../2026-10-07_M02-validacion/resumen-de-evidencia.md).
Los archivos generados de esta carpeta no se modificaron.
