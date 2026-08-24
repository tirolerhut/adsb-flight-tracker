export interface RawAircraft {
  hex: string;
  type?: string;
  flight?: string;
  callsign?: string;
  r?: string; // registration (e.g. YL-ABO, D-AIUB)
  t?: string; // ICAO type code (e.g. BCS3, A320, B789)
  desc?: string; // Aircraft description (e.g. AIRBUS A220-300)
  alt_baro?: number | string;
  alt_geom?: number | string;
  gs?: number;
  ias?: number;
  tas?: number;
  mach?: number;
  wd?: number; // wind direction (deg)
  ws?: number; // wind speed (kts)
  oat?: number; // outside air temp (deg C)
  tat?: number; // total air temp (deg C)
  track?: number;
  track_rate?: number;
  roll?: number;
  mag_heading?: number;
  true_heading?: number;
  baro_rate?: number;
  geom_rate?: number;
  squawk?: string;
  emergency?: string;
  category?: string;
  nav_qnh?: number;
  nav_altitude_mcp?: number;
  nav_heading?: number;
  nav_modes?: string[];
  lat?: number;
  lon?: number;
  nic?: number;
  rc?: number;
  seen_pos?: number;
  r_dst?: number; // distance to receiver (NM)
  r_dir?: number; // bearing from receiver (deg)
  version?: number;
  nic_baro?: number;
  nac_p?: number;
  nac_v?: number;
  sil?: number;
  sil_type?: string;
  gva?: number;
  sda?: number;
  alert?: number;
  spi?: number;
  mlat?: string[];
  tisb?: string[];
  messages?: number;
  seen?: number;
  rssi?: number;
}

export interface AircraftJsonPayload {
  now?: number;
  messages?: number;
  aircraft?: RawAircraft[];
  ac?: RawAircraft[]; // readsb alternative key
  total?: number;
  ctime?: number;
}

export interface FlightRecord {
  uid: string;
  firstSeen: string; // ISO UTC
  lastSeen: string;  // ISO UTC
  firstSeenTs: number;
  lastSeenTs: number;
  durationSeconds: number;
  hex: string;
  callsign: string;
  registration: string;
  typeCode: string;
  aircraftDesc: string;
  squawk: string;
  category: string;
  altMin: number | null;
  altMax: number | null;
  altLast: number | null;
  speedMax: number | null;
  speedLast: number | null;
  machMax: number | null;
  windSpeedMax: number | null;
  outsideAirTemp: number | null;
  trackLast: number | null;
  latFirst: number | null;
  lonFirst: number | null;
  latLast: number | null;
  lonLast: number | null;
  minReceiverDist: number | null;
  messagesCount: number;
  emergency: string;
  rssiMax: number | null;
  isActive: boolean;
  // ADSBDB Enrichment fields
  adsbdbQueried?: boolean;
  adsbdbRoute?: string; // e.g. "VIE -> LHR (Austrian Airlines)"
  adsbdbOrigin?: string;
  adsbdbDestination?: string;
  adsbdbAirline?: string;
}

export type DedupStrategy = 'daily' | 'strict_forever' | 'hex_only' | 'session_gap';

export interface DedupSettings {
  strategy: DedupStrategy;
  inactivityTimeoutSec: number; // e.g. 300s (5 min) or 900s (15 min)
  immediateLog: boolean;
  minMessages: number;
  ignoreNoCallsign: boolean;
}

export interface ReceiverConfig {
  sourceType: 'simulator' | 'url' | 'upload' | 'sample';
  url: string;
  pollIntervalSec: number;
  receiverLat: number;
  receiverLon: number;
}
