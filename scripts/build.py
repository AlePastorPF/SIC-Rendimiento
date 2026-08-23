#!/usr/bin/env python3
"""
Build script for the S.I.C. "Reporte General" dashboard.

What it does:
1. Reads data/SIC_Carga.xlsx (sheet "GPS").
2. Keeps only the "Session" rows (one row per player per activity).
3. Groups/averages, normalizes the date column, and applies known data fixes.
4. Encodes everything into a compact JSON blob.
5. Injects that JSON (plus the club logos and the app code) into template/template.html.
6. Writes the final, self-contained index.html to the repo root.

This script has NO dependency on anything outside this repo (no network calls,
no external services) other than the Python packages listed in requirements.txt.
It is meant to be run automatically by the GitHub Action in
.github/workflows/build.yml every time data/SIC_Carga.xlsx changes, but you can
also run it locally with:

    pip install -r scripts/requirements.txt
    python scripts/build.py
"""
import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
DATA_XLSX = ROOT / "data" / "SIC_Carga.xlsx"
TEMPLATE_HTML = ROOT / "template" / "template.html"
APP_JS = ROOT / "template" / "app.js"
LOGO_B64_TXT = ROOT / "assets" / "logo_b64.txt"
LOGOS_B64_JSON = ROOT / "assets" / "logos_b64.json"
LOGOS_SMALL_B64_JSON = ROOT / "assets" / "logos_small_b64.json"
OUTPUT_HTML = ROOT / "index.html"

# ---------------------------------------------------------------------------
# Known data fixes.
# Add entries here whenever a specific activity has a wrong date (or any other
# known bad value) in the source spreadsheet, so the fix is re-applied
# automatically on every rebuild instead of depending on the raw file being
# corrected upstream. Ideally these get fixed at the source (Catapult/OpenField)
# eventually, but until then this keeps the published report correct.
# ---------------------------------------------------------------------------
KNOWN_DATE_FIXES = {
    "SIC #63": "2026-08-10",
    "SIC #64": "2026-08-11",
}


def parse_fecha(x):
    if isinstance(x, str):
        return pd.to_datetime(x, dayfirst=True, errors="coerce")
    return pd.to_datetime(x, errors="coerce")


def build_dataset():
    if not DATA_XLSX.exists():
        sys.exit(f"ERROR: no se encontro {DATA_XLSX}. Subi la planilla SIC_Carga.xlsx a la carpeta data/.")

    df = pd.read_excel(DATA_XLSX, sheet_name="GPS")
    sess = df[df["Periodo"] == "Session"].copy()

    cols = [
        "Jugador", "Temporada", "Etiqueta de Actividad", "Actividad", "Fecha", "Puesto",
        "Distancia", "HSR (>5 m/s)", "Esf Expl", "RHIE Total Bouts", " # BiG ",
        "Contactos", "Max Vel", "Duracion (min)",
    ]
    sub = sess[cols].copy()
    sub.columns = [
        "Jugador", "Temporada", "Tipo", "Actividad", "Fecha", "Puesto",
        "Distancia", "HSR", "EsfExpl", "RHIE", "BiG", "Contactos", "MaxVel", "DuracionMin",
    ]

    sub["Fecha"] = sub["Fecha"].apply(parse_fecha)
    sub = sub.dropna(subset=["Fecha"])

    grp = sub.groupby(
        ["Jugador", "Temporada", "Tipo", "Actividad", "Fecha", "Puesto"], as_index=False
    ).agg({
        "Distancia": "mean", "HSR": "mean", "EsfExpl": "mean", "RHIE": "mean",
        "BiG": "mean", "Contactos": "mean", "MaxVel": "mean", "DuracionMin": "mean",
    })

    grp["Fecha"] = pd.to_datetime(grp["Fecha"]).dt.strftime("%Y-%m-%d")

    for actividad, fixed_date in KNOWN_DATE_FIXES.items():
        mask = grp["Actividad"] == actividad
        n = int(mask.sum())
        if n:
            grp.loc[mask, "Fecha"] = fixed_date
            print(f"[fix] {actividad}: {n} fila(s) -> Fecha corregida a {fixed_date}")

    numcols = ["Distancia", "HSR", "EsfExpl", "RHIE", "BiG", "Contactos", "MaxVel", "DuracionMin"]
    for c in numcols:
        grp[c] = pd.to_numeric(grp[c], errors="coerce").fillna(0).round(2)

    cat_cols = ["Jugador", "Tipo", "Actividad", "Puesto"]
    dicts = {}
    for c in cat_cols:
        grp[c] = grp[c].fillna("").astype(str)
        uniq = sorted(grp[c].unique().tolist())
        dicts[c] = uniq
        mapping = {v: i for i, v in enumerate(uniq)}
        grp[c] = grp[c].map(mapping)

    grp["Temporada"] = pd.to_numeric(grp["Temporada"], errors="coerce").fillna(0).astype(int)

    cols_order = [
        "Jugador", "Temporada", "Tipo", "Actividad", "Fecha", "Puesto",
        "Distancia", "HSR", "EsfExpl", "RHIE", "BiG", "Contactos", "MaxVel", "DuracionMin",
    ]
    data = grp[cols_order].values.tolist()

    bad = sum(
        1 for row in data for v in row
        if isinstance(v, float) and (np.isnan(v) or np.isinf(v))
    )
    if bad:
        sys.exit(f"ERROR: se encontraron {bad} valores invalidos (NaN/Inf) en los datos procesados.")

    return {"cols": cols_order, "dicts": dicts, "data": data}


def main():
    print(f"Leyendo {DATA_XLSX} ...")
    dataset = build_dataset()
    n_rows = len(dataset["data"])
    n_players = len(dataset["dicts"]["Jugador"])
    n_activities = len(dataset["dicts"]["Actividad"])
    print(f"OK: {n_rows} sesiones procesadas, {n_players} jugadores, {n_activities} actividades.")

    data_json = json.dumps(dataset, ensure_ascii=False, separators=(",", ":"), allow_nan=False)
    json.loads(data_json)  # validate it's strictly valid JSON before embedding

    template = TEMPLATE_HTML.read_text(encoding="utf-8")
    app_js = APP_JS.read_text(encoding="utf-8")
    logo_b64 = LOGO_B64_TXT.read_text(encoding="utf-8").strip()
    logos_json = LOGOS_B64_JSON.read_text(encoding="utf-8")
    logos_small_json = LOGOS_SMALL_B64_JSON.read_text(encoding="utf-8")
    logo_src = f"data:image/png;base64,{logo_b64}"

    out = template.replace("__LOGO_SRC__", logo_src)
    out = out.replace("__DATA_JSON__", data_json)
    out = out.replace("__LOGOS_JSON__", logos_json)
    out = out.replace("__LOGOS_SMALL_JSON__", logos_small_json)
    out = out.replace("__APP_JS__", app_js)

    leftover = [p for p in ["__LOGO_SRC__", "__DATA_JSON__", "__LOGOS_JSON__", "__LOGOS_SMALL_JSON__", "__APP_JS__"] if p in out]
    if leftover:
        sys.exit(f"ERROR: quedaron placeholders sin reemplazar: {leftover}")

    OUTPUT_HTML.write_text(out, encoding="utf-8")
    print(f"Listo: {OUTPUT_HTML} generado ({len(out)/1024:.0f} KB).")


if __name__ == "__main__":
    main()
