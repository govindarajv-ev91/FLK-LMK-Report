import { useCallback, useRef, useState } from "react";
import "./App.css";

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const ALLOWED_EXTENSIONS = [".zip", ".gz", ".tgz", ".tar.gz"];

function isAllowedArchive(name) {
  const lower = name.toLowerCase();
  return ALLOWED_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

function FileIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6z"
        stroke="#64748b"
        strokeWidth="1.5"
        fill="#f1f5f9"
      />
      <path d="M14 2v6h6" stroke="#64748b" strokeWidth="1.5" />
    </svg>
  );
}

export default function App() {
  const inputRef = useRef(null);
  const [files, setFiles] = useState([]);
  const [dragOver, setDragOver] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState("");

  const addFiles = useCallback((fileList) => {
    const incoming = Array.from(fileList).filter((f) => isAllowedArchive(f.name));
    if (!incoming.length) {
      setError("Please select ZIP or GZ archive files only (.zip, .gz, .tgz, .tar.gz).");
      return;
    }
    setError("");
    setFiles((prev) => {
      const names = new Set(prev.map((f) => f.name));
      const merged = [...prev];
      incoming.forEach((file) => {
        if (!names.has(file.name)) merged.push(file);
      });
      return merged;
    });
  }, []);

  const removeFile = (name) => {
    setFiles((prev) => prev.filter((f) => f.name !== name));
  };

  const onDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    addFiles(e.dataTransfer.files);
  };

  const processFiles = async () => {
    if (!files.length) {
      setError("Add at least one archive file.");
      return;
    }

    setProcessing(true);
    setError("");

    const formData = new FormData();
    files.forEach((file) => formData.append("files", file));

    try {
      const response = await fetch("/api/process", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.detail || "Processing failed.");
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "FLK-LMK-Report.zip";
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err.message || "Something went wrong.");
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="card">
      <header className="card-header">
        <h1>FLK-LMK Report Upload</h1>
        <p>Upload multiple ZIP or GZ archives containing Excel runsheets</p>
      </header>

      <div className="card-body">
        <section
          className={`dropzone ${dragOver ? "dropzone-active" : ""}`}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
        >
          <div className="dropzone-icon">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none">
              <rect x="3" y="3" width="18" height="18" rx="3" stroke="#22c55e" strokeWidth="1.5" />
              <path d="M12 8v8M8 12h8" stroke="#22c55e" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </div>
          <p className="dropzone-text">Drag ZIP / GZ files to upload</p>
          <button
            type="button"
            className="btn-primary"
            onClick={() => inputRef.current?.click()}
          >
            Choose Files
          </button>
          <input
            ref={inputRef}
            type="file"
            accept=".zip,.gz,.tgz,.tar.gz"
            multiple
            hidden
            onChange={(e) => {
              addFiles(e.target.files);
              e.target.value = "";
            }}
          />
        </section>

        <section className="upload-list">
          <h2>Files ({files.length})</h2>
          {files.length === 0 ? (
            <p className="empty">No files selected yet</p>
          ) : (
            <ul>
              {files.map((file) => (
                <li key={file.name} className="file-row">
                  <FileIcon />
                  <div className="file-meta">
                    <span className="file-name">{file.name}</span>
                    <span className="file-size">{formatSize(file.size)}</span>
                  </div>
                  <button
                    type="button"
                    className="remove-btn"
                    onClick={() => removeFile(file.name)}
                    aria-label={`Remove ${file.name}`}
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}

          {error && <p className="error">{error}</p>}

          <button
            type="button"
            className="btn-process"
            disabled={!files.length || processing}
            onClick={processFiles}
          >
            {processing ? "Processing…" : "Merge & Download Report"}
          </button>

          <div className="info-box">
            <strong>Output includes:</strong>
            <ul>
              <li>Merged_All_Data.xlsx — all Excel rows combined</li>
              <li>
                FHRID_Summary_Report.xlsx — unique FHRID with AgentName,
                DeliveryHub, City, rider count, Total (column F), and status counts
              </li>
            </ul>
          </div>
        </section>
      </div>
    </div>
  );
}
