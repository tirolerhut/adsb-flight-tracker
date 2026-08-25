export interface AdsbdbResponse {
  response?: {
    aircraft?: {
      mode_s?: string;
      icao_type_code?: string;
      icao_type?: string;
      type?: string;
      manufacturer?: string;
      registration?: string;
      registered_owner?: string;
      registered_owner_country_name?: string;
    };
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

// In-memory cache to prevent spamming adsbdb API
const adsbdbCache = new Map<string, {
  route?: string;
  origin?: string;
  destination?: string;
  airline?: string;
  registration?: string;
  typeCode?: string;
  aircraftDesc?: string;
  timestamp: number;
}>();

/**
 * Fetch flight route, origin, destination and aircraft data from ADSBDB.
 * Primary Endpoint: https://api.adsbdb.com/v0/aircraft/{MODE_S || REGISTRATION}?callsign={CALLSIGN}
 * Fallback Endpoint: https://api.adsbdb.com/v0/callsign/{CALLSIGN}
 */
export async function fetchAdsbdbRoute(
  callsign?: string,
  hex?: string,
  registration?: string
): Promise<{
  route: string;
  origin: string;
  destination: string;
  airline: string;
  registration?: string;
  typeCode?: string;
  aircraftDesc?: string;
} | null> {
  const cleanCs = (callsign || '').trim().toUpperCase();
  const cleanHex = (hex || '').trim().toUpperCase();
  const cleanReg = (registration || '').trim().toUpperCase();

  const ident = cleanHex || cleanReg;
  const cacheKey = `${ident}_${cleanCs}`;

  if (!ident && (!cleanCs || cleanCs === 'NOCALL' || cleanCs === 'UNKNOWN')) {
    return null;
  }

  if (adsbdbCache.has(cacheKey)) {
    const cached = adsbdbCache.get(cacheKey)!;
    return {
      route: cached.route || '',
      origin: cached.origin || '',
      destination: cached.destination || '',
      airline: cached.airline || '',
      registration: cached.registration,
      typeCode: cached.typeCode,
      aircraftDesc: cached.aircraftDesc
    };
  }

  try {
    let url = '';
    if (ident) {
      url = `https://api.adsbdb.com/v0/aircraft/${encodeURIComponent(ident)}`;
      if (cleanCs && cleanCs !== 'NOCALL' && cleanCs !== 'UNKNOWN') {
        url += `?callsign=${encodeURIComponent(cleanCs)}`;
      }
    } else {
      url = `https://api.adsbdb.com/v0/callsign/${encodeURIComponent(cleanCs)}`;
    }

    const res = await fetch(url);
    if (!res.ok) {
      // If aircraft query failed but we have callsign, try fallback to /callsign
      if (ident && cleanCs && cleanCs.length >= 3) {
        const fbRes = await fetch(`https://api.adsbdb.com/v0/callsign/${encodeURIComponent(cleanCs)}`);
        if (fbRes.ok) {
          const fbData: AdsbdbResponse = await fbRes.json();
          const fr = fbData?.response?.flightroute;
          if (fr) {
            const orig = fr.origin?.iata_code || fr.origin?.icao_code || fr.origin?.municipality || '';
            const dest = fr.destination?.iata_code || fr.destination?.icao_code || fr.destination?.municipality || '';
            const airline = fr.airline?.name || '';
            let routeDesc = '';
            if (orig && dest) {
              routeDesc = `${orig} ➔ ${dest}`;
              if (airline) routeDesc += ` (${airline})`;
            } else if (airline) {
              routeDesc = airline;
            }
            const fbResult = {
              route: routeDesc,
              origin: orig,
              destination: dest,
              airline
            };
            adsbdbCache.set(cacheKey, { ...fbResult, timestamp: Date.now() });
            return fbResult;
          }
        }
      }
      return null;
    }

    const data: AdsbdbResponse = await res.json();
    const resp = data?.response;
    if (!resp) return null;

    const flightroute = resp.flightroute;
    const aircraft = resp.aircraft;

    const orig = flightroute?.origin?.iata_code || flightroute?.origin?.icao_code || flightroute?.origin?.municipality || '';
    const dest = flightroute?.destination?.iata_code || flightroute?.destination?.icao_code || flightroute?.destination?.municipality || '';
    const airline = flightroute?.airline?.name || aircraft?.registered_owner || '';

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
      airline: airline,
      registration: aircraft?.registration,
      typeCode: aircraft?.icao_type || aircraft?.icao_type_code,
      aircraftDesc: aircraft?.type
    };

    adsbdbCache.set(cacheKey, { ...result, timestamp: Date.now() });
    return result;
  } catch (err) {
    console.debug('ADSBDB API query skipped/failed:', err);
    return null;
  }
}
