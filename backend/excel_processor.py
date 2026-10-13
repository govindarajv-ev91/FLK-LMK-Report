import io
import gzip
import re
import tarfile
import zipfile
from typing import BinaryIO

import pandas as pd

EXPECTED_COLUMNS = [
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
]

STATUS_COLUMNS = {
    "PICKUP_Picked_Complete": "PICKUP_Picked_Complete",
    "Delivered": "Delivered",
    "Delivery_Update": "Delivery_Update",
}


def _source_file_name(filename: str) -> str:
    base = filename.replace("\\", "/").rsplit("/", 1)[-1]
    without_extension = base
    for extension in (".csv.gz", ".gz", ".xlsx", ".xls", ".xlsm"):
        if without_extension.lower().endswith(extension):
            without_extension = without_extension[: -len(extension)]
            break
    if without_extension.lower().startswith("final_result_for_"):
        without_extension = without_extension[len("final_result_for_") :]

    match = re.match(r"^(.*_\d{4}-[A-Za-z]{3})-\d{1,2}(?:_|$)", without_extension)
    return match.group(1) if match else without_extension


def _normalize_columns(df: pd.DataFrame) -> pd.DataFrame:
    df.columns = [str(c).strip() for c in df.columns]
    return df


def _read_excel_bytes(data: bytes, filename: str) -> pd.DataFrame:
    buffer = io.BytesIO(data)
    try:
        df = pd.read_excel(buffer, engine="openpyxl")
    except Exception:
        buffer.seek(0)
        df = pd.read_excel(buffer, engine="xlrd")

    df = _normalize_columns(df)
    missing = [c for c in EXPECTED_COLUMNS if c not in df.columns]
    if missing:
        raise ValueError(f"{filename}: missing columns {', '.join(missing)}")

    return df[EXPECTED_COLUMNS].copy()


def _read_csv_bytes(data: bytes, filename: str) -> pd.DataFrame:
    df = pd.read_csv(io.BytesIO(data))
    df = _normalize_columns(df)
    missing = [c for c in EXPECTED_COLUMNS if c not in df.columns]
    if missing:
        raise ValueError(f"{filename}: missing columns {', '.join(missing)}")
    return df[EXPECTED_COLUMNS].copy()


def _is_gzip(data: bytes) -> bool:
    return len(data) >= 2 and data[0] == 0x1F and data[1] == 0x8B


def _is_zip(data: bytes) -> bool:
    return len(data) >= 4 and data[0:2] == b"PK"


def extract_excel_from_zip(zip_bytes: bytes, zip_name: str) -> list[pd.DataFrame]:
    frames: list[pd.DataFrame] = []
    with zipfile.ZipFile(io.BytesIO(zip_bytes), "r") as zf:
        excel_files = [
            name
            for name in zf.namelist()
            if not name.endswith("/")
            and name.lower().endswith((".xlsx", ".xls", ".xlsm"))
        ]
        if not excel_files:
            raise ValueError(f"{zip_name}: no Excel files found inside ZIP")

        for name in excel_files:
            data = zf.read(name)
            base = name.split("/")[-1]
            frames.append(_read_excel_bytes(data, f"{zip_name}/{base}"))

    return frames


def _extract_excel_from_tar(tar_bytes: bytes, archive_name: str) -> list[pd.DataFrame]:
    frames: list[pd.DataFrame] = []
    with tarfile.open(fileobj=io.BytesIO(tar_bytes), mode="r:") as tf:
        for member in tf.getmembers():
            if not member.isfile():
                continue
            data = tf.extractfile(member).read()
            inner_name = member.name.split("/")[-1]
            label = f"{archive_name}/{inner_name}"
            if inner_name.lower().endswith((".xlsx", ".xls", ".xlsm")):
                frames.append(_read_excel_bytes(data, label))
            elif inner_name.lower().endswith((".gz", ".tgz", ".tar.gz")) or _is_gzip(data):
                frames.extend(extract_excel_from_archive(data, label))
            elif inner_name.lower().endswith(".zip") or _is_zip(data):
                frames.extend(extract_excel_from_zip(data, label))

    if not frames:
        raise ValueError(f"{archive_name}: no Excel files found inside TAR archive")
    return frames


def extract_excel_from_gzip(gz_bytes: bytes, archive_name: str) -> list[pd.DataFrame]:
    try:
        inner = gzip.decompress(gz_bytes)
    except OSError as exc:
        raise ValueError(f"{archive_name}: invalid or corrupted GZ archive") from exc

    try:
        return _extract_excel_from_tar(inner, archive_name)
    except tarfile.TarError:
        pass

    if _is_zip(inner):
        try:
            return extract_excel_from_zip(inner, archive_name)
        except ValueError:
            return [_read_excel_bytes(inner, archive_name)]

    if _is_gzip(inner):
        return extract_excel_from_gzip(inner, archive_name)

    if archive_name.lower().endswith(".csv.gz"):
        return [_read_csv_bytes(inner, archive_name)]

    return [_read_excel_bytes(inner, archive_name)]


def extract_excel_from_archive(data: bytes, archive_name: str) -> list[pd.DataFrame]:
    lower = archive_name.lower()
    if lower.endswith(".zip") or _is_zip(data):
        return extract_excel_from_zip(data, archive_name)
    if lower.endswith((".gz", ".tgz", ".tar.gz")) or _is_gzip(data):
        return extract_excel_from_gzip(data, archive_name)
    raise ValueError(f"{archive_name}: unsupported archive format (use ZIP, GZ, or TAR.GZ)")


def merge_zip_uploads(zip_files: list[tuple[str, BinaryIO]]) -> tuple[pd.DataFrame, pd.DataFrame]:
    all_frames: list[pd.DataFrame] = []

    for archive_name, file_obj in zip_files:
        content = file_obj.read()
        if not content:
            raise ValueError(f"{archive_name}: empty file")
        file_name = _source_file_name(archive_name)
        for frame in extract_excel_from_archive(content, archive_name):
            frame["FileName"] = file_name
            all_frames.append(frame)

    if not all_frames:
        raise ValueError("No Excel data found in uploaded archive files")

    merged = pd.concat(all_frames, ignore_index=True)
    merged["FHRID"] = merged["FHRID"].astype(str).str.strip()
    merged = merged[merged["FHRID"].notna() & (merged["FHRID"] != "") & (merged["FHRID"] != "nan")]

    summary = build_fhrid_summary(merged)
    return merged, summary


def build_fhrid_summary(df: pd.DataFrame) -> pd.DataFrame:
    def first_non_empty(series: pd.Series) -> str:
        for value in series:
            if pd.notna(value) and str(value).strip():
                return str(value).strip()
        return ""

    grouped = df.groupby("FHRID", sort=True)

    summary = grouped.agg(
        AgentName=("AgentName", first_non_empty),
        DeliveryHub=("DeliveryHub", first_non_empty),
        City=("City", first_non_empty),
        RiderCount=("FHRID", "size"),
    ).reset_index()

    for col_name, status_value in STATUS_COLUMNS.items():
        counts = (
            df.assign(_status=df["ShipmentStatus"].astype(str).str.strip())
            .groupby("FHRID")["_status"]
            .apply(lambda s: int((s == status_value).sum()))
        )
        summary[col_name] = summary["FHRID"].map(counts).fillna(0).astype(int)

    summary["Total"] = (
        summary["PICKUP_Picked_Complete"]
        + summary["Delivered"]
        + summary["Delivery_Update"]
    )

    return summary[
        [
            "FHRID",
            "AgentName",
            "DeliveryHub",
            "City",
            "RiderCount",
            "Total",
            "PICKUP_Picked_Complete",
            "Delivered",
            "Delivery_Update",
        ]
    ]


def dataframe_to_excel_bytes(df: pd.DataFrame, sheet_name: str = "Sheet1") -> bytes:
    buffer = io.BytesIO()
    with pd.ExcelWriter(buffer, engine="openpyxl") as writer:
        df.to_excel(writer, index=False, sheet_name=sheet_name)
    buffer.seek(0)
    return buffer.getvalue()
