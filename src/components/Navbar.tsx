import React from 'react';
import { Plane, Radio, FileSpreadsheet, Code2, FileCode, Play, Pause, Download, RotateCcw } from 'lucide-react';

interface NavbarProps {
  activeTab: 'radar' | 'csv' | 'python' | 'json';
  setActiveTab: (tab: 'radar' | 'csv' | 'python' | 'json') => void;
  isSimulating: boolean;
  setIsSimulating: (val: boolean) => void;
  totalUnique: number;
  activeCount: number;
  onDownloadCsv: () => void;
  onReset: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  activeTab,
  setActiveTab,
  isSimulating,
  setIsSimulating,
  totalUnique,
  activeCount,
  onDownloadCsv,
  onReset
}) => {
  return (
    <header className="bg-white border-b border-slate-200 sticky top-0 z-50 shadow-xs">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo & Title */}
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center text-white shadow-xs">
              <Radio className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base sm:text-lg font-bold tracking-tight text-slate-900">
                  SkyLogger <span className="text-indigo-600 font-semibold text-xs px-1.5 py-0.5 rounded bg-indigo-50 border border-indigo-100">v2.4</span>
                </h1>
              </div>
              <p className="text-[11px] text-slate-500 hidden sm:block">
                aircraft.json &amp; fortlaufendes CSV-Logbuch
              </p>
            </div>
          </div>

          {/* Navigation Tabs */}
          <nav className="flex space-x-1 bg-slate-100 p-1 rounded-xl border border-slate-200/80">
            <button
              id="nav-tab-radar"
              onClick={() => setActiveTab('radar')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                activeTab === 'radar'
                  ? 'bg-white text-indigo-700 font-semibold shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
              }`}
            >
              <Plane className="w-3.5 h-3.5" />
              <span>Radar &amp; Flüge</span>
              {activeCount > 0 && (
                <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] bg-indigo-100 text-indigo-700 font-semibold">
                  {activeCount}
                </span>
              )}
            </button>

            <button
              id="nav-tab-csv"
              onClick={() => setActiveTab('csv')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                activeTab === 'csv'
                  ? 'bg-white text-indigo-700 font-semibold shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
              }`}
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>CSV-Logbuch</span>
              <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] bg-emerald-100 text-emerald-700 font-semibold">
                {totalUnique}
              </span>
            </button>

            <button
              id="nav-tab-python"
              onClick={() => setActiveTab('python')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                activeTab === 'python'
                  ? 'bg-white text-indigo-700 font-semibold shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
              }`}
            >
              <Code2 className="w-3.5 h-3.5" />
              <span>Python-Studio</span>
            </button>

            <button
              id="nav-tab-json"
              onClick={() => setActiveTab('json')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                activeTab === 'json'
                  ? 'bg-white text-indigo-700 font-semibold shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
              }`}
            >
              <FileCode className="w-3.5 h-3.5" />
              <span>JSON-Inspektor</span>
            </button>
          </nav>

          {/* Quick Actions */}
          <div className="flex items-center gap-2">
            <button
              id="btn-toggle-sim"
              onClick={() => setIsSimulating(!isSimulating)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                isSimulating
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100'
                  : 'bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100'
              }`}
              title={isSimulating ? 'Live-Tracking anhalten' : 'Live-Tracking fortsetzen'}
            >
              <span className={`w-2 h-2 rounded-full ${isSimulating ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`}></span>
              <span className="hidden md:inline">{isSimulating ? 'Live Tracking Active' : 'Pausiert'}</span>
            </button>

            <button
              id="btn-quick-download-csv"
              onClick={onDownloadCsv}
              disabled={totalUnique === 0}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:pointer-events-none text-white shadow-xs transition-colors"
              title="CSV-Datei mit allen deduplizierten Flügen herunterladen"
            >
              <Download className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">CSV Export</span>
            </button>

            <button
              id="btn-reset-session"
              onClick={onReset}
              className="p-2 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-100 border border-slate-200 transition-colors"
              title="Sitzung & Zähler zurücksetzen"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </header>
  );
};
