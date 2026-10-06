# Contradicciones entre el documento de dualidad y el Documento Maestro V2.2

Criterio acordado:

- **Documento Maestro V2.2**: fuente de verdad del comportamiento del producto.
- **Documento de dualidad**: fuente de verdad de los entregables académicos.

Cuando un ejemplo de un entregable contradice al Maestro o a la arquitectura real, el entregable se cumple como análisis,
comparación o propuesta; no se implementa ni se convierte en requisito del producto.

| Materia | Ejemplo del documento de dualidad | Qué establece el Maestro o la arquitectura real | Tratamiento |
|---|---|---|---|
| Arquitectura Orientada a Servicios | WS-*, SOAP, WSDL, XSD y ESB | API REST principal y GraphQL selectivo | Análisis comparativo (contrato, tipos, mensaje, bus) frente a la arquitectura real; no se implementa SOAP ni ESB |
| Seguridad de la Información | SHA-256 para contraseñas | Better Auth con su propio hashing de contraseñas (RNF-01) | Se documenta por qué un hash rápido como SHA-256 no es adecuado para contraseñas; no se modifica Better Auth |
| Seguridad de la Información | Permisos delegados a una "secretaria" | RN-001: un único rol de dominio (patient, doctor, admin, organization) | No se crea el rol; se analiza la delegación como concepto |
| Seguridad de la Información | 2FA, bloqueo por intentos fallidos, sesiones o JWT de corta duración, AES-256 en la BD, biometría móvil | No son requisitos del Maestro | Controles propuestos, análisis y recomendaciones; no se implementan automáticamente |
| Minería de datos | Clustering por diagnóstico, zonas geográficas o familia / seguro médico | RN-126 y RN-129: los modelos no usan datos clínicos ni de identidad | No se implementa; la segmentación usa surtidos y asistencia (RF-57, RF-58) con datasets ficticios (RNF-20) |
| Minería de datos | Ejemplos con "Cardiología" | Especialidades del esquema: infectología, psicología y medicina general | Los ejemplos de OLAP usan las especialidades reales |
| Programación para Móviles II | Room, Retrofit, SharedPreferences, CoreData, Firebase / Supabase | App móvil con Expo / React Native | Se documenta con la tecnología real del proyecto |

Se completará conforme cada módulo genere su evidencia.
