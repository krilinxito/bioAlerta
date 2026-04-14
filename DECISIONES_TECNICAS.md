# BioAlerta — Decisiones Técnicas y Fundamentos

> Documento de aprendizaje: cada decisión se explica primero de forma **intuitiva** y luego de forma **formal**. Los bloques de código muestran los fragmentos más importantes del pipeline.

---

## Índice

1. [Formulación del problema](#1-formulación-del-problema)
2. [Diseño del dataset](#2-diseño-del-dataset)
3. [Feature engineering geoespacial](#3-feature-engineering-geoespacial)
4. [Preparación de datos](#4-preparación-de-datos)
5. [Manejo del desbalance de clases](#5-manejo-del-desbalance-de-clases)
6. [Selección de modelos](#6-selección-de-modelos)
7. [Protocolo de validación](#7-protocolo-de-validación)
8. [Métricas de evaluación](#8-métricas-de-evaluación)
9. [Por qué ganó Random Forest](#9-por-qué-ganó-random-forest)
10. [Umbral de decisión adaptativo](#10-umbral-de-decisión-adaptativo)
11. [Importancia de variables](#11-importancia-de-variables)
12. [Pipeline completo](#12-pipeline-completo)

---

## 1. Formulación del problema

### Intuitivo

Tenemos especies de aves y mamíferos bolivianos. Algunas tienen etiqueta IUCN (sabemos si están amenazadas o no). Otras no la tienen. Queremos usar las que sí tienen etiqueta para *enseñarle* a un modelo qué características tiene una especie amenazada, y luego aplicar ese conocimiento a las que no tienen etiqueta.

La pregunta concreta es binaria: **¿amenazada (1) o no amenazada (0)?**

### Formal

Se define un problema de **clasificación binaria supervisada**:

- **Espacio de entrada** X ∈ ℝᵈ: vector de d features (rasgos biológicos + variables ambientales) por especie
- **Variable objetivo** y ∈ {0, 1}: 1 = amenazada (VU/EN/CR), 0 = no amenazada (LC/NT)
- **Objetivo**: aprender una función f: X → {0,1} que minimice la tasa de error ponderada por costo

**¿Por qué binaria y no multiclase (LC/NT/VU/EN/CR)?**

- Las categorías VU/EN/CR tienen muy pocos ejemplos cada una (algunas solo 2–3 por clase). Un clasificador multiclase necesita suficientes ejemplos de cada clase para aprender.
- En biología de conservación, la pregunta operativa es "¿debo priorizar esta especie?", no "¿exactamente qué tan amenazada está?". La distinción amenazada/no-amenazada es accionable; la distinción VU/EN no cambia la decisión inmediata.
- La agrupación VU+EN+CR como clase positiva aumenta la señal disponible para el modelo.

```python
# Codificación del target — notebook 04
iucn_map = {
    'LC': 0, 'NT': 0,          # no amenazadas
    'VU': 1, 'EN': 1, 'CR': 1  # amenazadas
}
df['threatened'] = df['iucn_categoria'].map(iucn_map)
# DD y NaN → excluidos del entrenamiento, usados como predicción
```

**¿Por qué modelos separados para aves y mamíferos?**

Tres razones:
1. Los rasgos biológicos vienen de fuentes distintas (AVONET para aves, PanTHERIA para mamíferos) con variables completamente diferentes.
2. El desbalance difiere: 1:35 en aves vs. 1:14 en mamíferos. Los pesos óptimos del modelo varían.
3. Los mecanismos de vulnerabilidad son distintos: en aves dominan morfología del pico y ala; en mamíferos domina la masa corporal.

---

## 2. Diseño del dataset

### Intuitivo

Cada especie es una fila. Las columnas son "características" que describen a esa especie: su tamaño, dónde vive, cuánto bosque hay en su zona, si hay minería cerca, etc. El modelo aprende qué combinación de características predice que una especie esté amenazada.

### Formal

Se construye una **matriz de diseño** X de dimensiones n × d donde:
- n = número de especies (1.313 aves train + 189 mamíferos train)
- d = número de features (64 para aves, 29 para mamíferos tras OHE)

Las features se agrupan en tres bloques:

| Bloque | Variables | Fuente |
|--------|-----------|--------|
| Rasgos biológicos | Masa corporal, morfología, rango geográfico | AVONET / PanTHERIA |
| Variables ambientales | Temperatura, precipitación, deforestación, cobertura | WorldClim / GFW / MapBiomas |
| Presión humana | ANPs, minería, petróleo, vías, quemas | RAISG |

**¿Por qué el centroide de especie como representación espacial?**

Cada especie puede tener miles de registros de ocurrencia distribuidos por Bolivia. Necesitamos reducir eso a un solo vector de features por especie.

- **Alternativa descartada — promedio de todos los registros**: la media aritmética es sensible a registros erróneos (coordenadas al revés, registros fuera de Bolivia).
- **Decisión tomada — mediana**: la mediana es el punto que minimiza la suma de distancias absolutas. Es robusta ante outliers: si el 10% de los registros tiene coordenadas erróneas, la mediana no se mueve.

```python
# Notebook 03 — cálculo del centroide robusto
centroids = (
    df_occ.groupby('species')
    .agg(
        lat_centroid=('decimalLatitude',  'median'),
        lon_centroid=('decimalLongitude', 'median'),
        n_occ=('species', 'count')
    )
    .reset_index()
)
```

---

## 3. Feature Engineering Geoespacial

### 3.1 Extracción de variables raster

#### Intuitivo

Un raster es como una imagen satelital donde cada píxel tiene un valor numérico (temperatura, lluvia, etc.). Para cada especie tenemos su ubicación (centroide). La pregunta es: ¿qué temperatura, qué precipitación, qué porcentaje de deforestación hay *en el lugar donde vive esa especie*?

La respuesta es simple: buscamos el píxel del raster que corresponde a las coordenadas del centroide y leemos su valor.

#### Formal

Se usa **muestreo puntual** (*point sampling*): dado un raster con transformación afín T y un punto p = (lon, lat), se calcula la fila y columna del píxel correspondiente:

```
col = (lon - x_origin) / pixel_width
row = (lat - y_origin) / pixel_height
```

La librería `rasterio.sample` vectoriza este cálculo para todos los puntos simultáneamente, sin cargar el raster completo en memoria.

```python
# Notebook 03 — extracción eficiente con rasterio.sample
import rasterio

def extraer_raster(tif_path, coords):
    """coords: lista de (lon, lat) en EPSG:4326"""
    with rasterio.open(tif_path) as src:
        values = [v[0] for v in src.sample(coords)]
    return values

coords = list(zip(species_df['lon_centroid'], species_df['lat_centroid']))

for var, path in worldclim_vars.items():
    species_df[var] = extraer_raster(path, coords)
```

### 3.2 Variables de deforestación (GFW)

#### Intuitivo

El raster de GFW tiene un número en cada píxel que indica *en qué año se perdió el bosque* (1=2001, 23=2023, 0=sin pérdida). Para saber si una especie está expuesta a deforestación, calculamos qué porcentaje de los puntos donde vive esa especie tienen pérdida forestal cerca.

Se calculan dos variables:
- **Total (2001–2023)**: cuánto bosque total se perdió en toda su zona
- **Reciente (2015–2023)**: solo los últimos 8 años — indica presión activa, no histórica

```python
# Notebook 03 — variables GFW
def calcular_forest_loss(lossyear_vals):
    total = np.array(lossyear_vals)
    n = len(total)
    return {
        'pct_forest_loss_total':  np.sum((total >= 1) & (total <= 23)) / n,
        'pct_forest_loss_recent': np.sum((total >= 15) & (total <= 23)) / n,
    }
```

### 3.3 Variables vectoriales (RAISG) — distancias y contención

#### Intuitivo

Para saber si una especie vive cerca de una mina ilegal o dentro de un área protegida, necesitamos operar con polígonos (formas geométricas), no con píxeles. GeoPandas extiende pandas con una columna especial que almacena formas geométricas.

Dos preguntas para cada especie:
- **¿Qué porcentaje de sus registros caen *dentro* de un ANP?** → operación `sjoin within`
- **¿A qué distancia está el ANP más cercano?** → operación `sjoin_nearest`

La distancia debe ser en kilómetros reales, no en grados. Por eso se reprojecta a un sistema de coordenadas métrico (UTM zona 20S, EPSG:32720) antes de medir.

#### Formal

`sjoin_nearest` implementa una búsqueda de vecino más cercano en el espacio euclidiano proyectado, usando índices espaciales R-tree que reducen la complejidad de O(n·m) a O(n·log m).

```python
# Notebook 03 — distancia a minería ilegal (en km)
gdf_occ_utm   = gdf_occ.to_crs('EPSG:32720')
gdf_minas_utm = gdf_minas.to_crs('EPSG:32720')

joined = gpd.sjoin_nearest(
    gdf_occ_utm, gdf_minas_utm,
    how='left', distance_col='dist_m'
)
# Agregar por especie: distancia mínima en km
dist_km = (
    joined.groupby('species')['dist_m']
    .min() / 1000
)
```

---

## 4. Preparación de Datos

### 4.1 Limpieza de nodata

#### Intuitivo

Los rasters tienen un valor especial (llamado "nodata") para los píxeles que están fuera del área de cobertura — por ejemplo, el océano en un raster continental. Si el centroide de una especie cae justo en el borde del raster, puede extraerse ese valor inválido (típicamente −3.4×10³⁵) en lugar de un valor climático real. Hay que detectar y eliminar esos valores antes de entrenar.

#### Formal

Se definen rangos fisiológicamente posibles para cada variable. Cualquier valor fuera del rango se reemplaza por `NaN`:

```python
# Notebook 04 — limpieza de nodata WorldClim
bio_ranges = {
    'bio1_mean':  (-600,  400),   # Temperatura *10: de -60°C a 40°C
    'bio4_mean':  (   0, 23000),  # Estacionalidad *100
    'bio7_mean':  (   0,  7200),  # Rango anual *10
    'bio12_mean': (   0, 12000),  # Precipitación anual mm
    'bio14_mean': (   0,  3000),  # Precipitación mes seco mm
    'bio15_mean': (   0,   265),  # CV de precipitación
}
for col, (lo, hi) in bio_ranges.items():
    mask = (df[col] < lo) | (df[col] > hi)
    df.loc[mask, col] = np.nan
    if mask.sum() > 0:
        print(f'{col}: {mask.sum()} valores nodata reemplazados')
```

### 4.2 Imputación — sin data leakage

#### Intuitivo

Después de limpiar, quedan algunos `NaN`. El modelo no puede trabajar con valores nulos, así que hay que rellenarlos. La estrategia más simple: rellenar con el valor típico (mediana para números, moda para categorías).

**La trampa del data leakage**: si calculamos la mediana sobre todos los datos (incluyendo los de test y predicción), estamos "filtrando" información del futuro al pasado. El modelo aprendería algo que en la realidad no podría saber. Para evitarlo, la mediana se calcula **solo con el conjunto de entrenamiento** y luego se aplica al resto.

#### Formal

El principio es que el imputador es parte del modelo: debe ser **ajustado** (*fit*) únicamente con datos de train y luego **aplicado** (*transform*) a train, test y predicción por separado.

```python
# Notebook 04 — imputación sin leakage
from sklearn.impute import SimpleImputer

# Columnas numéricas
num_cols = X_train.select_dtypes(include='number').columns
imp_num = SimpleImputer(strategy='median')
imp_num.fit(X_train[num_cols])               # aprende medianas del TRAIN
X_train[num_cols] = imp_num.transform(X_train[num_cols])
X_pred[num_cols]  = imp_num.transform(X_pred[num_cols])   # aplica al PREDICT

# Columnas categóricas
cat_cols = X_train.select_dtypes(include='object').columns
imp_cat = SimpleImputer(strategy='most_frequent')
imp_cat.fit(X_train[cat_cols])
X_train[cat_cols] = imp_cat.transform(X_train[cat_cols])
X_pred[cat_cols]  = imp_cat.transform(X_pred[cat_cols])
```

### 4.3 One-Hot Encoding

#### Intuitivo

Los modelos de ML trabajan con números. Variables como "Habitat = Forest" o "Trophic.Level = Carnivore" son texto y hay que convertirlas a números.

La forma más correcta: crear una columna binaria (0/1) por cada categoría posible. Si "Forest" es la categoría, la columna `Habitat_Forest` vale 1 para esa especie y 0 para las demás.

**¿Por qué se elimina una categoría?** Si tienes 3 categorías (Forest, Grassland, Water), con solo 2 columnas (Forest, Grassland) podés reconstruir la tercera: si ambas son 0, la especie es de Water. Tener las 3 columnas sería información redundante (*trampa de la variable ficticia*) que puede causar problemas matemáticos en algunos modelos.

#### Formal

One-Hot Encoding (*dummy encoding* con `drop_first=True`) convierte una variable categórica con k categorías en k−1 variables binarias, evitando multicolinealidad perfecta. Expande el espacio de features de 26 a 64 columnas para aves.

```python
# Notebook 04 — OHE de variables categóricas AVONET
cat_vars = ['Habitat', 'Migration', 'Trophic.Level',
            'Trophic.Niche', 'Primary.Lifestyle']

df_encoded = pd.get_dummies(df, columns=cat_vars, drop_first=True)
# drop_first=True elimina la primera categoría de cada variable
# para evitar la trampa de la variable ficticia
```

---

## 5. Manejo del Desbalance de Clases

### Intuitivo

Solo el 2.7% de las aves son amenazadas. Si un modelo predice "no amenazada" para **todas** las especies, tiene 97.3% de exactitud (*accuracy*) — pero no sirve para nada porque nunca detecta las amenazadas.

El desbalance hace que el modelo "aprenda a ignorar" la clase minoritaria porque equivocarse en ella apenas afecta la métrica de accuracy.

Solución: decirle al modelo que **equivocarse en una especie amenazada cuesta mucho más** que equivocarse en una no amenazada.

### Formal

`class_weight='balanced'` asigna a cada muestra de la clase c un peso:

```
w_c = n_total / (n_clases × n_c)
```

Para aves (n=1313, n_amenazadas=36, n_clases=2):
- Peso de clase amenazada: 1313 / (2 × 36) = **18.2**
- Peso de clase no amenazada: 1313 / (2 × 1277) = **0.51**

La función de pérdida que minimiza el modelo pondera cada error por estos pesos: equivocarse en una especie amenazada cuenta **36 veces más** que en una no amenazada.

```python
# Notebook 06 — class_weight en todos los clasificadores que lo soportan
from sklearn.ensemble import RandomForestClassifier

rf = RandomForestClassifier(
    n_estimators=300,
    class_weight='balanced',   # pesos inversamente proporcionales a frecuencia
    max_features='sqrt',
    random_state=42,
    n_jobs=-1
)
```

**¿Por qué no SMOTE (oversampling)?**

SMOTE genera ejemplos sintéticos de la clase minoritaria interpolando entre muestras existentes. Es útil, pero:
- Con solo 36 especies amenazadas en aves, los ejemplos sintéticos serían interpolaciones poco realistas biológicamente.
- `class_weight` es matemáticamente equivalente a ponderar los errores sin modificar los datos.
- Es más simple, reproducible y no introduce sesgo de interpolación.

---

## 6. Selección de Modelos

### Intuitivo

Se eligieron 5 modelos que representan enfoques fundamentalmente distintos de clasificación. La idea es no apostar todo a uno solo: si varios modelos con lógicas distintas llegan al mismo resultado, la conclusión es más robusta.

| Modelo | Analogía intuitiva |
|--------|-------------------|
| Regresión Logística | Trazar una línea recta que separa amenazadas de no amenazadas en el espacio de features |
| Random Forest | Consultar a 300 expertos independientes, cada uno con información parcial, y votar |
| Gradient Boosting | Un estudiante que aprende de sus errores iterativamente |
| SVM | Encontrar la "autopista" más ancha posible entre las dos clases |
| KNN | "Esta especie se parece a estas 7 conocidas, ¿qué son ellas?" |

### Formal

#### Regresión Logística

Modelo lineal generalizado que estima la probabilidad de clase 1 mediante la función logística:

```
P(y=1|x) = σ(wᵀx + b) = 1 / (1 + e^(−(wᵀx+b)))
```

Parámetros: `max_iter=2000` (convergencia con datos de alta dimensión), `solver='lbfgs'` (eficiente para datasets medianos), `C=1.0` (regularización L2 por defecto).

Ventaja: coeficientes directamente interpretables. Limitación: solo captura relaciones lineales.

#### Random Forest

Ensemble de T árboles de decisión entrenados con:
- **Bagging**: cada árbol ve una muestra bootstrap del train set (con reemplazo)
- **Feature randomness**: en cada nodo, solo se consideran √d features aleatorias para el split

La predicción es la media de las probabilidades de todos los árboles:
```
P̂(y=1|x) = (1/T) Σᵢ P̂ᵢ(y=1|x)
```

```python
RandomForestClassifier(
    n_estimators=300,    # 300 árboles: suficiente para estabilizar la varianza
    max_features='sqrt', # √64 ≈ 8 features por nodo en aves
    class_weight='balanced',
    random_state=42,
    n_jobs=-1            # paralelizar en todos los cores
)
```

**¿Por qué 300 árboles y no 100 o 1000?**
- Con pocos árboles la varianza de la predicción es alta (resultados variables entre ejecuciones).
- A partir de ~200 árboles la varianza se estabiliza y agregar más no mejora el AUC.
- 300 es el punto de compromiso estándar entre rendimiento y tiempo de cómputo.

**¿Por qué `max_features='sqrt'`?**
Es la heurística estándar para clasificación. Expone a cada árbol a un subconjunto diferente de features, forzando diversidad entre árboles. Sin esto, todos verían las mismas features y estarían correlacionados, reduciendo el beneficio del ensemble.

#### Gradient Boosting (HistGradientBoosting)

Construye árboles secuencialmente donde cada árbol corrige los residuos del anterior:

```
F_m(x) = F_{m-1}(x) + η · h_m(x)
```

donde h_m es el árbol que mejor ajusta el gradiente del error de F_{m-1}.

```python
HistGradientBoostingClassifier(
    class_weight='balanced',
    max_iter=300,        # número máximo de árboles
    learning_rate=0.05,  # η pequeño → aprendizaje más suave, menos overfitting
    random_state=42
)
```

**¿Por qué `learning_rate=0.05` y no mayor?**
Un learning rate alto (e.g. 0.3) converge rápido pero puede saltar el mínimo del error (overfitting). Uno bajo (0.05) requiere más árboles pero produce modelos más generalizables. Con `max_iter=300` y lr=0.05 se recorre suficiente del espacio de soluciones.

#### SVM con kernel RBF

Busca el hiperplano de margen máximo en un espacio de alta dimensión implícito definido por el kernel radial:

```
K(x, x') = exp(−γ ||x − x'||²)
```

Requiere normalización de variables (de ahí el `Pipeline` con `StandardScaler`), porque la distancia euclidiana no tiene sentido cuando las features tienen escalas muy distintas (masa corporal en gramos vs. temperatura en décimas de grado).

```python
Pipeline([
    ('scaler', StandardScaler()),  # z-score: media=0, std=1 por feature
    ('clf', SVC(
        class_weight='balanced',
        probability=True,   # necesario para predict_proba (Platt scaling)
        kernel='rbf',
        random_state=42
    ))
])
```

#### KNN

Clasifica cada punto por votación ponderada de sus k vecinos más cercanos. Con `weights='distance'`, los vecinos más cercanos tienen más influencia:

```
P(y=1|x) = Σᵢ (1/dᵢ · 𝟙[yᵢ=1]) / Σᵢ (1/dᵢ)
```

```python
Pipeline([
    ('scaler', StandardScaler()),  # crítico: KNN es puramente basado en distancias
    ('clf', KNeighborsClassifier(
        n_neighbors=7,         # k=7 es estándar para datasets medianos
        weights='distance',    # vecinos más cercanos pesan más
        n_jobs=-1
    ))
])
```

**Limitación de KNN con desbalance**: KNN no tiene `class_weight`. Con 1:35 de desbalance, los 7 vecinos de una especie amenazada son casi siempre no amenazadas, lo que sesga la predicción. Por eso KNN obtiene el peor ROC-AUC (0.696) entre los 5 modelos.

---

## 7. Protocolo de Validación

### Intuitivo

Para saber si un modelo realmente "aprendió" o simplemente memorizó, hay que evaluarlo en datos que **nunca vio durante el entrenamiento**.

**K-Fold**: dividir los datos en K partes. Entrenar con K−1 partes y evaluar con la parte restante. Repetir K veces cambiando cuál parte se evalúa. El resultado final es el promedio de las K evaluaciones.

**¿Por qué "estratificado"?** Con solo 36 especies amenazadas en 1313, si la división es al azar, algún pliegue podría quedar con 0 especies amenazadas — y el modelo no puede aprender ni evaluar lo que nunca vio. La estratificación garantiza que cada pliegue tenga la misma proporción de amenazadas que el dataset completo (~2.7%).

### Formal

**Stratified K-Fold** con k=5 particiona el conjunto D en 5 subconjuntos D₁,...,D₅ tal que:

```
|Dᵢ ∩ {y=1}| / |Dᵢ| ≈ |{y=1}| / |D|  ∀i
```

Para cada iteración i:
- Train: D \ Dᵢ (el 80% restante)
- Test: Dᵢ (el 20%)

```python
# Notebook 06 — validación cruzada estratificada
from sklearn.model_selection import StratifiedKFold, cross_validate

CV = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)
# shuffle=True: aleatoriza el orden antes de dividir
# random_state=42: reproducibilidad

results = cross_validate(
    model, X, y,
    cv=CV,
    scoring=['roc_auc', 'average_precision', 'f1'],
    n_jobs=-1   # evaluar los 5 pliegues en paralelo
)
```

**¿Por qué k=5 y no k=10?**
- k=10 da estimaciones más precisas pero es 2× más lento.
- Con n=1313 (aves), k=5 deja ~262 muestras de test por pliegue — suficiente para estimar AUC estable.
- Para mamíferos (n=189), k=5 deja ~38 muestras de test por pliegue — con k=10 quedarían ~19, muy pocas para estimar probabilidades.

---

## 8. Métricas de Evaluación

### Intuitivo

**¿Por qué no usar "accuracy" (exactitud)?**

Con 2.7% de amenazadas, un modelo que predice "no amenazada" para *todo* tiene accuracy = 97.3%. Perfecto en papel, inútil en la práctica.

Necesitamos métricas que midan específicamente qué tan bien el modelo identifica la clase minoritaria.

**ROC-AUC**: imagina que tomás al azar una especie amenazada y una no amenazada. ¿Con qué probabilidad el modelo asigna mayor probabilidad a la amenazada? Si AUC = 0.848, en el 84.8% de los pares lo hace correctamente.

**PR-AUC (Área bajo la curva Precisión-Recall)**: de todas las especies que el modelo señala como amenazadas, ¿qué fracción realmente lo es (precisión)? Y de todas las realmente amenazadas, ¿qué fracción detecta (recall)? PR-AUC resume este compromiso.

**F1**: media armónica de precisión y recall. Vale 1 solo si precisión=1 y recall=1 simultáneamente.

### Formal

Sea TP, FP, TN, FN los conteos de verdaderos positivos, falsos positivos, etc.

```
Precisión = TP / (TP + FP)     # de las predichas +, cuántas son realmente +
Recall    = TP / (TP + FN)     # de las realmente +, cuántas predijo como +
F1        = 2 · (P · R) / (P + R)

ROC-AUC = P(score(x⁺) > score(x⁻)) para x⁺ ∈ clase+ y x⁻ ∈ clase-
PR-AUC  = ∫ Precisión(t) d[Recall(t)]
```

**¿Por qué PR-AUC es más informativo que ROC-AUC con desbalance severo?**

ROC-AUC incluye los verdaderos negativos (TN) en su cálculo (a través de la tasa de falsos positivos = FP/(FP+TN)). Con 1277 negativos y solo 36 positivos, TN es enorme y domina el denominador, haciendo que ROC-AUC parezca optimista incluso para modelos mediocres.

PR-AUC no usa TN en su cálculo, por lo que es más sensible al rendimiento real sobre la clase minoritaria. La **línea base** de PR-AUC es la prevalencia (0.027 para aves): un clasificador aleatorio obtiene PR-AUC ≈ 0.027. Random Forest obtuvo 0.204 → es **7.5× mejor que el azar** en detectar las amenazadas.

---

## 9. Por qué Ganó Random Forest

### Intuitivo

Random Forest ganó por tres razones prácticas:
1. Las features más importantes (masa corporal, longitud de ala) tienen distribuciones muy asimétricas con outliers. Los árboles no se ven afectados por esto; la regresión logística sí.
2. Hay interacciones entre variables (p.ej., "masa grande Y rango pequeño → muy amenazada") que los modelos lineales no capturan pero los árboles sí.
3. Con 64 features y solo 36 positivos, los modelos más complejos (SVM, GB) tienden a sobreajustarse; RF tiene una regularización implícita por el bagging.

### Formal

| Modelo | ROC-AUC aves | PR-AUC aves | F1 aves |
|--------|-------------|-------------|---------|
| **Random Forest** | **0.848** | **0.204** | **0.130** |
| SVM | 0.834 | 0.190 | 0.176 |
| Gradient Boosting | 0.786 | 0.175 | 0.174 |
| Logistic Regression | 0.797 | 0.281 | 0.213 |
| KNN | 0.696 | 0.118 | 0.085 |

**Nota interesante**: Logistic Regression tiene mejor PR-AUC y F1 que RF. Esto sugiere que la frontera de decisión para las aves tiene componentes lineales importantes, y que RF —al ser no calibrado— produce probabilidades brutas que perjudican su PR-AUC. Sin embargo, RF se seleccionó por ROC-AUC, que es la métrica más robusta y threshold-independent para comparar el poder discriminativo general.

**Ventajas estructurales de RF para este problema:**
- **Invarianza a escala**: no requiere normalización. Masa en gramos y temperatura en décimas de grado coexisten sin problema.
- **Manejo implícito de outliers**: un árbol parte por comparaciones `x > threshold`; un outlier solo afecta a los nodos donde cae, no a todo el modelo.
- **Captura de interacciones**: los árboles capturan naturalmente "if mass > 1000g AND range < 5000km² then threatened" sin que se lo especifiques.
- **Importancia de variables gratuita**: sale directamente del entrenamiento (reducción de impureza de Gini por feature).

---

## 10. Umbral de Decisión Adaptativo

### Intuitivo

El modelo genera una probabilidad por especie (0 a 1). Para convertirla en "amenazada/no amenazada" hay que elegir un corte: probabilidades mayores al corte → amenazada.

El corte estándar es 0.5. Pero con 2.7% de amenazadas, el modelo nunca produce probabilidades de 0.5 para la clase rara — porque ha visto que el 97.3% de las especies son no amenazadas, así que sus probabilidades "ancla" en valores bajos.

**La solución**: usar como corte la prevalencia real del entrenamiento (2.7% para aves). Esto dice: "predice amenazada si la probabilidad supera lo que esperarías por azar". Tiene sentido intuitivo: si el modelo asigna 5% a una especie, y la probabilidad base es 2.7%, el modelo cree que esa especie tiene el doble de riesgo que una especie al azar — eso es suficiente evidencia.

### Formal

El umbral óptimo bajo **costos simétricos** es aquel que iguala las pérdidas esperadas de FP y FN:

```
C_FN · P(y=1) = C_FP · P(y=0)
```

Con costos simétricos (C_FN = C_FP), el umbral óptimo es:

```
t* = P(y=1) = prevalencia del entrenamiento
```

Este resultado es el **clasificador óptimo de Bayes** para distribución de clase desbalanceada con pérdidas iguales.

```python
# Notebook 06 — umbral adaptativo
umbral_aves = float(y_aves.mean())  # 36/1313 = 0.0274
umbral_mam  = float(y_mam.mean())   # 13/189  = 0.0688

prob_aves = modelo_aves.predict_proba(X_aves_pred)[:, 1]
prob_mam  = modelo_mam.predict_proba(X_mam_pred)[:, 1]

pred_aves = (prob_aves >= umbral_aves).astype(int)  # 31/165 = 1
pred_mam  = (prob_mam  >= umbral_mam).astype(int)   # 18/37  = 1
```

**¿Por qué RF produce probabilidades bajas aun con `class_weight='balanced'`?**

`class_weight` pondera los errores durante el entrenamiento (afecta el split criterion), pero las probabilidades de `predict_proba` se estiman como fracción de muestras de cada clase en las hojas del árbol. Las hojas siguen siendo mayoritariamente no amenazadas en los datos originales, así que las probabilidades brutas son bajas. Para calibrar las probabilidades a valores reales se necesitaría `CalibratedClassifierCV` (trabajo futuro).

---

## 11. Importancia de Variables

### Intuitivo

Random Forest puede decirnos qué features "usó más" para tomar sus decisiones. Si una feature aparece muy alto en los árboles (muchas divisiones pasan por ella y reducen mucho la impureza), es importante.

En aves: **longitud de ala y masa corporal** dominan. Tiene sentido — las aves grandes (rapaces, curasows, loros grandes) son precisamente las más cazadas y las más dependientes de bosque maduro.

En mamíferos: **masa corporal con 38.9%** domina completamente. Los mamíferos grandes son K-selectores extremos: pocas crías, lento desarrollo, territorios enormes. Cuando su hábitat se fragmenta no pueden recuperarse.

### Formal

La **impureza de Gini** mide la probabilidad de clasificar incorrectamente una muestra al azar:

```
Gini(t) = 1 - Σⱼ p²ⱼ(t)
```

La importancia de la feature f en el árbol T es la suma de reducciones de Gini ponderadas por el número de muestras que pasan por cada nodo donde f es usado para dividir:

```
Importance_T(f) = Σ_{nodos donde split(n)=f} [w(n) · ΔGini(n)]
```

La importancia global es el promedio sobre todos los árboles del forest. Esta métrica puede ser sesgada hacia features de alta cardinalidad y features continuas, pero para nuestro caso (features biológicas continuas vs. OHE binarias) es razonablemente confiable.

```python
# Notebook 06 — extracción de importancias
def get_feature_importance(modelo, top_n=20):
    clf = modelo.named_steps['clf'] if hasattr(modelo, 'named_steps') else modelo
    feature_names = clf.feature_names_in_
    importancias  = clf.feature_importances_  # array de shape (n_features,)

    fi = pd.Series(importancias, index=feature_names)
    return fi.sort_values(ascending=False).head(top_n)

fi_aves = get_feature_importance(modelo_aves)
# Wing.Length: 12.4%
# Mass:        11.8%
# Beak.Depth:   9.1%
# Range.Size:   8.7%
```

**¿Por qué variables de presión humana aparecen abajo?**

Dos razones:
1. Los criterios IUCN (A-E) están definidos principalmente en función de tamaño de rango y tendencia poblacional — que correlacionan directamente con rasgos biológicos.
2. El centroide único por especie promedia toda su distribución geográfica, diluyendo la señal local de presión humana. Una especie que tiene el 10% de sus registros en una zona minera activa obtiene `pct_min_ilegal ≈ 0.10` — señal débil.

---

## 12. Pipeline Completo

```
01_descarga_gbif.ipynb
    ↓ pygbif API → 1.37M registros
    ↓ occurrences.csv

02_descarga_datasets.ipynb
    ↓ Wikidata SPARQL → iucn_aves.csv, iucn_mamiferos.csv
    ↓ gdalwarp → rasters recortados a Bolivia
    ↓ RAISG shapefiles descargados

03_extraccion_espacial.ipynb
    ↓ centroide mediana por especie
    ↓ rasterio.sample → variables WorldClim, GFW, MapBiomas
    ↓ geopandas.sjoin → variables RAISG
    ↓ species_features.parquet (1704 × 51)

04_construccion_features.ipynb
    ↓ split aves / mamíferos
    ↓ split train (con IUCN) / predict (sin IUCN)
    ↓ limpieza nodata
    ↓ imputación (fit SOLO en train)
    ↓ OHE variables categóricas AVONET
    ↓ aves_train.parquet (1313 × 64)
    ↓ aves_predict.parquet (165 × 64)
    ↓ mamiferos_train.parquet (189 × 29)
    ↓ mamiferos_predict.parquet (37 × 29)

05_eda.ipynb
    ↓ distribuciones por clase
    ↓ heatmap correlaciones
    ↓ correlaciones punto-biserial con target
    ↓ figuras para informe (.png)

06_modelos.ipynb
    ↓ Stratified K-Fold k=5
    ↓ 5 modelos × 2 grupos × 3 métricas
    ↓ selección: Random Forest (mejor ROC-AUC)
    ↓ refit en 100% train
    ↓ feature importance
    ↓ predict_proba con umbral adaptativo (prevalencia)
    ↓ predicciones.parquet (202 especies)
```

### Decisiones clave en una tabla

| Decisión | Alternativa descartada | Razón |
|----------|----------------------|-------|
| Clasificación binaria | Multiclase LC/NT/VU/EN/CR | Muy pocos ejemplos por categoría fina |
| Modelos separados por clase | Un modelo unificado | Rasgos distintos, desbalances distintos |
| Centroide = mediana | Media aritmética | Robustez ante coordenadas erróneas |
| `class_weight='balanced'` | SMOTE oversampling | Equivalente matemáticamente, más simple |
| Stratified K-Fold | K-Fold sin estratificar | Con 36 positivos, un pliegue podría quedar vacío |
| ROC-AUC como criterio de selección | F1, accuracy | Threshold-independent, robusto al desbalance |
| Umbral = prevalencia | Umbral 0.5 | Clasificador de Bayes óptimo bajo costos simétricos |
| Imputación fit-solo-en-train | Imputación global | Evita data leakage |
| OHE con drop_first | OHE completo | Evita multicolinealidad perfecta |

---

## 13. Explicación de Métricas para Presentación

### 13.1 Base: Matriz de Confusión

Todo parte de 4 conteos. Dado un umbral de decisión, cada predicción cae en una celda:

```
                    PREDICHO
                  +               -
         ┌─────────────────┬─────────────────┐
    +    │  TP              │  FN              │  ← amenazadas reales
REAL     │  (acierto +)     │  (se escapó)     │
         ├─────────────────┼─────────────────┤
    -    │  FP              │  TN              │  ← no amenazadas reales
         │  (falsa alarma)  │  (acierto -)     │
         └─────────────────┴─────────────────┘
```

- **TP**: amenazada real, modelo dijo amenazada ✓
- **FN**: amenazada real, modelo dijo no amenazada ✗ — el peor error
- **FP**: no amenazada, modelo dijo amenazada ✗ — falsa alarma
- **TN**: no amenazada, modelo dijo no amenazada ✓

---

### 13.2 Precisión y Recall

```
              TP                          TP
Precisión = ──────          Recall = ──────────
            TP + FP                  TP + FN
```

- **Precisión**: de todo lo que el modelo marcó como amenazada, ¿cuántas realmente lo eran? → mide falsas alarmas
- **Recall**: de todas las amenazadas reales, ¿cuántas detectó? → mide cuántas se escaparon

Hay un **trade-off permanente**: bajar el umbral de decisión sube el recall pero baja la precisión.

---

### 13.3 ROC-AUC

Para cada umbral posible (0.01, 0.02, ..., 0.99) se calcula:

```
TPR (= Recall)     = TP / (TP + FN)      ← eje Y
FPR (tasa falsos+) = FP / (FP + TN)      ← eje X
```

Se grafica TPR vs FPR para todos los umbrales → curva ROC. El AUC es el área bajo esa curva.

**Interpretación intuitiva**: si tomas al azar una especie amenazada y una no amenazada, AUC es la probabilidad de que el modelo le asigne mayor puntaje a la amenazada. Con RF: 84.8% de los pares son ordenados correctamente.

**Línea base = 0.5** siempre, independiente del desbalance (un clasificador aleatorio sigue la diagonal).

**Escala**:
```
0.5         0.7         0.8         0.9         1.0
 |-----------|-----------|-----------|-----------|
 Azar       Aceptable    Bueno      Excelente  Perfecto
```

**Por qué ROC-AUC puede ser optimista con desbalance severo**: FPR usa TN en el denominador. Con 1.277 no-amenazadas, TN es enorme → FPR siempre es pequeño → la curva parece buena incluso para modelos mediocres.

---

### 13.4 PR-AUC y su línea base real

Para cada umbral se calcula Precisión y Recall → curva PR. El AUC es el área bajo esa curva.

**La línea base NO es 0.5 — es la prevalencia de la clase positiva.**

Justificación: un clasificador aleatorio que predice "amenazada" con probabilidad p tiene precisión esperada = p = prevalencia. Para aves: 36/1313 = **0.027**.

```
Escala PR-AUC (aves):
  0.027        0.10         0.20         0.50        1.0
   |------------|------------|------------|-----------|
  Azar         Bajo        Moderado      Bueno      Perfecto
  (prevalencia
   real = 2.7%)
```

Multiplicador de RF sobre el azar: 0.192 / 0.027 = **7.1×**

| Modelo | PR-AUC | Veces mejor que azar |
|---|---|---|
| KNN | 0.098 | 3.6× |
| Logistic Regression | 0.121 | 4.5× |
| Gradient Boosting | 0.168 | 6.2× |
| **Random Forest** | **0.192** | **7.1×** |

PR-AUC es más informativo que ROC-AUC con desbalance severo porque **no usa TN** en ningún cálculo.

---

### 13.5 F1-macro y por qué es bajo

```
                2 × Precisión × Recall
F1 =  ─────────────────────────────────────
              Precisión + Recall

F1-macro = (F1_clase0 + F1_clase1) / 2
```

**Por qué F1-macro es ~0.13 aunque el modelo funcione bien:**

Con 5-fold CV, cada pliegue de test tiene ~7 amenazadas. Ejemplo de un pliegue malo:

```
Amenazadas reales: 7
Modelo predice:    0 amenazadas  →  TP=0, FN=7, FP=0

Precisión = 0/0 → 0  (por convención)
Recall    = 0/7 = 0
F1_clase1 = 0

F1_clase0 ≈ 0.97  (predice bien la mayoría)
F1-macro  = (0.97 + 0) / 2 = 0.485  ← este pliegue colapsa
```

El promedio de 5 pliegues termina cerca de 0.13. **No porque el modelo sea malo, sino porque con 7 positivos de test un solo pliegue conservador hunde el promedio.**

---

### 13.6 Tabla resumen para presentación

| Métrica | Pregunta que responde | Línea base (azar) | RF obtiene | Interpretación |
|---|---|---|---|---|
| ROC-AUC | ¿Distingue bien amenazadas de no amenazadas? | 0.50 (siempre) | 0.848 | Muy bueno |
| PR-AUC | ¿Es preciso cuando los positivos son raros? | **0.027** (prevalencia) | 0.192 | 7.1× mejor que azar |
| F1-macro | ¿Es justo con ambas clases? | ~0.05 | 0.130 | Limitado por pocos positivos |

La métrica más confiable para comparar modelos en este problema es **ROC-AUC**: es threshold-independent, no se deforma por el desbalance de la misma forma que PR-AUC, y no colapsa por pliegues sin positivos como F1.

---

### 13.7 Por qué RF gana sobre Gradient Boosting (pregunta frecuente)

GB **no es una mejora de RF** — son paradigmas distintos:

| | Random Forest | Gradient Boosting |
|---|---|---|
| Construcción | 300 árboles en **paralelo** (bagging) | Árboles en **secuencia**, cada uno corrige al anterior |
| Problema que resuelve | Reduce **varianza** | Reduce **bias** |
| Riesgo | Pierde señal en clases raras | Se sobreajusta con pocos datos |

Con solo 36 positivos y 64 features (aves), GB tiene demasiada capacidad → sobreajuste. RF tiene regularización implícita (bagging + max_features=√64).

**Regla general: GB gana con muchos datos. RF gana con pocos positivos y muchas features.**

Nota: mirando solo aves, Logistic Regression tiene mejor PR-AUC (0.281) y F1 (0.213) que RF. Esto se debe a que RF genera probabilidades no calibradas — `predict_proba` refleja proporciones de hojas, no probabilidades reales. Trabajo futuro: `CalibratedClassifierCV`.

---

*Generado como referencia técnica del proyecto BioAlerta — Marzo 2026*
