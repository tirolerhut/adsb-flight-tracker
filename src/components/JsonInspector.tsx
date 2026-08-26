import React, { useState } from 'react';
import { RawAircraft, AircraftJsonPayload } from '../types';
import { Upload, FileCode, CheckCircle2, AlertCircle, Play, Sparkles, Copy, Check, Radio, Loader2 } from 'lucide-react';
import { INITIAL_SAMPLE_AIRCRAFT } from '../data/sampleAircraft';
import { DEFAULT_ADSB_FI_URL, fetchLiveAdsbFi } from '../utils/adsbLolApi';

interface JsonInspectorProps {
  currentPayload: AircraftJsonPayload | null;
  onLoadCustomAircraft: (aircraft: RawAircraft[], sourceName: string) => void;
}

export const JsonInspector: React.FC<JsonInspectorProps> = ({
  currentPayload,
  onLoadCustomAircraft
}) => {
  const [jsonText, setJsonText] = useState<string>('');
  const [parseError, setParseError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [isLoadingApi, setIsLoadingApi] = useState(false);

  const handleFetchLiveApi = async () => {
    setIsLoadingApi(true);
    setParseError(null);
    setSuccessMsg(null);
    try {
      const res = await fetchLiveAdsbFi(DEFAULT_ADSB_FI_URL);
      if (res.success && res.aircraft.length > 0) {
        const formatted = JSON.stringify(res.payload, null, 2);
        setJsonText(formatted);
        onLoadCustomAircraft(res.aircraft, 'opendata.adsb.fi (Innsbruck 25 NM)');
        setSuccessMsg(`Live-Daten von opendata.adsb.fi geladen: ${res.aircraft.length} aktive Flugzeuge über Innsbruck!`);
      } else if (res.success && res.aircraft.length === 0) {
        const formatted = JSON.stringify(res.payload, null, 2);
        setJsonText(formatted);
        setSuccessMsg('API-Abfrage erfolgreich, aktuell befinden sich 0 Flugzeuge im 25 NM Radius um LOWI.');
      } else {
        setParseError(res.error || 'Fehler beim Abrufen der adsb.fi Live-API.');
      }
    } catch (err: any) {
      setParseError(`Netzwerkfehler: ${err.message}`);
    } finally {
      setIsLoadingApi(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      if (text) {
        setJsonText(text);
        processJson(text, file.name);
      }
    };
    reader.readAsText(file);
  };

  const processJson = (rawText: string, sourceName = 'aircraft.json') => {
    setParseError(null);
    setSuccessMsg(null);

    try {
      const parsed = JSON.parse(rawText);
      const list: RawAircraft[] = parsed.aircraft || parsed.ac || (Array.isArray(parsed) ? parsed : []);

      if (!Array.isArray(list) || list.length === 0) {
        setParseError('Kein gültiges "aircraft" oder "ac" Array in der JSON-Datei gefunden.');
        return;
      }

      onLoadCustomAircraft(list, sourceName);
      setSuccessMsg(`Erfolgreich ${list.length} Flugzeuge aus '${sourceName}' geladen und analysiert!`);
    } catch (err: any) {
      setParseError(`JSON Parsing-Fehler: ${err.message}`);
    }
  };

  const handleLoadSample = () => {
    const sampleObj = {
      now: Date.now() / 1000,
      messages: 145820,
      aircraft: INITIAL_SAMPLE_AIRCRAFT
    };
    const formatted = JSON.stringify(sampleObj, null, 2);
    setJsonText(formatted);
    processJson(formatted, 'muster_aircraft.json');
  };

  const handleCopyCurrent = () => {
    if (!currentPayload) return;
    navigator.clipboard.writeText(JSON.stringify(currentPayload, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const acList = currentPayload?.aircraft || currentPayload?.ac || [];
  const withCoords = acList.filter(a => a.lat !== undefined && a.lon !== undefined).length;
  const withCallsign = acList.filter(a => a.flight && a.flight.trim().length > 0).length;
  const withSquawk = acList.filter(a => a.squawk && a.squawk.trim().length > 0).length;
  const withAlt = acList.filter(a => a.alt_baro !== undefined).length;

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 bg-indigo-50 text-indigo-600 rounded flex items-center justify-center">
              <FileCode className="w-3.5 h-3.5" />
            </div>
            <h2 className="text-base font-bold text-slate-900">ADS-B aircraft.json Inspektor &amp; Tester</h2>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Lade deine eigene aircraft.json von deinem ADS-B Empfänger (dump1090, readsb, PiAware) hoch oder füge JSON direkt ein.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={handleFetchLiveApi}
            disabled={isLoadingApi}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 transition-all shadow-2xs cursor-pointer disabled:opacity-50"
          >
            {isLoadingApi ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-600" />
            ) : (
              <Radio className="w-3.5 h-3.5 text-indigo-600" />
            )}
            <span>Live Innsbruck API (adsb.fi)</span>
          </button>

          <button
            onClick={handleLoadSample}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 transition-all shadow-2xs cursor-pointer"
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-500" />
            <span>Muster-JSON laden</span>
          </button>
        </div>
      </div>

      {/* Upload Box & Manual Input */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Upload & Editor */}
        <div className="lg:col-span-7 space-y-4">
          <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 space-y-4 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-800">Datei hochladen oder JSON einfügen</span>
              <label className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold cursor-pointer transition-all shadow-2xs">
                <Upload className="w-3.5 h-3.5" />
                <span>aircraft.json wählen</span>
                <input type="file" accept=".json" onChange={handleFileUpload} className="hidden" />
              </label>
            </div>

            <textarea
              rows={12}
              value={jsonText}
              onChange={(e) => setJsonText(e.target.value)}
              placeholder='{"now": 1724400000, "messages": 50000, "aircraft": [{"hex": "3c66a4", "flight": "DLH123", "alt_baro": 34000, "lat": 50.1, "lon": 8.6}]}'
              className="w-full p-3.5 bg-slate-950 border border-slate-800 rounded-xl text-xs font-mono text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 leading-relaxed shadow-inner"
            />

            {parseError && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                <span className="font-medium">{parseError}</span>
              </div>
            )}

            {successMsg && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span className="font-medium">{successMsg}</span>
              </div>
            )}

            <button
              onClick={() => processJson(jsonText)}
              disabled={!jsonText.trim()}
              className="w-full flex items-center justify-center gap-2 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white rounded-lg text-xs font-semibold transition-all shadow-2xs cursor-pointer"
            >
              <Play className="w-4 h-4" />
              <span>JSON analysieren &amp; in CSV-Logger einspeisen</span>
            </button>
          </div>
        </div>

        {/* Live Payload Stats & Structure Inspector */}
        <div className="lg:col-span-5 space-y-4">
          <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 space-y-4 shadow-xs">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">Aktuelle Payload-Struktur</h3>
              {currentPayload && (
                <button
                  onClick={handleCopyCurrent}
                  className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800 font-semibold cursor-pointer"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copied ? 'Kopiert' : 'JSON kopieren'}</span>
                </button>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2.5 text-xs">
              <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
                <span className="text-slate-500 block text-[11px] font-medium">Flugzeuge im Array</span>
                <span className="text-base font-bold text-slate-900 font-mono">{acList.length}</span>
              </div>
              <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
                <span className="text-slate-500 block text-[11px] font-medium">Mit GPS / Position</span>
                <span className="text-base font-bold text-emerald-600 font-mono">{withCoords}</span>
              </div>
              <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
                <span className="text-slate-500 block text-[11px] font-medium">Mit Rufzeichen (Flight)</span>
                <span className="text-base font-bold text-indigo-600 font-mono">{withCallsign}</span>
              </div>
              <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
                <span className="text-slate-500 block text-[11px] font-medium">Mit Squawk / Höhe</span>
                <span className="text-base font-bold text-slate-800 font-mono">{withSquawk} / {withAlt}</span>
              </div>
            </div>

            {/* Field specification overview */}
            <div className="space-y-2 text-xs">
              <span className="text-slate-700 font-bold block text-xs">Unterstützte ADS-B JSON Felder (readsb / dump1090):</span>
              <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 font-mono text-[11px] space-y-1 text-slate-300 shadow-inner max-h-56 overflow-y-auto">
                <p><span className="text-indigo-400 font-bold">hex</span>: 24-Bit ICAO Hex-Adresse (z.B. &quot;502d79&quot;)</p>
                <p><span className="text-indigo-400 font-bold">flight</span>: Rufzeichen / Flugnummer (z.B. &quot;SWR54M  &quot;)</p>
                <p><span className="text-indigo-400 font-bold">r / t / desc</span>: Registrierung, ICAO-Typ, Flugzeugmodell (z.B. &quot;YL-ABO&quot;, &quot;BCS3&quot;, &quot;AIRBUS A220-300&quot;)</p>
                <p><span className="text-indigo-400 font-bold">alt_baro / alt_geom</span>: Höhe in Fuß (z.B. 34000 / 35050)</p>
                <p><span className="text-indigo-400 font-bold">gs / ias / tas / mach</span>: Geschwindigkeit &amp; Mach (z.B. 418.4 kts / M0.776)</p>
                <p><span className="text-indigo-400 font-bold">wd / ws / oat</span>: Wind (239°/60kts) &amp; Außentemp (-42°C)</p>
                <p><span className="text-indigo-400 font-bold">track / heading</span>: Steuerkurs (z.B. 288.39°)</p>
                <p><span className="text-indigo-400 font-bold">squawk</span>: Transponder-Code (z.B. &quot;1000&quot;)</p>
                <p><span className="text-indigo-400 font-bold">lat / lon</span>: Geografische Koordinaten</p>
                <p><span className="text-indigo-400 font-bold">r_dst / r_dir</span>: Distanz (NM) &amp; Peilung (°) zur Empfänger-Antenne</p>
                <p><span className="text-indigo-400 font-bold">messages / rssi</span>: Nachrichtenanzahl &amp; Signalstärke (dBFS)</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
