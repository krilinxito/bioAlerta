"""
BioAlerta — Preprocesamiento de datos para el sitio web
Ejecutar: conda run -n bioalerta python bioalerta-web/scripts/prepare_data.py
"""
import os
import json
import shutil
import pandas as pd
import geopandas as gpd
from pathlib import Path

BASE = Path("/home/max1/ml/proy_sup")
DATA = BASE / "data"
OUT  = BASE / "bioalerta-web/public/data"
OUT.mkdir(parents=True, exist_ok=True)

EXOTIC = {"Ovis aries", "Equus caballus", "Bos taurus", "Capra hircus",
          "Bubalus bubalis", "Sus scrofa"}

# ─────────────────────────────────────────────────────────────────
# 1. Species predictions + coordinates
# ─────────────────────────────────────────────────────────────────
print("Procesando especies...")
preds = pd.read_parquet(DATA / "processed/predicciones.parquet")
feats = pd.read_parquet(DATA / "processed/species_features.parquet")

# species name puede ser el índice
if feats.index.name == "species" or "species" not in feats.columns:
    feats = feats.reset_index()
    if feats.columns[0] != "species":
        feats = feats.rename(columns={feats.columns[0]: "species"})

KEEP_FEATS = [
    "species", "lat_centroid", "lon_centroid", "iucn_categoria",
    "pct_forest_loss_total", "pct_forest_loss_recent",
    "pct_anp", "pct_min_ilegal", "pct_petroleo", "pct_ti",
    "n_occ"
]
keep = [c for c in KEEP_FEATS if c in feats.columns]
feats_slim = feats[keep].copy()

# Merge predictions con features
merged = preds.merge(feats_slim, on="species", how="left")
merged["prob_threatened"] = merged["prob_threatened"].round(4)
merged["is_exotic"] = merged["species"].isin(EXOTIC)

merged.to_json(OUT / "species.json", orient="records", force_ascii=False, indent=0)
print(f"  species.json: {len(merged)} filas")

# All species para la capa base del mapa
all_sp = feats_slim.copy()
all_sp["prob_threatened"] = None
all_sp["pred_threatened"] = None
all_sp["is_exotic"] = all_sp["species"].isin(EXOTIC)

# Sobreescribir con predicciones donde existan
pred_dict = preds.set_index("species").to_dict(orient="index")
for idx, row in all_sp.iterrows():
    sp = row["species"]
    if sp in pred_dict:
        all_sp.at[idx, "prob_threatened"] = round(pred_dict[sp]["prob_threatened"], 4)
        all_sp.at[idx, "pred_threatened"] = int(pred_dict[sp]["pred_threatened"])

# Agregar class desde preds donde no esté
if "class" not in all_sp.columns and "class" in preds.columns:
    class_dict = preds.set_index("species")["class"].to_dict()
    all_sp["class"] = all_sp["species"].map(class_dict)
elif "class" in feats.columns:
    all_sp["class"] = feats["class"].values

all_sp.to_json(OUT / "species_all.json", orient="records", force_ascii=False, indent=0)
print(f"  species_all.json: {len(all_sp)} filas")


# ─────────────────────────────────────────────────────────────────
# 2. Shapefiles → GeoJSON simplificados
# ─────────────────────────────────────────────────────────────────
def save_geojson(src_path, out_path, simplify_tol=None, keep_cols=None,
                 dissolve_by=None, skip_if_exists=False):
    out_path = Path(out_path)
    if skip_if_exists and out_path.exists():
        print(f"  SKIP (ya existe): {out_path.name}")
        return

    src_path = Path(src_path)
    if not src_path.exists():
        print(f"  WARN: no existe {src_path}")
        return

    print(f"  Leyendo {src_path.name}...")
    gdf = gpd.read_file(src_path)
    gdf = gdf.to_crs("EPSG:4326")

    if dissolve_by and dissolve_by in gdf.columns:
        print(f"    Dissolve por {dissolve_by}...")
        gdf = gdf.dissolve(by=dissolve_by).reset_index()
    elif dissolve_by == "_all":
        gdf["_key"] = 1
        gdf = gdf.dissolve(by="_key").reset_index(drop=True)

    if simplify_tol:
        gdf["geometry"] = gdf["geometry"].simplify(simplify_tol, preserve_topology=True)

    if keep_cols:
        available = [c for c in keep_cols if c in gdf.columns]
        gdf = gdf[available + ["geometry"]]

    gdf = gdf[~gdf.geometry.is_empty & gdf.geometry.notna()]
    gdf.to_file(str(out_path), driver="GeoJSON")

    size_kb = out_path.stat().st_size / 1024
    print(f"    → {out_path.name}: {len(gdf)} features, {size_kb:.0f} KB")


raisg = DATA / "raisg"

save_geojson(
    raisg / "Anps_jun2025/ANP_nacional.shp",
    OUT / "anp_nacional.geojson",
    simplify_tol=0.005,
    keep_cols=["nombre", "categoria", "area_ha"]
)

save_geojson(
    raisg / "Anps_jun2025/ANP_departamental.shp",
    OUT / "anp_departamental.geojson",
    simplify_tol=0.005,
    keep_cols=["nombre", "categoria"]
)

save_geojson(
    raisg / "Tis_Junho2025/Tis_TerritoriosIndigenas.shp",
    OUT / "territorios_indigenas.geojson",
    simplify_tol=0.01,
    keep_cols=["nombre", "status", "pais"]
)

save_geojson(
    raisg / "Petroleo_jun2025/petroleo.shp",
    OUT / "petroleo.geojson",
    simplify_tol=0.005,
    keep_cols=["nombre", "situacion", "pais"]
)

save_geojson(
    raisg / "MIneriaIlegal_2020/MineriaIlegal_pol.shp",
    OUT / "mineria_ilegal.geojson",
    simplify_tol=0.005,
    keep_cols=["pais", "area_km2"]
)

save_geojson(
    raisg / "ZonasMineras_jun2025/mineria.shp",
    OUT / "zonas_mineras.geojson",
    simplify_tol=0.01,
    dissolve_by="tipo_miner",
    keep_cols=["tipo_miner"]
)

save_geojson(
    raisg / "Vias_jun2025/vias_nacional.shp",
    OUT / "vias.geojson",
    simplify_tol=0.005,
    keep_cols=["nombre", "tipo"]
)

# Quemas: checkpoint porque dissolve de 1.3M features tarda varios minutos
save_geojson(
    raisg / "quemas2020/quemas.shp",
    OUT / "quemas.geojson",
    simplify_tol=0.01,
    dissolve_by="_all",
    skip_if_exists=True
)

# Mining GeoJSON (ya existe, copiar directo)
mining_src = DATA / "mining/mining_bolivia.geojson"
if mining_src.exists():
    shutil.copy(mining_src, OUT / "mining_bolivia.geojson")
    print(f"  mining_bolivia.geojson copiado ({mining_src.stat().st_size//1024} KB)")

# ─────────────────────────────────────────────────────────────────
# 3. Reporte de tamaños
# ─────────────────────────────────────────────────────────────────
print("\n─── Tamaños de archivos generados ───")
for f in sorted(OUT.iterdir()):
    kb = f.stat().st_size / 1024
    flag = " ⚠ >2MB" if kb > 2048 else ""
    print(f"  {f.name:40s} {kb:7.0f} KB{flag}")

print("\nDone.")
