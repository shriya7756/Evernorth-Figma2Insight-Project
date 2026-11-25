"""
Comprehensive pipeline diagnostic script.
Traces candidates -> predictions -> cleaning -> grid -> Vista page.
Shows each candidate's journey through the pipeline.
"""

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent

# Load all pipeline stages
candidates_file = ROOT / "dataset" / "new_candidates" / "new_dashboard_candidates.json"
clean_predictions_file = ROOT / "dataset" / "new_candidates" / "new_dashboard_clean_predictions.json"
grid_layout_file = ROOT / "outputs" / "dashboard_configs" / "new_dashboard" / "grid_layout.json"
vista_page_file = ROOT / "outputs" / "vista_pages" / "new_dashboard" / "page.json"

print("=" * 80)
print("PIPELINE DIAGNOSTIC REPORT")
print("=" * 80)

# Load candidates
with open(candidates_file) as f:
    cand_data = json.load(f)
candidates = cand_data["candidates"]

# Load clean predictions
with open(clean_predictions_file) as f:
    pred_data = json.load(f)
predictions = pred_data["predictions"]

# Load grid layout
with open(grid_layout_file) as f:
    grid_data = json.load(f)

# Load Vista page
with open(vista_page_file) as f:
    vista_page = json.load(f)

# Build lookup maps
pred_map = {p["candidate_id"]: p for p in predictions}
grid_map = {c["candidate_id"]: c for c in grid_data["components"]}
widget_map = {w["sourceComponentId"]: w for w in vista_page["widgets"]}

print(f"\n{'='*80}")
print(f"CANDIDATES: {len(candidates)}")
print(f"CLEAN PREDICTIONS: {len(predictions)}")
print(f"GRID COMPONENTS: {len(grid_data['components'])}")
print(f"VISTA WIDGETS: {len(vista_page['widgets'])}")
print(f"{'='*80}\n")

# Table header
print(f"{'ID':<10} {'Name':<30} {'Type':<12} {'Pred':<12} {'Grid':<8} {'Vista':<8} {'Notes'}")
print("-" * 120)

for cand in candidates:
    cid = cand["candidate_id"]
    name = cand["name"][:28]
    cand_type = cand.get("type", "FRAME")[:10]

    pred = pred_map.get(cid)
    pred_type = pred["predicted_type"] if pred else "N/A"
    conf = f"{pred['confidence']:.1f}%" if pred else "N/A"

    grid = grid_map.get(cid)
    in_grid = "YES" if grid else "NO"

    widget = widget_map.get(cid)
    in_vista = "YES" if widget else "NO"

    notes = []
    if pred:
        if pred_type == "OTHER":
            notes.append("Removed in cleaning")
        if pred["confidence"] < 70:
            notes.append(f"Low conf: {conf}")
    if grid and widget:
        if widget["type"] != "column2d" and widget["type"] != "doughnut2d" and widget["type"] != "table":
            notes.append(f"Type: {widget['type']}")
    if not grid and pred_type != "OTHER":
        notes.append("No grid placement")
    if not widget and in_grid == "YES":
        notes.append("No widget created")

    notes_str = "; ".join(notes) if notes else ""

    print(f"{cid:<10} {name:<30} {cand_type:<12} {pred_type:<12} {in_grid:<8} {in_vista:<8} {notes_str}")

print("\n" + "=" * 80)
print("SPECIFIC ISSUES IDENTIFIED:")
print("=" * 80)

# Check for KPI value extraction issues
print("\n1. KPI CARD VALUE EXTRACTION:")
for pred in predictions:
    if pred["predicted_type"] == "KPI_CARD":
        widget = widget_map.get(pred["candidate_id"])
        if widget:
            texts = pred["text_preview"]
            numeric_texts = [t for t in texts if any(c.isdigit() for c in t)]
            actual_value = numeric_texts[0] if numeric_texts else "N/A"
            extracted_value = widget.get("kpiValue", "N/A")
            if actual_value != extracted_value and actual_value != "N/A":
                print(f"  {pred['candidate_id']}: Actual={actual_value}, Extracted={extracted_value}")

# Check for duplicate tables
print("\n2. DUPLICATE TABLE CHECK:")
table_candidates = [p for p in predictions if p["predicted_type"] == "TABLE"]
if len(table_candidates) > 1:
    print(f"  Found {len(table_candidates)} TABLE predictions (should be 1):")
    for t in table_candidates:
        print(f"    {t['candidate_id']}: {t['name']} (parent: {t.get('parent_id', 'N/A')})")
else:
    print(f"  OK: {len(table_candidates)} TABLE prediction(s)")

# Check for chart data extraction
print("\n3. CHART DATA EXTRACTION:")
for pred in predictions:
    if pred["predicted_type"] == "CHART":
        widget = widget_map.get(pred["candidate_id"])
        if widget:
            chart_data = widget.get("chartData", [])
            warning = widget.get("chartDataWarning", "")
            if not chart_data and warning:
                print(f"  {pred['candidate_id']} ({pred['name']}): {warning}")
            elif chart_data:
                print(f"  {pred['candidate_id']} ({pred['name']}): OK - {len(chart_data)} data points")

# Check for donut-chart-container misclassification
print("\n4. DONUT-CHART-CONTAINER (4:271):")
pred_271 = pred_map.get("4:271")
if pred_271:
    print(f"  Predicted: {pred_271['predicted_type']} (confidence: {pred_271['confidence']}%)")
    print(f"  Name: {pred_271['name']}")
    print(f"  Text preview: {pred_271['text_preview']}")
    print(f"  Parent: {pred_271.get('parent_id', 'N/A')}")
    print(f"  Should be: CHART (it's a nested chart visualization)")

print("\n" + "=" * 80)
print("DIAGNOSTIC COMPLETE")
print("=" * 80)
