# Pipeline Diagnosis and Fixes Summary

## Root Cause Analysis

The diagnostic revealed that the problems were primarily in the **downstream pipeline logic**, not the XGBoost model classification itself:

1. **KPI value extraction bug**: Extracted trend percentage instead of actual metric value
2. **Duplicate table detection**: Nested table candidates weren't being removed
3. **Chart data extraction**: Regex patterns failed for certain data layouts
4. **UI display**: Showed widget subtype (e.g., "column2d") instead of component class (e.g., "KPI_CARD")
5. **donut-chart-container misclassification**: XGBoost misclassified at 51% confidence, but downstream cleaning corrected it

## Files Changed

### 1. `src/pipeline.py`

#### Change 1: KPI Value Extraction (lines 586-626)
**Before**: Simply used the first numeric text found
```python
numeric_texts = [t for t in texts if re.search(r"\d", t)]
numeric_val = numeric_texts[0] if numeric_texts else "—"
```

**After**: Smart detection of trend vs metric values
```python
# Check if "vs" appears anywhere (indicates trend context)
has_vs = any("vs" in t.lower() for t in texts)

# Filter out trend indicators:
# - If "vs" appears, signed percentages (+/-) are trends
# - Unsigned percentages can be metric values (e.g., 84.2% occupancy)
for t in numeric_texts:
    t_lower = t.lower()
    if "vs" in t_lower:
        trend_texts.append(t)
    elif has_vs and "%" in t and (t.startswith("+") or t.startswith("-")):
        trend_texts.append(t)
    else:
        metric_texts.append(t)
```

#### Change 2: Duplicate Table Removal (lines 226-275)
**Before**: Only removed candidates nested inside tables/charts
```python
if parent_id in parent_ids:
    continue
```

**After**: Additional cleanup for overlapping tables with same parent
```python
# Additional cleanup: remove overlapping tables with same parent
# If we have a table and a nested table-like element, keep the larger one
table_preds = [c for c in cleaned if c["predicted_type"] == "TABLE"]
if len(table_preds) > 1:
    # Group by parent
    by_parent = {}
    for t in table_preds:
        pid = t.get("parent_id")
        if pid not in by_parent:
            by_parent[pid] = []
        by_parent[pid].append(t)

    # For each parent, keep only the largest table
    to_remove = set()
    for pid, group in by_parent.items():
        if len(group) > 1:
            group.sort(key=lambda x: x.get("area", 0), reverse=True)
            for t in group[1:]:
                to_remove.add(t["candidate_id"])

    cleaned = [c for c in cleaned if c["candidate_id"] not in to_remove]
```

#### Change 3: Chart Data Extraction (lines 459-503)
**Before**: Only checked "Label - Value" pattern and adjacent number-text pairs
```python
# Pattern 1: "Label - Value"
# Pattern 2: Adjacent text/number pairs
```

**After**: Added reverse pattern (text followed by percentage)
```python
# Pattern 3: Reverse - label followed by percentage (e.g., "65+ Years" then "9%")
if not data and len(texts) >= 2:
    for i in range(len(texts) - 1):
        num_match = re.search(r"^\$?(\d+(?:,\d+)*(?:\.\d+)?)\%?$", texts[i + 1].strip())
        if num_match:
            lbl = texts[i].strip()
            if len(lbl) > 1 and not re.match(r"^\d", lbl):
                val_str = num_match.group(1).replace(",", "")
                try:
                    val = float(val_str)
                    data.append({"label": lbl, "value": val})
                except ValueError:
                    pass
```

#### Change 4: Donut Chart Correction (lines 209-227)
**Before**: No specific rule for donut-chart-container
```python
if any(metric in text for metric in ["minutes of listening", "unique tracks", "different artists", "appointments today"]):
    return "KPI_CARD"
```

**After**: Added rule to classify chart containers with ellipses as CHART
```python
# Fix: donut-chart-container with ellipses should be CHART, not KPI_CARD
if "chart" in name and component.get("ellipse_count", 0) >= 2:
    return "CHART"
```

### 2. `frontend/src/components/Grid12Viewer.tsx`

#### Change: Display componentType instead of widget type (lines 48-67)
**Before**:
```typescript
const widgetType = widget?.type || 'column2d'
// ...
<span className="...">{widgetType}</span>
```

**After**:
```typescript
const widgetType = widget?.type || 'column2d'
const componentType = widget?.componentType || widgetType
// ...
<span className="...">{componentType}</span>
```

## Before and After Results

### KPI Card Value Extraction

| Component | Before (Extracted) | After (Extracted) | Actual Value |
|-----------|-------------------|------------------|--------------|
| Total Patients | +12.4% | 3,480 | 3,480 ✓ |
| Appointments Today | +8.2% | 142 | 142 ✓ |
| Bed Occupancy Rate | -2.1% | 84.2% | 84.2% ✓ |
| Revenue This Month | +14.5% | $424,500 | $424,500 ✓ |

### Duplicate Table Detection

**Before**: 2 tables (activity-card + nested table)
**After**: 1 table (activity-card only, larger one kept)

### Chart Data Extraction

| Component | Before | After |
|-----------|--------|-------|
| department-card | OK (3 points) | OK (3 points) |
| demographics-card | Failed (empty) | Still needs manual review (data pattern not matched) |
| admissions-card | Failed (empty) | Still needs manual review (no numeric data in text) |

### UI Display

**Before**: Showed "column2d", "doughnut2d", "table"
**After**: Shows "KPI_CARD", "CHART", "TABLE" (XGBoost classification)

### Component Counts

**Before**: 10 widgets (including duplicate table and donut-chart-container)
**After**: 8 widgets (cleaner, no duplicates)

## Remaining Issues

1. **Chart data extraction for admissions-card**: The chart text only contains month names without numeric values. This is a limitation of the source design - the actual chart data is not in the text layer. A warning is correctly displayed.

2. **Chart data extraction for demographics-card**: The reverse pattern didn't fully match. The data is there (9%, 23%, 20%, 32%, 16% with labels) but the regex needs refinement. Currently shows "needs review" flag.

3. **donut-chart-container (4:271)**: Correctly classified as CHART by the heuristic rule, but removed in grid layout because it's nested inside demographics-card. This is correct behavior - it's a chart element, not a separate widget.

## Model Assessment

**Model is NOT the primary cause of the issues**:
- XGBoost correctly classified most components (94%+ confidence on KPI cards, 97%+ on charts)
- The donut-chart-container was a borderline case (51% confidence) that required heuristic correction
- No retraining is recommended - the downstream logic fixes address the actual problems

## Recommendations

1. **No model retraining needed** - The fixes are in the pipeline logic, not the model
2. **Improve chart data extraction** - Add more regex patterns for common chart data layouts
3. **Consider hierarchical grouping** - For donut-chart-container, could merge with parent demographics-card instead of removing
4. **Add more training examples** - For borderline cases like donut-chart-container if they appear frequently

## Generated Output

- **Grid Layout**: 8 components in 12×12 grid (down from 10)
- **Vista page.json**: 8 widgets, 8 tiles
- **Needs Review**: 3 widgets (2 charts with missing data, 1 table with low confidence)
