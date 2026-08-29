# FLK-LMK Report Processor

Upload multiple ZIP files (each containing Excel runsheets), merge all data, and download a summary report grouped by unique **FHRID** (rider).

## What it does

1. Accepts multiple `.zip`, `.gz`, `.tgz`, or `.tar.gz` files at once (drag & drop or file picker).
2. Extracts all Excel files (`.xlsx`, `.xls`) from each archive (ZIP, gzip, or tar.gz).
3. Validates the expected column format and merges all rows into one Excel file.
4. Builds an **FHRID summary** with:
   - `AgentName`, `DeliveryHub`, `City`
   - `RiderCount` — total shipment rows per FHRID
   - `Total` — sum of `PICKUP_Picked_Complete` + `Delivered` + `Delivery_Update` (column F)
   - Counts for `ShipmentStatus`: `PICKUP_Picked_Complete`, `Delivered`, `Delivery_Update`

## Expected Excel columns

```
RunsheetId, ShipmentUpdateDateTime, AgentName, FHRID, Vendor, DeliveryHub, City,
Zone, State, RunSheetStatus, ShipmentId, ShipmentType, ShipmentPrice, ShipmentWeight,
ShipmentStatus, SheetType, SheetCreateDateTime, CustomerFeedBackResponse, IsSellerReturn,
RunsheetShipmentStatus, GTNL
```

## Output (downloaded as `FLK-LMK-Report.zip`)

| File | Description |
|------|-------------|
| `Merged_All_Data.xlsx` | All rows from every Excel file combined |
| `FHRID_Summary_Report.xlsx` | One row per unique FHRID with counts |

## Run locally

### 1. Backend (Node.js)

```bash
cd backend
npm install
npm run dev
```

Server runs at **http://127.0.0.1:8000**

### 2. Frontend (React)

```bash
cd frontend
npm install
npm run dev
```

Open **http://localhost:5173** in your browser.

### Quick test (backend only)

```bash
cd backend
node testProcessor.js
```

## Tech stack

- **Backend:** Node.js, Express, xlsx, adm-zip
- **Frontend:** React, Vite

> A Python/FastAPI version is also included (`main.py`, `excel_processor.py`) if you prefer Python — install Python 3.10+ and run `pip install -r requirements.txt` then `uvicorn main:app --reload --port 8000`.
