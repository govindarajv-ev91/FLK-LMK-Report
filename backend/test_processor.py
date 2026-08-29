"""Quick sanity test for excel_processor."""
import io
import zipfile

import pandas as pd

from excel_processor import build_fhrid_summary, merge_zip_uploads

COLUMNS = [
    "RunsheetId", "ShipmentUpdateDateTime", "AgentName", "FHRID", "Vendor",
    "DeliveryHub", "City", "Zone", "State", "RunSheetStatus", "ShipmentId",
    "ShipmentType", "ShipmentPrice", "ShipmentWeight", "ShipmentStatus",
    "SheetType", "SheetCreateDateTime", "CustomerFeedBackResponse",
    "IsSellerReturn", "RunsheetShipmentStatus", "GTNL",
]

rows = [
    ["R1", "2026-01-01", "Agent A", "FHR001", "V1", "Hub1", "Mumbai", "Z1", "MH", "Open", "S1", "Type1", 100, 1.2, "Delivered", "ST", "2026-01-01", "", "N", "RS", "G1"],
    ["R1", "2026-01-01", "Agent A", "FHR001", "V1", "Hub1", "Mumbai", "Z1", "MH", "Open", "S2", "Type1", 100, 1.2, "PICKUP_Picked_Complete", "ST", "2026-01-01", "", "N", "RS", "G1"],
    ["R2", "2026-01-02", "Agent B", "FHR002", "V2", "Hub2", "Delhi", "Z2", "DL", "Open", "S3", "Type1", 200, 2.0, "Delivery_Update", "ST", "2026-01-02", "", "N", "RS", "G2"],
    ["R2", "2026-01-02", "Agent B", "FHR002", "V2", "Hub2", "Delhi", "Z2", "DL", "Open", "S4", "Type1", 200, 2.0, "Delivered", "ST", "2026-01-02", "", "N", "RS", "G2"],
]

df = pd.DataFrame(rows, columns=COLUMNS)
excel_buf = io.BytesIO()
df.to_excel(excel_buf, index=False, engine="openpyxl")
excel_buf.seek(0)

zip_buf = io.BytesIO()
with zipfile.ZipFile(zip_buf, "w") as zf:
    zf.writestr("sample.xlsx", excel_buf.getvalue())
zip_buf.seek(0)

merged, summary = merge_zip_uploads([("test.zip", zip_buf)])

assert len(merged) == 4
assert len(summary) == 2
assert summary.loc[summary["FHRID"] == "FHR001", "RiderCount"].iloc[0] == 2
assert summary.loc[summary["FHRID"] == "FHR001", "Delivered"].iloc[0] == 1
assert summary.loc[summary["FHRID"] == "FHR001", "PICKUP_Picked_Complete"].iloc[0] == 1
assert summary.loc[summary["FHRID"] == "FHR001", "Total"].iloc[0] == 2
assert summary.loc[summary["FHRID"] == "FHR002", "Delivery_Update"].iloc[0] == 1
assert summary.loc[summary["FHRID"] == "FHR002", "Total"].iloc[0] == 2

print("All tests passed.")
print(summary.to_string(index=False))
