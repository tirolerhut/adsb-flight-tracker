import { FlightRecord, DedupStrategy } from '../types';

export const CSV_COLUMNS = [
  { key: 'uid', label: 'flight_uid' },
  { key: 'firstSeen', label: 'first_seen_utc' },
  { key: 'lastSeen', label: 'last_seen_utc' },
  { key: 'durationSeconds', label: 'duration_seconds' },
  { key: 'hex', label: 'icao_hex' },
  { key: 'callsign', label: 'callsign' },
  { key: 'registration', label: 'registration' },
  { key: 'typeCode', label: 'type_code' },
  { key: 'aircraftDesc', label: 'aircraft_desc' },
  { key: 'adsbdbRoute', label: 'route' },
  { key: 'adsbdbAirline', label: 'airline' },
  { key: 'adsbdbOrigin', label: 'origin' },
  { key: 'adsbdbDestination', label: 'destination' },
  { key: 'squawk', label: 'squawk' },
  { key: 'category', label: 'category' },
  { key: 'altMin', label: 'altitude_min_ft' },
  { key: 'altMax', label: 'altitude_max_ft' },
  { key: 'altLast', label: 'altitude_last_ft' },
  { key: 'speedMax', label: 'speed_max_kts' },
  { key: 'speedLast', label: 'speed_last_kts' },
  { key: 'machMax', label: 'mach_max' },
  { key: 'windSpeedMax', label: 'wind_speed_max_kts' },
  { key: 'outsideAirTemp', label: 'oat_degc' },
  { key: 'trackLast', label: 'track_last_deg' },
  { key: 'latFirst', label: 'lat_first' },
  { key: 'lonFirst', label: 'lon_first' },
  { key: 'latLast', label: 'lat_last' },
  { key: 'lonLast', label: 'lon_last' },
  { key: 'minReceiverDist', label: 'min_receiver_dst_nm' },
  { key: 'messagesCount', label: 'messages_count' },
  { key: 'emergency', label: 'emergency' },
  { key: 'rssiMax', label: 'rssi_max' },
] as const;

export function generateFlightUid(hex: string, callsign: string, firstSeenTs: number, strategy: DedupStrategy): string {
  const cleanHex = hex.trim().toUpperCase();
  const cleanCallsign = (callsign || 'NOCALL').trim().toUpperCase();
  const d = new Date(firstSeenTs * 1000);
  const dateStr = d.toISOString().slice(0, 10).replace(/-/g, ''); // YYYYMMDD

  switch (strategy) {
    case 'strict_forever':
      return `${cleanHex}_${cleanCallsign}`;
    case 'hex_only':
      return `${cleanHex}_${dateStr}`;
    case 'session_gap':
      return `${cleanHex}_${cleanCallsign}_${firstSeenTs}`;
    case 'daily':
    default:
      return `${cleanHex}_${cleanCallsign}_${dateStr}`;
  }
}

export function formatFlightToCsvRow(record: FlightRecord): string {
  const values = [
    record.uid,
    record.firstSeen,
    record.lastSeen,
    record.durationSeconds,
    record.hex.toUpperCase(),
    record.callsign || '',
    record.registration || '',
    record.typeCode || '',
    record.aircraftDesc || '',
    record.adsbdbRoute || '',
    record.adsbdbAirline || '',
    record.adsbdbOrigin || '',
    record.adsbdbDestination || '',
    record.squawk || '',
    record.category || '',
    record.altMin !== null ? record.altMin : '',
    record.altMax !== null ? record.altMax : '',
    record.altLast !== null ? record.altLast : '',
    record.speedMax !== null ? Math.round(record.speedMax * 10) / 10 : '',
    record.speedLast !== null ? Math.round(record.speedLast * 10) / 10 : '',
    record.machMax !== null ? record.machMax.toFixed(3) : '',
    record.windSpeedMax !== null ? Math.round(record.windSpeedMax) : '',
    record.outsideAirTemp !== null ? Math.round(record.outsideAirTemp) : '',
    record.trackLast !== null ? Math.round(record.trackLast * 10) / 10 : '',
    record.latFirst !== null ? record.latFirst.toFixed(5) : '',
    record.lonFirst !== null ? record.lonFirst.toFixed(5) : '',
    record.latLast !== null ? record.latLast.toFixed(5) : '',
    record.lonLast !== null ? record.lonLast.toFixed(5) : '',
    record.minReceiverDist !== null ? record.minReceiverDist.toFixed(2) : '',
    record.messagesCount,
    record.emergency || 'none',
    record.rssiMax !== null ? record.rssiMax.toFixed(1) : '',
  ];

  return values.map(val => {
    const str = String(val);
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  }).join(',');
}

export function isValidFlightForCsv(record: FlightRecord, requireCallsign = true): boolean {
  if (!requireCallsign) return true;
  const cs = (record.callsign || '').trim().toUpperCase();
  return cs.length > 0 && cs !== 'NOCALL' && cs !== 'UNKNOWN' && cs !== 'UNAVAILABLE';
}

export function generateFullCsv(records: FlightRecord[], requireCallsign = true): string {
  const header = CSV_COLUMNS.map(c => c.label).join(',');
  const validRecords = requireCallsign ? records.filter(r => isValidFlightForCsv(r, true)) : records;
  const rows = validRecords.map(r => formatFlightToCsvRow(r));
  return [header, ...rows].join('\n');
}

export function downloadCsvFile(records: FlightRecord[], filename = 'flights_log.csv', requireCallsign = true) {
  const csvContent = generateFullCsv(records, requireCallsign);
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function parseCsvToFlightRecords(csvText: string): FlightRecord[] {
  const lines = csvText.trim().split(/\r?\n/);
  if (lines.length <= 1) return [];

  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
  const records: FlightRecord[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // Simple CSV parser supporting quotes
    const cols: string[] = [];
    let inQuotes = false;
    let currentCol = '';

    for (let charIdx = 0; charIdx < line.length; charIdx++) {
      const char = line[charIdx];
      if (char === '"' && (charIdx === 0 || line[charIdx - 1] !== '\\')) {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        cols.push(currentCol.trim().replace(/^"|"$/g, '').replace(/""/g, '"'));
        currentCol = '';
      } else {
        currentCol += char;
      }
    }
    cols.push(currentCol.trim().replace(/^"|"$/g, '').replace(/""/g, '"'));

    const rowMap: Record<string, string> = {};
    headers.forEach((h, idx) => {
      rowMap[h] = cols[idx] || '';
    });

    const uid = rowMap['flight_uid'] || `IMPORTED_${i}`;
    const firstSeen = rowMap['first_seen_utc'] || new Date().toISOString();
    const lastSeen = rowMap['last_seen_utc'] || firstSeen;

    records.push({
      uid,
      firstSeen,
      lastSeen,
      firstSeenTs: Math.floor(new Date(firstSeen).getTime() / 1000) || Date.now() / 1000,
      lastSeenTs: Math.floor(new Date(lastSeen).getTime() / 1000) || Date.now() / 1000,
      durationSeconds: parseInt(rowMap['duration_seconds'] || '0', 10) || 0,
      hex: rowMap['icao_hex'] || '',
      callsign: rowMap['callsign'] || '',
      registration: rowMap['registration'] || '',
      typeCode: rowMap['type_code'] || '',
      aircraftDesc: rowMap['aircraft_desc'] || '',
      adsbdbRoute: rowMap['route'] || undefined,
      adsbdbAirline: rowMap['airline'] || undefined,
      adsbdbOrigin: rowMap['origin'] || undefined,
      adsbdbDestination: rowMap['destination'] || undefined,
      squawk: rowMap['squawk'] || '',
      category: rowMap['category'] || '',
      altMin: rowMap['altitude_min_ft'] ? parseFloat(rowMap['altitude_min_ft']) : null,
      altMax: rowMap['altitude_max_ft'] ? parseFloat(rowMap['altitude_max_ft']) : null,
      altLast: rowMap['altitude_last_ft'] ? parseFloat(rowMap['altitude_last_ft']) : null,
      speedMax: rowMap['speed_max_kts'] ? parseFloat(rowMap['speed_max_kts']) : null,
      speedLast: rowMap['speed_last_kts'] ? parseFloat(rowMap['speed_last_kts']) : null,
      machMax: rowMap['mach_max'] ? parseFloat(rowMap['mach_max']) : null,
      windSpeedMax: rowMap['wind_speed_max_kts'] ? parseFloat(rowMap['wind_speed_max_kts']) : null,
      outsideAirTemp: rowMap['oat_degc'] ? parseFloat(rowMap['oat_degc']) : null,
      trackLast: rowMap['track_last_deg'] ? parseFloat(rowMap['track_last_deg']) : null,
      latFirst: rowMap['lat_first'] ? parseFloat(rowMap['lat_first']) : null,
      lonFirst: rowMap['lon_first'] ? parseFloat(rowMap['lon_first']) : null,
      latLast: rowMap['lat_last'] ? parseFloat(rowMap['lat_last']) : null,
      lonLast: rowMap['lon_last'] ? parseFloat(rowMap['lon_last']) : null,
      minReceiverDist: rowMap['min_receiver_dst_nm'] ? parseFloat(rowMap['min_receiver_dst_nm']) : null,
      messagesCount: parseInt(rowMap['messages_count'] || '1', 10) || 1,
      emergency: rowMap['emergency'] || 'none',
      rssiMax: rowMap['rssi_max'] ? parseFloat(rowMap['rssi_max']) : null,
      isActive: false,
    });
  }

  return records;
}
