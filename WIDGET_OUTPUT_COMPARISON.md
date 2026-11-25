# Widget Output Comparison

## Final Vista page.json Widgets (After Fixes)

### 1. Total Patients (KPI_CARD)
```json
{
  "componentType": "KPI_CARD",
  "kpiValue": "3,480",  // Fixed: was "+12.4%"
  "kpiLabel": "Total Patients",
  "trend": "vs last mo"
}
```

### 2. Appointments Today (KPI_CARD)
```json
{
  "componentType": "KPI_CARD",
  "kpiValue": "142",  // Fixed: was "+8.2%"
  "kpiLabel": "Appointments Today",
  "trend": "vs last mo"
}
```

### 3. Bed Occupancy Rate (KPI_CARD)
```json
{
  "componentType": "KPI_CARD",
  "kpiValue": "84.2%",  // Fixed: was "-2.1%"
  "kpiLabel": "Bed Occupancy Rate",
  "trend": "vs last mo"
}
```

### 4. Revenue This Month (KPI_CARD)
```json
{
  "componentType": "KPI_CARD",
  "kpiValue": "$424,500",  // Fixed: was "+14.5%"
  "kpiLabel": "Revenue This Month",
  "trend": "vs last mo"
}
```

### 5. Admissions Card (CHART)
```json
{
  "componentType": "CHART",
  "type": "column2d",
  "chartData": [],  // Warning: no numeric data in source text
  "chartDataWarning": "Could not extract chart data from source text",
  "needsReview": true
}
```

### 6. Department Card (CHART)
```json
{
  "componentType": "CHART",
  "type": "doughnut2d",
  "chartData": [
    {"label": "Oncology", "value": 310.0},
    {"label": "Pediatrics", "value": 289.0},
    {"label": "Orthopedics", "value": 212.0}
  ],
  "needsReview": false
}
```

### 7. Demographics Card (CHART)
```json
{
  "componentType": "CHART",
  "type": "doughnut2d",
  "chartData": [],  // Warning: reverse pattern didn't match
  "chartDataWarning": "Could not extract chart data from source text",
  "needsReview": true
}
```

### 8. Activity Card (TABLE)
```json
{
  "componentType": "TABLE",
  "type": "table",
  "confidence": 62.2%,  // Low confidence but kept as largest table
  "needsReview": true
}
```

## Removed Components

### 1. Donut Chart Container (4:271)
- **Reason**: Nested inside demographics-card, correctly removed
- **Classification**: Fixed from KPI_CARD to CHART via heuristic
- **Result**: Not in final output (correct)

### 2. Nested Table (4:310)
- **Reason**: Smaller table nested inside activity-card
- **Before**: Created duplicate table widget
- **After**: Removed, keeping only activity-card (larger table)

## Grid Layout (12×12)

```
Row 0-2:  [KPI_CARD 4 cols] [KPI_CARD 3 cols] [KPI_CARD 3 cols] [KPI_CARD 4 cols]
Row 2-6:  [CHART 12 cols]
Row 5-8:  [CHART 7 cols]  [CHART 5 cols]
Row 8-12: [TABLE 12 cols]
```

## Summary

- **Widgets**: 8 (down from 10)
- **Tiles**: 8 (down from 10)
- **KPI Values**: All corrected to show actual metric values
- **Duplicate Tables**: Removed
- **UI Display**: Shows componentType (KPI_CARD, CHART, TABLE) instead of widget type
- **Needs Review**: 3 widgets (2 charts with missing data, 1 table with low confidence)
