# PEI — Preparación del dataset para Machine Learning

**Fase 2.5 · Pipeline de preparación, sin entrenamiento**  
**Fecha:** 2026-11-16  
**Referencias:** [`01-diagnostico-datos-PEI.md`](01-diagnostico-datos-PEI.md), [`02-dataset-sintetico.md`](02-dataset-sintetico.md)

## Flujo

1. Leer los archivos reales `data/synthetic/appointments_synthetic.csv` (17 columnas) y `appointments_synthetic_audit.csv` (5 columnas).
2. Verificar unicidad y coincidencia 1:1 de `appointment_id`.
3. Unir por ese identificador y comprobar consistencia de etiqueta/outcome. **La selección de población se hace exclusivamente con `label_eligible == 1`.**
4. Ordenar elegibles cronológicamente por `scheduled_at`.
5. Separar periodo inicial/intermedio/final en train/validation/test.
6. Ajustar imputadores, escalador y codificador sólo con X de entrenamiento. Transformar validación/prueba con ese mismo objeto ya ajustado.
7. Guardar X transformada, y, manifiestos y preprocesador en `data/processed/`, sin sobrescribir los CSV originales.

Código: `src/mineria_datos/data/prepare.py`; configuración: `config/preparation.json`. No se entrenó ni evaluó un clasificador.

## Elegibilidad y etiqueta

De 10,000 registros fuente, 8,727 tienen `label_eligible=1` y pasan a los conjuntos. Los 1,273 registros con valor 0 se excluyen. Como comprobación de integridad, se verifica que el indicador concuerde con la tabla de outcomes esperada; el pipeline no calcula elegibilidad a partir de `final_outcome`.

Son elegibles `attended` (y=0), `patient_no_show` (y=1), `doctor_no_show` (y=0) y `both_no_show` (y=0). En el alcance del generador, todos son resultados observados de citas que llegaron a un resultado de asistencia; la ausencia de ambos o del médico no prueba la inasistencia exclusiva del paciente. Por eso sólo `patient_no_show` es positivo. `canceled` y `rescheduled` (label_eligible=0) se excluyen: no representan el resultado de asistencia de la cita original y sus ceros en el CSV de origen son valores de conveniencia, no negativos válidos para el problema.

### Distribución elegible

| Resultado simulado (auditoría; sólo descriptivo) | y | Filas |
|---|---:|---:|
| `attended` | 0 | 6,388 |
| `patient_no_show` | 1 | 1,804 |
| `doctor_no_show` | 0 | 444 |
| `both_no_show` | 0 | 91 |
| **Total elegible** |  | **8,727** |
| **Clase 0** | 0 | **6,923 (79.33%)** |
| **Clase 1** | 1 | **1,804 (20.67%)** |

`final_outcome` se usa sólo para validar el cruce y resumir las clases, no para seleccionar filas ni como X.

## Predictores y columnas excluidas

### Columnas fuente de X

| Campo | Tipo detectado | Tratamiento |
|---|---|---|
| `specialty_code` | Categórico | Imputación por moda si faltara; one-hot con categorías desconocidas ignoradas. |
| `appointment_type` | Categórico | Imputación por moda si faltara; one-hot. |
| `lead_time_hours` | Numérico | Imputación por mediana si faltara; estandarización. |
| `weekday`, `hour`, `month` | Numérico | Mediana y estandarización. Son derivados UTC del generador. |
| `prior_appointments_90d` | Numérico | Mediana y estandarización; histórico anterior a la hora programada según semántica de Fase 2. |
| `prior_attended_rate` | Numérico | Mediana y estandarización. |
| `prior_patient_no_show_count` | Numérico | Mediana y estandarización. |
| `prior_cancel_count` | Numérico | Mediana y estandarización. |
| `prior_reschedule_count` | Numérico | Mediana y estandarización. |

El pipeline detecta numéricas/categóricas desde los tipos leídos por pandas, define imputación para datos faltantes y `OneHotEncoder(handle_unknown="ignore")` para categorías. En este dataset actual no se requirió imputar valores: las transformaciones están preparadas para faltantes futuros. El escalador `StandardScaler` se aplica sólo a numéricas.

### Excluidas de X

| Columnas | Motivo |
|---|---|
| `appointment_id`, `patient_id`, `doctor_id` | Identificadores; permitirían memorizar entidades y no son características generalizables. |
| `y_patient_no_show` | Objetivo y, por definición, no predictor. Se guarda en archivo `y_<split>.csv`. |
| `created_at`, `scheduled_at` | Tiempos crudos: se usan para anticipación ya derivada y para partición/manifiesto, no como texto/ordinal artificial en X. |
| `final_outcome`, `patient_joined`, `doctor_joined` | Resultado y evidencia posteriores a la cita; fuga directa. |
| `label_eligible` | Sólo filtro de elegibilidad; usarlo como feature revelaría composición/selección del target. |

Las cinco columnas de auditoría nunca entran al `ColumnTransformer`. El código tiene lista positiva de predictores; después verifica que IDs, target y columnas posteriores prohibidas no están en columnas fuente ni transformadas de X.

## Momento de predicción y riesgo de fuga histórica

Para que el significado de “disponible antes de la cita” sea explícito, este prototipo fija el corte de predicción **inmediatamente antes de `scheduled_at`**. El generador construyó historial usando resultados de citas del mismo paciente programadas antes de la cita actual; ese historial puede incluir citas cuyo resultado ocurrió después de la reserva (`created_at`) de la actual. Por tanto, no sería seguro interpretar estas features como disponibles al reservar. Además, que una cita previa haya empezado antes del corte no prueba que haya terminado ni que su outcome estuviera ya registrado; ese dato temporal no está en los CSV. Véase la auditoría metodológica de Fase 2.5 en `04-validacion-metodologica.md`.

La auditoría metodológica adicional encontró 900 de 10,000 filas con al menos una cita previa en los 90 días que podía ser posterior a `created_at`; también identificó posibles superposiciones a la hora programada. No se modificó el generador porque la definición de Fase 2 sitúa historial antes de la cita actual y no se ha fijado integración/predicción al reservar. Para un futuro modelo de riesgo al reservar o con horas/días de anticipación, se debe recalcular todo el historial con corte `created_at`/`prediction_at` y su disponibilidad, desde eventos de origen; eliminar `created_at` de X por sí solo no corrige una feature histórica ya calculada con ese corte más tardío.

No se usa el resultado de la cita actual para construir X. La prueba automatizada confirma que `final_outcome` coincide con la etiqueta y que las columnas posteriores están excluidas. Ningún conjunto futuro se usa para ajustar transformaciones.

## División temporal observada

Se aplica 70%/15%/15% en orden cronológico de filas elegibles, con límites estrictos sin timestamp compartido entre conjuntos. La validación se incluyó porque su volumen (1,309) permite monitoreo descriptivo. Rangos UTC observados:

| Conjunto | Filas | Desde inclusivo | Hasta inclusivo | y=0 | y=1 |
|---|---:|---|---|---:|---:|
| Entrenamiento | 6,108 | 2025-01-01 02:32:22 | 2025-09-13 11:55:59 | 4,836 | 1,272 |
| Validación | 1,309 | 2025-09-13 13:09:48 | 2025-11-08 06:05:54 | 1,052 | 257 |
| Prueba | 1,310 | 2025-11-08 06:54:56 | 2025-12-31 23:55:30 | 1,035 | 275 |

La proporción se corta por número de filas, no por límites de mes; todos los registros de una ventana quedan antes de los del periodo siguiente. Se comprueba `max(train) < min(validation) < ...`. Para evaluación formal/modelado posterior convendrá acordar ventanas por fecha de negocio y considerar backtesting móvil.

## Artefactos

`data/processed/` contiene `X_train.csv`, `X_validation.csv`, `X_test.csv`, `y_<split>.csv`, `manifest_<split>.csv` (identificador y fecha para trazabilidad, fuera de X), `preprocessor.joblib` y `summary.json`. Tras la revisión metodológica, cada archivo y incluye el target original `y_patient_no_show` y la alternativa explícita `y_patient_absent_any`; ninguna columna objetivo entra a X. Los originales permanecen en `data/synthetic/`. El artefacto serializado debe cargarse con una versión compatible de scikit-learn.

## Ejecución y pruebas

Dependencias disponibles en el entorno revisado: pandas y scikit-learn. No se instalaron paquetes.

```powershell
python -m src.mineria_datos.data.prepare --config config/preparation.json --output-dir data/processed
python -m unittest discover -s tests/mineria_datos -v
```

Las pruebas cubren total y distribución de elegibles, uso de `label_eligible`, columnas prohibidas/IDs, cortes temporales estrictos, duplicados, correspondencia etiqueta-outcome y reproducibilidad/ajuste de categorías con entrenamiento únicamente.

## Limitaciones

- El dataset es sintético; los conteos y tasas no estiman PEI ni permiten concluir desempeño real.
- El corte pre-cita es justo antes de la hora programada. No representa un score útil al momento de reservar y no se modelan recordatorios o intervenciones.
- Historiales del generador son retrospectivos a la cita programada, no necesariamente a la reserva; la limitación debe corregirse al cambiar el momento de inferencia.
- Cancelaciones y reprogramaciones se excluyen; no se modela censura ni cadena de citas reagendadas.
- Eventos de `doctor_no_show` y `both_no_show` se mantienen como clase 0 por la definición pedida, pero una evaluación de producto puede decidir excluirlos para medir asistencia del paciente condicionada a la disponibilidad médica.
- Las fechas derivadas permanecen en UTC, y el escalado/one-hot son una preparación general, no selección óptima para un algoritmo concreto.
- Este entregable sólo prepara X/y y particiones; no entrena, selecciona ni valida modelos predictivos.
