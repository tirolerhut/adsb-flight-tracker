import React, { useState, useMemo } from 'react';
import { RawAircraft, FlightRecord } from '../types';
import { Compass, ZoomIn, ZoomOut, Target, Navigation, Layers, ShieldAlert } from 'lucide-react';
import { AIRLINE_INFO } from '../data/sampleAircraft';

interface LiveRadarProps {
  aircraft: RawAircraft[];
  flightRecords: FlightRecord[];
  receiverLat: number;
  receiverLon: number;
  selectedHex: string | null;
  onSelectHex: (hex: string | null) => void;
}

export const LiveRadar: React.FC<LiveRadarProps> = ({
  aircraft,
  flightRecords,
  receiverLat,
  receiverLon,
  selectedHex,
  onSelectHex
}) => {
  // Radar Range in Nautical Miles
  const [maxRangeNm, setMaxRangeNm] = useState<number>(100);
  const [showTrails, setShowTrails] = useState<boolean>(true);
  const [filterMode, setFilterMode] = useState<'all' | 'high' | 'low' | 'emergency'>('all');

  // Center & Dimensions for SVG Radar
  const size = 560;
  const center = size / 2;
  const radius = center - 40; // leaving margin for compass labels

  // Approximate nautical miles calculation from Lat/Lon
  // 1 degree lat ~ 60 nautical miles
  // 1 degree lon ~ 60 * cos(lat) nautical miles
  const scale = radius / maxRangeNm;

  const getCoordinates = (lat?: number, lon?: number) => {
    if (lat === undefined || lon === undefined) return null;
    const dLat = lat - receiverLat;
    const dLon = lon - receiverLon;
    const latRad = (receiverLat * Math.PI) / 180;

    const northNm = dLat * 60;
    const eastNm = dLon * 60 * Math.cos(latRad);

    const x = center + eastNm * scale;
    const y = center - northNm * scale; // Y is inverted in SVG (north is up)

    const distanceNm = Math.sqrt(northNm * northNm + eastNm * eastNm);

    return { x, y, distanceNm, northNm, eastNm };
  };

  const filteredAircraft = useMemo(() => {
    return aircraft.filter(ac => {
      const alt = typeof ac.alt_baro === 'number' ? ac.alt_baro : 0;
      if (filterMode === 'high') return alt >= 24000;
      if (filterMode === 'low') return alt < 10000;
      if (filterMode === 'emergency') {
        return (ac.emergency && ac.emergency !== 'none') || ac.squawk === '7700' || ac.squawk === '7600' || ac.squawk === '7500';
      }
      return true;
    });
  }, [aircraft, filterMode]);

  const selectedAc = aircraft.find(a => a.hex.toLowerCase() === selectedHex?.toLowerCase());
  const selectedRecord = flightRecords.find(r => r.hex.toLowerCase() === selectedHex?.toLowerCase());

  const prefix = (selectedAc?.flight || selectedRecord?.callsign || '').substring(0, 3);
  const airlineMeta = AIRLINE_INFO[prefix];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      {/* Radar Canvas Container */}
      <div className="lg:col-span-8 bg-white border border-slate-200 rounded-xl p-4 sm:p-5 shadow-xs flex flex-col items-center relative overflow-hidden">
        {/* Radar Controls Toolbar */}
        <div className="w-full flex flex-wrap items-center justify-between gap-2 pb-3 mb-2 border-b border-slate-100 text-xs">
          <div className="flex items-center gap-2 text-slate-800">
            <div className="w-5 h-5 bg-indigo-50 text-indigo-600 rounded flex items-center justify-center">
              <Compass className="w-3.5 h-3.5" />
            </div>
            <span className="font-bold text-slate-800">ADS-B Primär-Radar</span>
            <span className="text-slate-400 font-mono text-[11px]">({receiverLat.toFixed(2)}°N, {receiverLon.toFixed(2)}°E)</span>
          </div>

          <div className="flex items-center gap-2">
            {/* Filter pills */}
            <div className="flex bg-slate-100 p-0.5 rounded-lg border border-slate-200 text-[11px]">
              <button
                onClick={() => setFilterMode('all')}
                className={`px-2.5 py-1 rounded-md transition-colors ${filterMode === 'all' ? 'bg-indigo-600 text-white font-semibold shadow-xs' : 'text-slate-600 hover:text-slate-900'}`}
              >
                Alle ({aircraft.length})
              </button>
              <button
                onClick={() => setFilterMode('high')}
                className={`px-2.5 py-1 rounded-md transition-colors ${filterMode === 'high' ? 'bg-indigo-600 text-white font-semibold shadow-xs' : 'text-slate-600 hover:text-slate-900'}`}
              >
                &gt;FL240
              </button>
              <button
                onClick={() => setFilterMode('low')}
                className={`px-2.5 py-1 rounded-md transition-colors ${filterMode === 'low' ? 'bg-indigo-600 text-white font-semibold shadow-xs' : 'text-slate-600 hover:text-slate-900'}`}
              >
                &lt;FL100
              </button>
              <button
                onClick={() => setFilterMode('emergency')}
                className={`px-2.5 py-1 rounded-md transition-colors ${filterMode === 'emergency' ? 'bg-rose-600 text-white font-bold shadow-xs' : 'text-slate-600 hover:text-rose-600'}`}
              >
                Notfall
              </button>
            </div>

            {/* Zoom Controls */}
            <div className="flex items-center bg-slate-100 rounded-lg border border-slate-200 p-0.5">
              <button
                onClick={() => setMaxRangeNm(r => Math.max(25, r - 25))}
                disabled={maxRangeNm <= 25}
                className="p-1 text-slate-600 hover:text-slate-900 disabled:opacity-30 transition-colors"
                title="Zoom rein (+)"
              >
                <ZoomIn className="w-3.5 h-3.5" />
              </button>
              <span className="px-2 font-mono text-[11px] text-slate-700 font-semibold min-w-[50px] text-center">
                {maxRangeNm} NM
              </span>
              <button
                onClick={() => setMaxRangeNm(r => Math.min(250, r + 25))}
                disabled={maxRangeNm >= 250}
                className="p-1 text-slate-600 hover:text-slate-900 disabled:opacity-30 transition-colors"
                title="Zoom raus (-)"
              >
                <ZoomOut className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>

        {/* SVG Radar Scope */}
        <div className="relative w-full max-w-[560px] aspect-square flex items-center justify-center select-none my-1">
          <svg viewBox={`0 0 ${size} ${size}`} className="w-full h-full drop-shadow-sm">
            {/* Background Grid & Gradient */}
            <defs>
              <radialGradient id="radarGlow" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#0f172a" stopOpacity="1" />
                <stop offset="70%" stopColor="#090d16" stopOpacity="1" />
                <stop offset="100%" stopColor="#020617" stopOpacity="1" />
              </radialGradient>

              {/* Aircraft Icon Marker */}
              <g id="aircraft-icon">
                <path
                  d="M0,-10 L3,-4 L8,-1 L8,1 L3,0 L2,6 L4,8 L4,9 L0,8 L-4,9 L-4,8 L-2,6 L-3,0 L-8,1 L-8,-1 L-3,-4 Z"
                  fill="currentColor"
                />
              </g>
            </defs>

            {/* Radar Circular Background */}
            <circle cx={center} cy={center} r={radius} fill="url(#radarGlow)" stroke="#334155" strokeWidth="2" />

            {/* Range Rings */}
            {[0.25, 0.5, 0.75, 1.0].map((fraction, idx) => {
              const r = radius * fraction;
              const rangeNm = Math.round(maxRangeNm * fraction);
              return (
                <g key={`ring-${idx}`}>
                  <circle
                    cx={center}
                    cy={center}
                    r={r}
                    fill="none"
                    stroke="#1e293b"
                    strokeWidth="1.2"
                    strokeDasharray={idx === 3 ? 'none' : '3 3'}
                  />
                  <text
                    x={center + 4}
                    y={center - r + 12}
                    fill="#64748b"
                    fontSize="9"
                    fontFamily="monospace"
                  >
                    {rangeNm} NM
                  </text>
                </g>
              );
            })}

            {/* Crosshairs & Axes */}
            <line x1={center} y1={center - radius} x2={center} y2={center + radius} stroke="#1e293b" strokeWidth="1" />
            <line x1={center - radius} y1={center} x2={center + radius} y2={center} stroke="#1e293b" strokeWidth="1" />

            {/* Diagonal Guideline 45 deg */}
            <line
              x1={center - radius * 0.707}
              y1={center - radius * 0.707}
              x2={center + radius * 0.707}
              y2={center + radius * 0.707}
              stroke="#1e293b"
              strokeWidth="1"
              strokeDasharray="2 4"
            />
            <line
              x1={center - radius * 0.707}
              y1={center + radius * 0.707}
              x2={center + radius * 0.707}
              y2={center - radius * 0.707}
              stroke="#1e293b"
              strokeWidth="1"
              strokeDasharray="2 4"
            />

            {/* Compass Labels */}
            <text x={center} y={center - radius - 10} fill="#6366f1" fontSize="12" fontWeight="bold" textAnchor="middle">N 000°</text>
            <text x={center + radius + 15} y={center + 4} fill="#64748b" fontSize="11" textAnchor="start">E 090°</text>
            <text x={center} y={center + radius + 18} fill="#64748b" fontSize="11" textAnchor="middle">S 180°</text>
            <text x={center - radius - 15} y={center + 4} fill="#64748b" fontSize="11" textAnchor="end">W 270°</text>

            {/* Central Receiver Station Dot */}
            <circle cx={center} cy={center} r={4} fill="#6366f1" />
            <circle cx={center} cy={center} r={9} fill="none" stroke="#6366f1" strokeWidth="1.2" opacity="0.8" />

            {/* Aircraft Targets */}
            {filteredAircraft.map((ac) => {
              const coords = getCoordinates(ac.lat, ac.lon);
              if (!coords) return null;

              // Check if aircraft is outside radar scope range
              if (coords.distanceNm > maxRangeNm) return null;

              const isSelected = selectedHex?.toLowerCase() === ac.hex.toLowerCase();
              const track = ac.track || 0;
              const alt = typeof ac.alt_baro === 'number' ? ac.alt_baro : (typeof ac.alt_geom === 'number' ? ac.alt_geom : 0);
              const gs = ac.gs || 0;
              const isEmergency = (ac.emergency && ac.emergency !== 'none') || ac.squawk === '7700' || ac.squawk === '7600';

              const callsign = (ac.flight || ac.callsign || ac.hex).trim().toUpperCase();

              // Speed vector line (length based on ground speed)
              const speedVectorLen = Math.min(30, (gs / 500) * 25);
              const trackRad = (track * Math.PI) / 180;
              const vectorEndX = coords.x + Math.sin(trackRad) * speedVectorLen;
              const vectorEndY = coords.y - Math.cos(trackRad) * speedVectorLen;

              return (
                <g
                  key={ac.hex}
                  onClick={() => onSelectHex(isSelected ? null : ac.hex)}
                  className="cursor-pointer transition-transform"
                >
                  {/* Selected Highlight Circle */}
                  {isSelected && (
                    <circle
                      cx={coords.x}
                      cy={coords.y}
                      r={18}
                      fill="none"
                      stroke="#818cf8"
                      strokeWidth="2"
                      strokeDasharray="3 3"
                      className="animate-spin"
                      style={{ transformOrigin: `${coords.x}px ${coords.y}px` }}
                    />
                  )}

                  {/* Heading Vector */}
                  <line
                    x1={coords.x}
                    y1={coords.y}
                    x2={vectorEndX}
                    y2={vectorEndY}
                    stroke={isEmergency ? '#f43f5e' : (isSelected ? '#818cf8' : '#10b981')}
                    strokeWidth={isSelected ? '2.5' : '1.5'}
                  />

                  {/* Rotated Aircraft Marker */}
                  <g
                    transform={`translate(${coords.x}, ${coords.y}) rotate(${track})`}
                    className={isEmergency ? 'text-rose-400' : (isSelected ? 'text-indigo-400' : 'text-emerald-400 hover:text-white')}
                  >
                    <use href="#aircraft-icon" />
                  </g>

                  {/* Data Tag Label */}
                  <g transform={`translate(${coords.x + 8}, ${coords.y - 8})`}>
                    <rect
                      x="-2"
                      y="-10"
                      width="54"
                      height="22"
                      rx="3"
                      fill="#0f172a"
                      fillOpacity="0.9"
                      stroke={isSelected ? '#818cf8' : '#334155'}
                      strokeWidth="1"
                    />
                    <text
                      x="2"
                      y="0"
                      fill={isEmergency ? '#fb7185' : (isSelected ? '#c7d2fe' : '#f8fafc')}
                      fontSize="9"
                      fontWeight="bold"
                      fontFamily="monospace"
                    >
                      {callsign}
                    </text>
                    <text
                      x="2"
                      y="9"
                      fill="#94a3b8"
                      fontSize="7.5"
                      fontFamily="monospace"
                    >
                      {alt > 0 ? `FL${Math.round(alt / 100)}` : 'GND'} {gs > 0 ? `${Math.round(gs)}k` : ''}
                    </text>
                  </g>
                </g>
              );
            })}
          </svg>
        </div>

        {/* Legend */}
        <div className="w-full flex items-center justify-between text-[11px] text-slate-500 pt-3 border-t border-slate-100">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1.5 font-medium">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span> Normalflug
            </span>
            <span className="flex items-center gap-1.5 font-medium">
              <span className="w-2.5 h-2.5 rounded-full bg-indigo-500"></span> Ausgewählt
            </span>
            <span className="flex items-center gap-1.5 font-medium">
              <span className="w-2.5 h-2.5 rounded-full bg-rose-500"></span> Notfall (7700)
            </span>
          </div>
          <span className="font-mono text-slate-500 text-xs">
            {filteredAircraft.length} Flugziele im Radar
          </span>
        </div>
      </div>

      {/* Flight Detail Inspection Panel */}
      <div className="lg:col-span-4 bg-white border border-slate-200 rounded-xl p-4 sm:p-5 shadow-xs flex flex-col gap-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 bg-indigo-50 text-indigo-600 rounded flex items-center justify-center">
              <Target className="w-3.5 h-3.5" />
            </div>
            <h3 className="font-bold text-sm text-slate-800">Flugziel-Details</h3>
          </div>
          {selectedHex && (
            <button
              onClick={() => onSelectHex(null)}
              className="text-xs text-indigo-600 hover:text-indigo-800 font-medium"
            >
              Abwählen
            </button>
          )}
        </div>

        {selectedAc || selectedRecord ? (
          <div className="space-y-4">
            {/* Header info */}
            <div className="bg-slate-50 rounded-xl p-3.5 border border-slate-200">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-xl text-slate-900 font-mono">
                      {selectedAc?.flight || selectedRecord?.callsign || selectedAc?.r || 'OHNE RUFZEICHEN'}
                    </span>
                    {airlineMeta && (
                      <span className="text-base" title={airlineMeta.name}>
                        {airlineMeta.flag}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-xs text-indigo-600 font-mono font-semibold">
                      HEX: {selectedAc?.hex.toUpperCase() || selectedRecord?.hex.toUpperCase()}
                    </span>
                    {(selectedAc?.r || selectedRecord?.registration) && (
                      <span className="text-xs font-mono font-bold text-slate-700 bg-white px-1.5 py-0.5 rounded border border-slate-200">
                        {selectedAc?.r || selectedRecord?.registration}
                      </span>
                    )}
                  </div>
                  {(selectedAc?.desc || selectedAc?.t || selectedRecord?.aircraftDesc || selectedRecord?.typeCode) && (
                    <div className="text-xs font-medium text-slate-800 mt-1 flex items-center gap-1.5">
                      <span className="bg-indigo-50 text-indigo-700 px-1.5 py-0.5 rounded font-mono font-bold text-[10px] border border-indigo-100">
                        {selectedAc?.t || selectedRecord?.typeCode}
                      </span>
                      <span className="text-slate-600">{selectedAc?.desc || selectedRecord?.aircraftDesc}</span>
                    </div>
                  )}
                  {airlineMeta && (
                    <div className="text-xs text-slate-500 mt-1 font-medium">
                      {airlineMeta.name} ({airlineMeta.country})
                    </div>
                  )}
                </div>

                <div className="text-right">
                  <span className="inline-block px-2.5 py-1 rounded text-xs font-mono font-semibold bg-white text-slate-800 border border-slate-200 shadow-2xs">
                    Squawk: {selectedAc?.squawk || selectedRecord?.squawk || '----'}
                  </span>
                  {selectedRecord && (
                    <div className="text-[11px] text-emerald-700 mt-1 font-semibold">
                      ✓ In CSV erfasst
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Extended Flight Telemetry (readsb/dump1090) */}
            {(selectedAc?.mach !== undefined || selectedAc?.ws !== undefined || selectedAc?.oat !== undefined || selectedAc?.r_dst !== undefined) && (
              <div className="grid grid-cols-3 gap-2 text-xs">
                {selectedAc?.mach !== undefined && (
                  <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                    <span className="text-slate-500 block text-[10px] font-medium">Mach</span>
                    <span className="font-mono font-bold text-xs text-slate-900">M {selectedAc.mach.toFixed(3)}</span>
                  </div>
                )}
                {selectedAc?.ws !== undefined && (
                  <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                    <span className="text-slate-500 block text-[10px] font-medium">Wind</span>
                    <span className="font-mono font-bold text-xs text-slate-900">{selectedAc.wd || 0}° / {selectedAc.ws} kts</span>
                  </div>
                )}
                {selectedAc?.oat !== undefined && (
                  <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                    <span className="text-slate-500 block text-[10px] font-medium">Außentemp.</span>
                    <span className="font-mono font-bold text-xs text-slate-900">{selectedAc.oat}°C</span>
                  </div>
                )}
                {selectedAc?.r_dst !== undefined && (
                  <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200 col-span-3 flex justify-between items-center">
                    <span className="text-slate-500 text-[11px] font-medium">Empfänger-Distanz (r_dst)</span>
                    <span className="font-mono font-bold text-xs text-indigo-700">
                      {selectedAc.r_dst.toFixed(1)} NM {selectedAc.r_dir !== undefined ? `(${selectedAc.r_dir.toFixed(0)}°)` : ''}
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* Flight Metrics Grid */}
            <div className="grid grid-cols-2 gap-2.5 text-xs">
              <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
                <span className="text-slate-500 block text-[11px] font-medium">Höhe (Barometrisch)</span>
                <span className="font-mono font-bold text-sm text-slate-900">
                  {selectedAc?.alt_baro !== undefined
                    ? `${selectedAc.alt_baro.toLocaleString()} ft`
                    : (selectedRecord?.altLast ? `${selectedRecord.altLast.toLocaleString()} ft` : '--')}
                </span>
                {selectedAc?.baro_rate !== undefined && (
                  <span className="text-[10px] text-slate-500 block mt-0.5 font-medium">
                    {selectedAc.baro_rate > 0 ? `+${selectedAc.baro_rate}` : selectedAc.baro_rate} ft/min
                  </span>
                )}
              </div>

              <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
                <span className="text-slate-500 block text-[11px] font-medium">Geschwindigkeit (GS)</span>
                <span className="font-mono font-bold text-sm text-slate-900">
                  {selectedAc?.gs ? `${Math.round(selectedAc.gs)} kts` : (selectedRecord?.speedLast ? `${Math.round(selectedRecord.speedLast)} kts` : '--')}
                </span>
                <span className="text-[10px] text-slate-500 block mt-0.5 font-medium">
                  {selectedAc?.gs ? `~${Math.round(selectedAc.gs * 1.852)} km/h` : ''}
                </span>
              </div>

              <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
                <span className="text-slate-500 block text-[11px] font-medium">Steuerkurs (Track)</span>
                <span className="font-mono font-bold text-sm text-slate-900 flex items-center gap-1">
                  <Navigation
                    className="w-3.5 h-3.5 text-indigo-600 inline"
                    style={{ transform: `rotate(${selectedAc?.track || selectedRecord?.trackLast || 0}deg)` }}
                  />
                  {selectedAc?.track !== undefined ? `${Math.round(selectedAc.track)}°` : (selectedRecord?.trackLast ? `${Math.round(selectedRecord.trackLast)}°` : '--')}
                </span>
              </div>

              <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
                <span className="text-slate-500 block text-[11px] font-medium">Signal (RSSI / Msg)</span>
                <span className="font-mono font-bold text-sm text-slate-900">
                  {selectedAc?.rssi !== undefined ? `${selectedAc.rssi.toFixed(1)} dBFS` : '--'}
                </span>
                <span className="text-[10px] text-slate-500 block mt-0.5 font-medium">
                  {selectedAc?.messages || selectedRecord?.messagesCount || 0} Nachrichten
                </span>
              </div>
            </div>

            {/* Position Details */}
            <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 text-xs">
              <span className="text-slate-500 block text-[11px] font-medium mb-1">Geografische Position</span>
              <div className="font-mono text-slate-800 font-semibold flex justify-between">
                <span>Lat: {selectedAc?.lat ? selectedAc.lat.toFixed(5) : (selectedRecord?.latLast?.toFixed(5) || '--')}</span>
                <span>Lon: {selectedAc?.lon ? selectedAc.lon.toFixed(5) : (selectedRecord?.lonLast?.toFixed(5) || '--')}</span>
              </div>
            </div>

            {/* Deduplication Status info */}
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3.5 text-xs text-emerald-900 shadow-2xs">
              <div className="font-bold flex items-center gap-1.5 mb-1.5 text-emerald-800">
                <ShieldAlert className="w-4 h-4 text-emerald-600" />
                <span>Eindeutiger CSV-Schlüssel (UID)</span>
              </div>
              <p className="font-mono text-xs text-emerald-900 bg-white p-2 rounded-lg border border-emerald-200 break-all font-semibold shadow-2xs">
                {selectedRecord?.uid || `${(selectedAc?.hex || '').toUpperCase()}_${(selectedAc?.flight || 'NOCALL').trim()}_${new Date().toISOString().slice(0, 10).replace(/-/g, '')}`}
              </p>
              <p className="text-[11px] text-emerald-700 mt-2 leading-relaxed">
                Garantiert, dass dieser Flug beim Export oder Ingestion genau einmal in der CSV-Zieldatei abgelegt wird.
              </p>
            </div>
          </div>
        ) : (
          <div className="py-16 px-4 text-center text-slate-400 flex flex-col items-center">
            <Target className="w-12 h-12 text-slate-300 mb-3 stroke-1" />
            <p className="text-xs text-slate-500 max-w-xs leading-relaxed">
              Klicke ein Flugzeug im Radar an oder wähle einen Flug aus der Tabelle, um detaillierte Flug- und Transponderdaten anzuzeigen.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
