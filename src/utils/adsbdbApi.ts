export interface AdsbdbCallsignResponse {
  response?: {
    flightroute?: {
      callsign?: string;
      callsign_icao?: string;
      callsign_iata?: string;
      airline?: {
        name?: string;
        icao?: string;
        iata?: string;
        country?: string;
      };
      origin?: {
        name?: string;
        icao_code?: string;
        iata_code?: string;
        municipality?: string;
        country_name?: string;
      };
      destination?: {
        name?: string;
        icao_code?: string;
        iata_code?: string;
        municipality?: string;
        country_name?: string;
      };
    };
  };
}

export interface AdsbdbAircraftResponse {
  response?: {
    aircraft?: {
      icao_type_code?: string;
      type?: string;
      manufacturer?: string;
      registration?: string;
      registered_owner?: string;
      registered_owner_country_name?: string;
    };
  };
}

// In-memory cache to prevent spamming adsbdb API
const adsbdbCache = new Map<string, { route?: string; origin?: string; destination?: string; airline?: string; timestamp: number }>();

/**
 * Fetch flight route / aircraft data from ADSBDB only if callsign is available.
 * Endpoint: https://api.adsbdb.com/v0/callsign/{CALLSIGN}
 */
export async function fetchAdsbdbRoute(callsign: string): Promise<{
  route: string;
  origin: string;
  destination: string;
  airline: string;
} | null> {
  const clean = (callsign || '').trim().toUpperCase();
  if (!clean || clean === 'NOCALL' || clean === 'UNKNOWN' || clean.length < 3) {
    return null;
  }

  if (adsbdbCache.has(clean)) {
    const cached = adsbdbCache.get(clean)!;
    return {
      route: cached.route || '',
      origin: cached.origin || '',
      destination: cached.destination || '',
      airline: cached.airline || ''
    };
  }

  try {
    const res = await fetch(`https://api.adsbdb.com/v0/callsign/${encodeURIComponent(clean)}`);
    if (!res.ok) {
      return null;
    }
    const data: AdsbdbCallsignResponse = await res.json();
    const flightroute = data?.response?.flightroute;
    if (!flightroute) return null;

    const orig = flightroute.origin?.iata_code || flightroute.origin?.icao_code || flightroute.origin?.municipality || '';
    const dest = flightroute.destination?.iata_code || flightroute.destination?.icao_code || flightroute.destination?.municipality || '';
    const airline = flightroute.airline?.name || '';

    let routeDesc = '';
    if (orig && dest) {
      routeDesc = `${orig} ➔ ${dest}`;
      if (airline) routeDesc += ` (${airline})`;
    } else if (airline) {
      routeDesc = airline;
    }

    const result = {
      route: routeDesc,
      origin: orig,
      destination: dest,
      airline: airline
    };

    adsbdbCache.set(clean, { ...result, timestamp: Date.now() });
    return result;
  } catch (err) {
    console.debug('ADSBDB API query skipped/failed:', err);
    return null;
  }
}
