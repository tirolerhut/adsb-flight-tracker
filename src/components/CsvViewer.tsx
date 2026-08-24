import React, { useState } from 'react';
import { FlightRecord } from '../types';
import { generateFullCsv, downloadCsvFile, parseCsvToFlightRecords, isValidFlightForCsv } from '../utils/csvHelper';
import { Download, Copy, Check, FileSpreadsheet, Upload, RefreshCw, FileText } from 'lucide-react';

interface CsvViewerProps {
  records: FlightRecord[];
  onImportRecords: (imported: FlightRecord[]) => void;
}

export const CsvViewer: React.FC<CsvViewerProps> = ({ records, onImportRecords }) => {
  const [copied, setCopied] = useState(false);
  const [requireCallsign, setRequireCallsign] = useState(true);

  const csvContent = generateFullCsv(records, requireCallsign);
  const csvLines = csvContent.split('\n');
  const sizeBytes = new Blob([csvContent]).size;
  const filteredCount = records.filter(r => isValidFlightForCsv(r, requireCallsign)).length;

  const handleCopy = () => {
    navigator.clipboard.writeText(csvContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      if (text) {
        const parsed = parseCsvToFlightRecords(text);
        if (parsed.length > 0) {
          onImportRecords(parsed);
        }
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="space-y-6">
      {/* Header & Action Bar */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 bg-indigo-50 text-indigo-600 rounded flex items-center justify-center">
              <FileSpreadsheet className="w-3.5 h-3.5" />
            </div>
            <h2 className="text-base font-bold text-slate-900">Fortlaufende CSV-Ausgabedatei</h2>
            <span className="bg-indigo-50 text-indigo-700 text-xs px-2.5 py-0.5 rounded-full border border-indigo-100 font-mono font-semibold">
              flights_log.csv
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Garantierte 1-zeilige, deduplizierte Speicherung. Nur Flüge mit empfangener Flugnummer werden erfasst.
          </p>
        </div>

        {/* Actions */}
        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto justify-end">
          <label className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 cursor-pointer transition-all shadow-2xs">
            <Upload className="w-3.5 h-3.5 text-indigo-600" />
            <span>CSV importieren</span>
            <input type="file" accept=".csv" onChange={handleFileUpload} className="hidden" />
          </label>

          <button
            onClick={handleCopy}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 transition-all shadow-2xs cursor-pointer"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5 text-slate-500" />}
            <span className={copied ? 'text-emerald-700' : ''}>{copied ? 'Kopiert!' : 'CSV kopieren'}</span>
          </button>

          <button
            onClick={() => downloadCsvFile(records, 'flights_log.csv', requireCallsign)}
            disabled={filteredCount === 0}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white shadow-2xs transition-all cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>CSV herunterladen ({filteredCount} Zeilen)</span>
          </button>
        </div>
      </div>

      {/* CSV Stats Ribbon */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
        <div className="bg-white border border-slate-200 p-3.5 rounded-xl shadow-2xs">
          <span className="text-slate-500 block text-[11px] font-medium">Flüge in CSV</span>
          <span className="text-base font-bold text-slate-900 font-mono">{filteredCount} Flüge</span>
        </div>
        <div className="bg-white border border-slate-200 p-3.5 rounded-xl shadow-2xs">
          <span className="text-slate-500 block text-[11px] font-medium">Flugnummer-Gating</span>
          <span className="text-base font-bold text-indigo-600 font-mono">Streng aktiv</span>
        </div>
        <div className="bg-white border border-slate-200 p-3.5 rounded-xl shadow-2xs">
          <span className="text-slate-500 block text-[11px] font-medium">Format / Zeichensatz</span>
          <span className="text-base font-bold text-slate-800 font-mono">UTF-8 / RFC 4180</span>
        </div>
        <div className="bg-white border border-slate-200 p-3.5 rounded-xl shadow-2xs">
          <span className="text-slate-500 block text-[11px] font-medium">Deduplizierung</span>
          <span className="text-base font-bold text-emerald-600 font-mono">Aktiv (1x pro Flug)</span>
        </div>
      </div>

      {/* Code / Text Preview */}
      <div className="bg-slate-950 border border-slate-800 rounded-xl overflow-hidden shadow-xs">
        <div className="p-3 bg-slate-900 border-b border-slate-800 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2 text-slate-300 font-mono text-[11px]">
            <FileText className="w-4 h-4 text-emerald-400" />
            <span>Rohansicht der CSV-Datei (Vorschau)</span>
          </div>
          <span className="text-[11px] text-slate-400 font-mono">
            {csvLines.length} Zeilen
          </span>
        </div>

        <div className="p-4 max-h-[500px] overflow-y-auto font-mono text-xs text-slate-300 leading-relaxed space-y-1">
          {/* Header Row */}
          {csvLines.length > 0 && (
            <div className="text-sky-300 font-bold bg-sky-950/40 p-2 rounded-lg border border-sky-800/40 select-all whitespace-pre-wrap break-all">
              {csvLines[0]}
            </div>
          )}

          {/* Data Rows */}
          {csvLines.slice(1).map((line, idx) => {
            if (!line.trim()) return null;
            return (
              <div
                key={idx}
                className="hover:bg-slate-900 p-1.5 rounded transition-colors whitespace-pre-wrap break-all text-slate-300"
              >
                <span className="text-slate-500 select-none mr-2 font-mono text-[10px]">
                  {(idx + 1).toString().padStart(3, '0')}
                </span>
                {line}
              </div>
            );
          })}

          {records.length === 0 && (
            <div className="py-12 text-center text-slate-500">
              Noch keine Flugdaten vorhanden. Starte die Simulation oder lade eine aircraft.json hoch.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
