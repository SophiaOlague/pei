# Diccionario de variables — dataset sintético v2

Este diccionario describe `data/synthetic/v2/`. La versión anterior permanece en `data/synthetic/` y se documentó en `02-dataset-sintetico.md`. Los targets son etiquetas supervisadas independientes y nunca columnas de X. Los campos de auditoría se guardan en un CSV aparte.

## CSV de características y targets

| Campo | Tipo | Grupo | Definición |
|---|---|---|---|
| `appointment_id` | UUID sintético | Identificador | Clave única; excluir de X. |
| `patient_id` | UUID sintético | Identificador | Paciente ficticio; excluir de X. |
| `doctor_id` | UUID sintético | Identificador | Médico ficticio; excluir de X. |
| `specialty_code` | texto categórico | Predictor | Especialidad ficticia del médico. |
| `created_at` | ISO-8601 UTC | Predictor fuente | Fecha de reserva; se usa para validación y para establecer reserva previa, no entra a X. |
| `scheduled_at` | ISO-8601 UTC | Corte temporal | Hora programada y `prediction_at`; no entra como timestamp crudo a X. |
| `lead_time_hours` | decimal | Predictor | Anticipación entre creación y hora programada. |
| `appointment_type` | categoría | Predictor | `scheduled` o `emergency`; emergencias reciben anticipación de hasta 12 horas. |
| `weekday`, `hour`, `month` | enteros | Predictor | Calendario derivado en UTC. |
| `prior_appointments_90d` | entero | Predictor histórico de reservas | Otras reservas del paciente creadas dentro de los 90 días anteriores y antes del corte; excluye la cita actual. Una reserva ya existente puede tener `scheduled_at` futuro. No usa el outcome ni significa cita atendida/iniciada. |
| `prior_attended_rate` | decimal 0–1 | Predictor histórico de outcomes | Sólo outcomes clínicos resueltos antes del corte. Numerador: `patient_joined=1` (`attended`, `doctor_no_show`). Denominador: outcomes clínicos resueltos (`attended`, `patient_no_show`, `doctor_no_show`, `both_no_show`). Canceladas/reprogramadas excluidas. Cero si no hay denominador. |
| `prior_patient_no_show_count` | entero | Predictor histórico de outcomes | Conteo de `patient_no_show` resuelto antes del corte; no incluye `both_no_show` (ausencia amplia sí se representa en target principal A). |
| `prior_cancel_count` | entero | Predictor histórico de outcomes | Cancelaciones cuyo `transition_at`/`outcome_available_at` fue antes del corte. |
| `prior_reschedule_count` | entero | Predictor histórico de outcomes | Reprogramaciones cuya transición/outcome fue antes del corte. |
| `y_patient_absent_any` | entero 0/1 | Target principal | 1 para `patient_no_show` o `both_no_show`; 0 en otros resultados. Excluir de X. |
| `y_patient_no_show` | entero 0/1 | Target secundario | 1 sólo para `patient_no_show`; 0 en otros resultados. Excluir de X. |

## CSV de auditoría posterior

| Campo | Tipo | Definición |
|---|---|---|
| `appointment_id` | UUID | Clave de unión con CSV de features. |
| `final_outcome` | categoría | Uno de `attended`, `patient_no_show`, `doctor_no_show`, `both_no_show`, `canceled`, `rescheduled`. Sólo auditoría/derivación de labels. |
| `label_eligible` | entero 0/1 | 1 para los cuatro outcomes clínicos; 0 para cancelación y reprogramación. Filtro de población, jamás X. |
| `patient_joined`, `doctor_joined` | entero 0/1 | Marcas de asistencia simuladas; posteriores y no predictors. |
| `started_at` | ISO-8601 UTC o vacío | Inicio efectivo de sesión (primer participante); vacío sin sesión. |
| `ended_at` | ISO-8601 UTC o vacío | Cierre de sesión o finalización sintética del desenlace. No es equivalente al fin del bloque de agenda PEI. |
| `outcome_available_at` | ISO-8601 UTC | Instante a partir del que el sistema sintético puede conocer el resultado; un evento histórico sólo entra en agregados si es estrictamente anterior a `scheduled_at` actual. |
| `transition_at` | ISO-8601 UTC o vacío | Momento sintético de cancelación/reprogramación; también es su instante de disponibilidad. Vacío para outcomes clínicos. |

Para `attended`, el generador simula una llegada entre 5 minutos antes y 15 después del horario y una duración de 20–60 minutos; `outcome_available_at=ended_at`. Para `patient_no_show`, el médico inicia sala y se aplica tolerancia sintética de 15 minutos. `doctor_no_show` representa paciente conectado esperando hasta la ventana sintética de 30 minutos. En `both_no_show` nadie inicia sesión y se espera 30 minutos. Cancelaciones/reprogramaciones ocurren en un instante aleatorio entre reserva y cita. Son supuestos explícitos del generador, no una regla universal ni una afirmación sobre producción PEI.

## Características de X en el preprocesamiento

La lista positiva está en `src/mineria_datos/data/prepare.py`. Incluye `specialty_code`, `lead_time_hours`, `appointment_type`, calendario y las cinco variables `prior_*`. Los tres IDs, ambas etiquetas, fechas crudas y todas las columnas de auditoría se excluyen. El preprocesador usa mediana + `StandardScaler` para numéricas y moda + one-hot para categóricas, ajustado exclusivamente con train.
