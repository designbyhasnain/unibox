'use client';
import { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import Papa from 'papaparse';
import { importEditProjectsFromCSV } from '../../../lib/projects/actions';

type Props = {
  isOpen: boolean;
  onClose: () => void;
  onComplete: () => void;
};

type Step = 'upload' | 'preview' | 'importing' | 'done';

export default function CSVImportModal({ isOpen, onClose, onComplete }: Props) {
  const [step, setStep] = useState<Step>('upload');
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [fileName, setFileName] = useState('');
  const [result, setResult] = useState<{ imported: number; failed: number; skipped: number } | null>(null);
  const [progress, setProgress] = useState(0);

  const onDrop = useCallback((files: File[]) => {
    const file = files[0];
    if (!file) return;
    setFileName(file.name);

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const data = results.data as Record<string, string>[];
        setRows(data);
        setHeaders(results.meta.fields || []);
        setStep('preview');
      },
    });
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'text/csv': ['.csv'] },
    multiple: false,
  });

  const handleImport = async () => {
    setStep('importing');
    const batchSize = 100;
    const totalBatches = Math.ceil(rows.length / batchSize);

    const res = await importEditProjectsFromCSV(rows);
    setProgress(100);
    setResult({ imported: res.imported, failed: res.failed, skipped: res.skipped ?? 0 });
    setStep('done');
  };

  const handleClose = () => {
    setStep('upload');
    setRows([]);
    setHeaders([]);
    setFileName('');
    setResult(null);
    setProgress(0);
    onClose();
    if (result && result.imported > 0) onComplete();
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={handleClose}>
      <div className="ep-import-modal" onClick={e => e.stopPropagation()}>
        <div className="ep-import-header">
          <h2>Import CSV</h2>
          <button className="ep-import-close" onClick={handleClose}>✕</button>
        </div>

        {step === 'upload' && (
          <div {...getRootProps()} className={`ep-import-dropzone ${isDragActive ? 'ep-import-dropzone-active' : ''}`}>
            <input {...getInputProps()} />
            <div className="ep-import-dropzone-content">
              <span style={{ fontSize: 32 }}>📄</span>
              <p>Drag & drop a CSV file here, or click to browse</p>
              <p style={{ fontSize: 12, opacity: 0.5 }}>Only .csv files accepted</p>
            </div>
          </div>
        )}

        {step === 'preview' && (
          <div className="ep-import-preview">
            <p className="ep-import-info">📂 {fileName} — <strong>{rows.length}</strong> rows detected</p>
            <div className="ep-import-table-wrap">
              <table className="ep-import-table">
                <thead>
                  <tr>{headers.slice(0, 8).map(h => <th key={h}>{h}</th>)}{headers.length > 8 && <th>+{headers.length - 8} more</th>}</tr>
                </thead>
                <tbody>
                  {rows.slice(0, 5).map((row, i) => (
                    <tr key={i}>{headers.slice(0, 8).map(h => <td key={h}>{row[h]?.slice(0, 30) || ''}</td>)}{headers.length > 8 && <td>...</td>}</tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button className="ep-toolbar-btn ep-toolbar-btn-primary" style={{ marginTop: 16, width: '100%' }} onClick={handleImport}>
              Import {rows.length} rows
            </button>
          </div>
        )}

        {step === 'importing' && (
          <div className="ep-import-progress">
            <div className="ep-import-progress-bar">
              <div className="ep-import-progress-fill" style={{ width: `${progress}%` }} />
            </div>
            <p>Importing...</p>
          </div>
        )}

        {step === 'done' && result && (
          <div className="ep-import-done">
            <span style={{ fontSize: 48 }}>✅</span>
            <p>
              <strong>{result.imported}</strong> imported
              {result.skipped > 0 ? <>, {result.skipped} skipped (already exist)</> : ''}
              {result.failed > result.skipped ? <>, {result.failed - result.skipped} skipped (empty name)</> : ''}
            </p>
            <button className="ep-toolbar-btn ep-toolbar-btn-primary" onClick={handleClose}>Done</button>
          </div>
        )}
      </div>
    </div>
  );
}
