# Prototipo independiente de Minería de Datos

Generador reproducible de citas médicas ficticias y preparación de particiones para Machine Learning. No depende del backend PEI ni de servicios externos.

## Requisitos

Python 3.10 o posterior. El generador (`generator.py`) solo usa la biblioteca estándar. La preparación (`prepare.py`),
la auditoría temporal (`temporal_audit.py`) y las pruebas necesitan pandas, numpy, scikit-learn y joblib, listados en
`requirements.txt`:

```powershell
python -m pip install -r requirements.txt
```

## Reproducir desde cero

Desde la raíz del repositorio, con las dependencias instaladas:

```powershell
python -m src.mineria_datos.data.generator --config config/generation_v2.json
python -m src.mineria_datos.data.prepare --config config/preparation_v2.json
python -m unittest discover -s tests/mineria_datos -v
```

La misma configuración produce los mismos archivos byte a byte (semilla fija), incluido `preprocessor.joblib`. Las
pruebas generan su propio dataset v2 en una carpeta temporal: no dependen de los CSV de `data/` ni los modifican.

Los datos de `data/` son artefactos generados y se reconstruyen con estos comandos. La versión v1 (`data/synthetic/`,
`data/processed/`, `config/generation.json`, `config/preparation.json`) es histórica: la corrección temporal de v2
(`docs/mineria-datos/05-correccion-temporal-dataset.md`) cambió el formato, y el código actual ya no genera ni prepara
v1 (su configuración no tiene `synthetic_timing_rules` y sus CSV no tienen `y_patient_absent_any`).

## Generar

Desde la raíz del repositorio:

```powershell
python -m src.mineria_datos.data.generator --config config/generation_v2.json
```

O desde cualquier directorio, indicando `--config` y `--output-dir` con rutas. La configuración v2 se escribe en `data/synthetic/v2/`, conserva versión, manifiesto, resumen y hashes. La versión anterior en `data/synthetic/` no se sobrescribe. Los UUID usan un PRNG local con semilla; config idéntica produce los mismos datos.

## Probar

```powershell
python -m unittest discover -s tests/mineria_datos -v
```

## Separación contra fuga

`y_patient_no_show` es la columna objetivo, nunca predictor. Excluir `appointment_id`, `patient_id` y `doctor_id` de las matrices de entrenamiento. No usar columnas de auditoría: `final_outcome`, `label_eligible`, `patient_joined`, `doctor_joined`. Los agregados previos se construyen en orden cronológico y sólo con citas anteriores dentro de 90 días. Cancelaciones y reprogramaciones se conservan como filas del universo, con etiqueta 0 y `label_eligible=0`; las ausencias del médico y de ambos también tienen etiqueta 0, pero son outcomes distintos en auditoría.

La referencia obligatoria del dominio es `docs/mineria-datos/01-diagnostico-datos-PEI.md`. La descripción del dataset generado y sus limitaciones está en `docs/mineria-datos/02-dataset-sintetico.md`; el diccionario completo está en `docs/mineria-datos/diccionario-variables-sintetico.md`.

## Preparar particiones para Machine Learning (sin entrenar)

Con las dependencias de `requirements.txt` instaladas:

```powershell
python -m src.mineria_datos.data.prepare --config config/preparation_v2.json
```

Se combinan los CSV v2 por `appointment_id`, se comprueba el historial as-of y se selecciona población exclusivamente con `label_eligible`. Los artefactos versionados se escriben en `data/processed/v2/`; la salida anterior en `data/processed/` permanece intacta. Los CSV y procesados conservan dos targets comparables (`y_patient_no_show` y `y_patient_absent_any`); ambos se excluyen de X. El preprocesador se ajusta sólo en entrenamiento. `preprocessor.joblib` es un objeto serializado con joblib (pickle): cargarlo ejecuta código, así que solo debe cargarse desde copias de confianza, como las de este repositorio o las regeneradas con estos comandos. Consulta `docs/mineria-datos/05-correccion-temporal-dataset.md` para reglas temporales y limitaciones.
