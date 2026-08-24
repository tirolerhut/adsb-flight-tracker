import React, { useState, useMemo } from 'react';
import { FlightRecord } from '../types';
import { Search, ArrowUpDown, ShieldCheck, Clock, Radio, AlertTriangle } from 'lucide-react';
import { AIRLINE_INFO } from '../data/sampleAircraft';

interface FlightsTableProps {
  records: FlightRecord[];
  selectedHex: string | null;
  onSelectHex: (hex: string) => void;
}

type SortField = 'lastSeenTs' | 'firstSeenTs' | 'callsign' | 'hex' | 'altMax' | 'speedMax' | 'messagesCount' | 'durationSeconds';

export const FlightsTable: React.FC<FlightsTableProps> = ({
  records,
  selectedHex,
  onSelectHex
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'completed'>('all');
  const [sortField, setSortField] = useState<SortField>('lastSeenTs');
  const [sortAsc, setSortAsc] = useState<boolean>(false);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(false);
    }
  };

  const filteredRecords = useMemo(() => {
    return records
      .filter((r) => {
        if (statusFilter === 'active' && !r.isActive) return false;
        if (statusFilter === 'completed' && r.isActive) return false;

        if (!searchTerm.trim()) return true;
        const term = searchTerm.toLowerCase().trim();
        const callsign = (r.callsign || '').toLowerCase();
        const hex = (r.hex || '').toLowerCase();
        const squawk = (r.squawk || '').toLowerCase();
        const reg = (r.registration || '').toLowerCase();
        const typeCode = (r.typeCode || '').toLowerCase();
        const desc = (r.aircraftDesc || '').toLowerCase();
        const uid = (r.uid || '').toLowerCase();

        return (
          callsign.includes(term) ||
          hex.includes(term) ||
          squawk.includes(term) ||
          reg.includes(term) ||
          typeCode.includes(term) ||
          desc.includes(term) ||
          uid.includes(term)
        );
      })
      .sort((a, b) => {
        let valA = a[sortField];
        let valB = b[sortField];

        if (valA === null || valA === undefined) valA = 0;
        if (valB === null || valB === undefined) valB = 0;

        if (typeof valA === 'string') {
          return sortAsc
            ? (valA as string).localeCompare(valB as string)
            : (valB as string).localeCompare(valA as string);
        }

        return sortAsc ? (valA as number) - (valB as number) : (valB as number) - (valA as number);
      });
  }, [records, searchTerm, statusFilter, sortField, sortAsc]);

  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs">
      {/* Table Toolbar */}
      <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-3 bg-slate-50/50">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Suche Rufzeichen, HEX, Squawk, UID..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all shadow-2xs"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
          <div className="flex bg-slate-100 p-0.5 rounded-lg border border-slate-200 text-xs">
            <button
              onClick={() => setStatusFilter('all')}
              className={`px-3 py-1 rounded-md transition-all ${
                statusFilter === 'all' ? 'bg-indigo-600 text-white font-semibold shadow-2xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Alle ({records.length})
            </button>
            <button
              onClick={() => setStatusFilter('active')}
              className={`px-3 py-1 rounded-md transition-all ${
                statusFilter === 'active' ? 'bg-indigo-600 text-white font-semibold shadow-2xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Aktiv ({records.filter((r) => r.isActive).length})
            </button>
            <button
              onClick={() => setStatusFilter('completed')}
              className={`px-3 py-1 rounded-md transition-all ${
                statusFilter === 'completed' ? 'bg-indigo-600 text-white font-semibold shadow-2xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Geloggt ({records.filter((r) => !r.isActive).length})
            </button>
          </div>
        </div>
      </div>

      {/* Table Element */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs text-slate-700">
          <thead className="bg-slate-50 text-slate-500 font-bold border-b border-slate-200 text-[10px] uppercase tracking-wider select-none">
            <tr>
              <th className="py-3 px-4">Status</th>
              <th className="py-3 px-4 cursor-pointer hover:text-slate-900 transition-colors" onClick={() => handleSort('callsign')}>
                <div className="flex items-center gap-1">
                  Rufzeichen / Flug
                  <ArrowUpDown className="w-3 h-3 text-slate-400" />
                </div>
              </th>
              <th className="py-3 px-4 cursor-pointer hover:text-slate-900 transition-colors" onClick={() => handleSort('hex')}>
                <div className="flex items-center gap-1">
                  ICAO Hex
                  <ArrowUpDown className="w-3 h-3 text-slate-400" />
                </div>
              </th>
              <th className="py-3 px-4">Squawk</th>
              <th className="py-3 px-4 cursor-pointer hover:text-slate-900 transition-colors" onClick={() => handleSort('altMax')}>
                <div className="flex items-center gap-1">
                  Höhe (Max)
                  <ArrowUpDown className="w-3 h-3 text-slate-400" />
                </div>
              </th>
              <th className="py-3 px-4 cursor-pointer hover:text-slate-900 transition-colors" onClick={() => handleSort('speedMax')}>
                <div className="flex items-center gap-1">
                  Speed (Max)
                  <ArrowUpDown className="w-3 h-3 text-slate-400" />
                </div>
              </th>
              <th className="py-3 px-4 cursor-pointer hover:text-slate-900 transition-colors" onClick={() => handleSort('durationSeconds')}>
                <div className="flex items-center gap-1">
                  Dauer
                  <ArrowUpDown className="w-3 h-3 text-slate-400" />
                </div>
              </th>
              <th className="py-3 px-4 cursor-pointer hover:text-slate-900 transition-colors" onClick={() => handleSort('lastSeenTs')}>
                <div className="flex items-center gap-1">
                  Letztkontakt (UTC)
                  <ArrowUpDown className="w-3 h-3 text-slate-400" />
                </div>
              </th>
              <th className="py-3 px-4 cursor-pointer hover:text-slate-900 transition-colors" onClick={() => handleSort('messagesCount')}>
                <div className="flex items-center gap-1">
                  Msgs
                  <ArrowUpDown className="w-3 h-3 text-slate-400" />
                </div>
              </th>
              <th className="py-3 px-4 text-right">Eindeutige UID (CSV)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 font-mono text-xs">
            {filteredRecords.length > 0 ? (
              filteredRecords.map((r) => {
                const isSelected = selectedHex?.toLowerCase() === r.hex.toLowerCase();
                const prefix = (r.callsign || '').substring(0, 3);
                const airline = AIRLINE_INFO[prefix];
                const isEmergency = (r.emergency && r.emergency !== 'none') || r.squawk === '7700' || r.squawk === '7600';

                return (
                  <tr
                    key={r.uid}
                    onClick={() => onSelectHex(r.hex)}
                    className={`cursor-pointer transition-colors ${
                      isSelected
                        ? 'bg-indigo-50/90 text-indigo-950 font-medium'
                        : isEmergency
                        ? 'bg-rose-50/60 hover:bg-rose-50 text-rose-900'
                        : 'hover:bg-slate-50/80 bg-white'
                    }`}
                  >
                    {/* Status Pill */}
                    <td className="py-2.5 px-4 whitespace-nowrap font-sans">
                      {r.isActive ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                          Aktiv
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-slate-100 text-slate-600 border border-slate-200">
                          <Clock className="w-3 h-3 text-slate-400" />
                          Geloggt
                        </span>
                      )}
                    </td>

                    {/* Callsign, Airline & Aircraft Type */}
                    <td className="py-2.5 px-4 whitespace-nowrap font-sans">
                      <div className="flex items-center gap-1.5">
                        {airline && <span title={airline.name} className="text-sm">{airline.flag}</span>}
                        <span className="font-mono font-bold text-slate-900">
                          {r.callsign || r.registration || 'N/A'}
                        </span>
                        {r.registration && r.callsign && (
                          <span className="text-[10px] font-mono text-slate-500 bg-slate-100 px-1 rounded border border-slate-200">
                            {r.registration}
                          </span>
                        )}
                        {isEmergency && (
                          <span className="text-rose-700 text-[10px] font-bold px-1.5 py-0.2 rounded bg-rose-100 border border-rose-200 flex items-center gap-0.5">
                            <AlertTriangle className="w-3 h-3" /> {r.emergency}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 text-[10px] text-slate-500 mt-0.5">
                        {airline && <span>{airline.name}</span>}
                        {r.adsbdbRoute && (
                          <span className="font-mono text-emerald-700 bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-200 font-semibold" title={`ADSBDB: ${r.adsbdbRoute}`}>
                            ✈ {r.adsbdbRoute}
                          </span>
                        )}
                        {r.typeCode && !r.adsbdbRoute && (
                          <span className="font-mono text-indigo-600 bg-indigo-50 px-1 rounded border border-indigo-100 font-semibold">
                            {r.typeCode} {r.aircraftDesc ? `· ${r.aircraftDesc}` : ''}
                          </span>
                        )}
                      </div>
                    </td>

                    {/* ICAO Hex */}
                    <td className="py-2.5 px-4 whitespace-nowrap font-mono text-indigo-600 font-semibold">
                      {r.hex.toUpperCase()}
                    </td>

                    {/* Squawk */}
                    <td className="py-2.5 px-4 whitespace-nowrap font-mono text-slate-700">
                      {r.squawk || '----'}
                    </td>

                    {/* Alt Max */}
                    <td className="py-2.5 px-4 whitespace-nowrap font-mono text-slate-800 font-medium">
                      {r.altMax !== null ? `${r.altMax.toLocaleString()} ft` : '--'}
                    </td>

                    {/* Speed Max */}
                    <td className="py-2.5 px-4 whitespace-nowrap font-mono text-slate-800 font-medium">
                      {r.speedMax !== null ? `${Math.round(r.speedMax)} kts` : '--'}
                    </td>

                    {/* Duration */}
                    <td className="py-2.5 px-4 whitespace-nowrap font-mono text-slate-500">
                      {r.durationSeconds}s
                    </td>

                    {/* Last Seen UTC */}
                    <td className="py-2.5 px-4 whitespace-nowrap font-mono text-[11px] text-slate-500">
                      {r.lastSeen.replace('T', ' ').slice(0, 19)}
                    </td>

                    {/* Messages count */}
                    <td className="py-2.5 px-4 whitespace-nowrap font-mono text-slate-600">
                      {r.messagesCount.toLocaleString()}
                    </td>

                    {/* UID */}
                    <td className="py-2.5 px-4 whitespace-nowrap text-right font-mono text-[10px]">
                      <span className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded border border-slate-200 font-semibold shadow-2xs">
                        {r.uid}
                      </span>
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan={10} className="py-12 text-center text-slate-400 text-xs font-sans">
                  Keine Flüge gefunden, die den Suchkriterien entsprechen.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Footer Info */}
      <div className="p-3.5 bg-slate-50 border-t border-slate-200 text-xs text-slate-500 flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-emerald-700 font-medium">
          <ShieldCheck className="w-4 h-4 text-emerald-600" />
          Alle {records.length} erfassten Flüge werden strikt dedupliziert (jeder Flug nur 1x in der CSV).
        </span>
        <span className="font-mono text-slate-500 text-[11px]">
          Zeige {filteredRecords.length} von {records.length} Flügen
        </span>
      </div>
    </div>
  );
};
