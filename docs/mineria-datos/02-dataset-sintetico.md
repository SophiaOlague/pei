# PEI — Dataset sintético para Minería de Datos

**Fase 2 · Generador reproducible**  
**Fecha:** 2026-11-16  
**Referencia obligatoria:** [`01-diagnostico-datos-PEI.md`](01-diagnostico-datos-PEI.md)

## Resultado

Se generaron 10,000 filas ficticias de citas programadas entre `2025-01-01T00:00:00Z` y `2026-01-01T00:00:00Z`, con semilla `20261116`. El prototipo es independiente del backend, no se conecta a servicios ni requiere dependencias instalables.

Archivos resultantes:

- [`appointments_synthetic.csv`](../../data/synthetic/appointments_synthetic.csv): predictores disponibles antes de la cita y la columna objetivo `y_patient_no_show`.
- [`appointments_synthetic_audit.csv`](../../data/synthetic/appointments_synthetic_audit.csv): outcome simulado posterior, elegibilidad y marcas de presencia para auditoría. No usar este archivo como entrada de entrenamiento.
- [`generation.json`](../../config/generation.json): configuración reproducible.
- [`diccionario-variables-sintetico.md`](diccionario-variables-sintetico.md): tipos y definiciones completos.

Cada fila del archivo principal representa una cita. `y_patient_no_show` es la etiqueta objetivo y debe separarse de las columnas predictoras. Excluir además `appointment_id`, `patient_id` y `doctor_id` de cualquier matriz de características.

## Generación y patrones simulados

El módulo `src/mineria_datos/data/generator.py` usa `random.Random(seed)` y UUID v4 deterministas derivados del mismo generador pseudoaleatorio. Se crean universos sintéticos de 1,200 pacientes, 60 médicos y ocho especialidades. La asignación de especialidad es ficticia. Cada evento recibe hora programada, fecha de creación anterior, tipo de cita y relaciones con los identificadores sintéticos.

Los pacientes se asignan a tres perfiles latentes: alta asistencia (55%), variable (30%) y frecuencia mayor de inasistencia (15%). El riesgo individual también cambia con anticipación, día de semana, distancia respecto a las 11:00, tipo de cita y el historial previo. El resultado se muestrea en función de pesos configurables y luego se ajusta por la propensión latente de inasistencia del paciente; por eso los pesos son ponderaciones de generación, **no cuotas exactas** del resultado final.

La reserva de emergencia representa el 8% por configuración y recibe anticipación corta (hasta 12 horas). Las citas programadas reciben anticipación con distribución exponencial y un tope de 90 días. `created_at` se deriva de `scheduled_at - lead_time`; una cita puede crearse antes del comienzo del periodo de citas al tener anticipación previa.

### Historial as-of y prevención de fuga

Las citas se generan y ordenan cronológicamente por `scheduled_at`. Antes de simular el resultado de cada cita, se calculan sus cuatro contadores y tasa usando exclusivamente citas sintéticas anteriores del mismo paciente cuya hora programada cae en los 90 días previos. La cita actual y las citas futuras no participan. La tasa de asistencia considera `attended` y `doctor_no_show` como asistencia del paciente; no cuenta `both_no_show`, cancelaciones ni reprogramaciones como asistencia.

El resultado actual y marcas `patient_joined`/`doctor_joined` se guardan sólo en el archivo de auditoría. Aunque el objetivo binario está en el CSV principal, es una etiqueta supervisada, no una característica: el pipeline de entrenamiento deberá seleccionarla como `y` y excluirla de `X`. Las columnas posteriores de auditoría no deben unirse al entrenamiento.

## Tratamiento de outcomes

| `final_outcome` en auditoría | `y_patient_no_show` | `label_eligible` | Tratamiento |
|---|---:|---:|---|
| `attended` | 0 | 1 | Paciente atendió. |
| `patient_no_show` | 1 | 1 | Único caso positivo del objetivo. |
| `doctor_no_show` | 0 | 1 | Paciente presente, médico ausente; outcome separado. |
| `both_no_show` | 0 | 1 | Ambos ausentes; no se etiqueta como no-show exclusivo del paciente. |
| `canceled` | 0 | 0 | Se conserva en el dataset de generación pero debe excluirse del universo de entrenamiento/evaluación etiquetable. |
| `rescheduled` | 0 | 0 | Cita anterior sustituida/reprogramada; no es inasistencia. |

En esta simulación, la clase de cancelación no distingue actor y `rescheduled` es un resultado final separado; no se crea la cita nueva de la cadena de reprogramación. `label_eligible` permite filtrar cancelaciones/reprogramaciones. En las filas restantes, la etiqueta binaria positiva identifica únicamente el no-show del paciente.

## Distribución observada

| Resultado | Filas | Porcentaje |
|---|---:|---:|
| `attended` | 6,388 | 63.88% |
| `patient_no_show` | 1,804 | 18.04% |
| `doctor_no_show` | 444 | 4.44% |
| `both_no_show` | 91 | 0.91% |
| `canceled` | 887 | 8.87% |
| `rescheduled` | 386 | 3.86% |
| **Total** | **10,000** | **100.00%** |

Entre las 8,727 filas elegibles, 1,804 son positivas (20.67%). Los porcentajes son una salida de esta configuración/semilla; la proporción cambia al ajustar semilla, parámetros o distribución.

## Validaciones implementadas

`validate()` falla ante longitud incorrecta, identificadores de cita duplicados, universos mayores a la configuración, columnas de atributos personales prohibidas, timestamp/anticipación incoherentes, tipo o etiqueta fuera de catálogo, variables de calendario inconsistentes, tasa fuera de `[0,1]`, historial previo inconsistente o etiqueta distinta del outcome de auditoría. Además, cada identificador de fila es UUID generado por el PRNG local. Las pruebas verifican reproducibilidad, efecto de la semilla, etiquetas separadas, historia temporal y anticipación inválida.

La validación de “ausencia de datos personales” verifica una lista de nombres de columnas prohibidos y el esquema fijo generado; no es un escáner semántico de texto. El generador no incluye nombres, CURP, teléfonos, correos, fechas de nacimiento, dirección ni texto clínico. Todos los valores categóricos y los identificadores se crean desde código/configuración local sin muestreo de PEI.

Se ejecutó el generador dos veces con la misma configuración. SHA-256 coincidente entre ejecuciones:

- Dataset: `22E74378DCE16ECF3BF8AF4219CE810C64CD74DA5AA9B146BE0A69F29586D282`
- Auditoría: `2092C1EF1542553122617BC5A5B74169C8D477060E2BD4F404A8DF6213A1C272`

## Limitaciones

- Los outcomes son simulados y no estiman la frecuencia real de PEI. Tampoco representan evidencia de rendimiento predictivo.
- Perfiles latentes y probabilidades son reglas sintéticas; no se entrenó ni evaluó un modelo.
- Los pesos de outcomes no garantizan proporciones exactas porque el resultado de paciente se modula por comportamiento e historial.
- En el CSV de features el target vale 0 para cancelación y reprogramación por formato binario, aunque esas filas no son casos negativos comparables: deben filtrarse usando `label_eligible=1` desde el archivo de auditoría en un paso de preparación controlado. Nunca usar columnas posteriores como predictores.
- La simplificación de estados no incorpora pagos, transiciones correctivas, timestamps de conexión reales, políticas de cancelación ni cadena de reprogramación de PEI.
- Los derivados `weekday`, `hour` y `month` son UTC para reproducibilidad; la agenda de PEI tiene una convención horaria local que requerirá definición explícita al integrar.
- Los agregados históricos sólo consideran un horizonte fijo de 90 días, y la tasa usa todas las citas previas en ventana como denominador.

## Ejecución y pruebas

Desde la raíz del repositorio, con Python 3.10+:

```powershell
python -m src.mineria_datos.data.generator --config config/generation.json --output-dir data/synthetic
python -m unittest discover -s tests/mineria_datos -v
```

La configuración permite cambiar `n_records`, `period_start`, `period_months`, `seed`, `n_patients`, `n_doctors`, `specialty_codes`, `emergency_share` y `outcome_distribution`. Este último contiene pesos para `attended`, `patient_no_show`, `doctor_no_show`, `both_no_show`, `canceled` y `rescheduled`; deben ser no negativos y sumar más de cero.

Resultado de pruebas ejecutadas: **6 pruebas aprobadas** con `unittest` (estructura/cantidad, reproducibilidad, semilla, separación de outcomes, consistencia histórica y rechazo de anticipación negativa). No se instaló ninguna dependencia.

El flujo de datos es una etapa de construcción de dataset ficticio exclusivamente. No se considera terminado ningún modelo predictivo.
