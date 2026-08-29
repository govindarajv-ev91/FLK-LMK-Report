import io
import zipfile
from typing import Annotated

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

from excel_processor import dataframe_to_excel_bytes, merge_zip_uploads

app = FastAPI(title="FLK-LMK Report Processor")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
def health():
    return {"status": "ok"}


ALLOWED_EXTENSIONS = (".zip", ".gz", ".tgz", ".tar.gz")


def _is_allowed_archive(name: str) -> bool:
    lower = name.lower()
    return any(lower.endswith(ext) for ext in ALLOWED_EXTENSIONS)


@app.post("/api/process")
async def process_zips(
    files: Annotated[list[UploadFile], File(description="Multiple ZIP or GZ archive files")],
):
    if not files:
        raise HTTPException(
            status_code=400, detail="Upload at least one ZIP or GZ archive file"
        )

    archive_inputs: list[tuple[str, io.BytesIO]] = []
    for upload in files:
        name = upload.filename or "upload.zip"
        if not _is_allowed_archive(name):
            raise HTTPException(
                status_code=400,
                detail=f"{name} is not supported (use .zip, .gz, .tgz, or .tar.gz)",
            )
        content = await upload.read()
        archive_inputs.append((name, io.BytesIO(content)))

    try:
        merged_df, summary_df = merge_zip_uploads(archive_inputs)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except zipfile.BadZipFile as exc:
        raise HTTPException(status_code=400, detail="Invalid or corrupted ZIP file") from exc

    merged_bytes = dataframe_to_excel_bytes(merged_df, "MergedData")
    summary_bytes = dataframe_to_excel_bytes(summary_df, "FHRIDSummary")

    output = io.BytesIO()
    with zipfile.ZipFile(output, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("Merged_All_Data.xlsx", merged_bytes)
        zf.writestr("FHRID_Summary_Report.xlsx", summary_bytes)

    output.seek(0)
    return StreamingResponse(
        output,
        media_type="application/zip",
        headers={"Content-Disposition": 'attachment; filename="FLK-LMK-Report.zip"'},
    )
