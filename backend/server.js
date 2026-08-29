import AdmZip from "adm-zip";
import cors from "cors";
import express from "express";
import multer from "multer";

import {
  isAllowedArchiveName,
  mergeArchiveUploads,
  rowsToExcelBuffer,
} from "./excelProcessor.js";

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

app.use(
  cors({
    origin: ["http://localhost:5173", "http://127.0.0.1:5173"],
  })
);

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.post("/api/process", upload.array("files"), async (req, res) => {
  const files = req.files ?? [];
  if (!files.length) {
    return res
      .status(400)
      .json({ detail: "Upload at least one ZIP or GZ archive file" });
  }

  for (const file of files) {
    if (!isAllowedArchiveName(file.originalname)) {
      return res.status(400).json({
        detail: `${file.originalname} is not supported (use .zip, .gz, .tgz, or .tar.gz)`,
      });
    }
  }

  try {
    const archiveInputs = files.map((file) => ({
      name: file.originalname,
      buffer: file.buffer,
    }));

    const { merged, summary } = await mergeArchiveUploads(archiveInputs);
    const mergedBytes = rowsToExcelBuffer(merged, "MergedData");
    const summaryBytes = rowsToExcelBuffer(summary, "FHRIDSummary");

    const outputZip = new AdmZip();
    outputZip.addFile("Merged_All_Data.xlsx", mergedBytes);
    outputZip.addFile("FHRID_Summary_Report.xlsx", summaryBytes);

    res.setHeader("Content-Type", "application/zip");
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="FLK-LMK-Report.zip"'
    );
    res.send(outputZip.toBuffer());
  } catch (err) {
    res.status(400).json({ detail: err.message || "Processing failed" });
  }
});

const PORT = process.env.PORT || 8000;
app.listen(PORT, () => {
  console.log(`FLK-LMK backend running on http://127.0.0.1:${PORT}`);
});
