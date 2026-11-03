# M03: datos de QA en `production`

Registro de las cuentas creadas en `production` durante las pruebas con sesión real del registro profesional web
(2026-11-03). Ninguna se eliminó ni se modificó después; no se deben borrar ni editar desde aquí.

## Cuentas de QA válidas

| Uso | Correo | Identificadores | Estado |
|---|---|---|---|
| Médico de QA del flujo profesional | `fridaolague+prueba04@hotmail.com` | `user` `3wkrZTOY91rPjMQs0o2Gasl54CJHXwQ9`; `user_profile` `d7993947-dbcf-4bcd-bf1d-653fde16b0fa`; `doctor_profile` `58ec97c3-7dbe-4743-b8b7-b7ce560ddd02` | Correo verificado; rol `doctor`; nombre «QA Médico»; CURP sintética `XOXX480903HNEXXXU2`; Medicina general; aceptó `privacy_policy@dev-1` y `doctor_terms@dev-1` (2026-11-03 06:22:30 UTC); sin INE, cédula ni foto; registro en proceso, sin aprobación administrativa |
| Paciente de QA (inicio de sesión y separación de roles) | `fridaolague+prueba03@hotmail.com` | `user` `jjowzZdtXkqNkt2rK1WNitFmhxjbmXGB` | Existente desde 2026-10-26; solo se usó para iniciar y cerrar sesión; su perfil no cambió |

Eventos de auditoría generados: `doctor.profile.created` y dos `identity.legal_document.accepted`.

## Registro accidental (excluido de QA)

`fridaolague-prueba03@hotmail.com` (`user` `Q8EN92VbyxuA9hnTWS45jPJj0f3E4znF`, 2026-11-03 06:16:31 UTC) se creó por error al
escribir el alias con guion en lugar de `+`. **No es una cuenta de prueba válida ni forma parte de los escenarios de
M03.** Está sin verificar, sin sesiones, sin perfil y sin rol; el correo de verificación se envió a esa dirección, que no
pertenece al buzón de QA. Por decisión de la responsable del producto no se elimina ni se modifica; se excluye de los
registros y reportes de cuentas de QA válidas.

## Pendientes

- Cuando se publiquen los textos legales definitivos, el médico de QA deberá aceptarlos de nuevo (hoy aceptó `dev-1`).
- La gestión posterior de estos registros (conservación o baja) queda pendiente de decisión.
