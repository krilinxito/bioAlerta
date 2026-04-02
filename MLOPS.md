# MLOps en BioAlerta: Trazabilidad y Reproducibilidad

## El problema que resuelve

Un proyecto de ML sin versionado produce resultados que no se pueden reproducir: los datos cambian, los modelos se sobreescriben y no hay registro de qué configuración produjo qué resultado. Este documento describe cómo se resolvió ese problema en BioAlerta usando tres herramientas complementarias.

---

## Arquitectura general

```
Código / Notebooks  →  Git + GitHubbash: /c/Users/TU_USUARIO/miniconda3/etc/profile.d/conda.sh: No such file or directory
Datos (2.2 GB)      →  DVC + DagsHub Storage
Experimentos ML     →  MLflow + DagsHub Experiments
```

Cada herramienta versiona una capa distinta del proyecto.

---

## 1. DVC — Versionado de datos

### ¿Por qué no basta Git?

Git está diseñado para texto. Un archivo de 800 MB como `mapbiomas_bolivia.tif` no puede subirse a GitHub (límite de 100 MB por archivo) y si se pudiera, el repositorio sería inutilizable.

### Cómo funciona DVC

DVC calcula un hash MD5 de cada archivo y guarda ese hash en un archivo `.dvc` pequeño que sí va en Git. El archivo real se sube a un storage externo (en este caso DagsHub).

```
data/mapbiomas_bolivia.tif  (800 MB)
        ↓  dvc add
data/mapbiomas_bolivia.tif.dvc  ←  solo el hash, va en Git
        ↓
dvc push  →  sube el archivo real a DagsHub Storage
```

Si los datos cambian, el hash cambia y DVC crea una nueva versión. Git registra el cambio en el `.dvc`. Así queda trazabilidad completa de qué datos se usaron en cada commit.

### Comandos del flujo

```bash
# Inicializar DVC en el proyecto
dvc init

# Configurar el storage de DagsHub
dvc remote add -d origin s3://dvc
dvc remote modify origin endpointurl https://dagshub.com/krilinxito/bioAlerta.s3

# Credenciales (se guardan local, no van al repo)
dvc remote modify origin --local access_key_id <token>
dvc remote modify origin --local secret_access_key <token>

# Añadir datos al tracking de DVC
dvc add data/

# Subir datos al storage remoto
dvc push

# En otra máquina: bajar los datos
dvc pull
```

### Resultado

El repositorio de Git es liviano (solo código y punteros `.dvc`). Cualquier colaborador puede reproducir el entorno exacto con:

```bash
git clone https://github.com/krilinxito/bioAlerta
conda env create -f environment_win.yaml   # Windows
# conda env create -f environment.yaml     # Linux
conda activate bioalerta
dvc pull  # descarga los 2.2 GB de datos
```

---

## 2. DagsHub — Plataforma centralizada

DagsHub cumple dos roles:

**Storage S3** para los datos de DVC (equivalente a AWS S3 pero gratuito para proyectos académicos). Los datos reales viven aquí, referenciados por los punteros `.dvc` en Git.

**UI de experimentos** que integra MLflow y permite comparar runs visualmente sin necesidad de levantar un servidor local.

La conexión entre GitHub y DagsHub es automática: cada `git push` a GitHub se refleja en DagsHub en tiempo real.

---

## 3. MLflow — Trazabilidad de experimentos

### ¿Qué registra?

Cada vez que se entrena un modelo, MLflow guarda un **run** con:

| Tipo | Ejemplos en BioAlerta |
|------|-----------------------|
| Parámetros | `modelo`, `clase`, `cv_folds`, `seed` |
| Métricas | `roc_auc`, `pr_auc`, `f1` y sus desviaciones estándar |
| Artefactos | modelo serializado (`best_Aves`, `best_Mamiferos`) |

### Configuración en el notebook

```python
import dagshub
import mlflow

# Conectar con DagsHub (abre autenticación en el browser la primera vez)
dagshub.init(repo_owner='krilinxito', repo_name='bioAlerta', mlflow=True)
mlflow.set_experiment('bioalerta-modelos')
```

### Logging por modelo

```python
with mlflow.start_run(run_name=f"{clase}_{nombre}"):
    mlflow.log_param("clase",    clase)
    mlflow.log_param("modelo",   nombre)
    mlflow.log_param("seed",     SEED)
    mlflow.log_metric("roc_auc", roc_auc)
    mlflow.log_metric("pr_auc",  pr_auc)
    mlflow.log_metric("f1",      f1)
```

### Logging del modelo final

```python
with mlflow.start_run(run_name=f"best_{clase}"):
    mlflow.sklearn.log_model(modelo, artifact_path=f"modelo_{clase.lower()}")
```

### Resultado: 12 runs registrados

| Run | clase | modelo | ROC-AUC |
|-----|-------|--------|---------|
| Aves_Random Forest | Aves | Random Forest | 0.848 |
| Aves_SVM | Aves | SVM | 0.834 |
| Aves_Logistic Regression | Aves | Logistic Regression | 0.797 |
| Aves_Gradient Boosting | Aves | Gradient Boosting | 0.786 |
| Aves_KNN | Aves | KNN | 0.696 |
| Mamiferos_Random Forest | Mamiferos | Random Forest | 0.792 |
| Mamiferos_Gradient Boosting | Mamiferos | Gradient Boosting | 0.728 |
| Mamiferos_Logistic Regression | Mamiferos | Logistic Regression | 0.707 |
| Mamiferos_SVM | Mamiferos | SVM | 0.686 |
| Mamiferos_KNN | Mamiferos | KNN | 0.683 |
| best_Aves | Aves | Random Forest | — |
| best_Mamiferos | Mamiferos | Random Forest | — |

Los runs `best_*` contienen además el modelo serializado como artefacto descargable.

---

## Flujo completo de reproducibilidad

```
1. git clone https://github.com/krilinxito/bioAlerta
2. conda env create -f environment_win.yaml && conda activate bioalerta
3. dvc remote modify origin --local access_key_id <token>
   dvc remote modify origin --local secret_access_key <token>
4. dvc pull                     ← descarga data/
5. jupyter lab
6. Ejecutar notebooks 01→06     ← MLflow loggea automáticamente a DagsHub
```

Con estos pasos cualquier persona con acceso al repo puede reproducir exactamente los mismos resultados, con los mismos datos y el mismo entorno, en cualquier máquina.
