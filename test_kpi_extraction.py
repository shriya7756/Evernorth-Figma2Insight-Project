import re

def extract_kpi_value_old(texts):
    """Old logic"""
    numeric_texts = [t for t in texts if re.search(r"\d", t)]
    numeric_val = numeric_texts[0] if numeric_texts else "—"
    return numeric_val

def extract_kpi_value_new(texts):
    """New logic with vs detection and signed percentage handling"""
    numeric_texts = [t for t in texts if re.search(r"\d", t)]

    # Check if "vs" appears anywhere (indicates trend context)
    has_vs = any("vs" in t.lower() for t in texts)

    metric_texts = []
    trend_texts = []
    for t in numeric_texts:
        t_lower = t.lower()
        # Skip if it's explicitly a "vs" indicator
        if "vs" in t_lower:
            trend_texts.append(t)
        # If "vs" appears, only signed percentages are trends
        elif has_vs and "%" in t and (t.startswith("+") or t.startswith("-")):
            trend_texts.append(t)
        # Otherwise it's likely the metric value
        else:
            metric_texts.append(t)

    if metric_texts:
        numeric_val = metric_texts[0]
    elif numeric_texts:
        numeric_val = max(numeric_texts, key=len)
    else:
        numeric_val = "—"

    return numeric_val, metric_texts, trend_texts, has_vs

# Test cases
test_cases = [
    ["vs last mo", "+12.4%", "3,480", "Total Patients"],
    ["vs last mo", "+8.2%", "142", "Appointments Today"],
    ["vs last mo", "-2.1%", "84.2%", "Bed Occupancy Rate"],
    ["vs last mo", "+14.5%", "$424,500", "Revenue This Month"],
]

print("=" * 80)
print("KPI EXTRACTION TEST")
print("=" * 80)

for texts in test_cases:
    old_val = extract_kpi_value_old(texts)
    new_val, metric_texts, trend_texts, has_vs = extract_kpi_value_new(texts)
    print(f"\nTexts: {texts}")
    print(f"Has 'vs': {has_vs}")
    print(f"Old value: {old_val}")
    print(f"New value: {new_val}")
    print(f"Metric texts: {metric_texts}")
    print(f"Trend texts: {trend_texts}")
