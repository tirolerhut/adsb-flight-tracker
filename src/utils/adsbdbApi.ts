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
 * 1. Primary Endpoint for Origin/Destination/Route via Callsign:
 *    https://api.adsbdb.com/v0/callsign/{CALLSIGN_ICAO}
 * 2. Primary Endpoint for Aircraft Model/Type/Registration via Mode-S Hex:
 *    https://api.adsbdb.com/v0/aircraft/{MODE_S || REGISTRATION}
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

  const hasValidCallsign = Boolean(
    cleanCs &&
    cleanCs !== 'NOCALL' &&
    cleanCs !== 'UNKNOWN' &&
    cleanCs !== 'UNAVAILABLE' &&
    cleanCs.length >= 3
  );
  const ident = cleanHex || cleanReg;
  const cacheKey = `${ident}_${cleanCs}`;

  if (!ident && !hasValidCallsign) {
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

  let origin = '';
  let destination = '';
  let airline = '';
  let route = '';
  let reg = '';
  let typeCode = '';
  let aircraftDesc = '';

  try {
    // 1. Primäre Ermittlung von Start & Ziel über das Callsign: /v0/callsign/{CALLSIGN_ICAO}
    if (hasValidCallsign) {
      try {
        const csUrl = `https://api.adsbdb.com/v0/callsign/${encodeURIComponent(cleanCs)}`;
        const csRes = await fetch(csUrl);
        if (csRes.ok) {
          const csData: AdsbdbResponse = await csRes.json();
          const fr = csData?.response?.flightroute;
          if (fr) {
            origin = fr.origin?.iata_code || fr.origin?.icao_code || fr.origin?.municipality || '';
            destination = fr.destination?.iata_code || fr.destination?.icao_code || fr.destination?.municipality || '';
            airline = fr.airline?.name || '';
            if (origin && destination) {
              route = `${origin} ➔ ${destination}`;
              if (airline) route += ` (${airline})`;
            } else if (airline) {
              route = airline;
            }
          }
        }
      } catch (e) {
        console.debug('Callsign API fetch error:', e);
      }
    }

    // 2. Flugzeug-Stammdaten über Mode-S Hex / Registration: /v0/aircraft/{MODE_S}
    if (ident) {
      try {
        let acUrl = `https://api.adsbdb.com/v0/aircraft/${encodeURIComponent(ident)}`;
        if (hasValidCallsign && (!origin || !destination)) {
          acUrl += `?callsign=${encodeURIComponent(cleanCs)}`;
        }
        const acRes = await fetch(acUrl);
        if (acRes.ok) {
          const acData: AdsbdbResponse = await acRes.json();
          const ac = acData?.response?.aircraft;
          const fr = acData?.response?.flightroute;

          if (ac) {
            reg = ac.registration || '';
            typeCode = ac.icao_type || ac.icao_type_code || '';
            aircraftDesc = ac.type || '';
            if (!airline && ac.registered_owner) {
              airline = ac.registered_owner;
            }
          }

          // Falls Route noch nicht aus dem Callsign-Endpoint ermittelt wurde
          if ((!origin || !destination) && fr) {
            const origFallback = fr.origin?.iata_code || fr.origin?.icao_code || fr.origin?.municipality || '';
            const destFallback = fr.destination?.iata_code || fr.destination?.icao_code || fr.destination?.municipality || '';
            const airlineFallback = fr.airline?.name || '';
            if (origFallback && !origin) origin = origFallback;
            if (destFallback && !destination) destination = destFallback;
            if (airlineFallback && !airline) airline = airlineFallback;
            if (origin && destination && !route) {
              route = `${origin} ➔ ${destination}`;
              if (airline) route += ` (${airline})`;
            } else if (airline && !route) {
              route = airline;
            }
          }
        }
      } catch (e) {
        console.debug('Aircraft API fetch error:', e);
      }
    }

    const result = {
      route,
      origin,
      destination,
      airline,
      registration: reg || undefined,
      typeCode: typeCode || undefined,
      aircraftDesc: aircraftDesc || undefined
    };

    adsbdbCache.set(cacheKey, { ...result, timestamp: Date.now() });
    return result;
  } catch (err) {
    console.debug('ADSBDB API query general failure:', err);
    return null;
  }
}
