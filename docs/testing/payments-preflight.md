# Preflight de Payments (paso 0 de la Fase 1)

Diseño: `docs/arquitectura/Payments-decisiones.md` §3.7.
Código:
- `apps/backend/scripts/payments-preflight-core.ts`: la lógica.
- `apps/backend/scripts/payments-preflight.ts`: el ejecutable.
- `apps/backend/scripts/payments-preflight-core.spec.ts`: las pruebas, con un `pg` falso.

Estado al 2026-11-11:
- 0.a implementado y probado sin base de datos.
- **0.b (C2) y 0.c (otros destinos) no están autorizados ni ejecutados.**

## Requisitos antes de cada ejecución

1. **Autorización expresa** de la responsable del producto **para ese destino concreto**. La autorización de C2 no
   vale para ningún otro destino.
2. **Huella autorizada**: un archivo JSON **fuera del repositorio**, por ejemplo junto al `.env.c2` de C2, con este
   contenido:

   ```json
   {
     "label": "C2",
     "fingerprint": {
       "database": "…",
       "system_identifier": "…",
       "server_version": "…",
       "current_user": "…",
       "neon_project_id": "…",
       "neon_branch_id": "…",
       "neon_endpoint_id": "…",
       "host_sha256_16": "…"
     }
   }
   ```

   La responsable confirma los valores por un canal propio:
   - los identificadores de Neon, en la consola de Neon;
   - el resto, por el procedimiento que se apruebe junto con 0.b.

   No se reutiliza una huella de otro destino. `host_sha256_16` son los primeros 16 caracteres hexadecimales del
   SHA-256 del nombre de host en minúsculas.
3. **Archivo de entorno explícito** con una sola línea `DATABASE_URL=…`. El script no lee `process.env` ni `dotenv`
   y no presupone el `.env` del repositorio, cuyo destino debe identificarse por su huella como cualquier otro.

## Identificación (`--identify`, solo con autorización propia)

Sirve para obtener los componentes que no se pueden confirmar sin conexión (`system_identifier` y `server_version`)
y construir la huella autorizada. **No consulta ninguna tabla.**

Usa una lista cerrada (`IDENTIFY_ALLOWED_SQL`) que solo contiene:
- el modo de solo lectura y `SHOW transaction_read_only`;
- las 7 sentencias de huella;
- `ROLLBACK`.

```bash
cd apps/backend
npx ts-node --transpile-only scripts/payments-preflight.ts --identify --env-file <entorno> --out <salida.json>
```

Contenido de la salida:
- **En claro**: `database`, `system_identifier`, `server_version` y los tres ids de Neon.
- **Solo como hash**: `host_sha256_16` y `current_user_sha256_16`.
- `authorizedDraft`: una plantilla **incompleta**, con `label` y `current_user` vacíos. `parseAuthorizedTarget` la
  rechaza, así que **no es una autorización**.

Para construir la huella autorizada, la responsable:
1. Confirma los ids de Neon en la consola.
2. Escribe el rol de la conexión y comprueba que su SHA-256 truncado coincide con `current_user_sha256_16`.
3. Pone el rótulo.
4. Guarda el archivo fuera del repositorio.

Si `pg_control_system()` falla, el modo aborta con el SQLSTATE (42501 = sin permiso) y no escribe nada.

## Endpoint directo (ambos modos)

`assertDirectEndpoint` rechaza un host `-pooler` **antes de conectar**. Con el pooler de Neon en modo transacción,
el `SET SESSION` podría quedar en una conexión compartida.

## Éxito y fallo

Solo se informa éxito si todo lo siguiente terminó bien:
- la operación;
- el `ROLLBACK`;
- la escritura del archivo;
- el cierre de la conexión.

Cualquier fallo termina con código 1 y un mensaje propio que solo incluye el paso y el SQLSTATE.

## Ejecución (solo con autorización)

```bash
cd apps/backend
npx ts-node --transpile-only scripts/payments-preflight.ts --env-file <entorno> --authorized <huella.json> --out <informe.json>
```

Los tres argumentos son obligatorios: no hay valores por defecto ni otros argumentos.

## Garantías

| Garantía | Mecanismo | Prueba |
|---|---|---|
| Sin escrituras | Lista cerrada `PREFLIGHT_ALLOWED_SQL`; `GuardedClient` rechaza cualquier otra sentencia antes del driver; expresión `WRITE_KEYWORDS` aplicada a la lista completa | «lista de SQL permitido» |
| Solo lectura | `SET SESSION default_transaction_read_only = on` + `BEGIN … READ ONLY` + `SHOW transaction_read_only = on`; límites `statement_timeout`, `lock_timeout` e `idle_in_transaction_session_timeout`; siempre `ROLLBACK` | «ejecución correcta», «aborta… si la transacción no es de solo lectura» |
| Huella completa antes de los datos | 8 componentes, cada uno con su propia sentencia. Aborta si falta alguno, está vacío, devuelve más de una fila, no hay permiso para leerlo (SQLSTATE 42501) o no coincide. **No hay identificación aproximada** | «aborta y no lee datos» (8 componentes × falta y × discrepancia) |
| Sin credenciales | Los errores del driver se reducen a su SQLSTATE; el informe solo contiene el rótulo, el SHA-256 de la huella, conteos e ids técnicos; `assertReportHasNoSecrets` bloquea la escritura si aparece la URL, el host, el usuario o la contraseña | «no se emiten credenciales» |

**Nota sobre 0.b.** `pg_control_system()` puede estar restringida para el rol de la conexión. En ese caso el
preflight **aborta** con SQLSTATE 42501. Es el comportamiento exigido: hay que decidir cómo obtener el componente, no
omitirlo.

## Informe

Contenido:
- conteos de las 10 tablas;
- `status` × `type` de `payment`, con el mapeo propuesto (`pending`, `requires_action` y los estados desconocidos
  quedan **pendientes de decisión**);
- 26 comprobaciones de anomalías (recuento y hasta 20 ids);
- la compuerta 0.e: `directPathAllowed` solo es verdadero si todas las tablas están vacías y no hay anomalías.

El informe es evidencia para `docs/testing`, pero se versiona solo con autorización.
