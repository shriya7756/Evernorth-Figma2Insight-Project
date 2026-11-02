# 🧭 Figma2Insight — Beginner's Guide

> **Live Web App**: [https://figma2insight.netlify.app](https://figma2insight.netlify.app)  
> **Local App**: [http://localhost:5174](http://localhost:5174)

---

## What does Figma2Insight do?

Figma2Insight takes any **Figma dashboard design** and automatically:
1. **Discovers components**: Scans Figma layers to find KPI cards, charts, data tables, and filters.
2. **Classifies them with AI**: Runs an XGBoost machine learning model trained on semantic, graphical, and geometric features to label each component (`KPI_CARD`, `CHART`, `TABLE`, or `OTHER`).
3. **Generates grid layout**: Calculates the optimal placement on a responsive 12×12 grid system.
4. **Exports standard formats**: Assembles and validates a production-ready `page.json` specification for the Vista dashboard platform.

In short: **Raw Figma Design → AI Component Classification → Production Dashboard (`page.json`)**.

---

## 🖥️ Navigation Bar Overview

| Tab | Purpose |
|-----|---------|
| **Workspace** | The central command center where you load designs, configure package details, and execute the ML pipeline. |
| **Preview** | An interactive, visual canvas that shows your components mapped onto their 12×12 grid positions. |
| **Saved analyses** | A searchable cloud history (stored in MongoDB Atlas) of all your past pipeline runs, downloadable outputs, and metadata. |
| **Guide** | In-app reference covering 12×12 grid rules, Vista widget schema mappings, and validation heuristics. |

---

## 🛠️ Step-by-Step Workspace Guide

The **Workspace** is divided into 3 simple steps:

### Step 1 · Source Design (Left Column)
Choose how to supply your Figma design data:
- **Figma plugin tab**: If you use our Figma plugin (*"Local Dashboard Pipeline"*), click **Send current page** in Figma. Then in the web app, click **"Use this design"** to load it directly.
- **Upload JSON tab**: If you exported your Figma page as a JSON file, simply drag and drop it here (or click to browse). Supports files up to 50 MB.

*Once loaded, you'll see a green chip showing the design name, total node count, canvas dimensions, and a "Change design" button.*

### Step 2 · Package Details (Optional)
Fill in details to personalize your exported dashboard:
- **Dashboard Title**: Human-readable display name (e.g., *Executive Performance Overview*).
- **Slide ID**: A 5-character identifier (e.g., `CR001`). If left blank, one is auto-generated.
- **Subject Area / Topic / Slide Name**: Categorization tags formatted as lowercase words separated by hyphens (e.g., `operations`, `quarterly-metrics`).

### Step 3 · Processing Pipeline (Right Column)
Run the 4 automated AI processing stages:

| # | Stage | What happens under the hood |
|---|-------|-----------------------------|
| **1** | **Normalize** | Traverses the Figma tree, filters noise, and extracts component candidates. |
| **2** | **Extract features** | Computes 20 semantic and geometric features (dimensions, text density, numbers, percentages, colors). |
| **3** | **Classify components** | The XGBoost model predicts component labels (`KPI_CARD`, `CHART`, `TABLE`, `OTHER`). |
| **4** | **Generate layout** | Applies spatial heuristics, maps onto a 12×12 grid, and generates Vista `page.json`. |

#### How to run the pipeline:
- **⚡ Run full pipeline**: Runs all 4 stages automatically end-to-end (Recommended).
- **▶ Run individual stage**: Allows running or re-running a specific stage step-by-step.

---

## 📊 Viewing & Exporting Results

Once Stage 4 completes, a **Result Panel** appears:
- **Widgets**: Count of identified components included in the layout.
- **Tiles**: Number of allocated grid positions.
- **Need review**: Highlights low-confidence predictions in amber for quick manual inspection.
- **Saved to MongoDB**: Displays a badge confirming that your run and outputs are securely saved to the database.

### Action Buttons:
- **Open dashboard preview →**: Switches to the visual layout preview.
- **View page.json**: Inspects the generated JSON code directly inside a code viewer.
- **Download**: Downloads `page.json` directly to your local computer.

---

## 🔍 Saved Analyses (History Page)

Every completed run is automatically saved to MongoDB Atlas. From this page you can:
- **Search**: Filter past analyses by design or dashboard name.
- **Open Preview**: Re-open the visual layout canvas for any previous analysis.
- **Inspect / Download Artifacts**: Access `figma_data.json`, `predictions.json`, `grid_layout.json`, and `page.json`.
- **Delete**: Remove old or unwanted runs from the cloud database.

---

## 🟢 System Status Indicators

Look at the status chips at the top of the Workspace hero section:

| Status Chip | Meaning |
|-------------|---------|
| **API connected** | The frontend is successfully communicating with the Python backend server. |
| **Classifier — XGBoost model ready** | Machine learning models and feature encoders are loaded in memory. |
| **Saved analyses — MongoDB connected** | Cloud database connection to MongoDB Atlas is active and healthy. |

---

## 🚀 Quick Start Checklist for Beginners

```text
1. Open https://figma2insight.netlify.app (or http://localhost:5174)
2. In Step 1: Click "Use this design" or drop your Figma JSON export.
3. In Step 2: (Optional) Enter a Dashboard Title.
4. In Step 3: Click "⚡ Run full pipeline" (takes ~5–10 seconds).
5. Click "Open dashboard preview" to see your generated layout!
6. Click "Download" to save your production page.json.
```
