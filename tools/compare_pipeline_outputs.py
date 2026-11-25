"""Summarise pipeline output for Figma exports: python tools/compare_pipeline_outputs.py <project-root> <export.json>...

Run it once with a checkout of the previous version as <project-root> and once with this one to compare models.
"""
import collections
import contextlib
import io
import json
import os
import sys
import warnings

warnings.simplefilter("ignore")
root, *files = sys.argv[1:]
root = os.path.abspath(root)
files = [os.path.abspath(f) for f in files]
sys.path.insert(0, root)
os.chdir(root)
from src.pipeline import execute_full_pipeline  # noqa: E402

for f in files:
    data = json.load(open(f, encoding="utf-8-sig"))
    buf = io.StringIO()
    try:
        with contextlib.redirect_stdout(buf):
            r = execute_full_pipeline(data, sync_to_disk=False)
    except Exception as e:
        print(f"{os.path.basename(f):24} ERROR {type(e).__name__}: {str(e)[:120]}")
        continue
    page = r["pageJson"]
    types = collections.Counter(w["componentType"] for w in page["widgets"])
    charts = [w for w in page["widgets"] if w["componentType"] == "CHART"]
    with_data = sum(1 for w in charts if w.get("chartData"))
    tables = [w for w in page["widgets"] if w["componentType"] == "TABLE"]
    trows = sum(len((w.get("tableConfig") or {}).get("rows") or []) for w in tables)
    print(
        f"{os.path.basename(f):24} widgets={len(page['widgets']):3} review={page['validation']['reviewRequired']:2} "
        f"charts_w_data={with_data}/{len(charts)} table_rows={trows:3} stdout={len(buf.getvalue()):7}B {dict(types)}"
    )
