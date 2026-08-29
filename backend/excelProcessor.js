import { Readable } from "stream";
import { gunzipSync } from "zlib";

import AdmZip from "adm-zip";
import tar from "tar-stream";
import XLSX from "xlsx";

const EXPECTED_COLUMNS = [
  "RunsheetId",
  "ShipmentUpdateDateTime",
  "AgentName",
  "FHRID",
  "Vendor",
  "DeliveryHub",
  "City",
  "Zone",
  "State",
  "RunSheetStatus",
  "ShipmentId",
  "ShipmentType",
  "ShipmentPrice",
  "ShipmentWeight",
  "ShipmentStatus",
  "SheetType",
  "SheetCreateDateTime",
  "CustomerFeedBackResponse",
  "IsSellerReturn",
  "RunsheetShipmentStatus",
  "GTNL",
];

const STATUS_KEYS = [
  "PICKUP_Picked_Complete",
  "Delivered",
  "Delivery_Update",
];

const EXCEL_PATTERN = /\.(xlsx|xls|xlsm)$/i;

export const ALLOWED_ARCHIVE_EXTENSIONS = [".zip", ".gz", ".tgz", ".tar.gz"];

export function isAllowedArchiveName(name) {
  const lower = name.toLowerCase();
  return ALLOWED_ARCHIVE_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

function isGzipBuffer(buffer) {
  return buffer.length >= 2 && buffer[0] === 0x1f && buffer[1] === 0x8b;
}

function isZipBuffer(buffer) {
  return buffer.length >= 4 && buffer[0] === 0x50 && buffer[1] === 0x4b;
}

function isTarBuffer(buffer) {
  if (buffer.length < 512) return false;

  const ustar = buffer.subarray(257, 262).toString("ascii");
  if (ustar === "ustar" || ustar.startsWith("ustar")) return true;

  const name = buffer.subarray(0, 100).toString("utf8").replace(/\0/g, "").trim();
  if (!name) return false;

  const sizeOct = buffer.subarray(124, 136).toString("utf8").replace(/\0/g, "").trim();
  return /^\d+$/.test(sizeOct);
}

function normalizeColumns(row) {
  const out = {};
  for (const [key, value] of Object.entries(row)) {
    out[String(key).trim()] = value;
  }
  return out;
}

function readExcelBuffer(buffer, filename) {
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    throw new Error(`${filename}: Excel file has no sheets`);
  }

  const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
    defval: "",
    raw: false,
  });

  if (!rows.length) {
    throw new Error(`${filename}: Excel sheet is empty`);
  }

  const normalized = rows.map(normalizeColumns);
  const headers = Object.keys(normalized[0]);
  const missing = EXPECTED_COLUMNS.filter((col) => !headers.includes(col));
  if (missing.length) {
    throw new Error(`${filename}: missing columns ${missing.join(", ")}`);
  }

  return normalized.map((row) => {
    const picked = {};
    for (const col of EXPECTED_COLUMNS) {
      picked[col] = row[col] ?? "";
    }
    return picked;
  });
}

function extractExcelFromZip(zipBuffer, zipName) {
  const zip = new AdmZip(zipBuffer);
  const entries = zip
    .getEntries()
    .filter(
      (entry) =>
        !entry.isDirectory && EXCEL_PATTERN.test(entry.entryName.split("/").pop())
    );

  if (!entries.length) {
    throw new Error(`${zipName}: no Excel files found inside ZIP`);
  }

  const frames = [];
  for (const entry of entries) {
    const base = entry.entryName.split("/").pop();
    frames.push(readExcelBuffer(entry.getData(), `${zipName}/${base}`));
  }
  return frames.flat();
}

function extractExcelFromPkBuffer(buffer, label) {
  try {
    return extractExcelFromZip(buffer, label);
  } catch {
    return readExcelBuffer(buffer, label);
  }
}

function extractTarEntries(tarBuffer) {
  return new Promise((resolve, reject) => {
    const entries = [];
    const extractStream = tar.extract();

    extractStream.on("entry", (header, stream, next) => {
      if (header.type !== "file") {
        stream.resume();
        stream.on("end", next);
        return;
      }

      const chunks = [];
      stream.on("data", (chunk) => chunks.push(chunk));
      stream.on("end", () => {
        entries.push({
          name: header.name,
          data: Buffer.concat(chunks),
        });
        next();
      });
      stream.on("error", reject);
    });

    extractStream.on("finish", () => resolve(entries));
    extractStream.on("error", reject);

    Readable.from(tarBuffer).pipe(extractStream);
  });
}

async function extractExcelFromTar(tarBuffer, archiveName) {
  const entries = await extractTarEntries(tarBuffer);
  const frames = [];

  for (const entry of entries) {
    frames.push(
      ...(await extractExcelFromNestedBuffer(entry.data, archiveName, entry.name))
    );
  }

  if (!frames.length) {
    throw new Error(`${archiveName}: no Excel files found inside TAR archive`);
  }

  return frames;
}

async function extractExcelFromNestedBuffer(buffer, archiveName, innerName) {
  const base = innerName.split("/").pop();
  const label = `${archiveName}/${base}`;

  if (EXCEL_PATTERN.test(base)) {
    return readExcelBuffer(buffer, label);
  }

  if (/\.(tar\.gz|tgz|gz)$/i.test(base) || isGzipBuffer(buffer)) {
    return extractExcelFromGzip(buffer, label);
  }

  if (/\.zip$/i.test(base) || isZipBuffer(buffer)) {
    return extractExcelFromPkBuffer(buffer, label);
  }

  if (isTarBuffer(buffer)) {
    return extractExcelFromTar(buffer, label);
  }

  return [];
}

async function extractExcelFromGzip(gzBuffer, archiveName) {
  let inner;
  try {
    inner = gunzipSync(gzBuffer);
  } catch {
    throw new Error(`${archiveName}: invalid or corrupted GZ archive`);
  }

  if (isTarBuffer(inner)) {
    return extractExcelFromTar(inner, archiveName);
  }

  if (isZipBuffer(inner)) {
    return extractExcelFromPkBuffer(inner, archiveName);
  }

  if (isGzipBuffer(inner)) {
    return extractExcelFromGzip(inner, archiveName);
  }

  const hintedName = archiveName.replace(/\.(tar\.gz|tgz|gz)$/i, "");
  if (EXCEL_PATTERN.test(hintedName)) {
    return readExcelBuffer(inner, archiveName);
  }

  try {
    return readExcelBuffer(inner, archiveName);
  } catch {
    throw new Error(`${archiveName}: no Excel files found inside GZ archive`);
  }
}

export async function extractExcelFromArchive(buffer, archiveName) {
  const lower = archiveName.toLowerCase();

  if (lower.endsWith(".zip") || isZipBuffer(buffer)) {
    return extractExcelFromZip(buffer, archiveName);
  }

  if (
    lower.endsWith(".gz") ||
    lower.endsWith(".tgz") ||
    lower.endsWith(".tar.gz") ||
    isGzipBuffer(buffer)
  ) {
    return extractExcelFromGzip(buffer, archiveName);
  }

  throw new Error(
    `${archiveName}: unsupported archive format (use ZIP, GZ, or TAR.GZ)`
  );
}

function firstNonEmpty(values) {
  for (const value of values) {
    const text = String(value ?? "").trim();
    if (text && text !== "undefined" && text !== "null") return text;
  }
  return "";
}

export function buildFhridSummary(rows) {
  const byFhrid = new Map();

  for (const row of rows) {
    const fhrid = String(row.FHRID ?? "").trim();
    if (!fhrid || fhrid === "undefined" || fhrid === "null") continue;

    if (!byFhrid.has(fhrid)) {
      byFhrid.set(fhrid, {
        FHRID: fhrid,
        AgentName: [],
        DeliveryHub: [],
        City: [],
        RiderCount: 0,
        PICKUP_Picked_Complete: 0,
        Delivered: 0,
        Delivery_Update: 0,
      });
    }

    const item = byFhrid.get(fhrid);
    item.AgentName.push(row.AgentName);
    item.DeliveryHub.push(row.DeliveryHub);
    item.City.push(row.City);
    item.RiderCount += 1;

    const status = String(row.ShipmentStatus ?? "").trim();
    if (STATUS_KEYS.includes(status)) {
      item[status] += 1;
    }
  }

  return [...byFhrid.values()]
    .sort((a, b) => a.FHRID.localeCompare(b.FHRID))
    .map((item) => {
      const pickup = item.PICKUP_Picked_Complete;
      const delivered = item.Delivered;
      const deliveryUpdate = item.Delivery_Update;

      return {
        FHRID: item.FHRID,
        AgentName: firstNonEmpty(item.AgentName),
        DeliveryHub: firstNonEmpty(item.DeliveryHub),
        City: firstNonEmpty(item.City),
        RiderCount: item.RiderCount,
        Total: pickup + delivered + deliveryUpdate,
        PICKUP_Picked_Complete: pickup,
        Delivered: delivered,
        Delivery_Update: deliveryUpdate,
      };
    });
}

export async function mergeArchiveUploads(archiveFiles) {
  let allRows = [];

  for (const { name, buffer } of archiveFiles) {
    if (!buffer?.length) {
      throw new Error(`${name}: empty file`);
    }
    allRows = allRows.concat(await extractExcelFromArchive(buffer, name));
  }

  if (!allRows.length) {
    throw new Error("No Excel data found in uploaded archive files");
  }

  const summary = buildFhridSummary(allRows);
  return { merged: allRows, summary };
}

/** @deprecated Use mergeArchiveUploads */
export async function mergeZipUploads(archiveFiles) {
  return mergeArchiveUploads(archiveFiles);
}

export function rowsToExcelBuffer(rows, sheetName) {
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
}

export { EXPECTED_COLUMNS };
