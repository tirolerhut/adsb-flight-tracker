import React from 'react';
import { Plane, ShieldCheck, FilterX, Activity, AlertTriangle, ArrowUpRight } from 'lucide-react';
import { FlightRecord } from '../types';

interface StatsCardsProps {
  activeCount: number;
  totalUniqueCount: number;
  duplicatesPrevented: number;
  totalMessages: number;
  records: FlightRecord[];
}

export const StatsCards: React.FC<StatsCardsProps> = ({
  activeCount,
  totalUniqueCount,
  duplicatesPrevented,
  totalMessages,
  records
}) => {
  const maxAlt = records.reduce((max, r) => (r.altMax && r.altMax > max ? r.altMax : max), 0);
  const maxSpeed = records.reduce((max, r) => (r.speedMax && r.speedMax > max ? r.speedMax : max), 0);
  const emergencyCount = records.filter(r => r.emergency && r.emergency !== 'none' || r.squawk === '7700' || r.squawk === '7600' || r.squawk === '7500').length;

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
      {/* 1. Aktive Flugzeuge */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 flex flex-col justify-between shadow-xs relative overflow-hidden">
        <div className="flex items-center justify-between">
          <span className="text-xs text-slate-500 font-medium">Aktive Flugzeuge (Live)</span>
          <span className="flex h-2.5 w-2.5 relative">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
          </span>
        </div>
        <div className="mt-3 flex items-baseline justify-between">
          <div className="text-2xl font-bold text-slate-900 tracking-tight font-sans">
            {activeCount}
          </div>
          <div className="text-xs text-emerald-700 font-semibold px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-100 flex items-center">
            <Plane className="w-3.5 h-3.5 mr-1" /> Im Empfang
          </div>
        </div>
        <div className="mt-3 pt-2.5 border-t border-slate-100 text-[11px] text-slate-500 flex items-center justify-between">
          <span>Max. Speed</span>
          <span className="font-mono text-slate-700 font-semibold">{maxSpeed > 0 ? `${Math.round(maxSpeed)} kts` : '--'}</span>
        </div>
      </div>

      {/* 2. Deduplizierte Flüge (in CSV) */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 flex flex-col justify-between shadow-xs">
        <div className="flex items-center justify-between">
          <span className="text-xs text-slate-500 font-medium">Eindeutige Flüge (CSV)</span>
          <div className="w-5 h-5 bg-indigo-50 text-indigo-600 rounded flex items-center justify-center">
            <ShieldCheck className="w-3.5 h-3.5" />
          </div>
        </div>
        <div className="mt-3 flex items-baseline justify-between">
          <div className="text-2xl font-bold text-indigo-600 tracking-tight font-sans">
            {totalUniqueCount}
          </div>
          <div className="text-xs text-indigo-700 font-semibold px-2 py-0.5 rounded-full bg-indigo-50 border border-indigo-100">
            1x garantiert
          </div>
        </div>
        <div className="mt-3 pt-2.5 border-t border-slate-100 text-[11px] text-slate-500 flex items-center justify-between">
          <span>Max. Höhe</span>
          <span className="font-mono text-slate-700 font-semibold">{maxAlt > 0 ? `${maxAlt.toLocaleString()} ft` : '--'}</span>
        </div>
      </div>

      {/* 3. Verhindertes Duplikat */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 flex flex-col justify-between shadow-xs">
        <div className="flex items-center justify-between">
          <span className="text-xs text-slate-500 font-medium">Verhinderte Duplikate</span>
          <div className="w-5 h-5 bg-slate-100 text-slate-600 rounded flex items-center justify-center">
            <FilterX className="w-3.5 h-3.5" />
          </div>
        </div>
        <div className="mt-3 flex items-baseline justify-between">
          <div className="text-2xl font-bold text-slate-800 tracking-tight font-sans">
            {duplicatesPrevented}
          </div>
          <div className="text-xs text-slate-600 font-semibold px-2 py-0.5 rounded-full bg-slate-100 border border-slate-200">
            Gefiltert
          </div>
        </div>
        <div className="mt-3 pt-2.5 border-t border-slate-100 text-[11px] text-slate-500 flex items-center justify-between">
          <span>Deduplizier-Rate</span>
          <span className="font-mono text-slate-700 font-semibold">
            {totalUniqueCount + duplicatesPrevented > 0
              ? `${Math.round((duplicatesPrevented / (totalUniqueCount + duplicatesPrevented)) * 100)}%`
              : '0%'}
          </span>
        </div>
      </div>

      {/* 4. Nachrichten & ADS-B Stream */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 flex flex-col justify-between shadow-xs">
        <div className="flex items-center justify-between">
          <span className="text-xs text-slate-500 font-medium">ADS-B Nachrichten</span>
          {emergencyCount > 0 ? (
            <span className="flex items-center text-rose-600 text-xs font-bold gap-1 animate-pulse bg-rose-50 px-1.5 py-0.5 rounded border border-rose-200">
              <AlertTriangle className="w-3 h-3" /> {emergencyCount} Notfall
            </span>
          ) : (
            <div className="w-5 h-5 bg-sky-50 text-sky-600 rounded flex items-center justify-center">
              <Activity className="w-3.5 h-3.5" />
            </div>
          )}
        </div>
        <div className="mt-3 flex items-baseline justify-between">
          <div className="text-2xl font-bold text-slate-800 tracking-tight font-sans">
            {totalMessages.toLocaleString()}
          </div>
          <div className="text-xs text-slate-500 font-medium">
            1090 MHz
          </div>
        </div>
        <div className="mt-3 pt-2.5 border-t border-slate-100 text-[11px] text-slate-500 flex items-center justify-between">
          <span>Status</span>
          <span className="text-emerald-600 font-semibold flex items-center gap-1">
            <ArrowUpRight className="w-3 h-3" /> Stream Online
          </span>
        </div>
      </div>
    </div>
  );
};
