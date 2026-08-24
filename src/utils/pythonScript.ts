export const PYTHON_SCRIPT_CODE = `#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
=============================================================================
ADS-B Flight Logger & Web Control Dashboard (Port 7001)
=============================================================================
Dieses Skript überwacht fortlaufend die Datei 'aircraft.json' eines ADS-B Empfängers
(z. B. dump1090, readsb, tar1090, PiAware, FlightAware, RTL-SDR oder LAN-URL).

Hauptfunktionen:
1. Kontinuierliches Polling von lokaler Datei (/run/readsb/aircraft.json) oder HTTP-URL.
2. Intelligente Flugerkennung & Deduplizierung:
   - Jeder Flug wird anhand von ICAO-Hex, Rufzeichen (Callsign) und Flug-Session/Datum
     genau EINMAL in die CSV-Datei geschrieben.
   - Bereits in der CSV existierende Flüge werden beim Programmstart eingelesen,
     sodass auch nach Neustarts keine Duplikate entstehen.
   - Wartet Folgeaktualisierungen ab, bis der Transponder die Flugnummer sendet.
   - Fragt erst nach Erhalt der Flugnummer die ADSBDB API für Route/Airline ab.
3. Integrierter Webserver auf Port 7001:
   - Übersichtlicher Status über Uptime, aktive Flugzeuge & geloggte Flüge
   - Live-Einstellung von Quelle (URL/Pfad) und Polling-Intervall ohne SSH
   - Neustart-Button zur Re-Initialisierung des Trackers
   - Live-Statusfenster mit Inhalt & Suche der CSV-Flugdaten
   - Direkter CSV-Download über das Webinterface
=============================================================================
"""

import os
import sys
import time
import json
import csv
import argparse
import signal
import datetime
import threading
import urllib.request
import urllib.error
import urllib.parse
from http.server import HTTPServer, BaseHTTPRequestHandler
from socketserver import ThreadingMixIn
from typing import Dict, Any, Optional, Set, List

# Standard CSV-Spalten
CSV_FIELDNAMES = [
    "flight_uid", "first_seen_utc", "last_seen_utc", "duration_seconds",
    "icao_hex", "callsign", "registration", "type_code", "aircraft_desc",
    "route", "airline", "origin", "destination",
    "squawk", "category", "altitude_min_ft", "altitude_max_ft", "altitude_last_ft",
    "speed_max_kts", "speed_last_kts", "mach_max", "wind_speed_max_kts", "oat_degc",
    "track_last_deg", "lat_first", "lon_first", "lat_last", "lon_last",
    "min_receiver_dst_nm", "messages_count", "emergency", "rssi_max"
]

class ActiveFlight:
    def __init__(self, hex_id: str, first_seen: float, raw_ac: Dict[str, Any]):
        self.hex = hex_id.strip().lower()
        self.first_seen_ts = first_seen
        self.last_seen_ts = first_seen
        self.callsign = (raw_ac.get("flight") or raw_ac.get("callsign") or "").strip()
        self.registration = (raw_ac.get("r") or raw_ac.get("reg") or raw_ac.get("registration") or "").strip()
        self.type_code = (raw_ac.get("t") or raw_ac.get("type") or raw_ac.get("type_code") or "").strip()
        self.aircraft_desc = (raw_ac.get("desc") or raw_ac.get("description") or "").strip()
        self.squawk = str(raw_ac.get("squawk") or "").strip()
        self.category = str(raw_ac.get("category") or "").strip()
        self.emergency = str(raw_ac.get("emergency") or "none").strip()
        
        # ADSBDB enrichments
        self.adsbdb_queried = False
        self.route = ""
        self.airline = ""
        self.origin = ""
        self.destination = ""
        
        alt = self._parse_num(raw_ac.get("alt_baro") or raw_ac.get("altitude"))
        self.alt_min = alt
        self.alt_max = alt
        self.alt_last = alt
        
        spd = self._parse_num(raw_ac.get("gs") or raw_ac.get("speed"))
        self.speed_max = spd
        self.speed_last = spd
        
        mach = self._parse_num(raw_ac.get("mach"))
        self.mach_max = mach
        
        ws = self._parse_num(raw_ac.get("ws"))
        self.wind_speed_max = ws
        
        self.outside_air_temp = self._parse_num(raw_ac.get("oat"))
        self.track_last = self._parse_num(raw_ac.get("track") or raw_ac.get("heading"))
        
        lat = self._parse_num(raw_ac.get("lat"))
        lon = self._parse_num(raw_ac.get("lon"))
        self.lat_first = lat
        self.lon_first = lon
        self.lat_last = lat
        self.lon_last = lon
        
        r_dst = self._parse_num(raw_ac.get("r_dst") or raw_ac.get("dst"))
        self.min_receiver_dst = r_dst
        
        self.messages_count = int(raw_ac.get("messages") or 1)
        self.rssi_max = self._parse_num(raw_ac.get("rssi"))

    def has_valid_callsign(self) -> bool:
        cs = (self.callsign or "").strip().upper()
        return bool(cs and cs not in ("NOCALL", "UNKNOWN", "UNAVAILABLE", "NONE"))

    def update(self, raw_ac: Dict[str, Any], current_time: float):
        self.last_seen_ts = current_time
        cs = (raw_ac.get("flight") or raw_ac.get("callsign") or "").strip()
        if cs and (not self.callsign or self.callsign in ("UNKNOWN", "NOCALL")):
            self.callsign = cs
            
        reg = (raw_ac.get("r") or raw_ac.get("reg") or raw_ac.get("registration") or "").strip()
        if reg and not self.registration:
            self.registration = reg
            
        t_code = (raw_ac.get("t") or raw_ac.get("type_code") or "").strip()
        if t_code and not self.type_code:
            self.type_code = t_code
            
        desc = (raw_ac.get("desc") or raw_ac.get("description") or "").strip()
        if desc and not self.aircraft_desc:
            self.aircraft_desc = desc

        sq = str(raw_ac.get("squawk") or "").strip()
        if sq: self.squawk = sq
        cat = str(raw_ac.get("category") or "").strip()
        if cat: self.category = cat
        emg = str(raw_ac.get("emergency") or "").strip()
        if emg and emg != "none": self.emergency = emg

        alt = self._parse_num(raw_ac.get("alt_baro") or raw_ac.get("altitude"))
        if alt is not None:
            self.alt_last = alt
            if self.alt_min is None or alt < self.alt_min: self.alt_min = alt
            if self.alt_max is None or alt > self.alt_max: self.alt_max = alt

        spd = self._parse_num(raw_ac.get("gs") or raw_ac.get("speed"))
        if spd is not None:
            self.speed_last = spd
            if self.speed_max is None or spd > self.speed_max: self.speed_max = spd

        mach = self._parse_num(raw_ac.get("mach"))
        if mach is not None:
            if self.mach_max is None or mach > self.mach_max: self.mach_max = mach

        ws = self._parse_num(raw_ac.get("ws"))
        if ws is not None:
            if self.wind_speed_max is None or ws > self.wind_speed_max: self.wind_speed_max = ws

        oat = self._parse_num(raw_ac.get("oat"))
        if oat is not None: self.outside_air_temp = oat

        trk = self._parse_num(raw_ac.get("track") or raw_ac.get("heading"))
        if trk is not None: self.track_last = trk

        lat = self._parse_num(raw_ac.get("lat"))
        lon = self._parse_num(raw_ac.get("lon"))
        if lat is not None and lon is not None:
            if self.lat_first is None:
                self.lat_first, self.lon_first = lat, lon
            self.lat_last, self.lon_last = lat, lon

        r_dst = self._parse_num(raw_ac.get("r_dst") or raw_ac.get("dst"))
        if r_dst is not None:
            if self.min_receiver_dst is None or r_dst < self.min_receiver_dst:
                self.min_receiver_dst = r_dst

        msg = int(raw_ac.get("messages") or 0)
        if msg > self.messages_count: self.messages_count = msg
        
        rssi = self._parse_num(raw_ac.get("rssi"))
        if rssi is not None and (self.rssi_max is None or rssi > self.rssi_max):
            self.rssi_max = rssi

    def query_adsbdb(self):
        """Fragt die ADSBDB API ab, sobald eine gültige Flugnummer vorliegt."""
        if self.adsbdb_queried or not self.has_valid_callsign():
            return
        
        self.adsbdb_queried = True
        try:
            url = f"https://api.adsbdb.com/v0/callsign/{urllib.parse.quote(self.callsign.upper())}"
            req = urllib.request.Request(url, headers={"User-Agent": "ADSB-Logger/1.0"})
            with urllib.request.urlopen(req, timeout=3.0) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                fr = data.get("response", {}).get("flightroute", {})
                if fr:
                    orig = fr.get("origin", {}).get("iata_code") or fr.get("origin", {}).get("icao_code") or fr.get("origin", {}).get("municipality") or ""
                    dest = fr.get("destination", {}).get("iata_code") or fr.get("destination", {}).get("icao_code") or fr.get("destination", {}).get("municipality") or ""
                    airline = fr.get("airline", {}).get("name") or ""
                    self.origin = orig
                    self.destination = dest
                    self.airline = airline
                    if orig and dest:
                        self.route = f"{orig} -> {dest}"
                        if airline: self.route += f" ({airline})"
                    elif airline:
                        self.route = airline
        except Exception:
            pass

    def get_flight_uid(self, mode: str = "daily") -> str:
        cs = self.callsign.strip().upper() if self.has_valid_callsign() else "NOCALL"
        date_str = datetime.datetime.fromtimestamp(self.first_seen_ts, tz=datetime.timezone.utc).strftime("%Y%m%d")
        if mode == "strict_forever":
            return f"{self.hex.upper()}_{cs}"
        elif mode == "hex_only":
            return f"{self.hex.upper()}_{date_str}"
        return f"{self.hex.upper()}_{cs}_{date_str}"

    def to_csv_dict(self, uid: str) -> Dict[str, Any]:
        dt_first = datetime.datetime.fromtimestamp(self.first_seen_ts, tz=datetime.timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
        dt_last = datetime.datetime.fromtimestamp(self.last_seen_ts, tz=datetime.timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
        return {
            "flight_uid": uid,
            "first_seen_utc": dt_first,
            "last_seen_utc": dt_last,
            "duration_seconds": max(0, int(self.last_seen_ts - self.first_seen_ts)),
            "icao_hex": self.hex.upper(),
            "callsign": self.callsign,
            "registration": self.registration,
            "type_code": self.type_code,
            "aircraft_desc": self.aircraft_desc,
            "route": self.route,
            "airline": self.airline,
            "origin": self.origin,
            "destination": self.destination,
            "squawk": self.squawk,
            "category": self.category,
            "altitude_min_ft": int(self.alt_min) if self.alt_min is not None else "",
            "altitude_max_ft": int(self.alt_max) if self.alt_max is not None else "",
            "altitude_last_ft": int(self.alt_last) if self.alt_last is not None else "",
            "speed_max_kts": round(self.speed_max, 1) if self.speed_max is not None else "",
            "speed_last_kts": round(self.speed_last, 1) if self.speed_last is not None else "",
            "mach_max": round(self.mach_max, 3) if self.mach_max is not None else "",
            "wind_speed_max_kts": round(self.wind_speed_max, 1) if self.wind_speed_max is not None else "",
            "oat_degc": round(self.outside_air_temp, 1) if self.outside_air_temp is not None else "",
            "track_last_deg": round(self.track_last, 1) if self.track_last is not None else "",
            "lat_first": round(self.lat_first, 5) if self.lat_first is not None else "",
            "lon_first": round(self.lon_first, 5) if self.lon_first is not None else "",
            "lat_last": round(self.lat_last, 5) if self.lat_last is not None else "",
            "lon_last": round(self.lon_last, 5) if self.lon_last is not None else "",
            "min_receiver_dst_nm": round(self.min_receiver_dst, 2) if self.min_receiver_dst is not None else "",
            "messages_count": self.messages_count,
            "emergency": self.emergency,
            "rssi_max": round(self.rssi_max, 1) if self.rssi_max is not None else "",
        }

    @staticmethod
    def _parse_num(val):
        if val is None or val == "" or val == "ground": return None
        try: return float(val)
        except (ValueError, TypeError): return None


class ThreadedHTTPServer(ThreadingMixIn, HTTPServer):
    daemon_threads = True


class WebDashboardHandler(BaseHTTPRequestHandler):
    logger_instance: Optional['ADSBLogger'] = None

    def log_message(self, format, *args):
        # Silence standard HTTP access logging to keep terminal clean
        pass

    def send_json(self, data: Any, status: int = 200):
        body = json.dumps(data, indent=2).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        logger = self.logger_instance

        if not logger:
            self.send_error(500, "Logger instance not initialized")
            return

        if path in ("/", "/index.html"):
            html = logger.generate_dashboard_html()
            body = html.encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return

        elif path == "/api/status":
            self.send_json(logger.get_status_dict())
            return

        elif path in ("/api/csv", "/download", "/flights.csv"):
            if not os.path.exists(logger.csv_path):
                self.send_error(404, "CSV file not found")
                return
            try:
                with open(logger.csv_path, "rb") as f:
                    content = f.read()
                filename = os.path.basename(logger.csv_path) or "flights.csv"
                self.send_response(200)
                self.send_header("Content-Type", "text/csv; charset=utf-8")
                self.send_header("Content-Disposition", f'attachment; filename="{filename}"')
                self.send_header("Content-Length", str(len(content)))
                self.end_headers()
                self.wfile.write(content)
            except Exception as e:
                self.send_error(500, f"Error reading CSV: {e}")
            return

        elif path == "/api/csv_preview":
            query = urllib.parse.parse_qs(parsed.query)
            limit = int(query.get("limit", [50])[0])
            rows = logger.get_csv_recent_rows(limit=limit)
            self.send_json({"rows": rows, "count": len(rows), "total": len(logger.logged_uids)})
            return

        else:
            self.send_error(404, "Not Found")

    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        logger = self.logger_instance

        if not logger:
            self.send_error(500, "Logger not initialized")
            return

        length = int(self.headers.get("Content-Length", 0))
        post_data = self.rfile.read(length).decode("utf-8") if length > 0 else ""

        if path == "/api/config":
            try:
                params = {}
                if "application/json" in self.headers.get("Content-Type", ""):
                    params = json.loads(post_data)
                else:
                    form_params = urllib.parse.parse_qs(post_data)
                    for k, v in form_params.items():
                        params[k] = v[0]

                new_source = params.get("source", "").strip()
                new_interval = params.get("interval")

                if new_source:
                    logger.source = new_source
                if new_interval is not None and str(new_interval).strip():
                    logger.interval = max(0.5, float(new_interval))

                print(f"[WEB CONFIG] Neue Quelle: {logger.source} | Neues Intervall: {logger.interval}s")
                self.send_json({"success": True, "message": "Konfiguration erfolgreich übernommen!", "config": {"source": logger.source, "interval": logger.interval}})
            except Exception as e:
                self.send_json({"success": False, "error": str(e)}, status=400)
            return

        elif path == "/api/restart":
            try:
                logger.restart_tracker()
                self.send_json({"success": True, "message": "Logger wurde erfolgreich zurückgesetzt & neu gestartet!"})
            except Exception as e:
                self.send_json({"success": False, "error": str(e)}, status=500)
            return

        else:
            self.send_error(404, "Not Found")


class ADSBLogger:
    def __init__(self, source: str, csv_path: str, interval: float, timeout_gap: float, dedup_mode: str, immediate: bool, query_adsbdb: bool = True, web_port: int = 7001):
        self.source = source
        self.csv_path = os.path.abspath(csv_path)
        self.interval = max(0.5, interval)
        self.timeout_gap = max(10.0, timeout_gap)
        self.dedup_mode = dedup_mode
        self.immediate = immediate
        self.enable_adsbdb = query_adsbdb
        self.web_port = web_port
        
        self.active_flights: Dict[str, ActiveFlight] = {}
        self.logged_uids: Set[str] = set()
        self.lock = threading.Lock()
        self.running = True
        self.start_time = time.time()
        self.last_cycle_time: Optional[float] = None
        self.last_error: Optional[str] = None
        self.total_cycles = 0
        
        self._init_csv_and_load_existing()
        self._start_web_server()

    def _init_csv_and_load_existing(self):
        parent_dir = os.path.dirname(self.csv_path)
        if parent_dir:
            os.makedirs(parent_dir, exist_ok=True)
            
        if os.path.isfile(self.csv_path) and os.path.getsize(self.csv_path) > 0:
            try:
                with open(self.csv_path, mode="r", encoding="utf-8", newline="") as f:
                    for row in csv.DictReader(f):
                        uid = row.get("flight_uid")
                        if uid: self.logged_uids.add(uid.strip())
                print(f"[INIT] {len(self.logged_uids)} Flüge aus bestehender CSV geladen (Deduplizierung aktiv).")
            except Exception as e:
                print(f"[WARNUNG] Konnte CSV nicht lesen: {e}")
        else:
            with open(self.csv_path, mode="w", encoding="utf-8", newline="") as f:
                csv.DictWriter(f, fieldnames=CSV_FIELDNAMES).writeheader()
            print(f"[INIT] Neue CSV angelegt mit Kopfzeile: {self.csv_path}")

    def _start_web_server(self):
        WebDashboardHandler.logger_instance = self
        try:
            server = ThreadedHTTPServer(("0.0.0.0", self.web_port), WebDashboardHandler)
            t = threading.Thread(target=server.serve_forever, daemon=True)
            t.start()
            print(f"[WEB SERVER] Dashboard erreichbar unter: http://0.0.0.0:{self.web_port}")
        except Exception as e:
            print(f"[WARNUNG] Konnte Webserver auf Port {self.web_port} nicht starten: {e}")

    def restart_tracker(self):
        with self.lock:
            self.active_flights.clear()
            self.logged_uids.clear()
            self._init_csv_and_load_existing()
            self.last_error = None
            print("[RESTART] Logger zurückgesetzt & neu gestartet.")

    def fetch_data(self) -> Optional[Dict[str, Any]]:
        src = self.source
        if src.startswith("http://") or src.startswith("https://"):
            req = urllib.request.Request(src, headers={"User-Agent": "ADSB-Logger/1.0"})
            try:
                with urllib.request.urlopen(req, timeout=4.0) as resp:
                    data = json.loads(resp.read().decode("utf-8"))
                    self.last_error = None
                    return data
            except Exception as e:
                self.last_error = f"HTTP-Fehler ({src}): {e}"
                return None
        else:
            if not os.path.exists(src):
                self.last_error = f"Lokale Datei nicht gefunden: {src}"
                return None
            try:
                with open(src, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    self.last_error = None
                    return data
            except Exception as e:
                self.last_error = f"Datei-Lesefehler ({src}): {e}"
                return None

    def process(self, data: Dict[str, Any]):
        now = time.time()
        self.last_cycle_time = now
        self.total_cycles += 1
        
        with self.lock:
            for ac in (data.get("aircraft") or data.get("ac") or []):
                hex_id = (ac.get("hex") or "").strip().lower()
                if not hex_id: continue
                
                if hex_id in self.active_flights:
                    flight = self.active_flights[hex_id]
                    flight.update(ac, now)
                    
                    if flight.has_valid_callsign() and not flight.adsbdb_queried and self.enable_adsbdb:
                        flight.query_adsbdb()
                else:
                    flight = ActiveFlight(hex_id, now, ac)
                    self.active_flights[hex_id] = flight
                    
                    if flight.has_valid_callsign() and self.enable_adsbdb:
                        flight.query_adsbdb()
                        
                    if self.immediate and flight.has_valid_callsign():
                        uid = flight.get_flight_uid(self.dedup_mode)
                        if uid not in self.logged_uids:
                            self._write(flight, uid)
                            self.logged_uids.add(uid)

            # Abgelaufene Flüge prüfen
            expired = [h for h, f in self.active_flights.items() if now - f.last_seen_ts > self.timeout_gap]
            for hex_id in expired:
                flight = self.active_flights.pop(hex_id)
                if not flight.has_valid_callsign():
                    continue
                    
                uid = flight.get_flight_uid(self.dedup_mode)
                if uid not in self.logged_uids:
                    self._write(flight, uid)
                    self.logged_uids.add(uid)
                    print(f"\\n[GELOGGT] {flight.hex.upper()} | {flight.callsign} | {flight.route or 'OK'} -> CSV [{uid}]")

    def _write(self, flight: ActiveFlight, uid: str):
        try:
            with open(self.csv_path, mode="a", encoding="utf-8", newline="") as f:
                writer = csv.DictWriter(f, fieldnames=CSV_FIELDNAMES)
                writer.writerow(flight.to_csv_dict(uid))
                f.flush()
        except Exception as e:
            self.last_error = f"CSV-Schreibfehler: {e}"
            print(f"[FEHLER] CSV-Schreibfehler: {e}", file=sys.stderr)

    def get_status_dict(self) -> Dict[str, Any]:
        with self.lock:
            uptime = int(time.time() - self.start_time)
            total_active = len(self.active_flights)
            active_with_cs = sum(1 for f in self.active_flights.values() if f.has_valid_callsign())
            csv_size = os.path.getsize(self.csv_path) if os.path.exists(self.csv_path) else 0
            
            return {
                "status": "running" if self.running else "stopped",
                "uptime_seconds": uptime,
                "uptime_formatted": str(datetime.timedelta(seconds=uptime)),
                "source": self.source,
                "interval": self.interval,
                "timeout_gap": self.timeout_gap,
                "csv_path": self.csv_path,
                "csv_size_bytes": csv_size,
                "active_aircraft_total": total_active,
                "active_with_callsign": active_with_cs,
                "logged_flights_count": len(self.logged_uids),
                "total_cycles": self.total_cycles,
                "last_cycle_time": datetime.datetime.fromtimestamp(self.last_cycle_time, tz=datetime.timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC") if self.last_cycle_time else None,
                "last_error": self.last_error,
                "web_port": self.web_port
            }

    def get_csv_recent_rows(self, limit: int = 50) -> List[Dict[str, str]]:
        if not os.path.exists(self.csv_path):
            return []
        try:
            with open(self.csv_path, mode="r", encoding="utf-8", newline="") as f:
                reader = list(csv.DictReader(f))
                return reader[-limit:][::-1]  # Neueste zuerst
        except Exception:
            return []

    def generate_dashboard_html(self) -> str:
        return f"""<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ADS-B Logger Web Control (Port {self.web_port})</title>
  <style>
    :root {{
      --bg: #0f172a;
      --card-bg: #1e293b;
      --card-border: #334155;
      --accent: #3b82f6;
      --accent-hover: #2563eb;
      --emerald: #10b981;
      --amber: #f59e0b;
      --red: #ef4444;
      --text: #f8fafc;
      --text-muted: #94a3b8;
    }}
    * {{ box-sizing: border-box; margin: 0; padding: 0; }}
    body {{
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      background-color: var(--bg);
      color: var(--text);
      padding: 20px;
      line-height: 1.5;
    }}
    .container {{ max-width: 1200px; margin: 0 auto; display: flex; flex-direction: column; gap: 20px; }}
    header {{
      display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px;
      border-bottom: 1px solid var(--card-border); padding-bottom: 16px;
    }}
    .badge {{
      display: inline-flex; align-items: center; gap: 6px; padding: 4px 10px; border-radius: 9999px;
      font-size: 12px; font-weight: 600; background: rgba(16, 185, 129, 0.15); color: var(--emerald);
      border: 1px solid rgba(16, 185, 129, 0.3);
    }}
    .pulse {{ width: 8px; height: 8px; border-radius: 50%; background: var(--emerald); animation: pulse 2s infinite; }}
    @keyframes pulse {{ 0%, 100% {{ opacity: 1; transform: scale(1); }} 50% {{ opacity: 0.4; transform: scale(0.8); }} }}
    
    .grid-stats {{
      display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 16px;
    }}
    .card {{
      background: var(--card-bg); border: 1px solid var(--card-border); border-radius: 12px; padding: 18px;
    }}
    .card-title {{ font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; color: var(--text-muted); margin-bottom: 6px; }}
    .card-value {{ font-size: 24px; font-weight: 700; color: var(--text); }}
    .card-sub {{ font-size: 11px; color: var(--text-muted); margin-top: 4px; }}
    
    .grid-main {{
      display: grid; grid-template-columns: 1fr 1fr; gap: 20px;
    }}
    @media (max-width: 900px) {{ .grid-main {{ grid-template-columns: 1fr; }} }}
    
    .form-group {{ margin-bottom: 14px; }}
    label {{ display: block; font-size: 13px; font-weight: 600; margin-bottom: 6px; color: #cbd5e1; }}
    input[type="text"], input[type="number"] {{
      width: 100%; padding: 10px 12px; background: #0b1120; border: 1px solid var(--card-border);
      border-radius: 8px; color: #fff; font-family: monospace; font-size: 13px;
    }}
    input:focus {{ outline: none; border-color: var(--accent); }}
    
    .btn-group {{ display: flex; gap: 10px; flex-wrap: wrap; margin-top: 16px; }}
    button, .btn {{
      display: inline-flex; align-items: center; gap: 6px; padding: 9px 16px; border-radius: 8px;
      font-size: 13px; font-weight: 600; cursor: pointer; border: none; text-decoration: none; transition: all 0.15s;
    }}
    .btn-primary {{ background: var(--accent); color: #fff; }}
    .btn-primary:hover {{ background: var(--accent-hover); }}
    .btn-secondary {{ background: #334155; color: #f1f5f9; }}
    .btn-secondary:hover {{ background: #475569; }}
    .btn-emerald {{ background: #059669; color: #fff; }}
    .btn-emerald:hover {{ background: #047857; }}
    .btn-danger {{ background: #dc2626; color: #fff; }}
    .btn-danger:hover {{ background: #b91c1c; }}
    
    .table-container {{
      overflow-x: auto; max-height: 480px; overflow-y: auto; border: 1px solid var(--card-border);
      border-radius: 8px; background: #0b1120; margin-top: 12px;
    }}
    table {{ width: 100%; border-collapse: collapse; font-size: 12px; text-align: left; }}
    th {{ background: #1e293b; padding: 10px 12px; position: sticky; top: 0; color: #94a3b8; font-weight: 600; border-bottom: 1px solid var(--card-border); }}
    td {{ padding: 8px 12px; border-bottom: 1px solid #1e293b; white-space: nowrap; }}
    tr:hover {{ background: rgba(255,255,255,0.03); }}
    
    .banner-alert {{
      padding: 10px 14px; border-radius: 8px; font-size: 13px; margin-bottom: 14px; display: none;
    }}
    .banner-success {{ background: rgba(16, 185, 129, 0.2); border: 1px solid var(--emerald); color: #a7f3d0; }}
    .banner-error {{ background: rgba(239, 68, 68, 0.2); border: 1px solid var(--red); color: #fecaca; }}
  </style>
</head>
<body>
  <div class="container">
    <header>
      <div>
        <h1 style="font-size: 20px; font-weight: 700;">✈️ ADS-B Flight Logger & Control</h1>
        <p style="font-size: 12px; color: var(--text-muted);">Webinterface auf Port {self.web_port} &bull; Raspberry Pi Daemon</p>
      </div>
      <div style="display: flex; gap: 10px; align-items: center;">
        <span class="badge" id="status-badge"><span class="pulse"></span> AKTIV & LOGGING</span>
        <a href="/api/csv" class="btn btn-emerald" id="csv-download-btn">📥 CSV herunterladen</a>
      </div>
    </header>

    <div id="alert-box" class="banner-alert"></div>

    <!-- Status Metriken -->
    <div class="grid-stats">
      <div class="card">
        <div class="card-title">Aktive Flugzeuge</div>
        <div class="card-value" id="stat-active">-</div>
        <div class="card-sub" id="stat-active-cs">Davon mit Flugnummer: -</div>
      </div>
      <div class="card">
        <div class="card-title">Geloggte Flüge (CSV)</div>
        <div class="card-value" id="stat-logged">-</div>
        <div class="card-sub" id="stat-csv-size">CSV-Größe: -</div>
      </div>
      <div class="card">
        <div class="card-title">Polling-Intervall & Uptime</div>
        <div class="card-value" id="stat-interval">-</div>
        <div class="card-sub" id="stat-uptime">Uptime: -</div>
      </div>
      <div class="card">
        <div class="card-title">Quelle (aircraft.json)</div>
        <div class="card-value" style="font-size: 13px; font-family: monospace; word-break: break-all;" id="stat-source">-</div>
        <div class="card-sub" id="stat-cycle">Letzter Abruf: -</div>
      </div>
    </div>

    <!-- Hauptbereich: Einstellungen & CSV Vorschau -->
    <div class="grid-main">
      <!-- Formular: Konfiguration & Neustart -->
      <div class="card">
        <h2 style="font-size: 15px; margin-bottom: 12px; font-weight: 600;">⚙️ Einstellungen & Steuerung</h2>
        <form id="config-form" onsubmit="saveConfig(event)">
          <div class="form-group">
            <label for="cfg-source">ADS-B Quelle (aircraft.json URL oder Pfad)</label>
            <input type="text" id="cfg-source" name="source" placeholder="http://192.168.1.200/data/aircraft.json oder /run/readsb/aircraft.json">
            <div style="display: flex; gap: 6px; margin-top: 6px;">
              <button type="button" class="btn btn-secondary" style="font-size: 11px; padding: 3px 8px;" onclick="setSource('/run/readsb/aircraft.json')">readsb (Lokal)</button>
              <button type="button" class="btn btn-secondary" style="font-size: 11px; padding: 3px 8px;" onclick="setSource('http://192.168.1.200/data/aircraft.json')">LAN-IP (.200)</button>
            </div>
          </div>
          <div class="form-group">
            <label for="cfg-interval">Abfrageintervall (Sekunden)</label>
            <input type="number" id="cfg-interval" name="interval" min="1" max="60" step="1">
          </div>
          <div class="btn-group">
            <button type="submit" class="btn btn-primary">💾 Speichern & Anwenden</button>
            <button type="button" class="btn btn-danger" onclick="restartTracker()">🔄 Logger neu starten</button>
          </div>
        </form>
      </div>

      <!-- Quick Info & Pfade -->
      <div class="card">
        <h2 style="font-size: 15px; margin-bottom: 12px; font-weight: 600;">📁 Dateipfade & Schnittstellen</h2>
        <div style="font-size: 12px; color: #cbd5e1; display: flex; flex-direction: column; gap: 8px;">
          <div><strong style="color: #94a3b8;">CSV-Datei:</strong> <code style="color: #67e8f9;" id="info-csv-path">-</code></div>
          <div><strong style="color: #94a3b8;">REST Status API:</strong> <a href="/api/status" target="_blank" style="color: #60a5fa;">GET /api/status</a></div>
          <div><strong style="color: #94a3b8;">CSV Download:</strong> <a href="/api/csv" style="color: #34d399;">GET /api/csv</a></div>
          <div><strong style="color: #94a3b8;">Vorschau API:</strong> <a href="/api/csv_preview" target="_blank" style="color: #60a5fa;">GET /api/csv_preview</a></div>
          <div id="info-error" style="color: #f87171; display: none;"></div>
        </div>
      </div>
    </div>

    <!-- CSV Live Statusfenster -->
    <div class="card">
      <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
        <div>
          <h2 style="font-size: 15px; font-weight: 600;">📋 Statusfenster: CSV-Einträge (Vorschau der neuesten Flüge)</h2>
          <p style="font-size: 11px; color: var(--text-muted);">Nur Flüge mit erfasster Flugnummer werden dauerhaft in die CSV geschrieben.</p>
        </div>
        <div style="display: flex; gap: 10px;">
          <input type="text" id="search-input" placeholder="Suche nach Hex, Rufzeichen, Route..." oninput="filterTable()" style="width: 260px; font-size: 12px; padding: 6px 10px;">
          <button class="btn btn-secondary" onclick="loadPreview()" style="font-size: 12px; padding: 6px 12px;">🔄 Aktualisieren</button>
        </div>
      </div>

      <div class="table-container">
        <table id="csv-table">
          <thead>
            <tr>
              <th>Zeit (UTC)</th>
              <th>Rufzeichen</th>
              <th>Hex</th>
              <th>Route</th>
              <th>Airline</th>
              <th>Typ / Reg</th>
              <th>Höhe (Min / Max)</th>
              <th>Max Speed</th>
              <th>Dauer</th>
              <th>RSSI</th>
            </tr>
          </thead>
          <tbody id="csv-tbody">
            <tr><td colspan="10" style="text-align: center; color: var(--text-muted); padding: 20px;">Lade CSV-Daten...</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>

  <script>
    let rawRows = [];

    function showAlert(msg, isSuccess = true) {{
      const el = document.getElementById('alert-box');
      el.textContent = msg;
      el.className = 'banner-alert ' + (isSuccess ? 'banner-success' : 'banner-error');
      el.style.display = 'block';
      setTimeout(() => {{ el.style.display = 'none'; }}, 5000);
    }}

    function setSource(val) {{
      document.getElementById('cfg-source').value = val;
    }}

    async function loadStatus() {{
      try {{
        const res = await fetch('/api/status');
        const data = await res.json();
        
        document.getElementById('stat-active').textContent = data.active_aircraft_total;
        document.getElementById('stat-active-cs').textContent = 'Davon mit Flugnummer: ' + data.active_with_callsign;
        document.getElementById('stat-logged').textContent = data.logged_flights_count;
        document.getElementById('stat-csv-size').textContent = 'CSV-Größe: ' + Math.round(data.csv_size_bytes / 1024) + ' KB';
        document.getElementById('stat-interval').textContent = data.interval + 's';
        document.getElementById('stat-uptime').textContent = 'Uptime: ' + data.uptime_formatted;
        document.getElementById('stat-source').textContent = data.source;
        document.getElementById('stat-cycle').textContent = 'Letzter Abruf: ' + (data.last_cycle_time || 'Noch keiner');
        document.getElementById('info-csv-path').textContent = data.csv_path;

        if (!document.getElementById('cfg-source').value) {{
          document.getElementById('cfg-source').value = data.source;
        }}
        if (!document.getElementById('cfg-interval').value) {{
          document.getElementById('cfg-interval').value = data.interval;
        }}

        const errEl = document.getElementById('info-error');
        if (data.last_error) {{
          errEl.textContent = '⚠️ Letzter Fehler: ' + data.last_error;
          errEl.style.display = 'block';
        }} else {{
          errEl.style.display = 'none';
        }}
      }} catch (e) {{
        console.error("Status fetch error", e);
      }}
    }}

    async function loadPreview() {{
      try {{
        const res = await fetch('/api/csv_preview?limit=100');
        const data = await res.json();
        rawRows = data.rows || [];
        renderTable(rawRows);
      }} catch (e) {{
        console.error("Preview fetch error", e);
      }}
    }}

    function renderTable(rows) {{
      const tbody = document.getElementById('csv-tbody');
      if (!rows || rows.length === 0) {{
        tbody.innerHTML = '<tr><td colspan="10" style="text-align: center; color: var(--text-muted); padding: 20px;">Noch keine Flüge geloggt.</td></tr>';
        return;
      }}
      tbody.innerHTML = rows.map(r => 
        '<tr>' +
          '<td style="color: #94a3b8; font-family: monospace;">' + (r.first_seen_utc || '') + '</td>' +
          '<td><strong style="color: #38bdf8;">' + (r.callsign || '<span style="color:#64748b">kein Callsign</span>') + '</strong></td>' +
          '<td><code style="color: #fbbf24;">' + (r.icao_hex || '') + '</code></td>' +
          '<td style="color: #a7f3d0;">' + (r.route || '-') + '</td>' +
          '<td>' + (r.airline || '-') + '</td>' +
          '<td>' + (r.type_code || '') + (r.registration ? ' (' + r.registration + ')' : '') + '</td>' +
          '<td>' + (r.altitude_min_ft || '-') + ' / ' + (r.altitude_max_ft || '-') + ' ft</td>' +
          '<td>' + (r.speed_max_kts ? r.speed_max_kts + ' kts' : '-') + '</td>' +
          '<td>' + (r.duration_seconds ? r.duration_seconds + 's' : '-') + '</td>' +
          '<td style="color: #94a3b8;">' + (r.rssi_max ? r.rssi_max + ' dB' : '-') + '</td>' +
        '</tr>'
      ).join('');
    }}

    function filterTable() {{
      const q = document.getElementById('search-input').value.toLowerCase().trim();
      if (!q) {{
        renderTable(rawRows);
        return;
      }}
      const filtered = rawRows.filter(r => 
        (r.callsign && r.callsign.toLowerCase().includes(q)) ||
        (r.icao_hex && r.icao_hex.toLowerCase().includes(q)) ||
        (r.route && r.route.toLowerCase().includes(q)) ||
        (r.airline && r.airline.toLowerCase().includes(q)) ||
        (r.registration && r.registration.toLowerCase().includes(q))
      );
      renderTable(filtered);
    }}

    async function saveConfig(e) {{
      e.preventDefault();
      const source = document.getElementById('cfg-source').value.trim();
      const interval = document.getElementById('cfg-interval').value;
      try {{
        const res = await fetch('/api/config', {{
          method: 'POST',
          headers: {{ 'Content-Type': 'application/json' }},
          body: JSON.stringify({{ source, interval }})
        }});
        const data = await res.json();
        if (data.success) {{
          showAlert(data.message, true);
          loadStatus();
        }} else {{
          showAlert(data.error || 'Fehler beim Speichern', false);
        }}
      }} catch (err) {{
        showAlert('Verbindungsfehler zum Server', false);
      }}
    }}

    async function restartTracker() {{
      if (!confirm('Möchtest du den Flug-Tracker wirklich zurücksetzen? (Laufende Überflüge werden neu synchronisiert)')) return;
      try {{
        const res = await fetch('/api/restart', {{ method: 'POST' }});
        const data = await res.json();
        showAlert(data.message || 'Neu gestartet', true);
        setTimeout(() => {{ loadStatus(); loadPreview(); }}, 1000);
      }} catch (e) {{
        showAlert('Fehler beim Neustart', false);
      }}
    }}

    // Initial load & Polling
    loadStatus();
    loadPreview();
    setInterval(loadStatus, 3000);
    setInterval(loadPreview, 10000);
  </script>
</body>
</html>
"""

    def run(self):
        def _sig_handler(sig, frame):
            self.running = False

        signal.signal(signal.SIGINT, _sig_handler)
        signal.signal(signal.SIGTERM, _sig_handler)

        print(f"ADS-B Logger gestartet.")
        print(f"Quelle: {self.source} | Intervall: {self.interval}s | CSV: {self.csv_path}")
        print(f"Web Dashboard aktiv unter: http://0.0.0.0:{self.web_port}")
        
        while self.running:
            try:
                data = self.fetch_data()
                if data:
                    self.process(data)
                    with_cs = sum(1 for f in self.active_flights.values() if f.has_valid_callsign())
                    sys.stdout.write(f"\\r[STATUS] Im Luftraum: {len(self.active_flights)} ({with_cs} mit Flugnr.) | Geloggt: {len(self.logged_uids)} | Web: :{self.web_port}")
                    sys.stdout.flush()
                time.sleep(self.interval)
            except KeyboardInterrupt:
                self.running = False
                break
            except Exception as e:
                print(f"\\n[FEHLER im Polling-Loop]: {e}", file=sys.stderr)
                time.sleep(self.interval)

        print("\\nBeende Logger... Speichere verbleibende Flüge mit gültiger Flugnummer.")
        with self.lock:
            for h, f in self.active_flights.items():
                if f.has_valid_callsign():
                    uid = f.get_flight_uid(self.dedup_mode)
                    if uid not in self.logged_uids:
                        self._write(f, uid)
                        self.logged_uids.add(uid)


def main():
    parser = argparse.ArgumentParser(description="ADS-B aircraft.json Logger & Web Dashboard")
    parser.add_argument("--source", "-s", default="/run/readsb/aircraft.json", help="Pfad oder HTTP-URL zur aircraft.json")
    parser.add_argument("--output", "-o", default="flights.csv", help="CSV-Ausgabedatei")
    parser.add_argument("--interval", "-i", type=float, default=5.0, help="Polling-Intervall in Sek")
    parser.add_argument("--timeout", "-t", type=float, default=300.0, help="Inaktivitäts-Timeout in Sek")
    parser.add_argument("--dedup-mode", "-d", choices=["daily", "strict_forever", "hex_only"], default="daily")
    parser.add_argument("--immediate", action="store_true", help="Sofort bei Erhalt der Flugnummer loggen")
    parser.add_argument("--port", "-p", type=int, default=7001, help="Port für das integrierte Webinterface (Standard: 7001)")
    parser.add_argument("--no-adsbdb", action="store_true", help="ADSBDB Online-Routenabfrage deaktivieren")
    args = parser.parse_args()

    logger = ADSBLogger(
        source=args.source,
        csv_path=args.output,
        interval=args.interval,
        timeout_gap=args.timeout,
        dedup_mode=args.dedup_mode,
        immediate=args.immediate,
        query_adsbdb=not args.no_adsbdb,
        web_port=args.port
    )
    logger.run()

if __name__ == "__main__":
    main()
`;

export function generateSystemdService(
  pythonScriptPath = '/opt/adsb-logger/adsb_logger.py',
  csvPath = '/home/pi/adsb-data/flights.csv',
  source = '/run/readsb/aircraft.json',
  runUser = 'pi',
  port = 7001
): string {
  const workDir = csvPath.substring(0, csvPath.lastIndexOf('/')) || '/home/pi';
  return `[Unit]
Description=ADS-B Flight Logger & Web Dashboard Daemon (Port ${port})
After=network.target readsb.service dump1090-fa.service dump1090.service
Wants=network.target

[Service]
Type=simple
User=${runUser}
Group=${runUser}
WorkingDirectory=${workDir}
ExecStart=/usr/bin/python3 ${pythonScriptPath} --source "${source}" --output "${csvPath}" --interval 5.0 --timeout 300.0 --dedup-mode daily --port ${port}
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal
Nice=10

[Install]
WantedBy=multi-user.target
`;
}

export function generateInstallerBashScript(options?: {
  installDir?: string;
  csvDir?: string;
  serviceName?: string;
  defaultSource?: string;
  defaultNetworkUrl?: string;
  defaultInterval?: number;
  webPort?: number;
  githubRepo?: string;
  githubBranch?: string;
}): string {
  const installDir = options?.installDir || '/opt/adsb-logger';
  const csvDir = options?.csvDir || '$TARGET_HOME/adsb-data';
  const serviceName = options?.serviceName || 'adsb-logger';
  const defaultSource = options?.defaultSource || '/run/readsb/aircraft.json';
  const defaultNetworkUrl = options?.defaultNetworkUrl || 'http://192.168.1.200/data/aircraft.json';
  const defaultInterval = options?.defaultInterval || 5;
  const webPort = options?.webPort || 7001;
  const githubRepo = options?.githubRepo || 'tirolerhut/adsb-flight-tracker';
  const githubBranch = options?.githubBranch || 'main';

  return `#!/bin/bash
# ==============================================================================
# ADS-B Flight Logger & Web Control Dashboard - Setup Wizard
# Repository: https://github.com/${githubRepo}
# ==============================================================================
# 1-Zeilen-Installation via GitHub (direkt im Pi Terminal ausführen):
# curl -sSL https://raw.githubusercontent.com/${githubRepo}/${githubBranch}/install_adsb_logger.sh | sudo bash
# ==============================================================================

set -e

# Farben für Terminalausgabe
GREEN='\\033[0;32m'
BLUE='\\033[0;34m'
YELLOW='\\033[1;33m'
RED='\\033[0;31m'
CYAN='\\033[0;36m'
BOLD='\\033[1m'
NC='\\033[0m' # No Color

echo -e "\${BLUE}====================================================\${NC}"
echo -e "\${BLUE}     ADS-B Logger & Web Dashboard - Setup Wizard     \${NC}"
echo -e "\${BLUE}====================================================\${NC}"

# Interaktive Eingabefunktion (funktioniert auch bei curl | sudo bash über /dev/tty)
prompt_user() {
  local prompt_text="$1"
  local default_val="$2"
  local var_name="$3"
  local input_result=""
  if [ -t 0 ]; then
    read -r -p "$prompt_text" input_result
  elif [ -e /dev/tty ]; then
    read -r -p "$prompt_text" input_result < /dev/tty
  else
    input_result=""
  fi
  if [ -z "$input_result" ]; then
    input_result="$default_val"
  fi
  eval "$var_name=\\"\\$input_result\\""
}

# 1. Root-Berechtigungsprüfung
if [ "$EUID" -ne 0 ]; then
  echo -e "\${RED}[FEHLER] Bitte führe dieses Skript mit sudo / root-Rechten aus:\${NC}"
  echo -e "         curl -sSL https://raw.githubusercontent.com/${githubRepo}/${githubBranch}/install_adsb_logger.sh | sudo bash"
  echo -e "   oder: sudo bash $0"
  exit 1
fi

# 2. Benutzer & Verzeichnisse ermitteln
if [ -n "$SUDO_USER" ] && [ "$SUDO_USER" != "root" ]; then
  TARGET_USER="$SUDO_USER"
else
  TARGET_USER=$(id -un 1000 2>/dev/null || echo "pi")
fi

TARGET_HOME=$(getent passwd "$TARGET_USER" | cut -d: -f6)
if [ -z "$TARGET_HOME" ]; then
  TARGET_HOME="/home/$TARGET_USER"
fi

INSTALL_DIR="${installDir}"
DATA_DIR="${csvDir}"
SERVICE_FILE="/etc/systemd/system/${serviceName}.service"
WEB_PORT="${webPort}"

echo -e "\${GREEN}[✓]\${NC} Ziel-Benutzer: \${YELLOW}$TARGET_USER\${NC} (Home: $TARGET_HOME)"
echo ""

# 3. Interaktive Abfrage: Installations-Variante (Lokal vs. Netzwerk)
echo -e "\${CYAN}Bitte wähle die Installationsvariante:\${NC}"
echo -e "  \${YELLOW}1)\${NC} Lokale ADS-B Quelle (readsb / dump1090-fa auf diesem Raspberry Pi)"
echo -e "  \${YELLOW}2)\${NC} Netzwerk- / HTTP-Quelle (z. B. anderer Empfänger im LAN / IP-Adresse)"
prompt_user "Auswahl [1 oder 2, Standard: 1]: " "1" VARIANT_CHOICE

TARGET_SOURCE=""
if [ "$VARIANT_CHOICE" = "2" ]; then
  echo ""
  echo -e "\${CYAN}[Variante 2: Netzwerk-Quelle]\${NC}"
  prompt_user "Netzwerkpfad / URL zu aircraft.json [Standard: ${defaultNetworkUrl}]: " "${defaultNetworkUrl}" TARGET_SOURCE
  echo -e "\${GREEN}[✓]\${NC} Verwende Netzwerk-Quelle: \${YELLOW}$TARGET_SOURCE\${NC}"
else
  echo ""
  echo -e "\${CYAN}[Variante 1: Lokale Erkennung]\${NC}"
  echo -e "\${BLUE}[Suche]\${NC} Scanne nach aktiver lokaler aircraft.json (readsb / dump1090-fa)..."
  SOURCE_CANDIDATES=(
    "/run/readsb/aircraft.json"
    "/run/dump1090-fa/aircraft.json"
    "/run/dump1090-mutability/aircraft.json"
    "/var/run/readsb/aircraft.json"
    "/var/run/dump1090-fa/aircraft.json"
    "/run/dump1090/aircraft.json"
  )

  for src in "\${SOURCE_CANDIDATES[@]}"; do
    if [ -f "$src" ]; then
      TARGET_SOURCE="$src"
      echo -e "\${GREEN}[✓]\${NC} Aktive Datei gefunden: \${YELLOW}$TARGET_SOURCE\${NC}"
      break
    fi
  done

  if [ -z "$TARGET_SOURCE" ]; then
    TARGET_SOURCE="${defaultSource}"
    echo -e "\${YELLOW}[!] Keine laufende aircraft.json im RAM gefunden.\${NC}"
    echo -e "    Verwende Standardpfad: \${YELLOW}$TARGET_SOURCE\${NC}"
  fi
fi

# 4. Interaktive Abfrage: Abfrageintervall
echo ""
prompt_user "Abfrageintervall in Sekunden [Standard: ${defaultInterval}]: " "${defaultInterval}" POLL_INTERVAL
echo -e "\${GREEN}[✓]\${NC} Abfrageintervall gesetzt auf: \${YELLOW}\${POLL_INTERVAL} Sekunden\${NC}"
echo ""

# 5. Python 3 Prüfung & Installation
echo -e "\${BLUE}[1/4]\${NC} Prüfe Python 3 Installation..."
if ! command -v python3 &>/dev/null; then
  echo -e "\${YELLOW}[!] Python 3 nicht gefunden. Installiere über apt...\${NC}"
  apt-get update -y
  apt-get install -y python3
else
  PY_VER=$(python3 --version 2>&1)
  echo -e "\${GREEN}[✓]\${NC} $PY_VER ist installiert."
fi

# 6. Installationsverzeichnisse & Skript anlegen
echo -e "\${BLUE}[2/4]\${NC} Erstelle Verzeichnisse & installiere Python-Skript..."
mkdir -p "$INSTALL_DIR"
mkdir -p "$DATA_DIR"

chown -R "$TARGET_USER:$TARGET_USER" "$DATA_DIR"

# Schreibe adsb_logger.py
cat << 'EOF_PYTHON' > "$INSTALL_DIR/adsb_logger.py"
${PYTHON_SCRIPT_CODE}
EOF_PYTHON

chmod +x "$INSTALL_DIR/adsb_logger.py"
chown -R "$TARGET_USER:$TARGET_USER" "$INSTALL_DIR"
echo -e "\${GREEN}[✓]\${NC} Skript installiert in: \${YELLOW}$INSTALL_DIR/adsb_logger.py\${NC}"

# 7. Systemd Hintergrunddienst einrichten
echo -e "\${BLUE}[3/4]\${NC} Richte systemd Service ein..."

cat << EOF_SERVICE > "$SERVICE_FILE"
[Unit]
Description=ADS-B Flight Logger & Web Control Dashboard (Port $WEB_PORT)
After=network.target readsb.service dump1090-fa.service dump1090.service
Wants=network.target

[Service]
Type=simple
User=$TARGET_USER
Group=$TARGET_USER
WorkingDirectory=$DATA_DIR
ExecStart=/usr/bin/python3 $INSTALL_DIR/adsb_logger.py --source "$TARGET_SOURCE" --output "$DATA_DIR/flights.csv" --interval $POLL_INTERVAL --timeout 300.0 --dedup-mode daily --port $WEB_PORT
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal
Nice=10

[Install]
WantedBy=multi-user.target
EOF_SERVICE

chmod 644 "$SERVICE_FILE"
echo -e "\${GREEN}[✓]\${NC} Service-Datei erstellt: \${YELLOW}$SERVICE_FILE\${NC}"

# 8. Daemon neu laden und Dienst starten
echo -e "\${BLUE}[4/4]\${NC} Aktiviere und starte Hintergrunddienst..."
systemctl daemon-reload
systemctl enable "${serviceName}.service"
systemctl restart "${serviceName}.service"

sleep 2

# IP-Adresse für Web-Zugriff ermitteln
PI_IP=$(hostname -I 2>/dev/null | awk '{print $1}')
if [ -z "$PI_IP" ]; then
  PI_IP="127.0.0.1"
fi

# Status prüfen
if systemctl is-active --quiet "${serviceName}.service"; then
  echo ""
  echo -e "\${GREEN}====================================================\${NC}"
  echo -e "\${GREEN}  ERFOLG! ADS-B Logger läuft jetzt im Hintergrund!  \${NC}"
  echo -e "\${GREEN}====================================================\${NC}"
  echo -e ""
  echo -e "🌐 \${BOLD}Web-Dashboard erreichbar unter:\${NC}"
  echo -e "   \${CYAN}http://$PI_IP:$WEB_PORT\${NC}"
  echo -e "   \${CYAN}http://localhost:$WEB_PORT\${NC}"
  echo -e ""
  echo -e "Features im Web-Dashboard:"
  echo -e "  • Live-Status & Uptime"
  echo -e "  • Quelle & Intervall direkt im Browser ändern"
  echo -e "  • Logger per Knopfdruck neu starten"
  echo -e "  • CSV-Inhalt im Live-Statusfenster durchsuchen"
  echo -e "  • CSV-Download mit einem Klick"
  echo -e ""
  echo -e "Quelle:             \${YELLOW}$TARGET_SOURCE\${NC}"
  echo -e "Intervall:          \${YELLOW}\${POLL_INTERVAL} Sekunden\${NC}"
  echo -e "CSV-Ausgabedatei:   \${YELLOW}$DATA_DIR/flights.csv\${NC}"
  echo -e "Web-Port:           \${YELLOW}$WEB_PORT\${NC}"
  echo -e ""
  echo -e "Service-Befehle:"
  echo -e "  Status überprüfen:  \${YELLOW}sudo systemctl status ${serviceName}.service\${NC}"
  echo -e "  Live-Logs ansehen:  \${YELLOW}sudo journalctl -u ${serviceName}.service -f\${NC}"
  echo -e "  Service stoppen:    \${YELLOW}sudo systemctl stop ${serviceName}.service\${NC}"
  echo -e "  Service neu starten:\${YELLOW}sudo systemctl restart ${serviceName}.service\${NC}"
  echo ""
else
  echo -e "\${RED}[WARNUNG] Der Dienst konnte nicht sofort gestartet werden.\${NC}"
  echo -e "Prüfe die Logs mit: \${YELLOW}sudo journalctl -u ${serviceName}.service -n 30\${NC}"
fi
`;
}
