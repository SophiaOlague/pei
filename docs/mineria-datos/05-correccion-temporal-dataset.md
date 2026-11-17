# PEI — Fase 3: Corrección temporal del dataset sintético

**Versión corregida:** `v2` · **Semilla:** `20261116` · **Periodo de citas:** 2025-01-01 a 2026-01-01 UTC  
**No se entrenó ningún modelo.** Se usaron únicamente generador y datos sintéticos.

## 1. Problema encontrado

En v1, los agregados históricos se calculaban incluyendo outcomes de toda cita con `scheduled_at` anterior. Ese orden no garantizaba que una consulta hubiera terminado ni que una cancelación, reprogramación, asistencia o inasistencia ya se hubiese registrado al momento de predicción. Los archivos v1 no contenían `started_at`, `ended_at` ni `outcome_available_at`, así que no permitían reconstruir esa disponibilidad.

En la versión nueva, el corte se fija en `prediction_at = scheduled_at` de la cita actual y el uso de cualquier outcome anterior exige estrictamente `outcome_available_at < prediction_at`. El generador produce un historial sintético secuencial; la preparación lo reconstruye de manera independiente y rechaza discrepancias. Los archivos y preparados v1 permanecen en sus rutas previas.

## 2. Disponibilidad sintética de outcomes

El generador está en `src/mineria_datos/data/generator.py`; reglas configurables en `config/generation_v2.json`. No se impone una regla universal: los timestamps son supuestos didácticos explícitos para el prototipo.

| Outcome | `started_at` / `ended_at` sintéticos | `outcome_available_at` / transición |
|---|---|---|
| `attended` | Inicio entre 5 min antes y 15 min después de programada; duración aleatoria de 20–60 min; `ended_at` es el final simulado de consulta | Igual a `ended_at`. |
| `patient_no_show` | Médico entra entre 0–5 min tras la hora; sesión termina al cumplirse tolerancia de 15 min desde `scheduled_at` o cuando el médico entra después de esa tolerancia | Igual a `ended_at`, al determinar ausencia del paciente. |
| `doctor_no_show` | Paciente entra entre 0–5 min; espera hasta la ventana de 30 min desde `scheduled_at` | Igual a `ended_at`, al determinar ausencia del médico. |
| `both_no_show` | No hay participantes; ambos timestamps de sesión quedan vacíos | 30 min tras `scheduled_at`, al vencimiento de la ventana sintética. |
| `canceled` | No inicia sesión; inicio/fin vacíos | `transition_at` aleatorio entre reserva y cita; también es `outcome_available_at`. |
| `rescheduled` | Para el registro original no inicia sesión; inicio/fin vacíos | `transition_at` aleatorio entre reserva y horario original; también es `outcome_available_at`. La nueva cita no se materializa como otra fila en esta simulación. |

Las llegadas, esperas y duración no representan necesariamente agenda ni videoconsulta reales. En PEI el bloque de agenda no acota la consulta (`docs/arquitectura/M08-diseno.md`); precisamente por eso v2 usa fin de sesión explícito en lugar de inferirlo sólo desde `scheduled_at` o duración de bloque.

## 3. Features históricas corregidas

La función `derive_prior_features()` incluye una ventana retrospectiva de 90 días. `prior_appointments_90d` tiene semántica independiente: **conteo de otras reservas del paciente creadas dentro de los 90 días anteriores y antes del corte**; excluye la cita actual. Cuenta reservas aunque su cita programada esté en el futuro y no es un conteo de citas iniciadas, atendidas ni de outcomes resueltos. La definición está declarada en `config/generation_v2.json`.

Las demás variables dependen de outcome y sólo leen eventos con `outcome_available_at < scheduled_at`:

- `prior_attended_rate`: numerador son outcomes clínicos resueltos con `patient_joined=1` (`attended`, `doctor_no_show`); denominador son todos los outcomes clínicos resueltos (`attended`, `patient_no_show`, `doctor_no_show`, `both_no_show`). Cancelaciones y reprogramaciones quedan fuera del numerador **y** denominador. Sin outcomes clínicos resueltos, vale 0.
- `prior_patient_no_show_count`: cuenta sólo `patient_no_show` ya disponible; no cuenta `both_no_show`, consistente con el nombre histórico exclusivo.
- `prior_cancel_count` y `prior_reschedule_count`: cuentan respectivamente transiciones de ese tipo cuyo instante de disponibilidad es anterior al corte.

Una cita puede estar programada/iniciada antes del corte y seguir abierta; entonces contribuye a `prior_appointments_90d`, pero no a estadísticas basadas en outcome. Eventos con `outcome_available_at == prediction_at` también se excluyen por la desigualdad estricta.

El pipeline valida estas reglas en `validate_temporal_history()` antes de filtrar elegibilidad (`src/mineria_datos/data/prepare.py`). Además, `audit_prior_feature_timing()` (`src/mineria_datos/data/temporal_audit.py`) reconstruye independientemente los agregados desde ambos CSV v2.

## 4. Dos objetivos conservados

La población objetivo se selecciona únicamente por `label_eligible == 1`. `attended`, `patient_no_show`, `doctor_no_show` y `both_no_show` son elegibles; cancelaciones y reprogramaciones no lo son.

| Outcome elegible | Filas | `y_patient_absent_any` (principal) | `y_patient_no_show` (secundario) |
|---|---:|---:|---:|
| `attended` | 6,550 | 0 | 0 |
| `patient_no_show` | 1,800 | 1 | 1 |
| `doctor_no_show` | 406 | 0 | 0 |
| `both_no_show` | 20 | 1 | 0 |
| **Total elegible** | **8,776** |  |  |
| **Positivos** |  | **1,820 (20.74%)** | **1,800 (20.51%)** |
| **Negativos** |  | **6,956 (79.26%)** | **6,976 (79.49%)** |

El objetivo principal es “paciente ausente” sin importar si el médico también faltó. El secundario conserva el no-show exclusivo registrado como `patient_no_show`. Ambos targets se derivan del `final_outcome`, aparecen en archivos y separados, y ninguno forma parte de X. Los CSV v1 mantienen su etiqueta y significado originales.

## 5. Separación, features y prevención de fuga

La preparación sigue siendo cronológica: 70% train, 15% validation, 15% test. Para v2 son 6,143 / 1,316 / 1,317 filas elegibles, ordenadas estrictamente por `scheduled_at`; validation/test no intervienen en `fit`. `appointment_id`, `patient_id`, `doctor_id`, ambas etiquetas, `final_outcome`, `patient_joined`, `doctor_joined`, `label_eligible`, timestamps de auditoría y timestamps crudos no entran a X. Las columnas permitidas están en la lista positiva `FEATURE_COLUMNS`.

Auditoría de disponibilidad de la semilla v2:

| Indicador | Resultado |
|---|---:|
| Citas fuente | 10,000 |
| Filas con reservas programadas previas en ventana | 7,972 |
| Contribuciones de outcome incluidas por filtro estricto | 17,804 |
| Outcomes previos cuyo timestamp era igual o posterior al corte y fueron excluidos | 6 |
| Contribuciones de outcome incluidas antes de estar disponibles | 0 |
| Eventos simultáneos usados como historial | 0 |
| Inicios previos a menos de 30 min del corte siguiente | 4 |

Los cuatro intervalos cortos son citas potencialmente solapadas; el outcome de cada una sólo entra si realmente se había resuelto antes del corte. Los seis outcomes no disponibles se excluyeron. La ventana de 30 minutos es sólo un indicador diagnóstico; `ended_at` y `outcome_available_at` determinan la inclusión, no un umbral fijo.

## 6. Versiones, artefactos y manifiestos

Entradas nuevas:

- `config/generation_v2.json`
- `config/preparation_v2.json`

Datos sintéticos v2:

- `data/synthetic/v2/appointments_synthetic.csv`
- `data/synthetic/v2/appointments_synthetic_audit.csv`
- `data/synthetic/v2/summary.json`
- `data/synthetic/v2/dataset_manifest.json` (configuración/semilla y hashes SHA-256)

Procesados v2:

- `data/processed/v2/X_{train,validation,test}.csv`
- `data/processed/v2/y_{train,validation,test}.csv` (ambas etiquetas)
- `data/processed/v2/manifest_{train,validation,test}.csv` (versión, `appointment_id`, `prediction_at`; fuera de X)
- `data/processed/v2/preprocessor.joblib`
- `data/processed/v2/summary.json`
- `data/processed/v2/preparation_manifest.json` (hashes de entradas y salidas, targets y alcance de fit)

El diccionario [`diccionario-variables-sintetico.md`](diccionario-variables-sintetico.md) ahora documenta v2. El informe metodológico de Fase 2.5 se conserva y enlaza esta corrección. Las rutas anteriores `data/synthetic/*.csv` y `data/processed/*` no se sobrescriben.

## 7. Pruebas ejecutadas

Comando ejecutado en la raíz:

```powershell
python -m unittest discover -s tests/mineria_datos -v
```

**21 pruebas aprobadas, 0 fallidas.** Incluyen:

- timestamps coherentes por outcome y generación idéntica con la misma semilla;
- filtro estricto de outcomes con `outcome_available_at == prediction_at` o posterior;
- cita previa solapada y evento simultáneo no disponibles como outcome, aunque la reserva previa pueda contarse;
- reconstrucción independiente de todos los agregados, y rechazo de un historial adulterado por el pipeline;
- ambas etiquetas correctas, binaria y separadas de X;
- auditoría posterior/identificadores excluidos de X;
- división temporal estricta, ajuste train-only y preparación reproducible.

También se ejecutaron:

```powershell
python -m src.mineria_datos.data.generator --config config/generation_v2.json
python -m src.mineria_datos.data.prepare --config config/preparation_v2.json
python -c "import json; from src.mineria_datos.data.temporal_audit import audit_prior_feature_timing; print(json.dumps(audit_prior_feature_timing(), indent=2))"
```

## 8. Limitaciones pendientes

- Reglas de minutos, llegada, duración y disponibilidad son supuestos de simulación, no estimaciones ni reglas universales de PEI.
- `both_no_show` es una clase pequeña (20 de 8,776 elegibles en esta semilla); la evaluación comparativa de A puede ser inestable en esa subclase.
- `prior_appointments_90d` cuenta citas programadas previas, incluso si aún abiertas. No debe interpretarse como historial de asistencia.
- `prior_patient_no_show_count` sigue siendo exclusivo y no incluye both; conviene evaluar si añadir una característica distinta de ausencias amplias mejora la pregunta primaria.
- La nueva fila de la cadena de una reprogramación no se genera; transiciones se mantienen como resultado de la cita original.
- Hora local/festivos, recordatorios, entrega de mensajes y duraciones reales no están modelados.
- Los outcomes y perfiles se simulan con reglas configuradas; los resultados no demuestran rendimiento ni se generalizan a pacientes reales.
- No se entrenó modelo ni se seleccionó umbral; esta versión sólo corrige, prepara y valida datos sintéticos.
