import { gzipSync } from "zlib";

import AdmZip from "adm-zip";
import XLSX from "xlsx";

import tar from "tar-stream";
import { mergeArchiveUploads } from "./excelProcessor.js";

const COLUMNS = [
  "RunsheetId", "ShipmentUpdateDateTime", "AgentName", "FHRID", "Vendor",
  "DeliveryHub", "City", "Zone", "State", "RunSheetStatus", "ShipmentId",
  "ShipmentType", "ShipmentPrice", "ShipmentWeight", "ShipmentStatus",
  "SheetType", "SheetCreateDateTime", "CustomerFeedBackResponse",
  "IsSellerReturn", "RunsheetShipmentStatus", "GTNL",
];

const rows = [
  ["R1", "2026-01-01", "Agent A", "FHR001", "V1", "Hub1", "Mumbai", "Z1", "MH", "Open", "S1", "Type1", 100, 1.2, "Delivered", "ST", "2026-01-01", "", "N", "RS", "G1"],
  ["R1", "2026-01-01", "Agent A", "FHR001", "V1", "Hub1", "Mumbai", "Z1", "MH", "Open", "S2", "Type1", 100, 1.2, "PICKUP_Picked_Complete", "ST", "2026-01-01", "", "N", "RS", "G1"],
  ["R2", "2026-01-02", "Agent B", "FHR002", "V2", "Hub2", "Delhi", "Z2", "DL", "Open", "S3", "Type1", 200, 2.0, "Delivery_Update", "ST", "2026-01-02", "", "N", "RS", "G2"],
  ["R2", "2026-01-02", "Agent B", "FHR002", "V2", "Hub2", "Delhi", "Z2", "DL", "Open", "S4", "Type1", 200, 2.0, "Delivered", "ST", "2026-01-02", "", "N", "RS", "G2"],
];

function buildExcelBuffer() {
  const ws = XLSX.utils.aoa_to_sheet([COLUMNS, ...rows]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
}

function buildTarBuffer(files) {
  return new Promise((resolve, reject) => {
    const pack = tar.pack();
    const chunks = [];

    pack.on("data", (chunk) => chunks.push(chunk));
    pack.on("end", () => resolve(Buffer.concat(chunks)));
    pack.on("error", reject);

    (async () => {
      try {
        for (const { name, data } of files) {
          await new Promise((res, rej) => {
            pack.entry({ name, size: data.length }, data, (err) => (err ? rej(err) : res()));
          });
        }
        pack.finalize();
      } catch (err) {
        reject(err);
      }
    })();
  });
}

function assertSummary(summary) {
  if (summary.length !== 2) throw new Error(`Expected 2 summary rows, got ${summary.length}`);

  const fhr001 = summary.find((r) => r.FHRID === "FHR001");
  if (fhr001.RiderCount !== 2) throw new Error("FHR001 RiderCount mismatch");
  if (fhr001.Delivered !== 1) throw new Error("FHR001 Delivered mismatch");
  if (fhr001.PICKUP_Picked_Complete !== 1) throw new Error("FHR001 PICKUP mismatch");
  if (fhr001.Total !== 2) throw new Error("FHR001 Total mismatch");

  const fhr002 = summary.find((r) => r.FHRID === "FHR002");
  if (fhr002.Delivery_Update !== 1) throw new Error("FHR002 Delivery_Update mismatch");
  if (fhr002.Total !== 2) throw new Error("FHR002 Total mismatch");
}

async function runCase(label, buffer, name) {
  const { merged, summary } = await mergeArchiveUploads([{ name, buffer }]);
  if (merged.length !== 4) {
    throw new Error(`${label}: expected 4 merged rows, got ${merged.length}`);
  }
  assertSummary(summary);
  console.log(`✓ ${label}`);
}

const excelBuffer = buildExcelBuffer();

const zip = new AdmZip();
zip.addFile("sample.xlsx", excelBuffer);
await runCase("ZIP archive", zip.toBuffer(), "test.zip");

const gzExcel = gzipSync(excelBuffer);
await runCase("GZ compressed Excel", gzExcel, "sample.xlsx.gz");

const zipGz = gzipSync(zip.toBuffer());
await runCase("GZ compressed ZIP", zipGz, "bundle.zip.gz");

const tarBuffer = await buildTarBuffer([{ name: "sample.xlsx", data: excelBuffer }]);
const tarGz = gzipSync(tarBuffer);
await runCase("TAR.GZ archive", tarGz, "bundle.tar.gz");

console.log("All archive format tests passed.");
