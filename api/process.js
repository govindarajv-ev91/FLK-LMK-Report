import AdmZip from "adm-zip";

import {
  isAllowedArchiveName,
  mergeArchiveUploads,
  rowsToExcelBuffer,
} from "../backend/excelProcessor.js";
import { parseMultipartForm } from "./lib/parseMultipart.js";

export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ detail: "Method not allowed" });
  }

  let uploads;
  try {
    uploads = await parseMultipartForm(req);
  } catch {
    return res.status(400).json({ detail: "Could not read uploaded files" });
  }

  if (!uploads.length) {
    return res
      .status(400)
      .json({ detail: "Upload at least one ZIP or GZ archive file" });
  }

  for (const file of uploads) {
    if (!isAllowedArchiveName(file.originalname)) {
      return res.status(400).json({
        detail: `${file.originalname} is not supported (use .zip, .gz, .tgz, or .tar.gz)`,
      });
    }
  }

  try {
    const archiveInputs = uploads.map((file) => ({
      name: file.originalname,
      buffer: file.buffer,
    }));

    const { merged, summary } = await mergeArchiveUploads(archiveInputs);
    const mergedBytes = rowsToExcelBuffer(merged, "MergedData");
    const summaryBytes = rowsToExcelBuffer(summary, "FHRIDSummary");

    const outputZip = new AdmZip();
    outputZip.addFile("Merged_All_Data.xlsx", mergedBytes);
    outputZip.addFile("FHRID_Summary_Report.xlsx", summaryBytes);

    const zipBuffer = outputZip.toBuffer();

    res.setHeader("Content-Type", "application/zip");
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="FLK-LMK-Report.zip"'
    );
    res.status(200).send(zipBuffer);
  } catch (err) {
    res.status(400).json({ detail: err.message || "Processing failed" });
  }
}
