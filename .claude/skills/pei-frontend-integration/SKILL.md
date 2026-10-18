---
name: pei-frontend-integration
description: Integra de forma incremental una entrega semanal del frontend de PEI con el backend existente, con matriz de compatibilidad y aprobación explícita antes de modificar archivos.
argument-hint: <ruta-de-la-entrega-semanal>
disable-model-invocation: true
---

# Integración semanal del frontend de PEI

Entrega a integrar: `$ARGUMENTS`

PEI es el producto; Gestinnovo es la empresa.
El Documento Maestro V2.3 (`docs/arquitectura/Maestro-V2.3.md`) es la fuente de verdad del comportamiento.
El backend actual es el contrato: el frontend se adapta a él, nunca al revés.
Destino de la integración: `apps/web`.

## Restricciones obligatorias (aplican en todas las fases)

- No inventar endpoints, contratos, DTO, reglas de negocio ni datos. Toda afirmación sobre el backend cita `archivo:línea`.
- No modificar `apps/backend/**`, el esquema, las migraciones, `drizzle.config.ts` ni la infraestructura.
- No acceder a Neon ni a ninguna otra BD. No ejecutar `db:*`, `admin:bootstrap`, `legal:publish`, `identity:purge-documents`, `test:int`, `test:e2e`, `test:evidence` ni levantar el backend (se conecta a la BD).
- No hacer commit, push, PR, tag ni despliegue sin autorización explícita en el chat.
- La entrega es de solo lectura: no se modifica, mueve ni sobrescribe, ni tampoco ninguna entrega anterior. La integración se hace en `apps/web`.
- No abrir, mostrar ni copiar valores de archivos `.env*`. Como máximo, listar los nombres de las variables que el frontend espera.
- Si falta una capacidad del backend, documentarla y detener solo esa funcionalidad.
- Un flujo no está terminado porque su pantalla se renderice. Debe coincidir con el contrato real (petición, respuesta, errores, autenticación y permisos) y tener una prueba o verificación que lo demuestre.

## Flujo

### 1. Identificar la entrega
- Si `$ARGUMENTS` está vacío o la ruta no existe, preguntar la ruta y detenerse.
- Comprobar que existe `docs/arquitectura/Maestro-V2.3.md`. Si no existe, preguntar su ruta y detenerse.
- Registrar la ruta, la fecha, el stack (framework, gestor de paquetes) y la entrega anterior, si existe en `docs/integracion-frontend/`.

### 2. Inspeccionar el frontend (solo lectura)
Inventariar rutas o pantallas, llamadas HTTP o GraphQL, modelos y tipos, flujo de autenticación, roles asumidos, validaciones, mocks y variables de entorno esperadas (solo nombres).
No instalar dependencias dentro de la entrega.

### 3. Comparar con el backend real
Para cada llamada del frontend, localizar en `apps/backend/src` (`rest`, `graphql`, `auth`, `modules/*`):
método y ruta u operación, DTO de entrada y salida con sus validaciones, guards o roles, sesión de Better Auth, códigos de error y reglas de negocio aplicadas.

### 4. Consultar documentación
`docs/arquitectura/Maestro-V2.3.md` (RF, RN, RNF), `docs/arquitectura/*.md` y `docs/academico/M0x-*.md`.
Si el frontend contradice al Maestro, prevalece el Maestro y se señala la contradicción.
Si otros documentos citan la V2.2, prevalece la V2.3; se señala sin modificar esos documentos.

### 5. Clasificar cada funcionalidad
- **Soportada**: el contrato existe y coincide.
- **Parcialmente soportada**: el contrato existe pero hay diferencias (campos, formatos, permisos). Detallar cuáles.
- **No soportada**: no hay capacidad en el backend. Se documenta y se pospone.
- **Ambigua**: el frontend, el backend y el Maestro no permiten decidir. Requiere una decisión del usuario.

### 6. Matriz de compatibilidad y plan incremental
Escribir `docs/integracion-frontend/<AAAA-MM-DD>/matriz.md` con las columnas:
Funcionalidad | Pantalla | Llamada del frontend | Endpoint/DTO real (archivo:línea) | Autenticación/rol | Requisito del Maestro | Estado | Diferencias | Acción propuesta.
Después, el plan en incrementos pequeños, ordenados por dependencias (primero la autenticación), con los archivos de `apps/web` afectados y la validación de cada uno.
Este informe es el único archivo que se escribe antes de la aprobación; si el usuario no lo autoriza, se muestra solo en el chat.

### 7. Punto de aprobación
Mostrar un resumen de la matriz, el plan y las preguntas sobre lo ambiguo. **Detenerse.**
No modificar archivos hasta recibir una aprobación explícita que indique qué incremento se implementa.

### 8. Implementar solo el incremento aprobado
Dentro de `apps/web`. Sin adelantar otros incrementos.
Las funcionalidades no soportadas quedan deshabilitadas o marcadas como pendientes, sin datos inventados.

### 9. Validaciones locales seguras y revisión del diff
Solo en el frontend: typecheck, lint, build y pruebas unitarias con mocks basados en los DTO reales.
Del backend, solo `pnpm test` (unitarias, sin BD) y únicamente si es relevante.
Revisar `git diff` y confirmar que no se tocó `apps/backend/**` ni la entrega original, y que no hay secretos.

### 10. Entrega de resultados
Informar de: lo implementado, los resultados de las validaciones (salida real; los fallos tal cual), las funcionalidades pendientes o bloqueadas por el backend, las decisiones abiertas y `git status`.
Actualizar `docs/integracion-frontend/<AAAA-MM-DD>/resultado.md`.
Sin commit salvo autorización.
