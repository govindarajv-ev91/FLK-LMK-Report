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

From the project root, install dependencies for both services and start them together:

```bash
npm install --prefix backend
npm install --prefix frontend
npm run dev
```

Open **http://localhost:5173**. Press **Ctrl+C** to stop both servers.
You can also start each service separately as shown below.

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

## Deploy on Vercel

The repo is configured for Vercel with:
- **Frontend** → static files from `frontend/dist`
- **API** → serverless functions in `/api` (`/api/process`, `/api/health`)

### Steps

1. Go to [vercel.com/new](https://vercel.com/new) and import:
   `https://github.com/govindarajv-ev91/FLK-LMK-Report`
2. **Important:** leave **Root Directory** as `.` (project root). Do **not** set it to `frontend` only — that causes `404: NOT_FOUND` on `/api/process`.
3. Vercel will read `vercel.json` automatically. Click **Deploy**.

Or deploy from CLI:

```bash
npm install -g vercel
cd "FLK-LMK Report"
vercel --prod
```

### Vercel notes

- Upload limit on the free plan is about **4.5 MB per request**. Large ZIP/GZ files may need a paid plan or local backend.
- After deploy, the app and API share the same URL (e.g. `https://your-app.vercel.app/api/process`).

### Quick test (backend only)

```bash
cd backend
node testProcessor.js
```

## Tech stack

- **Backend:** Node.js, Express, xlsx, adm-zip
- **Frontend:** React, Vite

> A Python/FastAPI version is also included (`main.py`, `excel_processor.py`) if you prefer Python — install Python 3.10+ and run `pip install -r requirements.txt` then `uvicorn main:app --reload --port 8000`.
