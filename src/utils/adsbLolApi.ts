import { RawAircraft, AircraftJsonPayload } from '../types';

export const INNSBRUCK_AIRPORT = {
  name: 'Flughafen Innsbruck (LOWI)',
  lat: 47.259665,
  lon: 11.3431121,
  elevationFt: 1906,
  defaultRadiusNm: 25
};

export const DEFAULT_ADSB_FI_URL = `https://opendata.adsb.fi/api/v3/lat/${INNSBRUCK_AIRPORT.lat}/lon/${INNSBRUCK_AIRPORT.lon}/dist/${INNSBRUCK_AIRPORT.defaultRadiusNm}`;
export const DEFAULT_ADSB_LOL_URL = DEFAULT_ADSB_FI_URL;
export const DEFAULT_SOURCE_URL = DEFAULT_ADSB_FI_URL;

/**
 * Erstellt eine adsb.fi API URL für gegebene Koordinaten und Distanz in NM
 */
export function buildAdsbFiUrl(
  lat: number = INNSBRUCK_AIRPORT.lat,
  lon: number = INNSBRUCK_AIRPORT.lon,
  distNm: number = INNSBRUCK_AIRPORT.defaultRadiusNm
): string {
  return `https://opendata.adsb.fi/api/v3/lat/${lat}/lon/${lon}/dist/${Math.round(distNm)}`;
}

export function buildAdsbLolUrl(
  lat: number = INNSBRUCK_AIRPORT.lat,
  lon: number = INNSBRUCK_AIRPORT.lon,
  radiusNm: number = INNSBRUCK_AIRPORT.defaultRadiusNm
): string {
  return buildAdsbFiUrl(lat, lon, radiusNm);
}

export interface AdsbFetchResult {
  success: boolean;
  aircraft: RawAircraft[];
  payload: AircraftJsonPayload | null;
  total: number;
  now: number;
  error?: string;
}

export type AdsbLolFetchResult = AdsbFetchResult;

/**
 * Ruft Live-Flugzeugdaten von der adsb.fi OpenData REST API ab
 * (standardmäßig für Airport Innsbruck LOWI im 25 NM Umkreis)
 */
export async function fetchLiveAdsbFi(
  url: string = DEFAULT_ADSB_FI_URL
): Promise<AdsbFetchResult> {
  try {
    const resp = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json'
      }
    });

    if (!resp.ok) {
      throw new Error(`HTTP ${resp.status}: ${resp.statusText}`);
    }

    const data = await resp.json();
    const aircraftList: RawAircraft[] = data.ac || data.aircraft || (Array.isArray(data) ? data : []);

    const nowTs = typeof data.now === 'number' ? (data.now > 1e11 ? data.now / 1000 : data.now) : Date.now() / 1000;

    return {
      success: true,
      aircraft: aircraftList,
      payload: {
        now: nowTs,
        ctime: data.ctime,
        total: data.total || aircraftList.length,
        messages: data.messages || (aircraftList.reduce((acc, a) => acc + (a.messages || 0), 0)),
        ac: aircraftList,
        aircraft: aircraftList
      },
      total: data.total || aircraftList.length,
      now: nowTs
    };
  } catch (err: any) {
    return {
      success: false,
      aircraft: [],
      payload: null,
      total: 0,
      now: Date.now() / 1000,
      error: err.message || 'Verbindung zu opendata.adsb.fi fehlgeschlagen'
    };
  }
}

export const fetchLiveAdsbLol = fetchLiveAdsbFi;

