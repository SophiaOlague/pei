# Etapa B: corrida descartada (diagnóstico): NO es evidencia definitiva de M02

- **Resultado:** 373/374. Unitarias 240/240, integración 56/56, E2E 77/78.
- **Fallo:** TC-M01-204 (`test/audit-db.e2e-spec.ts`) superó el límite por defecto de Jest de 5 s. Ninguna aserción falló.
- **Causa:** la configuración E2E no tenía `testTimeout`, y la prueba escribe en Neon real dentro de una transacción
  revertida. Aislada tardó entre 1,8 y 5,0 s.
- **Acción autorizada:** `"testTimeout": 30000` en `apps/backend/test/jest-e2e.json`. No se modificó la prueba.
- **BD:** sin cambios (conteos y huellas idénticos).

Se conserva por decisión de cierre de M02. Detalle en
[`../2026-10-07_M02-validacion/resumen-de-evidencia.md`](../2026-10-07_M02-validacion/resumen-de-evidencia.md).
Los archivos generados de esta carpeta no se modificaron.
