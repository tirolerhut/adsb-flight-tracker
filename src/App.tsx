import { useState, useEffect, useRef } from 'react';
import { RawAircraft, FlightRecord, AircraftJsonPayload, DedupStrategy } from './types';
import { INITIAL_SAMPLE_AIRCRAFT, AIRLINE_INFO } from './data/sampleAircraft';
import { generateFlightUid, downloadCsvFile, isValidFlightForCsv } from './utils/csvHelper';
import { fetchAdsbdbRoute } from './utils/adsbdbApi';
import { Navbar } from './components/Navbar';
import { StatsCards } from './components/StatsCards';
import { LiveRadar } from './components/LiveRadar';
import { FlightsTable } from './components/FlightsTable';
import { CsvViewer } from './components/CsvViewer';
import { PythonStudio } from './components/PythonStudio';
import { JsonInspector } from './components/JsonInspector';
import { ShieldCheck, Plus, Sparkles } from 'lucide-react';

export default function App() {
  const [activeTab, setActiveTab] = useState<'radar' | 'csv' | 'python' | 'json'>('radar');
  const [isSimulating, setIsSimulating] = useState<boolean>(true);
  const [selectedHex, setSelectedHex] = useState<string | null>(null);

  // Receiver Station Location (Default: Central Alps / Innsbruck Receiver Station matching aircraft.json sample)
  const [receiverLat, setReceiverLat] = useState<number>(47.2602);
  const [receiverLon, setReceiverLon] = useState<number>(11.3941);

  // Deduplication Settings
  const [dedupStrategy, setDedupStrategy] = useState<DedupStrategy>('daily');
  const [timeoutSec, setTimeoutSec] = useState<number>(30); // 30s in web demo so transitions happen quickly

  // Current Live Aircraft in Airspace
  const [currentAircraft, setCurrentAircraft] = useState<RawAircraft[]>(INITIAL_SAMPLE_AIRCRAFT);
  const [currentPayload, setCurrentPayload] = useState<AircraftJsonPayload | null>({
    now: 1787343922.000,
    messages: 68286465,
    aircraft: INITIAL_SAMPLE_AIRCRAFT
  });

  // Unique Recorded Flights in CSV
  const [flightRecords, setFlightRecords] = useState<FlightRecord[]>(() => {
    // Initial bootstrap of the sample aircraft into flight records
    const nowTs = Math.floor(Date.now() / 1000);
    return INITIAL_SAMPLE_AIRCRAFT.map(ac => {
      const hex = ac.hex;
      const callsign = (ac.flight || '').trim();
      const uid = generateFlightUid(hex, callsign, nowTs, 'daily');
      const alt = typeof ac.alt_baro === 'number' ? ac.alt_baro : null;
      const gs = typeof ac.gs === 'number' ? ac.gs : null;
      const prefix = callsign ? callsign.slice(0, 3) : '';
      const airlineData = AIRLINE_INFO[prefix] || null;

      return {
        uid,
        firstSeen: new Date().toISOString(),
        lastSeen: new Date().toISOString(),
        firstSeenTs: nowTs,
        lastSeenTs: nowTs,
        durationSeconds: 120,
        hex,
        callsign,
        registration: ac.r || '',
        typeCode: ac.t || '',
        aircraftDesc: ac.desc || '',
        adsbdbRoute: airlineData ? `${airlineData.name}` : undefined,
        adsbdbAirline: airlineData?.name,
        adsbdbOrigin: undefined,
        adsbdbDestination: undefined,
        adsbdbQueried: false,
        squawk: ac.squawk || '1000',
        category: ac.category || 'A3',
        altMin: alt,
        altMax: alt,
        altLast: alt,
        speedMax: gs,
        speedLast: gs,
        machMax: typeof ac.mach === 'number' ? ac.mach : null,
        windSpeedMax: typeof ac.ws === 'number' ? ac.ws : null,
        outsideAirTemp: typeof ac.oat === 'number' ? ac.oat : null,
        trackLast: ac.track || 0,
        latFirst: ac.lat || null,
        lonFirst: ac.lon || null,
        latLast: ac.lat || null,
        lonLast: ac.lon || null,
        minReceiverDist: typeof ac.r_dst === 'number' ? ac.r_dst : null,
        messagesCount: ac.messages || 500,
        emergency: ac.emergency || 'none',
        rssiMax: ac.rssi || -16.5,
        isActive: true
      };
    });
  });

  // Track Duplicates Prevented Counter & Total Messages
  const [duplicatesPrevented, setDuplicatesPrevented] = useState<number>(1420);
  const [totalMessages, setTotalMessages] = useState<number>(142850);

  // Set of already recorded UIDs to guarantee 100% deduplication
  const loggedUidsRef = useRef<Set<string>>(new Set());

  // Keep logged UIDs in sync with flight records
  useEffect(() => {
    const set = new Set<string>();
    flightRecords.forEach(r => set.add(r.uid));
    loggedUidsRef.current = set;
  }, [flightRecords]);

  // Live Simulator Loop
  useEffect(() => {
    if (!isSimulating) return;

    const interval = setInterval(() => {
      const nowTs = Math.floor(Date.now() / 1000);
      const nowIso = new Date().toISOString();

      setTotalMessages(prev => prev + Math.floor(Math.random() * 25 + 10));

      setCurrentAircraft(prevAircraft => {
        // 1. Move existing aircraft along their tracks
        let updated = prevAircraft.map(ac => {
          const track = ac.track || 0;
          const speedKts = ac.gs || 400;
          // Approximate lat/lon step per 2 seconds
          // speed in NM/h -> per 2 sec = speed / 1800 NM
          const distNm = speedKts / 1800;
          const trackRad = (track * Math.PI) / 180;
          const dLat = (distNm * Math.cos(trackRad)) / 60;
          const dLon = (distNm * Math.sin(trackRad)) / (60 * Math.cos(((ac.lat || receiverLat) * Math.PI) / 180));

          const newLat = (ac.lat || receiverLat) + dLat;
          const newLon = (ac.lon || receiverLon) + dLon;

          // Minor climb / descent jitter
          let newAlt = typeof ac.alt_baro === 'number' ? ac.alt_baro : 30000;
          if (ac.baro_rate) {
            newAlt = Math.max(1000, Math.min(43000, newAlt + Math.round(ac.baro_rate / 30)));
          }

          return {
            ...ac,
            lat: newLat,
            lon: newLon,
            alt_baro: newAlt,
            messages: (ac.messages || 0) + Math.floor(Math.random() * 5 + 1),
            rssi: Math.min(-3.0, Math.max(-28.0, (ac.rssi || -15) + (Math.random() * 1.0 - 0.5))),
            seen: 0.1
          };
        });

        // 2. Filter out aircraft that flew too far (> 140 NM away)
        updated = updated.filter(ac => {
          if (!ac.lat || !ac.lon) return true;
          const dLat = (ac.lat - receiverLat) * 60;
          const dLon = (ac.lon - receiverLon) * 60 * Math.cos((receiverLat * Math.PI) / 180);
          const distNm = Math.sqrt(dLat * dLat + dLon * dLon);
          return distNm < 140;
        });

        // 3. Occasionally spawn a new aircraft if total count < 14
        if (updated.length < 12 && Math.random() < 0.3) {
          const airlineCodes = Object.keys(AIRLINE_INFO).filter(c => c !== 'GAF' && c !== 'CHX');
          const airline = airlineCodes[Math.floor(Math.random() * airlineCodes.length)];
          const flightNum = `${airline}${Math.floor(Math.random() * 899 + 100)}`;
          const hex = Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, '0');
          const angle = Math.random() * Math.PI * 2;
          const spawnDistNm = 80 + Math.random() * 30;

          const lat = receiverLat + (spawnDistNm * Math.cos(angle)) / 60;
          const lon = receiverLon + (spawnDistNm * Math.sin(angle)) / (60 * Math.cos((receiverLat * Math.PI) / 180));

          // Aim roughly toward center area
          const headingToCenter = ((Math.atan2(receiverLon - lon, receiverLat - lat) * 180) / Math.PI + 360) % 360;

          const newAc: RawAircraft = {
            hex,
            flight: flightNum,
            alt_baro: Math.floor(Math.random() * 25 + 15) * 1000,
            gs: Math.floor(Math.random() * 120 + 380),
            track: Math.round(headingToCenter + (Math.random() * 40 - 20)),
            baro_rate: Math.random() > 0.7 ? (Math.random() > 0.5 ? 1200 : -1200) : 0,
            squawk: Math.random() > 0.95 ? '7700' : '1000',
            emergency: Math.random() > 0.98 ? 'general' : 'none',
            category: 'A3',
            lat,
            lon,
            messages: 15,
            seen: 0.1,
            rssi: -18.5
          };

          updated.push(newAc);
        }

        // Deduplication & Ingestion into Flight Records
        setFlightRecords(prevRecords => {
          const recordMap = new Map<string, FlightRecord>();
          prevRecords.forEach(r => recordMap.set(r.uid, { ...r }));

          const currentHexSet = new Set(updated.map(a => a.hex.toLowerCase()));

          // Process current live aircraft
          updated.forEach(ac => {
            const hex = ac.hex.toLowerCase();
            const callsign = (ac.flight || '').trim();
            const uid = generateFlightUid(hex, callsign, nowTs, dedupStrategy);

            const alt = typeof ac.alt_baro === 'number' ? ac.alt_baro : null;
            const gs = typeof ac.gs === 'number' ? ac.gs : null;

            if (recordMap.has(uid)) {
              // Duplicate signal update -> Update metrics of existing record
              setDuplicatesPrevented(d => d + 1);
              const existing = recordMap.get(uid)!;
              existing.lastSeen = nowIso;
              existing.lastSeenTs = nowTs;
              existing.durationSeconds = Math.max(0, nowTs - existing.firstSeenTs);
              existing.isActive = true;
              if (callsign && (!existing.callsign || existing.callsign === 'NOCALL' || existing.callsign === 'UNKNOWN')) {
                existing.callsign = callsign;
                // Newly acquired callsign -> Trigger ADSBDB route lookup
                if (!existing.adsbdbQueried) {
                  existing.adsbdbQueried = true;
                  fetchAdsbdbRoute(callsign).then(routeInfo => {
                    if (routeInfo) {
                      setFlightRecords(curr => curr.map(f => f.uid === uid ? {
                        ...f,
                        adsbdbRoute: routeInfo.route,
                        adsbdbOrigin: routeInfo.origin,
                        adsbdbDestination: routeInfo.destination,
                        adsbdbAirline: routeInfo.airline
                      } : f));
                    }
                  });
                }
              }
              if (ac.squawk) existing.squawk = ac.squawk;
              if (alt !== null) {
                existing.altLast = alt;
                if (existing.altMin === null || alt < existing.altMin) existing.altMin = alt;
                if (existing.altMax === null || alt > existing.altMax) existing.altMax = alt;
              }
              if (gs !== null) {
                existing.speedLast = gs;
                if (existing.speedMax === null || gs > existing.speedMax) existing.speedMax = gs;
              }
              if (ac.track) existing.trackLast = ac.track;
              if (ac.lat && ac.lon) {
                if (existing.latFirst === null) {
                  existing.latFirst = ac.lat;
                  existing.lonFirst = ac.lon;
                }
                existing.latLast = ac.lat;
                existing.lonLast = ac.lon;
              }
              if (ac.messages && ac.messages > existing.messagesCount) {
                existing.messagesCount = ac.messages;
              }
              if (ac.emergency && ac.emergency !== 'none') existing.emergency = ac.emergency;
              if (ac.rssi && (existing.rssiMax === null || ac.rssi > existing.rssiMax)) {
                existing.rssiMax = ac.rssi;
              }
              if (ac.r && !existing.registration) existing.registration = ac.r;
              if (ac.t && !existing.typeCode) existing.typeCode = ac.t;
              if (ac.desc && !existing.aircraftDesc) existing.aircraftDesc = ac.desc;
              if (typeof ac.mach === 'number' && (existing.machMax === null || ac.mach > existing.machMax)) {
                existing.machMax = ac.mach;
              }
              if (typeof ac.ws === 'number' && (existing.windSpeedMax === null || ac.ws > existing.windSpeedMax)) {
                existing.windSpeedMax = ac.ws;
              }
              if (typeof ac.oat === 'number' && existing.outsideAirTemp === null) {
                existing.outsideAirTemp = ac.oat;
              }
              if (typeof ac.r_dst === 'number' && (existing.minReceiverDist === null || ac.r_dst < existing.minReceiverDist)) {
                existing.minReceiverDist = ac.r_dst;
              }
            } else {
              // Brand new unique flight!
              const newRecord: FlightRecord = {
                uid,
                firstSeen: nowIso,
                lastSeen: nowIso,
                firstSeenTs: nowTs,
                lastSeenTs: nowTs,
                durationSeconds: 0,
                hex,
                callsign,
                registration: ac.r || '',
                typeCode: ac.t || '',
                aircraftDesc: ac.desc || '',
                squawk: ac.squawk || '7000',
                category: ac.category || 'A3',
                altMin: alt,
                altMax: alt,
                altLast: alt,
                speedMax: gs,
                speedLast: gs,
                machMax: typeof ac.mach === 'number' ? ac.mach : null,
                windSpeedMax: typeof ac.ws === 'number' ? ac.ws : null,
                outsideAirTemp: typeof ac.oat === 'number' ? ac.oat : null,
                trackLast: ac.track || 0,
                latFirst: ac.lat || null,
                lonFirst: ac.lon || null,
                latLast: ac.lat || null,
                lonLast: ac.lon || null,
                minReceiverDist: typeof ac.r_dst === 'number' ? ac.r_dst : null,
                messagesCount: ac.messages || 1,
                emergency: ac.emergency || 'none',
                rssiMax: ac.rssi || null,
                isActive: true,
                adsbdbQueried: Boolean(callsign && callsign !== 'NOCALL' && callsign !== 'UNKNOWN')
              };
              recordMap.set(uid, newRecord);

              if (callsign && callsign !== 'NOCALL' && callsign !== 'UNKNOWN') {
                fetchAdsbdbRoute(callsign).then(routeInfo => {
                  if (routeInfo) {
                    setFlightRecords(curr => curr.map(f => f.uid === uid ? {
                      ...f,
                      adsbdbRoute: routeInfo.route,
                      adsbdbOrigin: routeInfo.origin,
                      adsbdbDestination: routeInfo.destination,
                      adsbdbAirline: routeInfo.airline
                    } : f));
                  }
                });
              }
            }
          });

          // Mark flights that left the receiver range as completed (isActive = false)
          recordMap.forEach(record => {
            if (!currentHexSet.has(record.hex.toLowerCase())) {
              record.isActive = false;
            }
          });

          return Array.from(recordMap.values());
        });

        // Update JSON payload container
        setCurrentPayload({
          now: nowTs,
          messages: totalMessages,
          aircraft: updated
        });

        return updated;
      });
    }, 2000);

    return () => clearInterval(interval);
  }, [isSimulating, dedupStrategy, receiverLat, receiverLon, totalMessages]);

  const handleReset = () => {
    const nowTs = Math.floor(Date.now() / 1000);
    setReceiverLat(47.2602);
    setReceiverLon(11.3941);
    setCurrentAircraft(INITIAL_SAMPLE_AIRCRAFT);
    setFlightRecords(
      INITIAL_SAMPLE_AIRCRAFT.map(ac => {
        const hex = ac.hex;
        const callsign = (ac.flight || '').trim();
        const uid = generateFlightUid(hex, callsign, nowTs, dedupStrategy);
        const alt = typeof ac.alt_baro === 'number' ? ac.alt_baro : null;
        const gs = typeof ac.gs === 'number' ? ac.gs : null;
        return {
          uid,
          firstSeen: new Date().toISOString(),
          lastSeen: new Date().toISOString(),
          firstSeenTs: nowTs,
          lastSeenTs: nowTs,
          durationSeconds: 60,
          hex,
          callsign,
          registration: ac.r || '',
          typeCode: ac.t || '',
          aircraftDesc: ac.desc || '',
          squawk: ac.squawk || '1000',
          category: ac.category || 'A3',
          altMin: alt,
          altMax: alt,
          altLast: alt,
          speedMax: gs,
          speedLast: gs,
          machMax: typeof ac.mach === 'number' ? ac.mach : null,
          windSpeedMax: typeof ac.ws === 'number' ? ac.ws : null,
          outsideAirTemp: typeof ac.oat === 'number' ? ac.oat : null,
          trackLast: ac.track || 0,
          latFirst: ac.lat || null,
          lonFirst: ac.lon || null,
          latLast: ac.lat || null,
          lonLast: ac.lon || null,
          minReceiverDist: typeof ac.r_dst === 'number' ? ac.r_dst : null,
          messagesCount: ac.messages || 200,
          emergency: ac.emergency || 'none',
          rssiMax: ac.rssi || -16.5,
          isActive: true
        };
      })
    );
    setDuplicatesPrevented(0);
    setSelectedHex(null);
  };

  const handleManualAddAircraft = () => {
    const airlineKeys = Object.keys(AIRLINE_INFO);
    const key = airlineKeys[Math.floor(Math.random() * airlineKeys.length)];
    const callsign = `${key}${Math.floor(Math.random() * 899 + 100)}`;
    const hex = Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, '0');
    const angle = Math.random() * Math.PI * 2;
    const dist = 30 + Math.random() * 40;

    const newAc: RawAircraft = {
      hex,
      flight: callsign,
      alt_baro: Math.floor(Math.random() * 25 + 10) * 1000,
      gs: Math.floor(Math.random() * 100 + 400),
      track: Math.floor(Math.random() * 360),
      baro_rate: 0,
      squawk: '1000',
      category: 'A3',
      lat: receiverLat + (dist * Math.cos(angle)) / 60,
      lon: receiverLon + (dist * Math.sin(angle)) / (60 * Math.cos((receiverLat * Math.PI) / 180)),
      messages: 50,
      rssi: -11.2,
      emergency: 'none'
    };

    setCurrentAircraft(prev => [newAc, ...prev]);
    setSelectedHex(hex);
  };

  const handleCustomAircraftLoaded = (loaded: RawAircraft[], sourceName: string) => {
    setIsSimulating(false);
    setCurrentAircraft(loaded);

    // Auto center receiver around loaded aircraft if they have lat/lon
    const validPositions = loaded.filter(a => typeof a.lat === 'number' && typeof a.lon === 'number');
    if (validPositions.length > 0) {
      const avgLat = validPositions.reduce((acc, a) => acc + (a.lat || 0), 0) / validPositions.length;
      const avgLon = validPositions.reduce((acc, a) => acc + (a.lon || 0), 0) / validPositions.length;
      setReceiverLat(avgLat);
      setReceiverLon(avgLon);
    }

    const nowTs = Math.floor(Date.now() / 1000);
    const nowIso = new Date().toISOString();

    const records: FlightRecord[] = loaded.map(ac => {
      const hex = ac.hex;
      const callsign = (ac.flight || '').trim();
      const uid = generateFlightUid(hex, callsign, nowTs, dedupStrategy);
      const alt = typeof ac.alt_baro === 'number' ? ac.alt_baro : null;
      const gs = typeof ac.gs === 'number' ? ac.gs : null;

      return {
        uid,
        firstSeen: nowIso,
        lastSeen: nowIso,
        firstSeenTs: nowTs,
        lastSeenTs: nowTs,
        durationSeconds: 0,
        hex,
        callsign,
        registration: ac.r || '',
        typeCode: ac.t || '',
        aircraftDesc: ac.desc || '',
        squawk: ac.squawk || '',
        category: ac.category || '',
        altMin: alt,
        altMax: alt,
        altLast: alt,
        speedMax: gs,
        speedLast: gs,
        machMax: typeof ac.mach === 'number' ? ac.mach : null,
        windSpeedMax: typeof ac.ws === 'number' ? ac.ws : null,
        outsideAirTemp: typeof ac.oat === 'number' ? ac.oat : null,
        trackLast: ac.track || null,
        latFirst: ac.lat || null,
        lonFirst: ac.lon || null,
        latLast: ac.lat || null,
        lonLast: ac.lon || null,
        minReceiverDist: typeof ac.r_dst === 'number' ? ac.r_dst : null,
        messagesCount: ac.messages || 1,
        emergency: ac.emergency || 'none',
        rssiMax: ac.rssi || null,
        isActive: true
      };
    });

    setFlightRecords(records);
    setCurrentPayload({
      now: nowTs,
      messages: loaded.reduce((s, a) => s + (a.messages || 1), 0),
      aircraft: loaded
    });
    setActiveTab('radar');
  };

  const activeCount = currentAircraft.length;
  const totalUnique = flightRecords.length;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans selection:bg-indigo-500 selection:text-white">
      {/* Top Navigation */}
      <Navbar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        isSimulating={isSimulating}
        setIsSimulating={setIsSimulating}
        totalUnique={totalUnique}
        activeCount={activeCount}
        onDownloadCsv={() => downloadCsvFile(flightRecords)}
        onReset={handleReset}
      />

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Real-time KPI Stats Banner */}
        <StatsCards
          activeCount={activeCount}
          totalUniqueCount={totalUnique}
          duplicatesPrevented={duplicatesPrevented}
          totalMessages={totalMessages}
          records={flightRecords}
        />

        {/* Tab 1: Live Radar & Flight Table */}
        {activeTab === 'radar' && (
          <div className="space-y-6">
            <LiveRadar
              aircraft={currentAircraft}
              flightRecords={flightRecords}
              receiverLat={receiverLat}
              receiverLon={receiverLon}
              selectedHex={selectedHex}
              onSelectHex={setSelectedHex}
            />

            {/* Deduplication Strategy Ribbon & Manual Flight Trigger */}
            <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs shadow-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-slate-600 font-semibold flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-emerald-600" />
                  Deduplizierungs-Modus:
                </span>
                <select
                  value={dedupStrategy}
                  onChange={(e) => setDedupStrategy(e.target.value as DedupStrategy)}
                  className="bg-slate-50 border border-slate-200 text-slate-800 px-3 py-1.5 rounded-lg text-xs font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors"
                >
                  <option value="daily">Täglich 1x je Hex+Callsign (HEX_CALLSIGN_YYYYMMDD)</option>
                  <option value="strict_forever">Streng 1x für immer (HEX_CALLSIGN)</option>
                  <option value="hex_only">1x je ICAO-Hex pro Tag (HEX_YYYYMMDD)</option>
                </select>
              </div>

              <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                <button
                  onClick={handleManualAddAircraft}
                  className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 shadow-xs transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Flugzeug hinzufügen</span>
                </button>
              </div>
            </div>

            {/* Deduplicated Flights Table */}
            <FlightsTable
              records={flightRecords}
              selectedHex={selectedHex}
              onSelectHex={setSelectedHex}
            />
          </div>
        )}

        {/* Tab 2: Continuous CSV Viewer & Downloader */}
        {activeTab === 'csv' && (
          <CsvViewer
            records={flightRecords}
            onImportRecords={(imported) => {
              setFlightRecords(imported);
            }}
          />
        )}

        {/* Tab 3: Standalone Python Script & Setup Guide */}
        {activeTab === 'python' && (
          <PythonStudio />
        )}

        {/* Tab 4: Raw JSON Inspector & Upload */}
        {activeTab === 'json' && (
          <JsonInspector
            currentPayload={currentPayload}
            onLoadCustomAircraft={handleCustomAircraftLoaded}
          />
        )}
      </main>

      {/* Footer */}
      <footer className="h-10 bg-slate-900 flex items-center px-4 sm:px-8 text-xs text-slate-400 justify-between mt-auto">
        <div className="max-w-7xl w-full mx-auto flex items-center justify-between">
          <div className="flex items-center gap-6">
            <span>ADS-B Logger <span className="text-slate-200 font-mono">v2.4</span></span>
            <span className="hidden sm:inline">Engine: <span className="text-slate-200">Python 3.10+ / readsb / dump1090</span></span>
          </div>
          <div className="flex gap-4 items-center">
            <span className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse"></span>
              <span className="text-slate-200">Active Listener</span>
            </span>
            <div className="w-px h-3 bg-slate-700"></div>
            <span className="text-slate-400">Strict Duplicate Filter Active</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
