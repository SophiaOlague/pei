# Integración de la app móvil con el backend de PEI

App Expo (SDK 57, React Native 0.86, expo-router) incorporada desde `telehealth-main` el 2026-10-25.
Sigue las mismas reglas que `apps/web/INTEGRACION.md`: el backend es la fuente de verdad, sin operaciones simuladas
que aparenten guardar datos y sin cambios en el backend desde esta integración.

## Configuración

| Elemento | Valor |
|---|---|
| Variable | `EXPO_PUBLIC_API_URL`: origen del backend, sin `/api/auth` ni barra final (ver `.env.example`; crear `.env.local`) |
| Lectura | `src/lib/config.ts` (`API_URL`, `AUTH_BASE_URL = ${API_URL}/api/auth`). Si falta, la app falla al iniciar con un mensaje claro |
| Cliente de Better Auth | `src/lib/auth-client.ts`, `expoClient` con `expo-secure-store` (cookie de sesión cifrada por el sistema) |
| Dispositivo físico | Usar la IP de la red local del equipo; `localhost` apunta al teléfono. Emulador de Android: `10.0.2.2` |

`EXPO_PUBLIC_*` se inserta en el bundle: nunca debe contener secretos.
Las videollamadas ya no usan el servidor externo del prototipo (retirado el 2026-11-16): la videoconsulta parte de una
cita real (Inicio → `joincall.tsx`) y la entrada a la sala depende del módulo de videoconsulta del backend, pendiente.

## Dependencias (versiones exactas)

| Paquete | Versión | Motivo |
|---|---|---|
| `better-auth`, `@better-auth/expo` | 1.7.10 | Fijadas (antes `^1.7.3` / `^1.7.10`, ya resueltas a 1.7.10). Backend en 1.7.5: misma serie 1.7 |
| `jest-expo` | 57.0.6 | Etiqueta `sdk-57` |
| `jest` | 29.7.0 | `jest-expo` 57 usa Jest 29 |
| `@react-native/jest-preset` | 0.86.3 | Peer de `jest-expo` 57 |
| `@testing-library/react-native` | 14.1.0 | `render` y `fireEvent` son asíncronos en v14 |
| `test-renderer` | 1.3.1 | Peer de RNTL 14 |
| `@types/jest` | 29.5.14 | |
| `eslint`, `eslint-config-expo` | 9.39.5, 57.0.2 | `expo lint` no tenía configuración (`eslint.config.js` nuevo) |

`pnpm-workspace.yaml`: `allowBuilds: unrs-resolver: false`. Su `postinstall` solo verifica el binario precompilado,
que ya se instala como dependencia opcional.

## Contrato de Better Auth verificado (código instalado)

| Aspecto | Comportamiento real | Referencia |
|---|---|---|
| Origen en móvil | `expoClient` envía `expo-origin: Linking.createURL("", { scheme })`; el plugin `expo()` del servidor lo copia a `Origin` | `@better-auth/expo/dist/client.js`, `index.js` |
| Validación del origen | Solo en peticiones **con cookie** (o forzadas). Inicio de sesión, registro y reenvío desde un dispositivo sin sesión no la pasan | `better-auth/dist/api/middlewares/origin-check.mjs` (`validateOrigin`) |
| `callbackURL` / `redirectTo` | Siempre se validan contra `trustedOrigins`; si no son de confianza → 403 `INVALID_CALLBACK_URL` / `INVALID_REDIRECT_URL`. `expoClient` convierte rutas relativas en `esquema://…` | mismo archivo; `client.js:705-720` |
| `exp://` (Expo Go) | El plugin solo lo añade con `NODE_ENV=development` | `@better-auth/expo/dist/index.js:43` |
| `/verify-email` con enlace profundo | Si la redirección es a un esquema propio de confianza, el plugin añade `?cookie=…`; la app tendría que leerla ella misma (el cliente solo lo hace en OAuth) | `index.js` (hook `after`), `client.js:676` |
| Inicio sin verificar | 403 `EMAIL_NOT_VERIFIED` y reenvía el enlace (`sendOnSignIn`) | `auth.config.ts` del backend |
| Credenciales inválidas | 401 `INVALID_EMAIL_OR_PASSWORD` | |
| Límites | Inicio 5/min, registro 3/min, reenvío 3/15 min → 429 | `AUTH_RATE_LIMIT` |
| Registro | No abre sesión (verificación obligatoria); con correo existente responde igual | |

## Esquema y enlaces profundos (esquema `gestinovo`, 2026-10-25)

- **Aplicado:** `"scheme": "gestinovo"` en `app.json` y `scheme: "gestinovo"` en `expoClient` (`src/lib/auth-client.ts`).
  Es el esquema histórico de la app móvil que el backend ya acepta. El backend no se modificó.
  - `expo config --type public` resuelve `scheme: 'gestinovo'`.
  - `gestinovo://` está en la lista por defecto del backend (`auth.config.ts:40`). También está en el `.env` local del
    backend, que define `AUTH_TRUSTED_ORIGINS` (tres orígenes) y por eso sustituye la lista por defecto. Cualquier
    otro entorno del backend que defina esa variable debe incluir `gestinovo://`.
  - Sin cambios: `storagePrefix: "telehealth"` (la sesión guardada sigue en la misma clave de SecureStore), `name`,
    `slug`, `bundleIdentifier`, `package`, `owner` y el `projectId` de EAS.
  - No existe `app.config.*`, y ningún código de la app abría ni recibía enlaces `telehealth://`.
- **Hay que volver a compilar el cliente de desarrollo** (`pnpm android` / `pnpm ios`, o una build de EAS): el esquema
  es configuración nativa (Info.plist / AndroidManifest). Una build anterior sigue registrando `telehealth://` y no
  abre los enlaces `gestinovo://`.
- **Con Expo Go** el origen es `exp://…`: el plugin `expo()` del backend solo lo acepta con `NODE_ENV=development`.
- **Efecto:** las peticiones con cookie (cerrar sesión, cambiar la contraseña) envían `expo-origin: gestinovo://`, que
  ya es de confianza. Verificado solo leyendo el código y con pruebas simuladas, no contra el backend real.
- **Correos de verificación y recuperación:** por ahora se envían sin `callbackURL`. El enlace verifica el correo en
  el navegador, que termina en el backend, y la persona vuelve a la app a iniciar sesión. Para volver directo a la
  app haría falta, además del esquema (ya aplicado): (1) leer el parámetro `?cookie=` del enlace profundo, que el cliente
  no procesa fuera de OAuth, o bien usar una página web intermedia; (2) tener en cuenta que el hook
  `rejectVerificationWithoutPassword` solo redirige a URLs `http(s)` y, con esquema propio, responde 403 en JSON
  (solo afecta a cuentas sin contraseña, como el primer administrador).

## Etapa 1: inicio de sesión y registro (2026-10-25)

### Flujo
- **Inicio de sesión** (`(auth)/login.tsx`): `authClient.signIn.email` con el correo recortado y sin `callbackURL`. Al
  tener éxito no navega: lo hace `Stack.Protected` de `_layout.tsx` cuando `get-session` confirma la sesión.
  - 401 → «Correo o contraseña incorrectos.»
  - 403 `EMAIL_NOT_VERIFIED` → pantalla de verificación (el backend ya reenvió el enlace).
  - 429 → mensaje de límite de intentos.
  - Sin respuesta o excepción → error de conexión.
  - Se ignora un segundo toque mientras hay una petición en curso.
- **Registro** (`(auth)/register.tsx`): `authClient.signUp.email` (`name`, `email`, `password`). Antes de enviar valida
  campos, formato del correo, contraseña de 8 a 128 caracteres y que coincida la confirmación. Si tiene éxito, borra
  las contraseñas del estado y reemplaza la pantalla por la de verificación; **nunca** navega a la app. Se eliminó
  `console.log(error)`.
- **Verificación** (`(auth)/verificar-correo.tsx`, nueva): explica que hay que abrir el enlace, que vence en una hora.
  «Reenviar enlace» llama a `authClient.sendVerificationEmail({ email })` con una respuesta genérica (no revela la
  cuenta) y maneja 429 y errores de red. «Ir a iniciar sesión» lleva al inicio de sesión.
- El correo pendiente vive solo en memoria (`src/lib/pending-verification.ts`), nunca en la URL ni en disco.
- Los mensajes salen de `src/lib/auth-errors.ts`: nunca se muestra el mensaje crudo del servidor.

### Pruebas automáticas (Jest + RNTL, cliente de Better Auth simulado, sin red)
- `src/__tests__/auth-screens.test.tsx` (13): éxito sin navegación manual, validación, 401, 403 `EMAIL_NOT_VERIFIED`,
  429 y red en el inicio de sesión; registro hacia la verificación, validaciones, 429 y red; reenvío correcto, 429 y
  ausencia de correo pendiente.
- `src/__tests__/auth-errors.test.ts` (7) y `src/__tests__/config.test.ts` (2).
- `jest.setup.ts` fija `EXPO_PUBLIC_API_URL=http://backend.test` (dominio reservado `.test`; nunca se contacta).

### Validación (2026-10-25)

| Comando | Antes | Después |
|---|---|---|
| `pnpm test` | sin pruebas | 22/22 |
| `pnpm exec tsc --noEmit` | 10 errores | 10 errores, todos previos (videollamada, `global.css`, `animated-icon`); ninguno en archivos tocados |
| `pnpm check` (Biome/ultracite) | 588 | 579. Archivos nuevos sin errores; quedan 6 `noJsxPropsBind` en login y registro, patrón original de la app |
| `pnpm lint` (`expo lint`) | sin configurar | 3 errores y 18 avisos, todos previos (`editprofile`, `(auth)/call`, `use-color-scheme.web`) |

Esta tabla corresponde solo a simulaciones. Las pruebas reales están en «Pruebas manuales: backend local con BD Neon `production`».

## Corrección: el formulario se borraba al tocar la contraseña (2026-10-26)

- **Síntoma (emulador):** al tocar el campo de contraseña del registro se vaciaban el nombre y el correo.
- **Causa:** `@better-auth/expo` vuelve a pedir `get-session` cada vez que `AppState` pasa a `active`
  (`client.js:411`). Al abrirse el teclado seguro o el autocompletado de Android, la app queda inactiva un instante. Sin
  sesión, el átomo marca `isPending: current.data === null` (`session-atom.mjs:58`), es decir, `true` en cada consulta. El
  `_layout.tsx` original sustituía toda la navegación por un `ActivityIndicator` mientras `isPending` era verdadero, así
  que desmontaba la pantalla.
- **Corrección** (`src/app/_layout.tsx`): el estado `initialSessionResolved` se activa en la primera respuesta, y el
  indicador solo bloquea hasta entonces. En las consultas siguientes las pantallas no se desmontan y los `Stack.Protected`
  siguen decidiendo con `session`, la última sesión confirmada por el backend.
- **Prueba** (`src/__tests__/root-layout.test.tsx`, 3): rutas reales de expo-router (`renderRouter`) con `useSession`
  simulado.
  1. Durante la consulta inicial no se muestra ninguna pantalla.
  2. Si `get-session` se repite mientras se escribe, el formulario conserva sus valores.
  3. Las rutas protegidas solo se abren con sesión, y se cierran si una consulta posterior ya no la devuelve.

  Con el `_layout.tsx` original, la segunda prueba falla («Unable to find an element with displayValue: Sophy»).
- **Validación:** `pnpm test` 25/25; `tsc` 7 errores, todos previos en videollamada. Bajó de 10 porque `expo start`
  generó `expo-env.d.ts`, que declara `global.css` y los módulos CSS; el archivo está ignorado por git. Biome: sin errores
  en los archivos tocados y 577 en total. `expo lint`: 3 errores y 18 avisos, todos previos.

## Pruebas manuales: backend local con BD Neon `production` (2026-10-26)

### Entorno
- **Backend:** `pnpm start:dev` en `apps/backend` (puerto 3000), en local. **La base de datos NO es local:** el `.env` del
  backend apunta a Neon `production` (`br-royal-recipe-b54s5hnn`, host `ep-wandering-bonus-…`; según
  `apps/web/INTEGRACION.md`, la misma rama de las pruebas manuales de la web). Correo real por Resend.
  `BETTER_AUTH_URL=http://localhost:3000`. No se cambió su configuración.
- **App:** cliente de desarrollo Android (`pnpm android`, 15 min) en el AVD `Medium_Phone`, lanzado con
  `-memory 2048 -gpu host`. El primer arranque con la configuración por defecto (4 GB) se cerró con código 255.
- **Metro:** `pnpm start`, **sin** `CI=1`. En modo CI no vigila los archivos y siguió sirviendo el `_layout.tsx`
  anterior hasta reiniciarlo.
- **API:** `.env.local` con `EXPO_PUBLIC_API_URL=http://10.0.2.2:3000`.
- **Esquema:** `adb shell dumpsys package` muestra `gestinovo`, `exp+telehealth` (del cliente de desarrollo, derivado del
  `slug`) y `expo-dev-launcher`. `am start -d gestinovo://` → `Status: ok`; `telehealth://` ya no se resuelve.
- **Cuenta de prueba:** `fridaolague+prueba2@hotmail.com` («Sophy Olague»). La contraseña la escribió la persona en el
  emulador; nunca pasó por el chat ni por scripts.

### Resultados
| # | Prueba | Resultado | Escribe en la BD | Envía correo |
|---|---|---|---|---|
| 1 | Conectividad sin sesión (PC y emulador): `get-session`, `GET /me`, `GET /me/registration-status` | Completada por la persona | No | No |
| 2 | Bienvenida al abrir sin sesión | Correcta; tras la primera consulta pasa de la pantalla en blanco a la bienvenida | No | No |
| 3 | Formulario de registro tras tocar la contraseña, cerrar el teclado y mandar la app a segundo plano y de vuelta | Nombre y correo conservados (con la corrección) | No | No |
| 4 | **Registro** | «Revisa tu correo» con el correo; no entra a la app | Sí: `user`, `account`, `verification` | **Sí** (llegó) |
| 5 | **Verificación** desde el navegador del PC | Redirige a `http://localhost:3000/` sin `?error`, que muestra «Hello World» (ver pendientes) | Sí: `emailVerified`, sesión en ese navegador | No |
| 6 | **Inicio de sesión** | Entra a las pestañas; «Mi perfil» muestra el nombre y el correo de la sesión real | Sí: `session` | No |
| 7 | Persistencia: cerrar la app por completo y reabrirla | Sigue dentro, en Inicio, sin pasar por el acceso | No | No |
| 8 | **Cierre de sesión** (Mi perfil → Configuración avanzada → Cerrar sesión) | Va a «Bienvenido de nuevo». Sin `403 INVALID_ORIGIN` y sin errores en el log del backend | Sí: borra la `session` | No |
| 9 | Ruta protegida tras cerrar sesión (`gestinovo:///home`) | No se abre; sigue en el acceso | No | No |
| 10 | Reapertura tras cerrar sesión | Bienvenida; no recupera la sesión | No | No |

- El cierre de sesión es la primera petición **con cookie** que pasa por la validación de origen de Better Auth. Que
  funcionara confirma que `gestinovo://` es de confianza en este backend.
- El código HTTP de `sign-out` no se vio directamente, porque el backend no registra las peticiones correctas. Se deduce de
  `onSuccess` en `logout.tsx`, que Better Auth solo llama con una respuesta 2xx, y de la ausencia de errores en el log.
- Logcat no registró errores de JavaScript ni cierres de la app. Solo aparecieron avisos conocidos: rutas sin export por
  defecto y `NativeEventEmitter`.
- **Datos que quedan en Neon `production`:** la cuenta de prueba (verificada, sin perfil de paciente; sus tokens) (no existe `/delete-user`) y la sesión que abrió el enlace de verificación en
  el navegador del PC, hasta que venza.

### Limitaciones y hallazgos pendientes
- `logout.tsx` no maneja errores: si `sign-out` falla, no avisa a la persona. Tampoco limpia el estado en memoria (por
  ejemplo, el carrito de `CartProvider`).
- El enlace de verificación termina en el «Hello World» de `app.controller.ts`, porque se envía sin `callbackURL`. Hace
  falta una página de confirmación (web o enlace profundo; ver «Esquema y enlaces profundos»).
- Con `BETTER_AUTH_URL=http://localhost:3000`, los enlaces de los correos solo funcionan en el PC donde corre el backend.
- La pantalla de Inicio muestra datos de demostración (por ejemplo, «Próxima Cita · Dra Andrea Castro»).
- expo-router avisa que cinco archivos de `(app)/` no son pantallas (`cart-type.ts`, `cartcontext.tsx`,
  `citas-demos.ts`, `emergency-demo.ts`, `lab-demo.ts`); conviene moverlos fuera de `app/`.
- Hay avisos de `NativeEventEmitter` sin `addListener` ni `removeListeners` (probablemente de los módulos de videollamada
  o de sonido).
- El AVD `Medium_Phone` pide 16 GB de RAM y el equipo tiene 15,6 GB: arrancarlo con `-memory 2048`.

### Pendientes generales
- Edición del perfil, foto y cambio de contraseña no están conectados (completar el perfil y los documentos
  legales: ver «Etapa M2»).
  `editprofile` y `deleteaccount` siguen llamando a rutas deshabilitadas (`/update-user`, `/delete-user`).
- Las pantallas de citas, laboratorio, recetas, pagos y emergencia siguen con datos de demostración.

## Etapa M2: completar el registro (perfil + aceptación legal) (2026-10-26)

Mismo flujo que la etapa H1 de `apps/web`. **Solo pruebas simuladas:** no se escribió en ninguna base de datos ni se
llamó al backend.

### Flujo y endpoints
1. Con sesión, `(app)/_layout.tsx` envuelve la app en `RegistrationGate`
   (`src/components/registration/registration-gate.tsx`), que pide `GET /me/registration-status`. No se muestra nada de
   la app mientras carga, si falla o si falta un paso. El estado se desmonta al cerrar sesión y no pasa de una cuenta a
   otra.
   - `profileCompleted: false` → paso 1. `legal.accepted: false` → paso 2. La INE no bloquea (`pendingRegistrationStep`
     en `src/lib/api.ts`, mismo criterio que la web).
   - Error de red o 5xx → mensaje y «Reintentar». 401 → «Cerrar sesión». 403 `NotAPatientError` → «Esta aplicación es
     para pacientes», con «Cerrar sesión».
2. **Paso 1** (`complete-registration.tsx`): nombre(s), apellidos, CURP y fecha de nacimiento → `POST /me/patient-profile`.
   - Antes de enviar: campos obligatorios, hasta 100 caracteres, el mismo formato de CURP que `CURP_PATTERN`
     (`domain/curp.ts`; el dígito verificador lo valida el backend) y fecha `AAAA-MM-DD` real y en el pasado. La CURP se
     envía en mayúsculas y los textos recortados.
   - `ProfileAlreadyExistsError` (un reintento) → solo relee el estado. Otros errores de dominio (por ejemplo,
     `RegistrationDataConflictError`, `InvalidCurpError`) muestran el mensaje del backend, que no repite la CURP.
   - Los mensajes de class-validator (arreglo) se resumen como «Revisa los datos».
   - Teléfono, dirección y contacto de emergencia (opcionales en el DTO) no se piden aquí: se editan después con
     `PATCH /me/profile`.
3. **Paso 2:** `GET /legal-documents/current?audience=patient`, filtrado por los `documentId` de `legal.pending`. Cada
   documento muestra título, versión, texto desplegable y una casilla desmarcada.
   - «Aceptar y continuar» se habilita solo con todas marcadas → `POST /me/legal-acceptances` con exactamente esos ids.
   - `LegalDocumentNotCurrentError` → relee el estado.
   - Sin régimen publicado (`pending: []`) → aviso de que no se puede completar el registro, sin pedir documentos.
4. Tras cada paso se vuelve a pedir el estado. Solo cuando el backend ya no indica perfil ni legales se muestran las
   pestañas.

### Cliente de API (`src/lib/api.ts`)
- `fetch` a `EXPO_PUBLIC_API_URL` con `credentials: "omit"` y `Cookie: await authClient.getCookie()`: en móvil la cookie
  de sesión vive en SecureStore, no en el sistema.
- Las rutas de Nest no pasan por la validación de origen de Better Auth; las protege `SessionGuard`.
- `ApiError` conserva `status` (0 = sin conexión) y `error` (el nombre del error de dominio de `DomainExceptionFilter`).

### Pruebas automáticas (sin red)
- `src/__tests__/api.test.ts` (6), con `fetch` simulado:
  - Cookie de SecureStore y `credentials: "omit"`.
  - Cuerpos exactos del perfil y de la aceptación.
  - Red → status 0.
  - Error de dominio conservado.
  - Mensajes de class-validator y de 401 no expuestos.
  - Orden perfil → legales, sin bloquear por la INE.
- `src/__tests__/registration-gate.test.tsx` (11), con la API simulada:
  - Compuerta: app solo con el registro completo; error de red con reintento; 401 → cerrar sesión; cuenta no paciente.
  - Paso 1: validaciones sin llamar al backend; perfil normalizado y avance a los legales; `ProfileAlreadyExistsError`;
    error de conflicto sin avanzar.
  - Paso 2: ids exactos y solo con todas las casillas; `LegalDocumentNotCurrentError`; sin documentos publicados.
- Durante el desarrollo, la prueba de «sin documentos publicados» detectó que el paso 2 pedía los documentos aunque no
  hubiera pendientes. Se corrigió.

### Validación (2026-10-26)
| Comando | Resultado |
|---|---|
| `pnpm test` | 42/42 (6 suites) |
| `tsc --noEmit` | 7 errores, todos previos (videollamada); ninguno en archivos tocados |
| `expo lint` | 3 errores y 18 avisos, todos previos |
| Biome (archivos nuevos) | 7 `noJsxPropsBind` (manejadores en línea, mismo patrón que el resto de la app), 1 `noExcessiveCognitiveComplexity` (validación del paso 1) y 1 `useErrorCause` falso positivo (la causa se pasa por el constructor de `ApiError`) |
| Biome (total) | 585 (577 antes de M2) |

### Pendiente
- **Prueba manual sin hacer.** Completaría el perfil de la cuenta de prueba en Neon `production`, con una CURP, de forma
  permanente. Requiere autorización aparte.
- Las aceptaciones dependen de los documentos vigentes en `production`: según `apps/web/INTEGRACION.md`, el régimen de
  legado (`privacy_notice` y `terms_and_conditions`).
- La fecha de nacimiento se escribe a mano (`AAAA-MM-DD`). Un selector de fecha requeriría una dependencia nueva.

### Correcciones tras la revisión de M2 (solo pruebas simuladas)
- **M-1. Documentos que cambiaron:** si `legal.pending` pide un id que `/current` ya no trae, el paso legal muestra el
  aviso y **«Volver a cargar»** en lugar de «Aceptar y continuar».
  - La acción relee el estado en la compuerta, que desmonta el paso. Al volver a montarse, los documentos se piden de
    nuevo y las casillas empiezan desmarcadas; no se acepta nada automáticamente.
  - Mientras la compuerta carga, el botón no existe, así que no hay peticiones duplicadas. Si la recarga falla, la
    compuerta muestra «Reintentar».
- **M-2. Errores al escribir** (`writeErrorAction` en `complete-registration.tsx`), en el perfil y en la aceptación:
  - 401, `ProfileAlreadyExistsError` y `LegalDocumentNotCurrentError` → se relee el estado. Con la sesión vencida, la
    compuerta recibe el 401 y ofrece «Cerrar sesión».
  - Sin respuesta o 5xx (**ambiguo**: la escritura pudo aplicarse) → **no se reenvía.** El botón cambia a
    «Comprobar estado», que relee el estado antes de permitir otro envío.
  - Otros 4xx → se muestra el mensaje del backend y se puede corregir.
- **Cierre de sesión en la compuerta:** ya no ignora los errores. Si `signOut` devuelve `{ error }` o lanza una
  excepción, muestra «No pudimos cerrar la sesión…» y «Reintentar cerrar sesión». Mientras se cierra, el botón queda
  deshabilitado.
- **B-1:** `src/lib/profile-validation.ts` (`validateProfile`, `isValidBirthDate`) replica `parseBirthDate` del backend:
  una fecha real y **anterior al inicio de hoy en UTC**. Ahora se rechaza la fecha de hoy. `handleSubmit` usa
  `validateProfile`, con lo que desaparece el aviso de complejidad de Biome.
- **Pruebas nuevas:**
  - `profile-validation.test.ts` (7): hoy contra ayer en UTC, fecha futura, fecha inexistente, otro formato,
    normalización, campos, longitud y CURP.
  - En `registration-gate.test.tsx` (+6): documentos que cambiaron y su recarga (ids, casillas desmarcadas, sin aceptar);
    recarga con error de red; 401 en el perfil y en los legales; respuesta ambigua sin reenvío; cierre de sesión que falla
    (`{ error }` y excepción) con reintento.
- **Validación:**
  - `pnpm test`: 55/55 (7 suites).
  - `tsc`: 7 errores, todos previos.
  - `expo lint`: 3 errores y 18 avisos, todos previos.
  - Biome en los archivos de M2: 7 `noJsxPropsBind`, el patrón de la app, y 1 `useErrorCause` falso positivo. Total: 584.

### Prueba manual de M2: backend local con BD Neon `production` (2026-10-26)
Autorizada expresamente. Cuenta de prueba `fridaolague+prueba2@hotmail.com`. **No se registran aquí la CURP, el nombre
legal ni la fecha de nacimiento:** los escribió la persona directamente en el emulador.

| # | Paso | Resultado | Escribe en la BD |
|---|---|---|---|
| 1 | `DATABASE_URL` (solo el host) | El mismo host documentado (`ep-wandering-bonus-…`, rama `production`) | No |
| 2 | Inicio de sesión (la contraseña la escribió la persona) y estado del registro | «Completa tu registro · Paso 1 de 2»: la compuerta recibió que falta el perfil | Sí: `session` |
| 3 | Perfil con una primera CURP | **Rechazado:** «No fue posible completar el registro…». El log del backend muestra `registration_conflict field=curp`, sin el valor: la CURP ya pertenece a otra cuenta. No se creó nada y la app no reintentó | No |
| 4 | Perfil con otra CURP válida | Guardado. Al releer el estado, la app pasó a «Paso 2 de 2» | **Sí:** perfil de usuario y de paciente, y evento de auditoría |
| 5 | Documentos en la app | Aviso de Privacidad v1 y Términos y Condiciones v1, con las casillas desmarcadas y «Aceptar y continuar» deshabilitado | No |
| 6 | Aceptación | La persona confirmó los IDs `a241a35a-f67d-49b2-adce-0e7f826cbe78` (`privacy_notice` v1) y `76a4a0b5-3c9b-4293-ade6-8fdd5a437472` (`terms_and_conditions` v1). Se marcaron las dos casillas y se pulsó «Aceptar y continuar». La app entró a las pestañas | **Sí:** 2 aceptaciones legales |
| 7 | Persistencia: cerrar la app por completo y reabrirla | La compuerta volvió a consultar `GET /me/registration-status` y entró directo a las pestañas, sin pedir perfil ni documentos | No |

- Logcat no registró errores de JavaScript ni cierres de la app. El backend solo registró el aviso del conflicto del
  paso 3.
- **Límites de la evidencia:**
  - El estado se observó a través de la app. No se consultó el endpoint a mano, porque eso requiere extraer la cookie de
    sesión, y tampoco se leyó la BD directamente.
  - La persistencia se confirma porque la consulta de estado del backend, hecha al reabrir, ya no indica perfil ni
    legales pendientes.
- **Efectos permanentes en Neon `production`:** el perfil de paciente de la cuenta de prueba (con CURP), 2 aceptaciones
  de documentos de prueba («Aviso de privacidad test» y «Terminos y condiciones test»), el evento de auditoría y la
  sesión actual.
- **Hallazgos:**
  - «Mi perfil» sigue mostrando el nombre de Better Auth («Sophy Olague»), no el nombre legal del perfil: la pantalla aún
    no usa `GET /me/profile` (etapa siguiente).
  - El texto de la casilla dice «acepto el Términos y Condiciones»; debería decir «los».
  - Si la CURP choca con la de otra cuenta, el mensaje es genérico a propósito (no revela la cuenta). Desde la app no se
    distingue de otros conflictos.

## Nombre legal en «Mi perfil» y texto de la aceptación (2026-10-26)
Solo pruebas simuladas; sin peticiones reales.

- **Contrato** (`GetPatientProfileUseCase`, `me.controller.ts`): `GET /me/profile` con `SessionGuard` y
  `RolesGuard('patient')`. Responde `{ firstName, lastName, birthDate, curp, phone, address, emergencyContactName,
  emergencyContactPhone, hasPhoto }`. Sin sesión → 401; sin rol de paciente o sin perfil → 403
  `PatientProfileRequiredError`.
- **Cliente:** `getProfile()` y `legalFullName()` en `src/lib/api.ts`, con el mismo `request` autenticado (cookie de
  SecureStore); no hay un cliente nuevo. La CURP de la respuesta no se muestra ni se registra.
- **Pantalla** (`src/app/(app)/(tabs)/options/profile.tsx`), en el lugar donde antes estaba `session.user.name`:
  - Mientras carga: indicador pequeño, sin mostrar ningún nombre. La navegación no se bloquea.
  - Perfil con nombre: nombre(s) y apellidos legales, el mismo criterio que la web.
  - Perfil sin nombre utilizable, o 403 `PatientProfileRequiredError`: el nombre de la cuenta (Better Auth), sin aviso.
  - Red, 5xx o 401: el nombre de la cuenta **y** el aviso «No pudimos cargar tu nombre legal.» con «Reintentar». No se
    presenta como un perfil vacío.
- **Casilla legal** (`complete-registration.tsx`): «He leído y acepto **los** Términos y Condiciones» y «He leído y acepto
  **el** Aviso de Privacidad» (`ACCEPT_LABELS`). La casilla y las validaciones no cambian.
- **Pruebas:**
  - `src/__tests__/profile-screen.test.tsx` (5): nombre legal sin la CURP en pantalla; carga sin nombre; perfil sin nombre
    utilizable → cuenta; 403 → cuenta sin aviso; red → aviso y reintento.
  - `api.test.ts` (+2): `legalFullName`.
  - `registration-gate.test.tsx`: textos exactos de las dos casillas.
- **Validación:**
  - `pnpm test`: 62/62 (8 suites).
  - `tsc`: 7 errores, todos previos.
  - `expo lint`: 3 errores y 18 avisos, todos previos. En `profile.tsx` quedan los avisos originales: `goBack`,
    `handleLogout` e `isPending` sin usar.
  - Biome: 584, sin cambios. En `profile.tsx` solo quedan los avisos que ya tenía el original: `any`, variables sin usar y
    una línea en blanco.
- **Pendiente:** prueba manual en el emulador.

## «Editar información», fase A: solo visualización (2026-10-26)
Solo pruebas simuladas; sin peticiones reales ni escrituras.

- **Antes:** `src/app/(app)/editprofile.tsx` precargaba todo desde `session.user` (la cuenta de Better Auth). Mostraba el
  nombre de la cuenta y dejaba vacíos el teléfono, la dirección y el contacto, porque esos campos no existen en la
  sesión. Además, guardaba con `authClient.updateUser`: `/update-user` está en `disabledPaths`, así que ningún guardado
  llegaba al backend. Aun así mostraba «¡Cambios guardados correctamente!», navegaba a «Mi perfil» antes de validar y
  dejaba un `console.log`.
- **Ahora:**
  - Los datos salen de `getProfile()` (`GET /me/profile`) mediante el hook `usePatientProfile`, con el mismo cliente
    autenticado. La pantalla ya no se bloquea con el `isPending` de la sesión: el estado del perfil vive aparte.
  - Encabezado e inicial del avatar con `legalFullName()`. Mientras carga no se muestra ningún nombre.
  - Con error (red, 5xx, 401): el nombre de la cuenta, «No pudimos cargar tus datos…» y «Reintentar». Con 403
    `PatientProfileRequiredError`: el nombre de la cuenta y «Aún no tienes un perfil de paciente». En ninguno de los
    dos casos se muestran campos vacíos como si fueran datos.
  - Nombre legal y fecha de nacimiento: solo lectura, con la nota de que no se pueden modificar desde esta pantalla. La
    fecha se presenta `AAAA-MM-DD` → `DD/MM/AAAA` con `formatIsoDateForDisplay` (`src/lib/date-format.ts`), solo para
    mostrarla.
  - Teléfono, dirección y contacto de emergencia (nombre y teléfono): precargados con los valores reales. En esta fase
    son de solo lectura; un valor `null` se ve como el texto de marcador «Sin registrar».
  - **Guardado:** el botón «Guardar cambios» está deshabilitado, con el aviso «La edición estará disponible
    próximamente». No se llama a `updateUser` ni a `PATCH /me/profile`. «Cancelar» pasó a llamarse «Volver».
  - La CURP de la respuesta no se muestra ni se registra.
  - Sin cambios: la foto local (sigue guardando solo una URI en SecureStore, fuera de alcance) y el ID de la cuenta.
- **Pruebas:** `src/__tests__/editprofile.test.tsx` (8):
  - Nombre legal en el encabezado y la inicial, sin la CURP.
  - Los cuatro campos y la fecha precargados y de solo lectura.
  - Valores `null`.
  - Carga sin nombre.
  - Error con el nombre de la cuenta y reintento.
  - 403 sin perfil.
  - El botón deshabilitado no llama a `updateUser`, a `fetch` ni a la navegación.
  - `formatIsoDateForDisplay`.

  Con el `editprofile.tsx` original fallan 7 de 8; la de formato de fecha no depende de la pantalla.
- **Validación:**
  - `pnpm test`: 70/70 (9 suites).
  - `tsc`: 7 errores, todos previos.
  - `expo lint`: **2 errores y 17 avisos** (antes 3 y 18; desapareció el `set-state-in-effect` de `editprofile`).
  - Biome: **570** (antes 584). En `editprofile.tsx` quedan avisos del código original: el de la foto (`loadImage` sin
    llamar, desestructuración, bloque sin llaves, variable sin usar) y el orden de los estilos.
- **Fase B:** ver la sección siguiente.

## «Editar información», fase B: guardado con `PATCH /me/profile` (2026-10-26)
Solo pruebas simuladas. **No se probó contra Neon:** la prueba manual requiere autorización aparte.

- **Contrato verificado** (`UpdatePatientProfileDto`, `UpdatePatientProfileUseCase`):
  - `PATCH /me/profile` exige sesión y rol paciente.
  - Solo acepta `phone` (1–30), `address` (1–300), `emergencyContactName` (1–100) y `emergencyContactPhone` (1–30).
    Los valores se recortan y `null` borra el valor.
  - Cualquier otro campo responde 400 (`forbidNonWhitelisted`). Sin campos responde 400 `NoEditableFieldsError`.
  - Respuesta: `{ updated: [...] }`, con un evento de auditoría.
- **Cliente** (`src/lib/api.ts`, con el mismo `request` autenticado que `getProfile`):
  - `updateProfile()`, `diffEditableProfile()`, `validateEditableProfile()`, `EDITABLE_PROFILE_FIELDS` y
    `EDITABLE_PROFILE_LIMITS`.
  - El diff solo incluye los campos que cambiaron. Compara los textos recortados, y un texto vacío (o solo espacios) se
    envía como `null`: el backend rechaza `""`.
- **Pantalla** (`editprofile.tsx`, `ProfileForm`):
  - El nombre legal y la fecha siguen de solo lectura. Los cuatro campos editables se habilitan, con `maxLength` igual
    al del DTO.
  - Antes de enviar: validación de longitudes. Si no hay cambios, «No hay cambios para guardar.» y no se envía nada.
  - Mientras guarda: botón deshabilitado con indicador, así que no hay envíos duplicados. No hay navegación.
  - Éxito: «Cambios guardados.» **solo** tras la respuesta correcta. Lo guardado pasa a ser la nueva base, y otro
    toque sin cambios no reenvía.
  - 4xx: «No pudimos guardar los cambios. …» con el mensaje ya saneado por `api.ts`; los valores escritos se conservan.
    401: «Tu sesión expiró…».
  - Red o 5xx (**ambiguo**): «No pudimos confirmar si se guardaron los cambios…». **No se reintenta.** El botón
    cambia a «Comprobar estado», que pide `GET /me/profile` y compara con lo escrito:
    - Coincide → «Se confirmó que los cambios están guardados.»
    - No coincide → «Los cambios no se guardaron. Puedes intentarlo de nuevo.», conservando lo escrito.
    - Si la comprobación también falla → sigue el estado ambiguo.
  - Sin cambios: la foto local y el resto de pantallas. Nunca se llama a `authClient.updateUser`.
- **Pruebas:**
  - `editprofile.test.tsx` (17).
    - Visualización: nombre legal; precarga; solo lectura del nombre y la fecha; nulos; carga; error de carga con
      reintento; 403.
    - Guardado: solo los campos modificados y recortados, sin campos de solo lectura ni `updateUser`; vaciar → `null`;
      sin cambios no hay petición; longitudes; doble toque bloqueado con éxito solo tras la respuesta y sin navegar;
      nueva base tras guardar; 4xx conserva lo escrito; 401; ambiguo confirmado por `GET` sin reenviar; ambiguo no
      guardado y nuevo intento.
  - `api.test.ts` (+3): diff, validación y `updateProfile` con método `PATCH`, cuerpo y cookie.
- **Validación:**
  - `pnpm test`: 82/82 (9 suites).
  - `tsc`: 7 errores, todos previos.
  - `expo lint`: 2 errores y 17 avisos, igual que tras la fase A.
  - Biome: 572 (570 tras la fase A). Los +2 son `noJsxPropsBind` de `onPress={handleSave}` y `onPress={handleCheck}`,
    el mismo patrón que el resto de la app.
- **Pendiente:** prueba manual de guardado contra Neon `production` (escribe el perfil de la cuenta de prueba y un
  evento de auditoría); requiere autorización aparte.

### Corrección M-1: doble envío por toques casi simultáneos (2026-10-26)
- **Problema:** `saving` y `checking` son estados de React y solo cambian en el siguiente render. Dos toques en el
  mismo frame los veían en `false` y lanzaban dos `PATCH`: el mismo valor, pero dos eventos de auditoría.
- **Corrección:** `src/hooks/use-exclusive-operation.ts`, una guardia con `useRef` (síncrona) **compartida** por
  `handleSave` y `handleCheck` en `editprofile.tsx`.
  - `run()` toma la marca antes de llamar a la operación (antes del primer `await`) y la libera en `finally`, también
    si falla. Si ya hay una operación en curso, no ejecuta nada.
  - `handleSave` consulta `isBusy()` antes de validar, para no mostrar mensajes durante una operación en curso.
  - Sin cambios: estados de carga, mensajes, manejo de resultados ambiguos, API, validación y diseño.
- **Pruebas:**
  - `use-exclusive-operation.test.ts` (4): dos llamadas en el mismo tick → una ejecución; guardar contra comprobar
    → la segunda no se ejecuta; liberación tras éxito; liberación tras error (que se propaga). Con la guardia
    desactivada, fallan las dos primeras.
  - `editprofile.test.tsx` (+2): tras un error de guardado se puede volver a guardar; tras una comprobación fallida se
    puede comprobar de nuevo.
  - RNTL 14 no puede disparar dos eventos en el mismo frame sin superponer `act()` (lo intenté y contamina las pruebas
    siguientes), así que la concurrencia real se prueba en el hook.
  - Además, cada prueba de la pantalla reinicia `getProfile` y `updateProfile` (`mockReset`), para que no le
    queden respuestas sin consumir de otra prueba.
- **Validación:**
  - `pnpm test`: 88/88 (10 suites).
  - `tsc`: 7 errores, todos previos.
  - `expo lint`: 2 errores y 17 avisos, todos previos.
  - Biome: 572, igual que antes de M-1. Hay dos `biome-ignore` justificados para `noUnnecessaryConditions`: Biome no
    sigue los cambios del ref.

### Prueba manual del guardado (M-1) contra Neon `production` (2026-10-26)
Autorizada específicamente para esta prueba puntual. Backend local → BD de Neon.

- **Identidad de la rama, confirmada en la propia BD:** sesión de `psql` con `default_transaction_read_only=on` que
  consulta los parámetros de la compute: `neon.branch_id = br-royal-recipe-b54s5hnn`,
  `neon.endpoint_id = ep-wandering-bonus-b5kxacor`, `neon.project_id = royal-paper-10258990`. El nombre `production` no
  se expone en la BD; se identificó por el ID. No se imprimió `DATABASE_URL`.
- **Cuenta:** la de prueba de M2 (alias `+prueba2`). En solo lectura: 1 cuenta, verificada, rol `patient`, con perfil
  de usuario y de paciente, y los **4 campos editables en `null`**.
- **Instantáneas de solo lectura**, sin datos personales: banderas de nulo, `md5` de nombre/apellidos/CURP/fecha
  (para detectar cambios sin exponerlos), fechas de actualización y conteos de auditoría.

| Paso | Resultado |
|---|---|
| Escribir «Calle Ficticia 100 Prueba M1» (sintético) en Dirección y **dos toques en paralelo** a «Guardar cambios» (`adb shell "input tap … & input tap … & wait"`) | «Cambios guardados.». En la BD, `address` = el valor sintético (comprobado como booleano) y **1** evento `identity.patient_profile.updated` con `{"fields":["address"]}` |
| Reabrir la pantalla | Dirección muestra el valor guardado (nuevo `GET /me/profile`) |
| Restaurar: vaciar Dirección y guardar (un toque, envía `address: null`) | «Cambios guardados.». En la BD, `address` vuelve a `null`; 2.º evento, también `{"fields":["address"]}` |
| Comparación con el estado inicial | Solo cambiaron `patient_profile.updated_at` y +2 eventos de auditoría (de 3 a 5). Igual que antes: los otros 3 campos (`null`), el `md5` de identidad, `user_profile.updated_at`, el rol y las 2 aceptaciones legales |

- **Concurrencia (M-1):** los dos toques en paralelo produjeron **un solo** `PATCH` (1 evento). **Límite:** no se puede
  asegurar que los dos toques cayeran en el mismo frame de React. La exclusión entre guardar y comprobar no se puede
  provocar desde la interfaz, porque nunca se ven los dos botones a la vez. Ambos casos están probados en
  `use-exclusive-operation.test.ts`.
- **Logs:** 0 cadenas con forma de CURP en logcat, Metro y el backend; sin errores ni avisos en el backend.
- **Efecto permanente:** 2 eventos de auditoría (`identity.patient_profile.updated`, solo agregar). El perfil quedó
  como estaba.

## Pagos de consulta con Stripe (2026-11-16)

Mismo flujo que `apps/web` (Payments, `docs/arquitectura/Payments-decisiones.md` §8: Stripe en modo TEST). Sustituye
al Card Payment Brick de Mercado Pago, que se retiró de la app. El backend no cambió.

| Elemento | Valor |
|---|---|
| SDK | `@stripe/stripe-react-native` 0.64.0 (versión de Expo SDK 57), con su config plugin en `app.json` sin Apple Pay ni Google Pay |
| Variable | `EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY`: clave PUBLICABLE (`pk_test_…`). Una clave `sk_…` o `rk_…` deshabilita el pago |
| Pantalla | `src/app/(app)/pago.tsx`, con `StripeProvider` solo en esa pantalla; `src/lib/stripe.ts` |

### Flujo y endpoints
1. `GET /me/patient/appointments/:id`: importe y estado de la cita (solo `pending_payment` admite pago).
2. `CardField` captura la tarjeta y `createPaymentMethod` crea el `pm_…`. Si Stripe no puede leer la tarjeta, se
   muestra su mensaje y no se llama al backend.
3. `POST /me/patient/appointments/:id/payment` con `Idempotency-Key` y cuerpo `{ token: "pm_…" }`, sin importe. El
   backend crea y confirma el PaymentIntent y confirma la cita con M08.
4. 3-D Secure: si la respuesta es `processing` con `nextAction`, `handleNextAction` muestra el reto (regreso a
   `gestinovo://stripe-redirect`) y después `POST /me/patient/payments/:paymentId/sync` da el estado real. Cancelar el
   reto no confirma nada: se muestra el estado del backend.
5. La consulta solo se muestra confirmada si el backend lo indica. «Consultar estado del pago» vuelve a usar `sync`.

La clave de idempotencia vive en SecureStore (nunca datos de la tarjeta). Se conserva tras errores de red y se renueva
tras un rechazo o una cancelación. El `client_secret` del reto solo vive en memoria.

### Pruebas
- Automatizadas (Jest, SDK de Stripe y backend simulados): `src/__tests__/pago-screen.test.tsx`, 13 casos.
- Build de desarrollo de Android con Stripe (2026-11-16): `./gradlew assembleDebug` con el JDK 21 de Android Studio,
  BUILD SUCCESSFUL; el módulo nativo `stripe_stripe-react-native` quedó enlazado por autolinking. `android/` (ignorada
  por git) no se regeneró: el config plugin de Stripe, sin Apple Pay ni Google Pay, no cambia el proyecto Android.
- Prueba manual en Android con Stripe TEST (2026-11-16): **superada**, según informó la responsable del producto.
  Flujo comprobado: reserva de un horario, pantalla de pago y pago con tarjeta en Stripe TEST contra el backend local.
  No se registraron aquí las tarjetas usadas ni el resultado del reto 3-D Secure, la cancelación o el rechazo; esos
  casos solo tienen cobertura automatizada (simulada).
- Pendiente: prueba en iOS (no hay build de iOS).

## Etapa 3: sala de espera de videoconsulta (2026-11-22)

- `joincall.tsx` usa los endpoints reales de `modules/video`: entrar (`/session/enter`), latido cada 15 s
  (`/session/presence`), salida voluntaria con confirmación (`/session/leave`) y credencial tras la admisión
  (`/session/token`). Lógica en `src/hooks/use-video-session.ts`; mensajes en `src/components/video/waiting-room-status.tsx`.
- Reconexión: sin red se muestra «Se perdió la conexión»; si el backend cerró la presencia (más de 45 s sin latido),
  el siguiente latido vuelve a entrar.
- `pendingResolution` se explica sin cerrar la cita. Las inasistencias registradas se informan y detienen los latidos.
- Credencial: la llamada (`realtimekit-call.tsx`) solo se monta con un token real de proveedor `realtimekit`. Hoy el
  backend responde 422 (proveedor sin configurar) y la app muestra ese mensaje, con «Reintentar».
- Pruebas: `joincall.test.tsx` (fetch y WebRTC simulados). No probado en emulador ni contra el backend local.
- Reaceptación legal (D-37, RN-140), resuelta el 2026-11-22: el backend añade `legal.reacceptanceRequired` a
  `GET /me/registration-status` (perfil completo y alguna vez aceptado un régimen completo del paciente, según
  `user_legal_acceptance`). Con ese indicador el gate muestra la app con un aviso «Revisar y aceptar»; sin él (o en falso)
  conserva el bloqueo del registro inicial. Agendar lo sigue rechazando el backend y `seleccionfecha.tsx` lo explica.
