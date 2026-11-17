# PEI — Revisión metodológica previa al entrenamiento

**Auditoría estática y pruebas reproducibles · 2026-11-16**  
**Alcance:** exclusivamente los CSV sintéticos, el generador/pipeline Python y referencias de esquema/diseño PEI ya presentes en el repositorio. No se usaron datos reales ni se entrenó un modelo.

> **Estado:** informe histórico de la versión anterior del dataset (Fase 2.5). Sus hallazgos de disponibilidad no resuelta motivaron la versión corregida v2. Para la metodología vigente, reglas de timestamps y conteos corregidos, consultar [`05-correccion-temporal-dataset.md`](05-correccion-temporal-dataset.md). Los archivos v1 y sus artefactos se conservaron.

## Conclusiones ejecutivas

- La definición actual corresponde a **inasistencia exclusiva del paciente**: sólo `patient_no_show` es positivo. En los 8,727 casos elegibles hay 1,804 positivos (20.67%).
- Para predecir **si el paciente estará ausente**, la definición A es más directa: incluye `both_no_show`, pues el paciente también está ausente aunque el médico falte. Da 1,895 positivos (21.71%). La B responde una pregunta distinta: ausencia del paciente atribuible en solitario bajo el outcome del generador, con el médico presente.
- Ambas etiquetas son reproducibles desde `final_outcome`. El pipeline preserva el target vigente como `y_patient_no_show` y agrega el experimento alternativo `y_patient_absent_any` en los CSV de y procesados. El CSV sintético original no se cambia.
- La partición actual tiene orden estricto train → validation → test, sin timestamps compartidos entre límites; el `ColumnTransformer` se ajusta sólo con train. Es apropiada como baseline académico cronológico, con limitaciones de periodo único y proporciones por cantidad de filas.
- No se puede confirmar disponibilidad de outcomes históricos: el CSV no incluye cuándo terminó cada cita ni cuándo se registró cada outcome. El `scheduled_at` previo sólo establece que una cita empezó antes. Se encontraron cuatro eventos previos del mismo paciente iniciados dentro de 30 minutos de otra cita; y el diseño de PEI dice que la consulta real puede exceder el bloque de agenda. Por lo tanto, `prior_*` basadas en outcomes no están temporalmente certificadas al corte inmediatamente anterior a la cita.

## 1. Objetivos binarios comparados

La población es la seleccionada mediante `label_eligible == 1`, sin usar `final_outcome` para escoger los casos. Se valida aparte que el indicador y la etiqueta correspondan con el resultado simulado.

| Resultado de auditoría | Casos | A: ausencia del paciente | B: ausencia exclusiva del paciente |
|---|---:|---:|---:|
| `attended` | 6,388 | 0 | 0 |
| `patient_no_show` | 1,804 | 1 | 1 |
| `doctor_no_show` | 444 | 0 | 0 |
| `both_no_show` | 91 | 1 | 0 |
| **Elegibles** | **8,727** |  |  |
| **Positivos** |  | **1,895 (21.71%)** | **1,804 (20.67%)** |
| **Negativos** |  | **6,832 (78.29%)** | **6,923 (79.33%)** |

**A — `y_patient_absent_any`:** “¿Estuvo ausente el paciente?” `patient_no_show` y `both_no_show` son positivos. Este target contesta literalmente la ausencia del paciente, sin dejar que la asistencia del médico cambie la etiqueta del paciente.

**B — `y_patient_no_show` actual:** “¿Se registró `patient_no_show`?” Sólo ese outcome es positivo; `both_no_show` permanece negativo. Es más útil para estudiar el caso en que el sistema atribuye no-show al paciente y el médico sí estuvo disponible, pero no mide toda ausencia del paciente.

**Recomendación:** usar A como experimento principal si el producto quiere anticipar ausencia física/conexión del paciente. Conservar B como experimento secundario para el outcome operacional exclusivo. Ambos targets quedan guardados en cada `y_train.csv`, `y_validation.csv` y `y_test.csv`, con nombres explícitos. X no incorpora ninguno. No se cambió la etiqueta del CSV original ni el nombre/semántica de `y_patient_no_show`.

## 2. Corte y disponibilidad temporal

Se conserva el corte definido en Fase 2.5: **instante inmediatamente anterior a `scheduled_at`**. Para cada variable se reconstruyó el historial del generador usando el mismo paciente, `0 < current.scheduled_at - prior.scheduled_at <= 90 días`, y se comprobaron los agregados contra los valores escritos.

| Característica | Eventos usados por el generador | ¿Inicio anterior al corte? | ¿Resultado disponible antes del corte? | Hallazgo |
|---|---|---|---|---|
| `prior_appointments_90d` | Toda cita sintética previa del paciente en 90 días, sin importar su resultado | Sí, su inicio programado es anterior | El mero conteo/registro de una reserva puede estar disponible, pero no se conserva `created_at` de cada evento en el agregado para verificarlo por fila | 7,972 de 10,000 filas tienen al menos un evento en historial. No depende del outcome; semánticamente cuenta citas previas programadas, no necesariamente citas atendidas/terminadas. |
| `prior_attended_rate` | Proporción de todos los eventos anteriores que son `attended` o `doctor_no_show` | Sí | **No verificable**: depende de outcome y no hay `outcome_available_at` ni fin de encuentro | Denominador incluye todos los outcomes, también cancelación/reprogramación; esto no es una tasa condicionada sólo a citas celebradas. |
| `prior_patient_no_show_count` | Conteo previo con outcome `patient_no_show` | Sí | **No verificable**: no-show se determina después de ventanas/participación de la cita y no hay instante de resolución en CSV | Una cita solapada puede no haber resuelto su estado al siguiente corte. |
| `prior_cancel_count` | Conteo previo con outcome `canceled` | Sí | **No verificable**: no hay timestamp sintético de cancelación | En PEI existe `appointment.cancelled_at`, pero no se incluyó en los archivos sintéticos. |
| `prior_reschedule_count` | Conteo previo con outcome `rescheduled` | Sí | **No verificable**: no hay timestamp sintético de transición/reprogramación | PEI registra historial de estado, pero no se simuló el momento en que se produjo la transición. |

### Solapamiento y evidencia cuantificada

La auditoría reproducible `audit_prior_feature_timing()` (`src/mineria_datos/data/temporal_audit.py`) reporta:

| Medición | Valor |
|---|---:|
| Filas inspeccionadas | 10,000 |
| Filas con historial previo | 7,972 |
| Contribuciones evento-historial | 17,810 |
| Pares previos del mismo paciente con inicio a menos de 30 min del corte actual | 4 |
| Pares con timestamp programado exactamente igual | 0 |
| Timestamps de disponibilidad de outcome en el CSV | 0 |

De las cuatro contribuciones dentro de esa ventana, dos participan en `prior_patient_no_show_count`; las cuatro participan en el denominador de `prior_attended_rate`. Ninguna correspondió a cancelación o reprogramación. El threshold sólo identifica casos que podrían seguir abiertos bajo una duración de 30 minutos; no demuestra su outcome ni su instante de resolución.

30 minutos es sólo una ventana de sensibilidad, no un máximo probado. `apps/backend/src/db/schema/doctor.ts` da 30 minutos por defecto a `appointmentDurationMinutes`, pero el diseño `docs/arquitectura/M08-diseno.md` aclara que el bloque de agenda no termina ni limita la videoconsulta. Además, la determinación de no-show depende de tiempos de tolerancia/espera/reconexión en `apps/backend/src/modules/appointments/domain/cancellation-policy.ts` y el diseño M08. Una diferencia mayor a 30 minutos tampoco demuestra que el outcome ya estuviera disponible.

**Resultado metodológico:** hay riesgo concreto de que outcomes de citas anteriores aún abiertas se hayan incorporado a las variables `prior_*`; el CSV no permite demostrar en cuántas filas estuvieron resueltos al corte. No afirmamos que las cuatro ventanas cortas sean las únicas filas afectadas.

### Corrección recomendada

Para poder entrenar con el corte pre-cita usando historial, generar eventos con `outcome_available_at` (y, de ser posible, `started_at`, `ended_at`, transición/status timestamp y cancelación timestamp). Al computar cada fila, incluir una contribución basada en outcome sólo cuando `outcome_available_at < prediction_at`. Registrar simultaneidad y solapamiento. Para `prior_appointments_90d`, definir si se cuentan reservas existentes o citas efectivamente realizadas; nombrar cada agregado según su semántica.

Con los CSV actuales no se puede recalcular correctamente esas features; falta el tiempo de disponibilidad, no sólo una regla de transformación. Antes de la corrección, la opción segura para una auditoría de corte pre-cita es excluir de X las cuatro columnas dependientes de outcome (`prior_attended_rate`, `prior_patient_no_show_count`, `prior_cancel_count`, `prior_reschedule_count`) y decidir si `prior_appointments_90d` se mantiene como mero conteo de citas previamente programadas. La preparación actual aún las incluye para conservar la corrida comparable con Fase 2.5; no debe considerarse fuga resuelta.

## 3. Partición y ajuste del preprocesador

Se comprobó con `data/processed/summary.json` y pruebas que:

| Conjunto | Filas | Desde UTC | Hasta UTC |
|---|---:|---|---|
| Train | 6,108 | 2025-01-01 02:32:22 | 2025-09-13 11:55:59 |
| Validation | 1,309 | 2025-09-13 13:09:48 | 2025-11-08 06:05:54 |
| Test | 1,310 | 2025-11-08 06:54:56 | 2025-12-31 23:55:30 |

- Orden estricto: `max(train) < min(validation) < min(test)` y el máximo de validation precede a test.
- No hay timestamps compartidos entre conjuntos. La función falla si un mismo timestamp cruza un límite.
- Los registros de train terminan antes de validation/test. El generador recorre citas por fecha programada y el historial de una fila sólo toma eventos con `scheduled_at` estrictamente anterior; no usa resultados de citas programadas en el futuro. Las citas anteriores aún no resueltas siguen siendo el riesgo de disponibilidad descrito arriba.
- `prepare()` ajusta `ColumnTransformer` sólo mediante `processor.fit(splits["train"][x_columns])`; validation y test reciben únicamente `transform()`.
- Imputadores, media/desviación del escalado y categorías one-hot se aprenden del train. `OneHotEncoder(handle_unknown="ignore")` maneja categorías nuevas sin volver a ajustar.

La separación es adecuada para un prototipo académico inicial: evita una evaluación aleatoria que mezcle periodos y permite conservar un test final. Sus límites son un solo año sintético, un único corte y particiones por número de filas en lugar de cortes definidos por calendario. Para conclusiones más sólidas, usar varios cortes temporales/backtesting, mantener el test final intacto y volver a verificar el linaje temporal de todas las features.

## Riesgos adicionales

- A y B no deben confundirse: B puede etiquetar como negativo un paciente ausente en `both_no_show`.
- `patient_id`/`doctor_id` se excluyen de X; `appointment_id` tampoco es predictor. Los manifiestos conservan ID/fecha sólo para trazabilidad.
- `final_outcome`, `patient_joined`, `doctor_joined` y `label_eligible` no entran a X. `label_eligible` sólo filtra población y luego se elimina.
- Los resultados sintéticos están influidos por perfiles y reglas escritos por el generador; su distribución no estima datos reales ni representa prueba de rendimiento.
- Variables calendario están en UTC, no en la zona horaria local configurada en PEI.
- No se simulan `outcome_available_at`, cambios de estado, cancelación temporal, duración real ni varias cadenas de reagenda; esto limita auditoría de históricos.

## Pruebas reproducibles realizadas

Comando ejecutado desde la raíz:

```powershell
python -m unittest discover -s tests/mineria_datos -v
```

**16 pruebas aprobadas, 0 fallidas.** Cubren:

- Reglas/cantidad de elegibles y distribución observada.
- Dos objetivos y sus conteos; la alternativa se deriva de `both_no_show` sin alterar el CSV fuente.
- Consistencia etiqueta/outcome y exclusión de cancelados/reprogramados mediante `label_eligible`.
- Ausencia de IDs, y, outcomes y columnas de auditoría en X.
- Filas sin duplicar y cortes temporales estrictos.
- Reconstrucción de cada contador y tasa `prior_*`; reporte de overlaps y timestamp de outcome ausente.
- Reproducibilidad de transformación y evidencia de que las categorías one-hot corresponden a train.

Para reproducir la auditoría temporal por separado:

```powershell
python -c "import json; from src.mineria_datos.data.temporal_audit import audit_prior_feature_timing; print(json.dumps(audit_prior_feature_timing(), indent=2))"
```

No se modificaron los CSV originales ni se entrenaron modelos.

## Recomendaciones antes de entrenamiento

1. Confirmar como objetivo primario A o B según decisión de producto; mantener el otro como análisis de sensibilidad.
2. Elegir punto real de intervención/predicción: al reservar, 24 horas antes, o justo antes de la cita. Cada corte requiere recalcular disponibilidad e historial.
3. Añadir tiempos sintéticos de finalización/disponibilidad al generador y regenerar en una versión de datos identificada, conservando los archivos previos para reproducibilidad.
4. Recalcular historial as-of por `prediction_at`; no confiar en `scheduled_at` previo como sustituto de outcome resuelto.
5. Definir denominador y semántica de `prior_attended_rate`; separar citas programadas, realizadas, canceladas, reprogramadas y outcomes sin adjudicar.
6. Repetir auditoría temporal, pruebas y particiones después de corregir los datos. Mantener test bloqueado y entonces iniciar evaluación de baselines/modelos.
