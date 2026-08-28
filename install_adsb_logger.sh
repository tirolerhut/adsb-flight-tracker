#!/bin/bash
# ==============================================================================
# ADS-B Flight Logger & Web Control Dashboard - Setup Wizard
# Repository: https://github.com/tirolerhut/adsb-flight-tracker
# ==============================================================================
# 1-Zeilen-Installation via GitHub (direkt im Pi Terminal ausführen):
# curl -sSL https://raw.githubusercontent.com/tirolerhut/adsb-flight-tracker/main/install_adsb_logger.sh | sudo bash
# ==============================================================================

set -e

# Farben für Terminalausgabe
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m' # No Color

echo -e "${BLUE}====================================================${NC}"
echo -e "${BLUE}     ADS-B Logger & Web Dashboard - Setup Wizard     ${NC}"
echo -e "${BLUE}====================================================${NC}"

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
  eval "$var_name=\"\$input_result\""
}

# 1. Root-Berechtigungsprüfung
if [ "$EUID" -ne 0 ]; then
  echo -e "${RED}[FEHLER] Bitte führe dieses Skript mit sudo / root-Rechten aus:${NC}"
  echo -e "         curl -sSL https://raw.githubusercontent.com/tirolerhut/adsb-flight-tracker/main/install_adsb_logger.sh | sudo bash"
  echo -e "   oder: sudo bash $0"
  exit 1
fi

# 2. Benutzer, Gruppe & Verzeichnisse ermitteln
TARGET_USER=""
if [ -n "$SUDO_USER" ] && id "$SUDO_USER" &>/dev/null; then
  TARGET_USER="$SUDO_USER"
elif id -un 1000 &>/dev/null; then
  TARGET_USER=$(id -un 1000 2>/dev/null)
elif id "pi" &>/dev/null; then
  TARGET_USER="pi"
elif id "dietpi" &>/dev/null; then
  TARGET_USER="dietpi"
elif id "ubuntu" &>/dev/null; then
  TARGET_USER="ubuntu"
elif [ -n "$USER" ] && id "$USER" &>/dev/null; then
  TARGET_USER="$USER"
else
  TARGET_USER=$(whoami 2>/dev/null || echo "root")
fi

# Validiere Benutzer
if ! id "$TARGET_USER" &>/dev/null; then
  TARGET_USER="root"
fi

TARGET_GROUP=$(id -gn "$TARGET_USER" 2>/dev/null || echo "$TARGET_USER")
if ! getent group "$TARGET_GROUP" &>/dev/null; then
  TARGET_GROUP=$(id -g "$TARGET_USER" 2>/dev/null || echo "0")
fi

TARGET_HOME=$(getent passwd "$TARGET_USER" 2>/dev/null | cut -d: -f6)
if [ -z "$TARGET_HOME" ] || [ ! -d "$TARGET_HOME" ]; then
  if [ "$TARGET_USER" = "root" ]; then
    TARGET_HOME="/root"
  else
    TARGET_HOME="/home/$TARGET_USER"
  fi
fi

INSTALL_DIR="/opt/adsb-logger"
DATA_DIR="$TARGET_HOME/adsb-data"
SERVICE_FILE="/etc/systemd/system/adsb-logger.service"
WEB_PORT="7001"

echo -e "${GREEN}[✓]${NC} Ziel-Benutzer: ${YELLOW}$TARGET_USER${NC} (Gruppe: ${YELLOW}$TARGET_GROUP${NC}, Home: ${YELLOW}$TARGET_HOME${NC})"
echo ""

# 3. Interaktive Abfrage: Installations-Variante (Innsbruck API vs. Lokale Hardware vs. LAN IP)
echo -e "${CYAN}Bitte wähle die primäre ADS-B Datenquelle:${NC}"
echo -e "  ${YELLOW}1)${NC} REST-API: Flughafen Innsbruck LOWI (25 NM Radius über adsb.fi) ${GREEN}[Empfohlen]${NC}"
echo -e "  ${YELLOW}2)${NC} Lokaler ADS-B Empfänger (readsb / dump1090-fa auf diesem Raspberry Pi)"
echo -e "  ${YELLOW}3)${NC} Netzwerk- / HTTP-Quelle (z. B. anderer Tar1090/readsb Empfänger im LAN)"
echo -e "  ${YELLOW}4)${NC} Benutzerdefinierte URL oder Datei"
prompt_user "Auswahl [1-4, Standard: 1]: " "1" VARIANT_CHOICE

TARGET_SOURCE=""
if [ "$VARIANT_CHOICE" = "1" ]; then
  TARGET_SOURCE="https://opendata.adsb.fi/api/v3/lat/47.259665/lon/11.3431121/dist/25"
  echo -e "${GREEN}[✓]${NC} Verwende Innsbruck 25 NM API: ${YELLOW}$TARGET_SOURCE${NC}"
elif [ "$VARIANT_CHOICE" = "3" ]; then
  echo ""
  echo -e "${CYAN}[Variante 3: Netzwerk-Quelle]${NC}"
  prompt_user "Netzwerkpfad / URL zu aircraft.json [Standard: http://192.168.1.200/data/aircraft.json]: " "http://192.168.1.200/data/aircraft.json" TARGET_SOURCE
  echo -e "${GREEN}[✓]${NC} Verwende Netzwerk-Quelle: ${YELLOW}$TARGET_SOURCE${NC}"
elif [ "$VARIANT_CHOICE" = "4" ]; then
  echo ""
  prompt_user "Gib die vollständige URL oder den Dateipfad an: " "https://opendata.adsb.fi/api/v3/lat/47.259665/lon/11.3431121/dist/25" TARGET_SOURCE
  echo -e "${GREEN}[✓]${NC} Verwende benutzerdefinierte Quelle: ${YELLOW}$TARGET_SOURCE${NC}"
else
  echo ""
  echo -e "${CYAN}[Variante 2: Lokale Hardware]${NC}"
  echo -e "${BLUE}[Suche]${NC} Scanne nach aktiver lokaler aircraft.json (readsb / dump1090-fa)..."
  SOURCE_CANDIDATES=(
    "/run/readsb/aircraft.json"
    "/run/dump1090-fa/aircraft.json"
    "/run/dump1090-mutability/aircraft.json"
    "/var/run/readsb/aircraft.json"
    "/var/run/dump1090-fa/aircraft.json"
    "/run/dump1090/aircraft.json"
  )

  for src in "${SOURCE_CANDIDATES[@]}"; do
    if [ -f "$src" ]; then
      TARGET_SOURCE="$src"
      echo -e "${GREEN}[✓]${NC} Aktive Datei gefunden: ${YELLOW}$TARGET_SOURCE${NC}"
      break
    fi
  done

  if [ -z "$TARGET_SOURCE" ]; then
    TARGET_SOURCE="/run/readsb/aircraft.json"
    echo -e "${YELLOW}[!] Keine laufende aircraft.json im RAM gefunden.${NC}"
    echo -e "    Verwende Standardpfad: ${YELLOW}$TARGET_SOURCE${NC}"
  fi
fi

# 4. Interaktive Abfrage: Abfrageintervall
echo ""
prompt_user "Abfrageintervall in Sekunden [Standard: 5]: " "5" POLL_INTERVAL
echo -e "${GREEN}[✓]${NC} Abfrageintervall gesetzt auf: ${YELLOW}${POLL_INTERVAL} Sekunden${NC}"
echo ""

# 5. Systempakete & Python 3 Abhängigkeiten prüfen & installieren
echo -e "${BLUE}[1/5]${NC} Prüfe erforderliche Systempakete & Abhängigkeiten..."

REQUIRED_PACKAGES=("python3" "curl" "gawk")
MISSING_PACKAGES=()

for pkg in "${REQUIRED_PACKAGES[@]}"; do
  if ! dpkg -s "$pkg" &>/dev/null && ! command -v "$pkg" &>/dev/null; then
    MISSING_PACKAGES+=("$pkg")
  fi
done

if [ ${#MISSING_PACKAGES[@]} -gt 0 ]; then
  echo -e "${YELLOW}[!] Fehlende Pakete erkannt: ${MISSING_PACKAGES[*]}${NC}"
  echo -e "${BLUE}[Apt]${NC} Aktualisiere Paketquellen & installiere Abhängigkeiten..."
  apt-get update -y
  apt-get install -y "${MISSING_PACKAGES[@]}"
fi

# Detaillierte Paket- & Modulprüfung
if command -v python3 &>/dev/null; then
  PY_VER=$(python3 --version 2>&1)
  echo -e "${GREEN}[✓]${NC} Python: ${YELLOW}$PY_VER${NC}"
else
  echo -e "${RED}[FEHLER] Python 3 konnte nicht installiert werden.${NC}"
  exit 1
fi

# Prüfe erforderliche Python 3 Standard-Module
if python3 -c "import urllib.request, urllib.parse, urllib.error, http.server, socketserver, json, csv, argparse, threading, signal, datetime; print('OK')" &>/dev/null; then
  echo -e "${GREEN}[✓]${NC} Python Standardmodule (urllib, http.server, json, csv, threading): ${YELLOW}Vollständig vorhanden${NC}"
else
  echo -e "${YELLOW}[!] Fehlende Python-Module erkannt. Installiere python3-full / standard packages...${NC}"
  apt-get install -y python3-full python3-pkg-resources || true
fi

# Prüfe curl
if command -v curl &>/dev/null; then
  echo -e "${GREEN}[✓]${NC} HTTP-Client: ${YELLOW}$(curl --version 2>&1 | head -n 1 | cut -d' ' -f1-2)${NC}"
fi

# Prüfe systemd
if command -v systemctl &>/dev/null; then
  echo -e "${GREEN}[✓]${NC} Dienstverwaltung: ${YELLOW}systemd / systemctl bereit${NC}"
else
  echo -e "${RED}[WARNUNG] systemctl nicht gefunden. Hintergrunddienst kann evtl. nicht registriert werden.${NC}"
fi

# 5. Vorhandenen Hintergrunddienst stoppen, falls er läuft (verhindert Dateisperren / unvollständiges Überschreiben)
echo -e "${BLUE}[2/5]${NC} Prüfe auf laufenden Hintergrunddienst..."
if systemctl is-active --quiet "adsb-logger.service" 2>/dev/null; then
  echo -e "${YELLOW}[!] Bestehender Dienst 'adsb-logger.service' ist aktiv.${NC}"
  echo -e "${BLUE}[Stop]${NC} Halte Dienst an, damit adsb_logger.py sicher überschrieben und aktualisiert werden kann..."
  systemctl stop "adsb-logger.service" 2>/dev/null || true
  sleep 1
  echo -e "${GREEN}[✓]${NC} Dienst 'adsb-logger.service' erfolgreich angehalten."
fi
# Beende auch eventuelle lose laufende Python-Prozesse des Loggers
pkill -f "$INSTALL_DIR/adsb_logger.py" 2>/dev/null || true
pkill -f "adsb_logger.py" 2>/dev/null || true

# 6. Installationsverzeichnisse & Skript sicher atomar anlegen
echo -e "${BLUE}[3/5]${NC} Erstelle Verzeichnisse & installiere Python-Skript..."
mkdir -p "$INSTALL_DIR"
mkdir -p "$DATA_DIR"

if id "$TARGET_USER" &>/dev/null; then
  chown -R "$TARGET_USER:$TARGET_GROUP" "$DATA_DIR" 2>/dev/null || chown -R "$TARGET_USER" "$DATA_DIR" 2>/dev/null || true
fi

# Schreibe adsb_logger.py zuerst in temporäre Datei
cat << 'EOF_PYTHON' > "$INSTALL_DIR/adsb_logger.py.tmp"
#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
=============================================================================
ADS-B Flight Logger & Web Control Dashboard (Port 7001)
=============================================================================
Dieses Skript überwacht fortlaufend Flugzeuge über dem Flughafen Innsbruck (LOWI)
im Umkreis von 25 nautischen Meilen über die REST-API von adsb.fi:
https://opendata.adsb.fi/api/v3/lat/47.259665/lon/11.3431121/dist/25

Alternativ kann jede andere HTTP-API oder lokale 'aircraft.json' Datei
(z. B. dump1090, readsb, tar1090, PiAware, RTL-SDR) angegeben werden.

Hauptfunktionen:
1. Kontinuierliches Polling der Innsbruck 25 NM Point-API (oder lokaler aircraft.json).
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
   - Direkter CSV-Download & HTTP-Stream (/flights.csv) über das Webinterface
=============================================================================
"""

import gzip
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
import io
import email.utils
from http.server import HTTPServer, BaseHTTPRequestHandler
from socketserver import ThreadingMixIn
from typing import Dict, Any, Optional, Set, List

SCRIPT_VERSION = "2.7.0"
DEFAULT_GITHUB_REPO = "tirolerhut/adsb-flight-tracker"
DEFAULT_GITHUB_BRANCH = "main"

# Standard-Quelle: Flughafen Innsbruck (LOWI) im 25 NM Radius über opendata.adsb.fi
DEFAULT_SOURCE = "https://opendata.adsb.fi/api/v3/lat/47.259665/lon/11.3431121/dist/25"
INNSBRUCK_LAT = 47.259665
INNSBRUCK_LON = 11.3431121
INNSBRUCK_RADIUS_NM = 25.0

# Cache für ADSBDB-Abfragen um API-Limits und Latenz zu minimieren
_ADSBDB_ROUTE_CACHE: Dict[str, Dict[str, str]] = {}
_ADSBDB_AC_CACHE: Dict[str, Dict[str, str]] = {}
_CACHE_LOCK = threading.Lock()

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
        if not self.callsign:
            return False
        cs = self.callsign.strip().upper()
        if cs in ("NOCALL", "UNKNOWN", "UNAVAILABLE", "NONE", "00000000", "TEST", "GROUND", "NO-REG", "N/A"):
            return False
        clean_chars = "".join(c for c in cs if c.isalnum())
        return len(clean_chars) >= 2

    def update(self, raw_ac: Dict[str, Any], current_time: float):
        self.last_seen_ts = current_time
        cs = (raw_ac.get("flight") or raw_ac.get("callsign") or raw_ac.get("flight_number") or "").strip()
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

    def to_dict(self) -> Dict[str, Any]:
        dt_first = datetime.datetime.fromtimestamp(self.first_seen_ts, tz=datetime.timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
        dt_last = datetime.datetime.fromtimestamp(self.last_seen_ts, tz=datetime.timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
        return {
            "hex": self.hex.upper(),
            "callsign": self.callsign or "-",
            "registration": self.registration or "-",
            "type_code": self.type_code or "-",
            "aircraft_desc": self.aircraft_desc or "-",
            "route": self.route or "-",
            "airline": self.airline or "-",
            "origin": self.origin or "-",
            "destination": self.destination or "-",
            "altitude_ft": int(self.alt_last) if self.alt_last is not None else "-",
            "speed_kts": round(self.speed_last, 1) if self.speed_last is not None else "-",
            "track_deg": round(self.track_last, 1) if self.track_last is not None else "-",
            "lat": round(self.lat_last, 5) if self.lat_last is not None else "-",
            "lon": round(self.lon_last, 5) if self.lon_last is not None else "-",
            "dst_nm": round(self.min_receiver_dst, 1) if self.min_receiver_dst is not None else "-",
            "squawk": self.squawk or "-",
            "first_seen_utc": dt_first,
            "last_seen_utc": dt_last,
            "duration_s": max(0, int(self.last_seen_ts - self.first_seen_ts)),
        }

    def query_adsbdb(self, timeout: float = 2.0):
        """
        Ermittelt Flugdaten (Start, Ziel, Route, Fluggesellschaft, Flugzeugtyp)
        asynchron und nicht-blockierend über die ADSBDB API mit Caching.
        """
        if self.adsbdb_queried:
            return
        
        cs_clean = (self.callsign or "").strip().upper()
        ident = (self.hex or "").strip().upper()
        if not ident and self.registration:
            ident = self.registration.strip().upper()
            
        has_cs = bool(cs_clean and cs_clean not in ("NOCALL", "UNKNOWN", "NONE") and len(cs_clean) >= 3)
        
        if not has_cs and not ident:
            return

        self.adsbdb_queried = True

        # Schneller Cache-Lookup (kein Netzwerk nötig)
        with _CACHE_LOCK:
            if has_cs and cs_clean in _ADSBDB_ROUTE_CACHE:
                cached = _ADSBDB_ROUTE_CACHE[cs_clean]
                if cached.get("origin"): self.origin = cached["origin"]
                if cached.get("destination"): self.destination = cached["destination"]
                if cached.get("airline"): self.airline = cached["airline"]
                if cached.get("route"): self.route = cached["route"]
            if ident and ident in _ADSBDB_AC_CACHE:
                ac_c = _ADSBDB_AC_CACHE[ident]
                if ac_c.get("registration") and not self.registration: self.registration = ac_c["registration"]
                if ac_c.get("type_code") and not self.type_code: self.type_code = ac_c["type_code"]
                if ac_c.get("aircraft_desc") and not self.aircraft_desc: self.aircraft_desc = ac_c["aircraft_desc"]
                if ac_c.get("airline") and not self.airline: self.airline = ac_c["airline"]

        # Falls alles bereits aus Cache gefüllt ist: kein API-Call nötig
        if self.route and (self.registration or not ident):
            return

        def _do_fetch_async():
            headers = {"User-Agent": "ADSB-Logger/2.7 (Raspberry Pi Tracker; +https://github.com/tirolerhut/adsb-flight-tracker)"}
            
            # 1. Ermittlung von Start & Ziel mit der Callsign-API: /v0/callsign/{CALLSIGN_ICAO}
            if has_cs and not self.route:
                try:
                    cs_url = f"https://api.adsbdb.com/v0/callsign/{urllib.parse.quote(cs_clean)}"
                    cs_req = urllib.request.Request(cs_url, headers=headers)
                    with urllib.request.urlopen(cs_req, timeout=timeout) as cs_resp:
                        cs_data = json.loads(cs_resp.read().decode("utf-8"))
                        cs_fr = cs_data.get("response", {}).get("flightroute", {})
                        if cs_fr:
                            orig = cs_fr.get("origin", {}).get("iata_code") or cs_fr.get("origin", {}).get("icao_code") or cs_fr.get("origin", {}).get("municipality") or ""
                            dest = cs_fr.get("destination", {}).get("iata_code") or cs_fr.get("destination", {}).get("icao_code") or cs_fr.get("destination", {}).get("municipality") or ""
                            al_name = cs_fr.get("airline", {}).get("name") or ""
                            if orig: self.origin = orig
                            if dest: self.destination = dest
                            if al_name and not self.airline: self.airline = al_name
                            if orig and dest:
                                self.route = f"{orig} -> {dest}"
                                if al_name: self.route += f" ({al_name})"
                            elif al_name and not self.route:
                                self.route = al_name
                            
                            with _CACHE_LOCK:
                                _ADSBDB_ROUTE_CACHE[cs_clean] = {
                                    "origin": self.origin, "destination": self.destination,
                                    "airline": self.airline, "route": self.route
                                }
                except Exception:
                    pass

            # 2. Flugzeug-Stammdaten & Fallback-Route über Mode-S Hex / Registrierung
            if ident and (not self.registration or not self.type_code or not self.route):
                try:
                    url = f"https://api.adsbdb.com/v0/aircraft/{urllib.parse.quote(ident)}"
                    if has_cs and (not self.origin or not self.destination):
                        url += f"?callsign={urllib.parse.quote(cs_clean)}"
                    req = urllib.request.Request(url, headers=headers)
                    with urllib.request.urlopen(req, timeout=timeout) as resp:
                        data = json.loads(resp.read().decode("utf-8"))
                        resp_obj = data.get("response", {})
                        
                        # Flugzeug-Stammdaten übernehmen
                        ac_info = resp_obj.get("aircraft", {})
                        if ac_info:
                            if not self.registration and ac_info.get("registration"):
                                self.registration = ac_info.get("registration")
                            if not self.type_code and ac_info.get("icao_type"):
                                self.type_code = ac_info.get("icao_type")
                            if not self.aircraft_desc and ac_info.get("type"):
                                self.aircraft_desc = ac_info.get("type")
                            if not self.airline and ac_info.get("registered_owner"):
                                self.airline = ac_info.get("registered_owner")

                            with _CACHE_LOCK:
                                _ADSBDB_AC_CACHE[ident] = {
                                    "registration": self.registration, "type_code": self.type_code,
                                    "aircraft_desc": self.aircraft_desc, "airline": self.airline
                                }

                        # Falls Start/Ziel noch nicht ermittelt wurden: Fallback aus aircraft response
                        if not self.origin or not self.destination:
                            fr = resp_obj.get("flightroute", {})
                            if fr:
                                orig = fr.get("origin", {}).get("iata_code") or fr.get("origin", {}).get("icao_code") or fr.get("origin", {}).get("municipality") or ""
                                dest = fr.get("destination", {}).get("iata_code") or fr.get("destination", {}).get("icao_code") or fr.get("destination", {}).get("municipality") or ""
                                al_name = fr.get("airline", {}).get("name") or ""
                                if orig and not self.origin: self.origin = orig
                                if dest and not self.destination: self.destination = dest
                                if al_name and not self.airline: self.airline = al_name
                                if orig and dest and not self.route:
                                    self.route = f"{orig} -> {dest}"
                                    if al_name: self.route += f" ({al_name})"
                                elif al_name and not self.route:
                                    self.route = al_name
                except Exception:
                    pass

        # Immer in separatem Daemon-Thread ausführen (niemals den Logger-Loop blockieren!)
        threading.Thread(target=_do_fetch_async, daemon=True).start()

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

    def send_cors_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS, HEAD")
        self.send_header("Access-Control-Allow-Headers", "*")
        self.send_header("Access-Control-Expose-Headers", "*")

    def send_json(self, data: Any, status: int = 200):
        body = json.dumps(data, indent=2).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-cache, no-transform, must-revalidate")
        self.send_cors_headers()
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_cors_headers()
        self.send_header("Access-Control-Max-Age", "86400")
        self.send_header("Content-Length", "0")
        self.end_headers()

    def do_HEAD(self):
        self._handle_request(is_head=True)

    def do_GET(self):
        self._handle_request(is_head=False)

    def _serve_csv(self, is_head: bool = False, query: Optional[Dict[str, List[str]]] = None, force_download: bool = False):
        logger = self.logger_instance
        query = query or {}
        download_flag = force_download or query.get("download", ["0"])[0].lower() in ("1", "true", "yes") or query.get("dl", ["0"])[0].lower() in ("1", "true", "yes")
        limit_param = query.get("limit", [None])[0]
        since_param = query.get("since", [None])[0]
        sep_param = query.get("sep", [","])[0]

        last_mod_time = time.time()
        filename = os.path.basename(logger.csv_path) if logger and logger.csv_path else "flights.csv"

        if logger and os.path.exists(logger.csv_path):
            try:
                last_mod_time = os.path.getmtime(logger.csv_path)
            except Exception:
                pass

        if limit_param or since_param or sep_param != ",":
            limit = None
            if limit_param:
                try:
                    limit = int(limit_param)
                except ValueError:
                    limit = None

            rows = []
            if logger and os.path.exists(logger.csv_path):
                with open(logger.csv_path, "r", encoding="utf-8", errors="replace") as f:
                    reader = csv.DictReader(f)
                    for r in reader:
                        if since_param and r.get("first_seen_utc", "") < since_param:
                            continue
                        rows.append(r)
            if limit and limit > 0:
                rows = rows[-limit:]

            output_io = io.StringIO()
            writer = csv.DictWriter(output_io, fieldnames=CSV_FIELDNAMES, delimiter=sep_param, extrasaction="ignore")
            writer.writeheader()
            for r in rows:
                writer.writerow(r)
            content_bytes = output_io.getvalue().encode("utf-8")
        else:
            if logger and os.path.exists(logger.csv_path) and os.path.getsize(logger.csv_path) > 0:
                try:
                    with open(logger.csv_path, "rb") as f:
                        content_bytes = f.read()
                except Exception:
                    content_bytes = (",".join(CSV_FIELDNAMES) + "\n").encode("utf-8")
            else:
                content_bytes = (",".join(CSV_FIELDNAMES) + "\n").encode("utf-8")

        self.send_response(200)
        self.send_header("Content-Type", "text/csv; charset=utf-8")
        disposition_type = "attachment" if download_flag else "inline"
        self.send_header("Content-Disposition", f'{disposition_type}; filename="{filename}"')
        self.send_header("Content-Length", str(len(content_bytes)))
        self.send_header("Cache-Control", "no-cache, no-transform, must-revalidate")
        self.send_header("Pragma", "no-cache")
        try:
            self.send_header("Last-Modified", email.utils.formatdate(last_mod_time, usegmt=True))
        except Exception:
            pass
        self.send_cors_headers()
        self.end_headers()

        if not is_head:
            self.wfile.write(content_bytes)

    def _handle_request(self, is_head: bool = False):
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
            self.send_cors_headers()
            self.end_headers()
            if not is_head:
                self.wfile.write(body)
            return

        elif path == "/api/status":
            if is_head:
                self.send_response(200)
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.send_cors_headers()
                self.end_headers()
            else:
                self.send_json(logger.get_status_dict())
            return

        elif path in ("/api/active", "/api/live", "/api/aircraft"):
            active_list = logger.get_active_flights_list()
            if is_head:
                self.send_response(200)
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.send_cors_headers()
                self.end_headers()
            else:
                self.send_json({"aircraft": active_list, "count": len(active_list), "timestamp": time.time()})
            return

        elif path in ("/api/csv", "/flights.csv", "/data/flights.csv", "/csv", "/download", "/api/flights.csv"):
            query = urllib.parse.parse_qs(parsed.query)
            force_dl = (path == "/download")
            self._serve_csv(is_head=is_head, query=query, force_download=force_dl)
            return

        elif path == "/api/csv_preview":
            query = urllib.parse.parse_qs(parsed.query)
            limit = int(query.get("limit", [50])[0])
            rows = logger.get_csv_recent_rows(limit=limit)
            if is_head:
                self.send_response(200)
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.send_cors_headers()
                self.end_headers()
            else:
                self.send_json({"rows": rows, "count": len(rows), "total": len(logger.logged_uids)})
            return

        elif path == "/api/update_check":
            query = urllib.parse.parse_qs(parsed.query)
            repo = query.get("repo", [DEFAULT_GITHUB_REPO])[0]
            branch = query.get("branch", [DEFAULT_GITHUB_BRANCH])[0]
            raw_url = query.get("raw_url", [""])[0]
            try:
                result = logger.check_github_update(repo=repo, branch=branch, raw_url=raw_url)
                if is_head:
                    self.send_response(200)
                    self.send_header("Content-Type", "application/json; charset=utf-8")
                    self.send_cors_headers()
                    self.end_headers()
                else:
                    self.send_json(result)
            except Exception as e:
                self.send_json({"success": False, "error": f"Fehler bei GitHub Update-Prüfung: {e}"}, status=500)
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

        elif path == "/api/update":
            try:
                params = {}
                if post_data:
                    try:
                        params = json.loads(post_data)
                    except Exception:
                        form_params = urllib.parse.parse_qs(post_data)
                        for k, v in form_params.items():
                            params[k] = v[0]
                repo = params.get("repo", DEFAULT_GITHUB_REPO)
                branch = params.get("branch", DEFAULT_GITHUB_BRANCH)
                raw_url = params.get("raw_url", "")
                restart = params.get("restart", True)
                if isinstance(restart, str):
                    restart = restart.lower() in ("true", "1", "yes")

                result = logger.update_from_github(repo=repo, branch=branch, raw_url=raw_url, restart=restart)
                self.send_json(result)
            except Exception as e:
                self.send_json({"success": False, "error": f"Update-Fehler: {e}"}, status=500)
            return

        elif path == "/api/rollback":
            try:
                result = logger.rollback_backup(restart=True)
                self.send_json(result)
            except Exception as e:
                self.send_json({"success": False, "error": f"Rollback-Fehler: {e}"}, status=500)
            return

        else:
            self.send_error(404, "Not Found")


class ADSBLogger:
    def __init__(self, source: str = DEFAULT_SOURCE, csv_path: str = "flights.csv", interval: float = 5.0, timeout_gap: float = 300.0, dedup_mode: str = "daily", immediate: bool = False, query_adsbdb: bool = True, web_port: int = 7001):
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
            req = urllib.request.Request(src, headers={
                "User-Agent": f"Mozilla/5.0 (compatible; ADSB-Innsbruck-Logger/{SCRIPT_VERSION}; +https://opendata.adsb.fi)",
                "Accept": "application/json",
                "Accept-Encoding": "gzip, deflate"
            })
            try:
                with urllib.request.urlopen(req, timeout=7.0) as resp:
                    headers = dict(resp.headers)
                    raw = resp.read()
                    if headers.get("content-encoding") == "gzip" or (len(raw) >= 2 and raw[:2] == b"\x1f\x8b"):
                        try:
                            raw = gzip.decompress(raw)
                        except Exception:
                            pass
                    data = json.loads(raw.decode("utf-8", errors="replace"))
                    self.last_error = None
                    return data
            except Exception as e:
                self.last_error = f"API/HTTP-Fehler ({src}): {e}"
                return None
        else:
            if not os.path.exists(src):
                self.last_error = f"Lokale Datei nicht gefunden: {src}"
                return None
            try:
                with open(src, "r", encoding="utf-8", errors="replace") as f:
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
            ac_list = data.get("aircraft") or data.get("ac") or []
            for ac in ac_list:
                hex_id = (ac.get("hex") or "").strip().lower()
                if not hex_id:
                    continue
                
                if hex_id in self.active_flights:
                    flight = self.active_flights[hex_id]
                    flight.update(ac, now)
                else:
                    flight = ActiveFlight(hex_id, now, ac)
                    self.active_flights[hex_id] = flight
                
                # Wenn Rufzeichen vorhanden ist: asynchron ADSBDB abfragen & sofort in CSV loggen
                if flight.has_valid_callsign():
                    uid = flight.get_flight_uid(self.dedup_mode)
                    if uid not in self.logged_uids:
                        if not flight.adsbdb_queried and self.enable_adsbdb:
                            flight.query_adsbdb(timeout=2.0)
                        self._write(flight, uid)
                        self.logged_uids.add(uid)
                    elif not flight.adsbdb_queried and self.enable_adsbdb:
                        flight.query_adsbdb(timeout=2.0)

            # Abgelaufene Flüge (Timeout nach Verlassen des Empfangsbereichs)
            expired = [h for h, f in self.active_flights.items() if now - f.last_seen_ts > self.timeout_gap]
            for hex_id in expired:
                flight = self.active_flights.pop(hex_id)
                # Falls ein Flug ohne offizielles Rufzeichen bisher nicht geloggt wurde (z.B. VFR/Segelflug)
                uid = flight.get_flight_uid(self.dedup_mode)
                if uid not in self.logged_uids and flight.hex:
                    if not flight.adsbdb_queried and self.enable_adsbdb:
                        flight.query_adsbdb(timeout=2.0)
                    self._write(flight, uid)
                    self.logged_uids.add(uid)

    def get_active_flights_list(self) -> List[Dict[str, Any]]:
        with self.lock:
            # Sortieren nach Entfernung oder letztem Empfang
            flights = list(self.active_flights.values())
            return [f.to_dict() for f in sorted(flights, key=lambda x: x.last_seen_ts, reverse=True)]

    def _write(self, flight: ActiveFlight, uid: str):
        try:
            parent_dir = os.path.dirname(self.csv_path)
            if parent_dir:
                os.makedirs(parent_dir, exist_ok=True)
            
            file_exists = os.path.isfile(self.csv_path) and os.path.getsize(self.csv_path) > 0
            with open(self.csv_path, mode="a", encoding="utf-8", newline="") as f:
                writer = csv.DictWriter(f, fieldnames=CSV_FIELDNAMES)
                if not file_exists:
                    writer.writeheader()
                writer.writerow(flight.to_csv_dict(uid))
                f.flush()
                try:
                    os.fsync(f.fileno())
                except Exception:
                    pass
            self.last_error = None
            cs_display = flight.callsign or flight.hex.upper()
            route_display = flight.route or (flight.airline if flight.airline else "-")
            print(f"\n[GELOGGT] {flight.hex.upper()} | {cs_display:<8} | Route: {route_display:<20} -> CSV ({os.path.basename(self.csv_path)})", flush=True)
        except Exception as e:
            err_str = f"CSV-Schreibfehler ({self.csv_path}): {e}"
            self.last_error = err_str
            print(f"\n[FEHLER] {err_str}", file=sys.stderr, flush=True)

    def get_script_path(self) -> str:
        try:
            return os.path.abspath(__file__)
        except Exception:
            return os.path.abspath(sys.argv[0])

    def get_backup_path(self) -> str:
        return self.get_script_path() + ".bak"

    def check_github_update(self, repo: str = DEFAULT_GITHUB_REPO, branch: str = DEFAULT_GITHUB_BRANCH, raw_url: str = "") -> Dict[str, Any]:
        if not raw_url:
            repo = (repo or DEFAULT_GITHUB_REPO).strip()
            branch = (branch or DEFAULT_GITHUB_BRANCH).strip()
            url = f"https://raw.githubusercontent.com/{repo}/{branch}/adsb_logger.py"
        else:
            url = raw_url.strip()

        req = urllib.request.Request(url, headers={"User-Agent": f"ADSB-Logger-Updater/{SCRIPT_VERSION}"})
        with urllib.request.urlopen(req, timeout=5.0) as resp:
            content = resp.read().decode("utf-8")

        remote_ver = "unknown"
        for line in content.splitlines()[:60]:
            if line.startswith("SCRIPT_VERSION"):
                remote_ver = line.split("=")[-1].strip().strip('"').strip("'")
                break

        script_path = self.get_script_path()
        local_bytes = os.path.getsize(script_path) if os.path.exists(script_path) else 0
        has_backup = os.path.exists(self.get_backup_path())

        return {
            "success": True,
            "current_version": SCRIPT_VERSION,
            "remote_version": remote_ver,
            "up_to_date": remote_ver == SCRIPT_VERSION,
            "remote_bytes": len(content.encode("utf-8")),
            "local_bytes": local_bytes,
            "url": url,
            "script_path": script_path,
            "has_backup": has_backup
        }

    def update_from_github(self, repo: str = DEFAULT_GITHUB_REPO, branch: str = DEFAULT_GITHUB_BRANCH, raw_url: str = "", restart: bool = True) -> Dict[str, Any]:
        if not raw_url:
            repo = (repo or DEFAULT_GITHUB_REPO).strip()
            branch = (branch or DEFAULT_GITHUB_BRANCH).strip()
            url = f"https://raw.githubusercontent.com/{repo}/{branch}/adsb_logger.py"
        else:
            url = raw_url.strip()

        req = urllib.request.Request(url, headers={"User-Agent": f"ADSB-Logger-Updater/{SCRIPT_VERSION}"})
        with urllib.request.urlopen(req, timeout=10.0) as resp:
            new_code = resp.read().decode("utf-8")

        if "class ADSBLogger" not in new_code:
            raise ValueError("Heruntergeladene Datei ist kein gültiges ADS-B Logger Skript (ADSBLogger Klasse fehlt).")

        # Syntax-Check
        compile(new_code, "adsb_logger_update.py", "exec")

        script_path = self.get_script_path()
        backup_path = self.get_backup_path()
        tmp_path = script_path + ".tmp"

        # Backup erstellen
        if os.path.exists(script_path):
            try:
                with open(script_path, "r", encoding="utf-8") as cur_f:
                    cur_code = cur_f.read()
                with open(backup_path, "w", encoding="utf-8") as bak_f:
                    bak_f.write(cur_code)
                    bak_f.flush()
                    try:
                        os.fsync(bak_f.fileno())
                    except Exception:
                        pass
            except Exception as e:
                print(f"[UPDATE WARNUNG] Backup konnte nicht gespeichert werden: {e}")

        # Neue Datei zunächst sicher in temporäre Datei schreiben
        with open(tmp_path, "w", encoding="utf-8") as f:
            f.write(new_code)
            f.flush()
            try:
                os.fsync(f.fileno())
            except Exception:
                pass

        try:
            os.chmod(tmp_path, 0o755)
        except Exception:
            pass

        # Atomarer Austausch der Datei (verhindert unvollständiges Schreiben/Sperren)
        os.replace(tmp_path, script_path)

        remote_ver = "unknown"
        for line in new_code.splitlines()[:60]:
            if line.startswith("SCRIPT_VERSION"):
                remote_ver = line.split("=")[-1].strip().strip('"').strip("'")
                break

        print(f"\n[UPDATE] Skript erfolgreich von {url} aktualisiert! Version: {remote_ver} ({len(new_code)} Bytes)")

        if restart:
            def _restart_worker():
                time.sleep(1.0)
                print("[UPDATE] Halte Dienst/Logger für sicheren Neustart an...")
                self.running = False
                try:
                    res = os.system("systemctl restart adsb-logger 2>/dev/null || (systemctl stop adsb-logger 2>/dev/null && sleep 1 && systemctl start adsb-logger 2>/dev/null)")
                    if res == 0:
                        return
                except Exception:
                    pass
                try:
                    os.execv(sys.executable, [sys.executable] + sys.argv)
                except Exception as e:
                    print(f"[RESTART FEHLER]: {e}", file=sys.stderr)

            t = threading.Thread(target=_restart_worker, daemon=True)
            t.start()

        return {
            "success": True,
            "message": f"Skript erfolgreich auf Version {remote_ver} aktualisiert! Dienst wird jetzt sauber neu gestartet.",
            "version": remote_ver,
            "script_path": script_path,
            "backup_path": backup_path,
            "bytes": len(new_code)
        }

    def rollback_backup(self, restart: bool = True) -> Dict[str, Any]:
        script_path = self.get_script_path()
        backup_path = self.get_backup_path()
        tmp_path = script_path + ".tmp"

        if not os.path.exists(backup_path):
            raise FileNotFoundError("Keine Backup-Datei (.bak) vorhanden.")

        with open(backup_path, "r", encoding="utf-8") as f:
            bak_code = f.read()

        compile(bak_code, "adsb_logger_rollback.py", "exec")

        with open(tmp_path, "w", encoding="utf-8") as f:
            f.write(bak_code)
            f.flush()
            try:
                os.fsync(f.fileno())
            except Exception:
                pass

        try:
            os.chmod(tmp_path, 0o755)
        except Exception:
            pass

        os.replace(tmp_path, script_path)

        if restart:
            def _restart_worker():
                time.sleep(1.0)
                print("[ROLLBACK] Halte Dienst/Logger für Neustart an...")
                self.running = False
                try:
                    res = os.system("systemctl restart adsb-logger 2>/dev/null || (systemctl stop adsb-logger 2>/dev/null && sleep 1 && systemctl start adsb-logger 2>/dev/null)")
                    if res == 0:
                        return
                except Exception:
                    pass
                try:
                    os.execv(sys.executable, [sys.executable] + sys.argv)
                except Exception:
                    pass

            t = threading.Thread(target=_restart_worker, daemon=True)
            t.start()

        return {
            "success": True,
            "message": "Backup (.bak) erfolgreich wiederhergestellt! Dienst wird sauber neu gestartet."
        }

    def get_status_dict(self) -> Dict[str, Any]:
        with self.lock:
            uptime = int(time.time() - self.start_time)
            total_active = len(self.active_flights)
            active_with_cs = sum(1 for f in self.active_flights.values() if f.has_valid_callsign())
            csv_size = os.path.getsize(self.csv_path) if os.path.exists(self.csv_path) else 0
            has_backup = os.path.exists(self.get_backup_path())
            
            return {
                "version": SCRIPT_VERSION,
                "status": "running" if self.running else "stopped",
                "uptime_seconds": uptime,
                "uptime_formatted": str(datetime.timedelta(seconds=uptime)),
                "source": self.source,
                "interval": self.interval,
                "timeout_gap": self.timeout_gap,
                "csv_path": self.csv_path,
                "script_path": self.get_script_path(),
                "has_backup": has_backup,
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
        html = """<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ADS-B Logger Web Control (Port __WEB_PORT__)</title>
  <style>
    :root {
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
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      background-color: var(--bg);
      color: var(--text);
      padding: 20px;
      line-height: 1.5;
    }
    .container { max-width: 1200px; margin: 0 auto; display: flex; flex-direction: column; gap: 20px; }
    header {
      display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px;
      border-bottom: 1px solid var(--card-border); padding-bottom: 16px;
    }
    .badge {
      display: inline-flex; align-items: center; gap: 6px; padding: 4px 10px; border-radius: 9999px;
      font-size: 12px; font-weight: 600; background: rgba(16, 185, 129, 0.15); color: var(--emerald);
      border: 1px solid rgba(16, 185, 129, 0.3);
    }
    .pulse { width: 8px; height: 8px; border-radius: 50%; background: var(--emerald); animation: pulse 2s infinite; }
    @keyframes pulse { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.4; transform: scale(0.8); } }
    
    .grid-stats {
      display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 16px;
    }
    .card {
      background: var(--card-bg); border: 1px solid var(--card-border); border-radius: 12px; padding: 18px;
    }
    .card-title { font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; color: var(--text-muted); margin-bottom: 6px; }
    .card-value { font-size: 24px; font-weight: 700; color: var(--text); }
    .card-sub { font-size: 11px; color: var(--text-muted); margin-top: 4px; }
    
    .grid-main {
      display: grid; grid-template-columns: 1fr 1fr; gap: 20px;
    }
    @media (max-width: 900px) { .grid-main { grid-template-columns: 1fr; } }
    
    .form-group { margin-bottom: 14px; }
    label { display: block; font-size: 13px; font-weight: 600; margin-bottom: 6px; color: #cbd5e1; }
    input[type="text"], input[type="number"] {
      width: 100%; padding: 10px 12px; background: #0b1120; border: 1px solid var(--card-border);
      border-radius: 8px; color: #fff; font-family: monospace; font-size: 13px;
    }
    input:focus { outline: none; border-color: var(--accent); }
    
    .btn-group { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 16px; }
    button, .btn {
      display: inline-flex; align-items: center; gap: 6px; padding: 9px 16px; border-radius: 8px;
      font-size: 13px; font-weight: 600; cursor: pointer; border: none; text-decoration: none; transition: all 0.15s;
    }
    .btn-primary { background: var(--accent); color: #fff; }
    .btn-primary:hover { background: var(--accent-hover); }
    .btn-secondary { background: #334155; color: #f1f5f9; }
    .btn-secondary:hover { background: #475569; }
    .btn-emerald { background: #059669; color: #fff; }
    .btn-emerald:hover { background: #047857; }
    .btn-danger { background: #dc2626; color: #fff; }
    .btn-danger:hover { background: #b91c1c; }
    
    .table-container {
      overflow-x: auto; max-height: 480px; overflow-y: auto; border: 1px solid var(--card-border);
      border-radius: 8px; background: #0b1120; margin-top: 12px;
    }
    table { width: 100%; border-collapse: collapse; font-size: 12px; text-align: left; }
    th { background: #1e293b; padding: 10px 12px; position: sticky; top: 0; color: #94a3b8; font-weight: 600; border-bottom: 1px solid var(--card-border); }
    td { padding: 8px 12px; border-bottom: 1px solid #1e293b; white-space: nowrap; }
    tr:hover { background: rgba(255,255,255,0.03); }
    
    .banner-alert {
      padding: 10px 14px; border-radius: 8px; font-size: 13px; margin-bottom: 14px; display: none;
    }
    .banner-success { background: rgba(16, 185, 129, 0.2); border: 1px solid var(--emerald); color: #a7f3d0; }
    .banner-error { background: rgba(239, 68, 68, 0.2); border: 1px solid var(--red); color: #fecaca; }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <div>
        <h1 style="font-size: 20px; font-weight: 700;">✈️ ADS-B Flight Logger & Control</h1>
        <p style="font-size: 12px; color: var(--text-muted);">Webinterface auf Port __WEB_PORT__ &bull; Raspberry Pi Daemon</p>
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

    <!-- Hauptbereich: Einstellungen, GitHub Update & CSV Vorschau -->
    <div class="grid-main" style="grid-template-columns: repeat(auto-fit, minmax(340px, 1fr));">
      <!-- Formular: Konfiguration & Steuerung -->
      <div class="card">
        <h2 style="font-size: 15px; margin-bottom: 12px; font-weight: 600;">⚙️ Einstellungen & Steuerung</h2>
        <form id="config-form" onsubmit="saveConfig(event)">
          <div class="form-group">
            <label for="cfg-source">ADS-B Quelle (REST API-URL oder aircraft.json Pfad)</label>
            <input type="text" id="cfg-source" name="source" placeholder="https://opendata.adsb.fi/api/v3/lat/47.259665/lon/11.3431121/dist/25">
            <div style="display: flex; gap: 6px; margin-top: 6px; flex-wrap: wrap;">
              <button type="button" class="btn btn-secondary" style="font-size: 11px; padding: 3px 8px; color: #38bdf8;" onclick="setSource('https://opendata.adsb.fi/api/v3/lat/47.259665/lon/11.3431121/dist/25')">📍 Innsbruck 25 NM (adsb.fi)</button>
              <button type="button" class="btn btn-secondary" style="font-size: 11px; padding: 3px 8px;" onclick="setSource('https://opendata.adsb.fi/api/v3/lat/47.259665/lon/11.3431121/dist/50')">📍 Innsbruck 50 NM (adsb.fi)</button>
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
            <button type="button" class="btn btn-danger" onclick="restartTracker()">🔄 Logger zurücksetzen</button>
          </div>
        </form>
      </div>

      <!-- GitHub Online-Update -->
      <div class="card" style="border-color: #3b82f6;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
          <h2 style="font-size: 15px; font-weight: 600; color: #60a5fa;">🐙 GitHub Online-Update</h2>
          <span class="badge" style="background: rgba(59, 130, 246, 0.15); color: #93c5fd; border-color: rgba(59, 130, 246, 0.3);" id="badge-version">v__VERSION__</span>
        </div>
        <p style="font-size: 12px; color: var(--text-muted); margin-bottom: 12px;">
          Aktualisiert das Skript direkt über die offizielle GitHub-Seite und startet den Dienst neu.
        </p>
        <div class="form-group">
          <label for="gh-repo">GitHub Repository & Branch</label>
          <div style="display: grid; grid-template-columns: 2fr 1fr; gap: 8px;">
            <input type="text" id="gh-repo" value="tirolerhut/adsb-flight-tracker" placeholder="Benutzer/Repo">
            <input type="text" id="gh-branch" value="main" placeholder="Branch">
          </div>
        </div>

        <div id="update-status-box" style="display: none; padding: 10px; border-radius: 8px; font-size: 12px; margin-bottom: 12px; background: #0b1120; border: 1px solid var(--card-border);"></div>

        <div class="btn-group">
          <button type="button" class="btn btn-secondary" onclick="checkGithubUpdate()" id="btn-check-update">🔍 Nach Update suchen</button>
          <button type="button" class="btn btn-primary" onclick="runGithubUpdate()" id="btn-run-update" style="background: #2563eb;">🚀 Jetzt aktualisieren</button>
          <button type="button" class="btn btn-secondary" onclick="rollbackBackup()" id="btn-rollback" style="display: none; color: #fca5a5;">↩️ Rollback (.bak)</button>
        </div>
      </div>

      <!-- Quick Info & Dateipfade -->
      <div class="card">
        <h2 style="font-size: 15px; margin-bottom: 12px; font-weight: 600;">📁 Dateipfade & Schnittstellen</h2>
        <div style="font-size: 12px; color: #cbd5e1; display: flex; flex-direction: column; gap: 8px;">
          <div><strong style="color: #94a3b8;">Skript:</strong> <code style="color: #93c5fd; word-break: break-all;" id="info-script-path">-</code></div>
          <div><strong style="color: #94a3b8;">CSV-Datei:</strong> <code style="color: #67e8f9; word-break: break-all;" id="info-csv-path">-</code></div>
          <div><strong style="color: #94a3b8;">REST Status API:</strong> <a href="/api/status" target="_blank" style="color: #60a5fa;">GET /api/status</a></div>
          <div><strong style="color: #94a3b8;">HTTP CSV Stream:</strong> <a href="/flights.csv" target="_blank" style="color: #34d399;">GET /flights.csv</a></div>
          <div><strong style="color: #94a3b8;">Vorschau API:</strong> <a href="/api/csv_preview" target="_blank" style="color: #60a5fa;">GET /api/csv_preview</a></div>
          <div id="info-error" style="color: #f87171; display: none;"></div>
        </div>
      </div>
    </div>

    <!-- HTTP CSV Schnittstelle & Automatisierte Datenanalyse -->
    <div class="card" style="border-color: #10b981; background: linear-gradient(180deg, #111827 0%, #0f172a 100%);">
      <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px; margin-bottom: 12px;">
        <div style="display: flex; align-items: center; gap: 8px;">
          <h2 style="font-size: 15px; font-weight: 700; color: #34d399;">🌐 HTTP CSV-Quelle für automatische Datenanalysen</h2>
          <span class="badge" style="background: rgba(16, 185, 129, 0.15); color: #6ee7b7; border-color: rgba(16, 185, 129, 0.3);">REST & Stream API</span>
        </div>
        <div style="display: flex; gap: 8px; flex-wrap: wrap;">
          <a id="btn-open-csv" href="/flights.csv" target="_blank" class="btn btn-secondary" style="font-size: 12px; padding: 5px 10px;">🔗 Im Browser öffnen</a>
          <a id="btn-dl-csv" href="/api/csv?download=1" class="btn btn-emerald" style="font-size: 12px; padding: 5px 10px;">📥 CSV herunterladen</a>
        </div>
      </div>
      
      <p style="font-size: 12px; color: var(--text-muted); margin-bottom: 12px;">
        Die CSV-Datei wird live über standardkonforme HTTP-Endpunkte mit <code>CORS (Access-Control-Allow-Origin: *)</code>, <code>HEAD</code>-Unterstützung und <code>Last-Modified</code> Zeitstempeln bereitgestellt. Ideal für automatisiertes Einlesen in <strong>Python (Pandas/Polars)</strong>, <strong>DuckDB</strong>, <strong>R</strong>, <strong>Excel / Power Query</strong> oder <strong>Cronjobs / cURL</strong>.
      </p>

      <!-- URL Bar mit Kopier-Button -->
      <div class="form-group" style="margin-bottom: 14px;">
        <label style="font-size: 11px; color: #94a3b8; font-weight: 600;">DIREKTE HTTP-CSV URL (FÜR ANALYSE-SKRIPTE):</label>
        <div style="display: flex; gap: 8px; align-items: center;">
          <input type="text" id="http-csv-url-input" readonly style="font-family: monospace; font-size: 13px; color: #38bdf8; background: #0b1120; font-weight: 600; cursor: text;" value="http://localhost:7001/flights.csv">
          <button type="button" class="btn btn-primary" onclick="copyCsvUrl()" id="btn-copy-csv-url" style="white-space: nowrap;">📋 Link kopieren</button>
        </div>
      </div>

      <!-- Code Snippets Box -->
      <div style="background: #090d16; border: 1px solid var(--card-border); border-radius: 8px; padding: 12px;">
        <div style="display: flex; gap: 6px; margin-bottom: 10px; flex-wrap: wrap;" id="snippet-tab-buttons">
          <button type="button" class="btn btn-secondary snippet-tab" onclick="setSnippetTab('pandas')" id="tab-btn-pandas" style="font-size: 11px; padding: 4px 10px;">🐍 Python (Pandas)</button>
          <button type="button" class="btn btn-secondary snippet-tab" onclick="setSnippetTab('duckdb')" id="tab-btn-duckdb" style="font-size: 11px; padding: 4px 10px;">🦆 DuckDB / SQL</button>
          <button type="button" class="btn btn-secondary snippet-tab" onclick="setSnippetTab('r')" id="tab-btn-r" style="font-size: 11px; padding: 4px 10px;">📈 R</button>
          <button type="button" class="btn btn-secondary snippet-tab" onclick="setSnippetTab('excel')" id="tab-btn-excel" style="font-size: 11px; padding: 4px 10px;">📊 Excel & Sheets</button>
          <button type="button" class="btn btn-secondary snippet-tab" onclick="setSnippetTab('curl')" id="tab-btn-curl" style="font-size: 11px; padding: 4px 10px;">💻 cURL / Cron</button>
        </div>

        <pre id="snippet-code-box" style="background: #040711; color: #a5f3fc; padding: 10px 12px; border-radius: 6px; font-family: monospace; font-size: 12px; overflow-x: auto; margin: 0; white-space: pre-wrap; line-height: 1.5;"></pre>
        
        <div style="display: flex; justify-content: flex-end; margin-top: 8px;">
          <button type="button" class="btn btn-secondary" onclick="copySnippetCode()" id="btn-copy-snippet" style="font-size: 11px; padding: 3px 10px;">📋 Code kopieren</button>
        </div>
      </div>

      <!-- Parameter Quick-Guide -->
      <div style="margin-top: 12px; font-size: 11px; color: #94a3b8; display: flex; gap: 14px; flex-wrap: wrap;">
        <div>🔹 <code>/flights.csv</code> Vollständige Datei</div>
        <div>🔹 <code>/api/csv?limit=500</code> Neueste 500 Zeilen</div>
        <div>🔹 <code>/api/csv?since=2026-08-25</code> Ab Datum/Zeit</div>
        <div>🔹 <code>/api/csv?sep=;</code> Semikolon-Trennzeichen (Excel)</div>
      </div>
    </div>

    <!-- Live im Luftraum (Aktive Flugzeuge) -->
    <div class="card" style="border-color: #38bdf8; background: linear-gradient(180deg, #0f172a 0%, #0b1329 100%);">
      <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px; margin-bottom: 12px;">
        <div style="display: flex; align-items: center; gap: 8px;">
          <h2 style="font-size: 15px; font-weight: 700; color: #38bdf8;">📡 Aktuell im Luftraum (Live-Erfassung Innsbruck 25 NM)</h2>
          <span id="badge-live-count" class="badge" style="background: rgba(56, 189, 248, 0.2); color: #38bdf8; border-color: rgba(56, 189, 248, 0.4);">0 Flugzeuge</span>
        </div>
        <div style="display: flex; gap: 8px;">
          <button class="btn btn-secondary" onclick="loadLiveAircraft()" style="font-size: 12px; padding: 4px 10px;">🔄 Live neu laden</button>
        </div>
      </div>

      <div class="table-container">
        <table id="live-table">
          <thead>
            <tr>
              <th>Rufzeichen</th>
              <th>Hex</th>
              <th>Fluggesellschaft / Route</th>
              <th>Typ / Reg</th>
              <th>Flughöhe</th>
              <th>Speed</th>
              <th>Kurs</th>
              <th>Distanz LOWI</th>
              <th>Squawk</th>
              <th>Signal</th>
            </tr>
          </thead>
          <tbody id="live-tbody">
            <tr><td colspan="10" style="text-align: center; color: var(--text-muted); padding: 18px;">Empfange Live-Daten aus Innsbrucker Luftraum...</td></tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- CSV Live Statusfenster -->
    <div class="card">
      <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
        <div>
          <h2 style="font-size: 15px; font-weight: 600;">📋 Statusfenster: CSV-Einträge (Geloggte Flüge)</h2>
          <p style="font-size: 11px; color: var(--text-muted);">Alle Flüge mit Rufzeichen werden automatisch und dauerhaft in der CSV gespeichert.</p>
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
              <th>Start</th>
              <th>Ziel</th>
              <th>Route / Airline</th>
              <th>Typ / Reg</th>
              <th>Höhe (Min / Max)</th>
              <th>Max Speed</th>
              <th>Dauer</th>
              <th>RSSI</th>
            </tr>
          </thead>
          <tbody id="csv-tbody">
            <tr><td colspan="11" style="text-align: center; color: var(--text-muted); padding: 20px;">Lade CSV-Daten...</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>

  <script>
    let rawRows = [];

    async function loadLiveAircraft() {
      try {
        const res = await fetch('/api/active');
        const data = await res.json();
        const list = data.aircraft || [];
        const countBadge = document.getElementById('badge-live-count');
        if (countBadge) countBadge.textContent = `${list.length} Flugzeug${list.length === 1 ? '' : 'e'}`;

        const tbody = document.getElementById('live-tbody');
        if (!list || list.length === 0) {
          tbody.innerHTML = '<tr><td colspan="10" style="text-align: center; color: var(--text-muted); padding: 18px;">Aktuell kein Flugzeug im 25 NM Radius erfasst.</td></tr>';
          return;
        }

        tbody.innerHTML = list.map(ac => {
          const hasCs = ac.callsign && ac.callsign !== '-';
          const csHtml = hasCs 
            ? `<strong style="color: #38bdf8;">${ac.callsign}</strong>` 
            : `<span style="color: #64748b; font-style: italic;">Kein Rufzeichen</span>`;
          const routeHtml = ac.route && ac.route !== '-' 
            ? `<span style="color: #a7f3d0; font-weight: 600;">${ac.route}</span>` 
            : (ac.airline && ac.airline !== '-' ? ac.airline : '-');
          
          return `
            <tr>
              <td>${csHtml}</td>
              <td><code style="color: #fbbf24;">${ac.hex}</code></td>
              <td>${routeHtml}</td>
              <td>${ac.type_code !== '-' ? ac.type_code : ''} ${ac.registration !== '-' ? '(' + ac.registration + ')' : ''}</td>
              <td><span style="color: #93c5fd;">${ac.altitude_ft !== '-' ? ac.altitude_ft + ' ft' : '-'}</span></td>
              <td>${ac.speed_kts !== '-' ? ac.speed_kts + ' kts' : '-'}</td>
              <td>${ac.track_deg !== '-' ? ac.track_deg + '°' : '-'}</td>
              <td><span style="color: #34d399; font-weight: 600;">${ac.dst_nm !== '-' ? ac.dst_nm + ' NM' : '-'}</span></td>
              <td><code>${ac.squawk}</code></td>
              <td style="color: #94a3b8;">${ac.duration_s}s aktiv</td>
            </tr>
          `;
        }).join('');
      } catch (e) {
        console.error("Live aircraft fetch error", e);
      }
    }

    function showAlert(msg, isSuccess = true) {
      const el = document.getElementById('alert-box');
      el.textContent = msg;
      el.className = 'banner-alert ' + (isSuccess ? 'banner-success' : 'banner-error');
      el.style.display = 'block';
      setTimeout(() => { el.style.display = 'none'; }, 5000);
    }

    function setSource(val) {
      document.getElementById('cfg-source').value = val;
    }

    async function loadStatus() {
      try {
        const res = await fetch('/api/status');
        const data = await res.json();
        
        document.getElementById('stat-active').textContent = data.active_aircraft_total;
        document.getElementById('stat-active-cs').textContent = `Davon mit Flugnummer: ${data.active_with_callsign}`;
        document.getElementById('stat-logged').textContent = data.logged_flights_count;
        document.getElementById('stat-csv-size').textContent = `CSV-Größe: ${Math.round(data.csv_size_bytes / 1024)} KB`;
        document.getElementById('stat-interval').textContent = `${data.interval}s`;
        document.getElementById('stat-uptime').textContent = `Uptime: ${data.uptime_formatted}`;
        document.getElementById('stat-source').textContent = data.source;
        document.getElementById('stat-cycle').textContent = `Letzter Abruf: ${data.last_cycle_time || 'Noch keiner'}`;
        document.getElementById('info-csv-path').textContent = data.csv_path;
        if (data.script_path && document.getElementById('info-script-path')) {
          document.getElementById('info-script-path').textContent = data.script_path;
        }
        if (data.version && document.getElementById('badge-version')) {
          document.getElementById('badge-version').textContent = `v${data.version}`;
        }
        const rollbackBtn = document.getElementById('btn-rollback');
        if (rollbackBtn) {
          rollbackBtn.style.display = data.has_backup ? 'inline-flex' : 'none';
        }

        if (!document.getElementById('cfg-source').value) {
          document.getElementById('cfg-source').value = data.source;
        }
        if (!document.getElementById('cfg-interval').value) {
          document.getElementById('cfg-interval').value = data.interval;
        }

        const errEl = document.getElementById('info-error');
        if (data.last_error) {
          errEl.textContent = '⚠️ Letzter Fehler: ' + data.last_error;
          errEl.style.display = 'block';
        } else {
          errEl.style.display = 'none';
        }
      } catch (e) {
        console.error("Status fetch error", e);
      }
    }

    async function checkGithubUpdate() {
      const repo = document.getElementById('gh-repo').value.trim() || 'tirolerhut/adsb-flight-tracker';
      const branch = document.getElementById('gh-branch').value.trim() || 'main';
      const box = document.getElementById('update-status-box');
      const btn = document.getElementById('btn-check-update');
      
      btn.disabled = true;
      btn.textContent = '⏳ Prüfe GitHub...';
      box.style.display = 'block';
      box.innerHTML = '<span style="color: #60a5fa;">Verbinde mit GitHub (' + repo + '@' + branch + ')...</span>';

      try {
        const res = await fetch(`/api/update_check?repo=${encodeURIComponent(repo)}&branch=${encodeURIComponent(branch)}`);
        const data = await res.json();
        
        if (data.success) {
          if (data.up_to_date) {
            box.innerHTML = `
              <div style="color: #34d399; font-weight: 600; margin-bottom: 4px;">✅ Skript ist auf dem neuesten Stand!</div>
              <div style="color: #94a3b8;">Installiert: <code>v${data.current_version}</code> | GitHub: <code>v${data.remote_version}</code> (${Math.round(data.remote_bytes / 1024)} KB)</div>
            `;
          } else {
            box.innerHTML = `
              <div style="color: #fbbf24; font-weight: 600; margin-bottom: 4px;">🎉 Neues Update auf GitHub verfügbar!</div>
              <div style="color: #cbd5e1;">Installiert: <code>v${data.current_version}</code> ➔ GitHub: <strong style="color:#60a5fa;">v${data.remote_version}</strong> (${Math.round(data.remote_bytes / 1024)} KB)</div>
              <div style="color: #94a3b8; margin-top: 4px; font-size: 11px;">Klicke auf "Jetzt aktualisieren", um die neue Version herunterzuladen.</div>
            `;
          }
        } else {
          box.innerHTML = `<span style="color: #f87171;">⚠️ ${data.error || 'Fehler beim Prüfen auf GitHub'}</span>`;
        }
      } catch (err) {
        box.innerHTML = '<span style="color: #f87171;">⚠️ Verbindungsfehler zu GitHub. Bitte Internetverbindung prüfen.</span>';
      } finally {
        btn.disabled = false;
        btn.textContent = '🔍 Nach Update suchen';
      }
    }

    async function runGithubUpdate() {
      const repo = document.getElementById('gh-repo').value.trim() || 'tirolerhut/adsb-flight-tracker';
      const branch = document.getElementById('gh-branch').value.trim() || 'main';
      
      if (!confirm(`Möchtest du das ADS-B Logger Skript jetzt direkt von GitHub (${repo}@${branch}) herunterladen und den Dienst neu starten?`)) {
        return;
      }

      const box = document.getElementById('update-status-box');
      const btn = document.getElementById('btn-run-update');
      
      btn.disabled = true;
      btn.textContent = '⏳ Aktualisiere...';
      box.style.display = 'block';
      box.innerHTML = '<span style="color: #60a5fa;">🚀 Lade neuestes Skript von GitHub herunter & erstelle Backup...</span>';

      try {
        const res = await fetch('/api/update', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ repo, branch, restart: true })
        });
        const data = await res.json();
        
        if (data.success) {
          showAlert(data.message, true);
          box.innerHTML = `
            <div style="color: #34d399; font-weight: 600;">✅ ${data.message}</div>
            <div style="color: #94a3b8; margin-top: 4px;">Version: <strong>v${data.version}</strong> (${data.bytes} Bytes). Die Seite lädt in 4 Sekunden automatisch neu...</div>
          `;
          setTimeout(() => {
            window.location.reload();
          }, 4000);
        } else {
          showAlert(data.error || 'Update fehlgeschlagen', false);
          box.innerHTML = `<span style="color: #f87171;">⚠️ Fehler: ${data.error || 'Update fehlgeschlagen'}</span>`;
          btn.disabled = false;
          btn.textContent = '🚀 Jetzt aktualisieren';
        }
      } catch (err) {
        showAlert('Update-Befehl gesendet. Dienst startet neu...', true);
        box.innerHTML = '<span style="color: #34d399;">Dienst startet neu. Seite lädt in 4 Sekunden neu...</span>';
        setTimeout(() => {
          window.location.reload();
        }, 4000);
      }
    }

    async function rollbackBackup() {
      if (!confirm('Möchtest du wirklich die vorherige Skript-Version (.bak) wiederherstellen und neu starten?')) return;
      try {
        const res = await fetch('/api/rollback', { method: 'POST' });
        const data = await res.json();
        if (data.success) {
          showAlert(data.message, true);
          setTimeout(() => { window.location.reload(); }, 3000);
        } else {
          showAlert(data.error || 'Rollback fehlgeschlagen', false);
        }
      } catch (e) {
        showAlert('Rollback ausgelöst. Starte neu...', true);
        setTimeout(() => { window.location.reload(); }, 3000);
      }
    }

    async function loadPreview() {
      try {
        const res = await fetch('/api/csv_preview?limit=100');
        const data = await res.json();
        rawRows = data.rows || [];
        renderTable(rawRows);
      } catch (e) {
        console.error("Preview fetch error", e);
      }
    }

    function renderTable(rows) {
      const tbody = document.getElementById('csv-tbody');
      if (!rows || rows.length === 0) {
        tbody.innerHTML = '<tr><td colspan="11" style="text-align: center; color: var(--text-muted); padding: 20px;">Noch keine Flüge geloggt.</td></tr>';
        return;
      }
      tbody.innerHTML = rows.map(r => `
        <tr>
          <td style="color: #94a3b8; font-family: monospace;">${r.first_seen_utc || ''}</td>
          <td><strong style="color: #38bdf8;">${r.callsign || '<span style="color:#64748b">kein Callsign</span>'}</strong></td>
          <td><code style="color: #fbbf24;">${r.icao_hex || ''}</code></td>
          <td><span style="color: #34d399; font-weight: 600; background: rgba(52, 211, 153, 0.1); padding: 2px 6px; border-radius: 4px;">${r.origin || '-'}</span></td>
          <td><span style="color: #f472b6; font-weight: 600; background: rgba(244, 114, 182, 0.1); padding: 2px 6px; border-radius: 4px;">${r.destination || '-'}</span></td>
          <td style="color: #a7f3d0;">${r.route || r.airline || '-'}</td>
          <td>${r.type_code || ''} ${r.registration ? '(' + r.registration + ')' : ''}</td>
          <td>${r.altitude_min_ft || '-'} / ${r.altitude_max_ft || '-'} ft</td>
          <td>${r.speed_max_kts ? r.speed_max_kts + ' kts' : '-'}</td>
          <td>${r.duration_seconds ? r.duration_seconds + 's' : '-'}</td>
          <td style="color: #94a3b8;">${r.rssi_max ? r.rssi_max + ' dB' : '-'}</td>
        </tr>
      `).join('');
    }

    function filterTable() {
      const q = document.getElementById('search-input').value.toLowerCase().trim();
      if (!q) {
        renderTable(rawRows);
        return;
      }
      const filtered = rawRows.filter(r => 
        (r.callsign && r.callsign.toLowerCase().includes(q)) ||
        (r.icao_hex && r.icao_hex.toLowerCase().includes(q)) ||
        (r.origin && r.origin.toLowerCase().includes(q)) ||
        (r.destination && r.destination.toLowerCase().includes(q)) ||
        (r.route && r.route.toLowerCase().includes(q)) ||
        (r.airline && r.airline.toLowerCase().includes(q)) ||
        (r.registration && r.registration.toLowerCase().includes(q))
      );
      renderTable(filtered);
    }

    async function saveConfig(e) {
      e.preventDefault();
      const source = document.getElementById('cfg-source').value.trim();
      const interval = document.getElementById('cfg-interval').value;
      try {
        const res = await fetch('/api/config', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ source, interval })
        });
        const data = await res.json();
        if (data.success) {
          showAlert(data.message, true);
          loadStatus();
        } else {
          showAlert(data.error || 'Fehler beim Speichern', false);
        }
      } catch (err) {
        showAlert('Verbindungsfehler zum Server', false);
      }
    }

    async function restartTracker() {
      if (!confirm('Möchtest du den Flug-Tracker wirklich zurücksetzen? (Laufende Überflüge werden neu synchronisiert)')) return;
      try {
        const res = await fetch('/api/restart', { method: 'POST' });
        const data = await res.json();
        showAlert(data.message || 'Neu gestartet', true);
        setTimeout(() => { loadStatus(); loadPreview(); }, 1000);
      } catch (e) {
        showAlert('Fehler beim Neustart', false);
      }
    }

    let currentSnippetTab = 'pandas';

    function getCsvUrl() {
      return window.location.origin + '/flights.csv';
    }

    function getSnippets() {
      const csvUrl = getCsvUrl();
      const origin = window.location.origin;
      return {
        pandas: `# 🐍 Python (Pandas) Datenanalyse über HTTP\\nimport pandas as pd\\n\\nurl = "${csvUrl}"\\ndf = pd.read_csv(url)\\n\\nprint(f"Geloggte Flüge: {len(df)}")\\nprint(df[['first_seen_utc', 'callsign', 'airline', 'origin', 'destination', 'altitude_max_ft', 'speed_max_kts']].head(10))\\n\\n# Analyse: Top Airlines\\nprint("\\nTop Airlines:")\\nprint(df['airline'].value_counts().head(5))`,
        duckdb: `-- 🦆 DuckDB / SQL - Direktabfrage über HTTP\\nSELECT \\n    callsign, \\n    airline, \\n    origin || ' ➔ ' || destination AS route, \\n    altitude_max_ft, \\n    speed_max_kts, \\n    first_seen_utc\\nFROM read_csv_auto('${csvUrl}')\\nWHERE callsign IS NOT NULL\\nORDER BY first_seen_utc DESC\\nLIMIT 20;`,
        r: `# 📈 R Data Analysis über HTTP\\nurl <- "${csvUrl}"\\nflights <- read.csv(url, stringsAsFactors = FALSE, encoding = "UTF-8")\\n\\ncat("Flüge gesamt:", nrow(flights), "\\n")\\nhead(flights[, c("first_seen_utc", "callsign", "airline", "origin", "destination")])\\nsummary(flights$altitude_max_ft)`,
        excel: `# 📊 Excel & Google Sheets Live-Datenquelle\\n\\nMicrosoft Excel:\\n1. Menü: Daten ➔ Aus dem Web\\n2. URL eingeben: ${csvUrl}\\n3. 'Laden' wählen (Aktualisiert auf Knopfdruck oder im Intervall)\\n\\nGoogle Sheets (Zelle A1):\\n=IMPORTDATA("${csvUrl}")`,
        curl: `# 💻 cURL & Cronjob Backup\\n# 1. Gesamte CSV herunterladen:\\ncurl -sSL "${csvUrl}" -o /tmp/flights.csv\\n\\n# 2. Nur die neuesten 100 Flüge abfragen:\\ncurl -sSL "${origin}/api/csv?limit=100" -o /tmp/recent_flights.csv\\n\\n# 3. 15-Minuten Cronjob zur Archivierung:\\n# */15 * * * * curl -sSL "${csvUrl}" -o ~/archive_$(date +\\%Y\\%m\\%d_\\%H\\%M).csv`
      };
    }

    function setSnippetTab(tab) {
      currentSnippetTab = tab;
      const tabs = ['pandas', 'duckdb', 'r', 'excel', 'curl'];
      tabs.forEach(t => {
        const btn = document.getElementById('tab-btn-' + t);
        if (btn) {
          if (t === tab) {
            btn.style.background = '#2563eb';
            btn.style.color = '#fff';
            btn.style.borderColor = '#3b82f6';
          } else {
            btn.style.background = '#1e293b';
            btn.style.color = '#cbd5e1';
            btn.style.borderColor = 'transparent';
          }
        }
      });
      const snippets = getSnippets();
      const code = (snippets[tab] || '').replace(/\\n/g, '\n');
      document.getElementById('snippet-code-box').textContent = code;
    }

    function copyCsvUrl() {
      const url = getCsvUrl();
      navigator.clipboard.writeText(url);
      const btn = document.getElementById('btn-copy-csv-url');
      const orig = btn.textContent;
      btn.textContent = '✅ Kopiert!';
      btn.style.background = '#059669';
      setTimeout(() => {
        btn.textContent = orig;
        btn.style.background = '';
      }, 2000);
    }

    function copySnippetCode() {
      const snippets = getSnippets();
      const code = (snippets[currentSnippetTab] || '').replace(/\\n/g, '\n');
      navigator.clipboard.writeText(code);
      const btn = document.getElementById('btn-copy-snippet');
      const orig = btn.textContent;
      btn.textContent = '✅ Code kopiert!';
      setTimeout(() => {
        btn.textContent = orig;
      }, 2000);
    }

    function updateHttpUrls() {
      const csvUrl = getCsvUrl();
      const inputEl = document.getElementById('http-csv-url-input');
      if (inputEl) inputEl.value = csvUrl;
      const openBtn = document.getElementById('btn-open-csv');
      if (openBtn) openBtn.href = csvUrl;
      const dlBtn = document.getElementById('btn-dl-csv');
      if (dlBtn) dlBtn.href = window.location.origin + '/api/csv?download=1';
      setSnippetTab(currentSnippetTab);
    }

    // Initial load & Polling
    updateHttpUrls();
    loadStatus();
    loadLiveAircraft();
    loadPreview();
    setInterval(loadStatus, 3000);
    setInterval(loadLiveAircraft, 2500);
    setInterval(loadPreview, 10000);
  </script>
</body>
</html>
"""
        return html.replace("__WEB_PORT__", str(self.web_port)).replace("__VERSION__", SCRIPT_VERSION)

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
                    sys.stdout.write(f"\r[STATUS] Im Luftraum: {len(self.active_flights)} ({with_cs} mit Flugnr.) | Geloggt: {len(self.logged_uids)} | Web: :{self.web_port}")
                    sys.stdout.flush()
                time.sleep(self.interval)
            except KeyboardInterrupt:
                self.running = False
                break
            except Exception as e:
                print(f"\n[FEHLER im Polling-Loop]: {e}", file=sys.stderr)
                time.sleep(self.interval)

        print("\nBeende Logger... Speichere verbleibende Flüge mit gültiger Flugnummer.")
        with self.lock:
            for h, f in self.active_flights.items():
                if f.has_valid_callsign():
                    uid = f.get_flight_uid(self.dedup_mode)
                    if uid not in self.logged_uids:
                        self._write(f, uid)
                        self.logged_uids.add(uid)


def run_cli_update(repo: str = DEFAULT_GITHUB_REPO, branch: str = DEFAULT_GITHUB_BRANCH, service_name: str = "adsb-logger"):
    print("=" * 60)
    print("ADS-B Logger CLI Update & Dienst-Verwaltung")
    print("=" * 60)
    print(f"[1/4] Prüfe und stoppe laufenden Hintergrunddienst ({service_name}.service)...")
    os.system(f"systemctl stop {service_name}.service 2>/dev/null || true")
    os.system("pkill -f adsb_logger.py 2>/dev/null || true")
    time.sleep(1)
    
    print(f"[2/4] Lade aktuelle adsb_logger.py von GitHub ({repo}@{branch})...")
    url = f"https://raw.githubusercontent.com/{repo}/{branch}/adsb_logger.py"
    req = urllib.request.Request(url, headers={"User-Agent": f"ADSB-Logger-CLI-Updater/{SCRIPT_VERSION}"})
    try:
        with urllib.request.urlopen(req, timeout=10.0) as resp:
            new_code = resp.read().decode("utf-8")
        if "class ADSBLogger" not in new_code:
            raise ValueError("Heruntergeladene Datei ist kein gültiges ADS-B Logger Skript.")
        compile(new_code, "update_test.py", "exec")
    except Exception as e:
        print(f"[FEHLER] Herunterladen oder Syntax-Prüfung fehlgeschlagen: {e}")
        print(f"Starte Dienst '{service_name}.service' wieder...")
        os.system(f"systemctl start {service_name}.service 2>/dev/null || true")
        sys.exit(1)

    script_path = os.path.abspath(__file__)
    tmp_path = script_path + ".tmp"
    bak_path = script_path + ".bak"

    # Backup anlegen
    if os.path.exists(script_path):
        try:
            with open(script_path, "r", encoding="utf-8") as f_cur:
                cur_code = f_cur.read()
            with open(bak_path, "w", encoding="utf-8") as f_bak:
                f_bak.write(cur_code)
        except Exception:
            pass

    # Atomar schreiben
    with open(tmp_path, "w", encoding="utf-8") as f:
        f.write(new_code)
        f.flush()
        try:
            os.fsync(f.fileno())
        except Exception:
            pass
    os.chmod(tmp_path, 0o755)
    os.replace(tmp_path, script_path)
    print(f"[3/4] Skript sicher und atomar aktualisiert ({len(new_code)} Bytes)")

    print(f"[4/4] Starte Hintergrunddienst ({service_name}.service) neu...")
    os.system(f"systemctl start {service_name}.service 2>/dev/null || true")
    time.sleep(1)
    os.system(f"systemctl is-active --quiet {service_name}.service && echo '[✓] Dienst ist aktiv und läuft!' || echo '[!] Bitte Status mit sudo systemctl status {service_name}.service prüfen.'")
    print("=" * 60)


def main():
    parser = argparse.ArgumentParser(description="ADS-B Flugzeug-Logger (Airport Innsbruck 25 NM API via adsb.fi) & Web Dashboard")
    parser.add_argument("--source", "-s", default=DEFAULT_SOURCE, help=f"API-URL (z. B. opendata.adsb.fi API) oder Dateipfad zur aircraft.json (Standard: {DEFAULT_SOURCE})")
    parser.add_argument("--output", "-o", default="flights.csv", help="CSV-Ausgabedatei")
    parser.add_argument("--interval", "-i", type=float, default=5.0, help="Polling-Intervall in Sek")
    parser.add_argument("--timeout", "-t", type=float, default=300.0, help="Inaktivitäts-Timeout in Sek")
    parser.add_argument("--dedup-mode", "-d", choices=["daily", "strict_forever", "hex_only"], default="daily")
    parser.add_argument("--immediate", action="store_true", help="Sofort bei Erhalt der Flugnummer loggen")
    parser.add_argument("--port", "-p", type=int, default=7001, help="Port für das integrierte Webinterface (Standard: 7001)")
    parser.add_argument("--no-adsbdb", action="store_true", help="ADSBDB Online-Routenabfrage deaktivieren")
    parser.add_argument("--update", action="store_true", help="Stoppt den Dienst, lädt die neueste Skript-Version von GitHub herunter und startet den Dienst neu")
    parser.add_argument("--github-repo", default=DEFAULT_GITHUB_REPO, help="GitHub Repository für Updates")
    parser.add_argument("--github-branch", default=DEFAULT_GITHUB_BRANCH, help="GitHub Branch für Updates")
    parser.add_argument("--service-name", default="adsb-logger", help="Name des systemd-Dienstes")
    args = parser.parse_args()

    if args.update:
        run_cli_update(repo=args.github_repo, branch=args.github_branch, service_name=args.service_name)
        return

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
EOF_PYTHON

# Syntaxprüfung vor dem atomaren Austausch
if python3 -m py_compile "$INSTALL_DIR/adsb_logger.py.tmp" &>/dev/null; then
  mv -f "$INSTALL_DIR/adsb_logger.py.tmp" "$INSTALL_DIR/adsb_logger.py"
else
  echo -e "${YELLOW}[!] Warnung bei Syntaxprüfung, übernehme Datei dennoch...${NC}"
  mv -f "$INSTALL_DIR/adsb_logger.py.tmp" "$INSTALL_DIR/adsb_logger.py"
fi

chmod +x "$INSTALL_DIR/adsb_logger.py"
if id "$TARGET_USER" &>/dev/null; then
  chown -R "$TARGET_USER:$TARGET_GROUP" "$INSTALL_DIR" 2>/dev/null || chown -R "$TARGET_USER" "$INSTALL_DIR" 2>/dev/null || true
fi
echo -e "${GREEN}[✓]${NC} Skript sicher installiert in: ${YELLOW}$INSTALL_DIR/adsb_logger.py${NC}"

# Automatischen Update-Befehl auf dem System bereitstellen
cat << 'EOF_UPDATE' > "$INSTALL_DIR/update.sh"
#!/bin/bash
set -e
echo -e "\033[0;34m====================================================\033[0m"
echo -e "\033[0;34m        ADS-B Logger - Automatisches Update         \033[0m"
echo -e "\033[0;34m====================================================\033[0m"
echo -e "[1/4] Halte Dienst adsb-logger.service an..."
systemctl stop adsb-logger.service 2>/dev/null || true
pkill -f adsb_logger.py 2>/dev/null || true
sleep 1
echo -e "[2/4] Lade neueste Version von GitHub (tirolerhut/adsb-flight-tracker@main)..."
curl -sSL "https://raw.githubusercontent.com/tirolerhut/adsb-flight-tracker/main/adsb_logger.py" -o "/opt/adsb-logger/adsb_logger.py.tmp"
if [ -s "/opt/adsb-logger/adsb_logger.py.tmp" ] && python3 -m py_compile "/opt/adsb-logger/adsb_logger.py.tmp" 2>/dev/null; then
  mv -f "/opt/adsb-logger/adsb_logger.py.tmp" "/opt/adsb-logger/adsb_logger.py"
  chmod +x "/opt/adsb-logger/adsb_logger.py"
  echo -e "\033[0;32m[✓] Skript erfolgreich aktualisiert.\033[0m"
else
  echo -e "\033[0;31m[FEHLER] Herunterladen oder Syntaxprüfung fehlgeschlagen.\033[0m"
  rm -f "/opt/adsb-logger/adsb_logger.py.tmp"
fi
echo -e "[3/4] Starte Dienst adsb-logger.service neu..."
systemctl start adsb-logger.service
sleep 1
echo -e "[4/4] Dienst-Status:"
systemctl status adsb-logger.service --no-pager || true
EOF_UPDATE

chmod +x "$INSTALL_DIR/update.sh"
ln -sf "$INSTALL_DIR/update.sh" /usr/local/bin/update-adsb-logger 2>/dev/null || true

# 7. Systemd Hintergrunddienst einrichten
echo -e "${BLUE}[4/5]${NC} Richte systemd Service ein..."

cat << EOF_SERVICE > "$SERVICE_FILE"
[Unit]
Description=ADS-B Flight Logger & Web Control Dashboard (Port $WEB_PORT)
After=network.target readsb.service dump1090-fa.service dump1090.service
Wants=network.target

[Service]
Type=simple
User=$TARGET_USER
Group=$TARGET_GROUP
WorkingDirectory=$DATA_DIR
Environment=PYTHONUNBUFFERED=1
ExecStart=/usr/bin/python3 -u $INSTALL_DIR/adsb_logger.py --source "$TARGET_SOURCE" --output "$DATA_DIR/flights.csv" --interval $POLL_INTERVAL --timeout 300.0 --dedup-mode daily --port $WEB_PORT
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal
Nice=10

[Install]
WantedBy=multi-user.target
EOF_SERVICE

chmod 644 "$SERVICE_FILE"
echo -e "${GREEN}[✓]${NC} Service-Datei erstellt: ${YELLOW}$SERVICE_FILE${NC}"

# 8. Daemon neu laden und Dienst starten
echo -e "${BLUE}[5/5]${NC} Aktiviere und starte Hintergrunddienst..."
systemctl daemon-reload
systemctl enable "adsb-logger.service"
systemctl restart "adsb-logger.service"

sleep 2

# IP-Adresse für Web-Zugriff ermitteln
PI_IP=$(hostname -I 2>/dev/null | awk '{print $1}')
if [ -z "$PI_IP" ]; then
  PI_IP="127.0.0.1"
fi

# Status prüfen
if systemctl is-active --quiet "adsb-logger.service"; then
  echo ""
  echo -e "${GREEN}====================================================${NC}"
  echo -e "${GREEN}  ERFOLG! ADS-B Logger läuft jetzt im Hintergrund!  ${NC}"
  echo -e "${GREEN}====================================================${NC}"
  echo -e ""
  echo -e "🌐 ${BOLD}Web-Dashboard erreichbar unter:${NC}"
  echo -e "   ${CYAN}http://$PI_IP:$WEB_PORT${NC}"
  echo -e "   ${CYAN}http://localhost:$WEB_PORT${NC}"
  echo -e ""
  echo -e "Features im Web-Dashboard:"
  echo -e "  • Live-Status & Uptime"
  echo -e "  • Quelle & Intervall direkt im Browser ändern"
  echo -e "  • Logger per Knopfdruck neu starten"
  echo -e "  • CSV-Inhalt im Live-Statusfenster durchsuchen"
  echo -e "  • CSV-Download & HTTP-Stream (GET /flights.csv)"
  echo -e "  • 1-Klick Online-Update von GitHub"
  echo -e ""
  echo -e "Quelle:             ${YELLOW}$TARGET_SOURCE${NC}"
  echo -e "Intervall:          ${YELLOW}${POLL_INTERVAL} Sekunden${NC}"
  echo -e "CSV-Ausgabedatei:   ${YELLOW}$DATA_DIR/flights.csv${NC}"
  echo -e "Web-Port:           ${YELLOW}$WEB_PORT${NC}"
  echo ""
  echo -e "Service- & Update-Befehle:"
  echo -e "  Schnell-Update:     ${YELLOW}sudo update-adsb-logger${NC}  oder  ${YELLOW}sudo python3 $INSTALL_DIR/adsb_logger.py --update${NC}"
  echo -e "  Status überprüfen:  ${YELLOW}sudo systemctl status adsb-logger.service${NC}"
  echo -e "  Live-Logs ansehen:  ${YELLOW}sudo journalctl -u adsb-logger.service -f${NC}"
  echo -e "  Service stoppen:    ${YELLOW}sudo systemctl stop adsb-logger.service${NC}"
  echo -e "  Service neu starten:${YELLOW}sudo systemctl restart adsb-logger.service${NC}"
  echo ""
else
  echo -e "${RED}[WARNUNG] Der Dienst konnte nicht sofort gestartet werden.${NC}"
  echo -e "Prüfe die Logs mit: ${YELLOW}sudo journalctl -u adsb-logger.service -n 30${NC}"
fi
