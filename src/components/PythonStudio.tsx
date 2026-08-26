import React, { useState } from 'react';
import { PYTHON_SCRIPT_CODE, generateSystemdService, generateInstallerBashScript } from '../utils/pythonScript';
import { Code2, Download, Copy, Check, Server, HelpCircle, Settings, Cpu, ShieldCheck, Sparkles, Terminal, Globe } from 'lucide-react';

export const PythonStudio: React.FC = () => {
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedCli, setCopiedCli] = useState(false);
  const [copiedService, setCopiedService] = useState(false);
  const [copiedInstaller, setCopiedInstaller] = useState(false);
  const [copiedQuickCmd, setCopiedQuickCmd] = useState(false);
  const [copiedCurlCmd, setCopiedCurlCmd] = useState(false);
  const [copiedWgetCmd, setCopiedWgetCmd] = useState(false);

  // GitHub repo configuration for 1-liner install
  const [githubRepo, setGithubRepo] = useState('tirolerhut/adsb-flight-tracker');
  const [githubBranch, setGithubBranch] = useState('main');

  // Customizer state
  const [sourceType, setSourceType] = useState<'local' | 'url'>('url');
  const [sourcePath, setSourcePath] = useState('https://opendata.adsb.fi/api/v3/lat/47.259665/lon/11.3431121/dist/25');
  const [outputPath, setOutputPath] = useState('flights.csv');
  const [interval, setInterval] = useState(5);
  const [timeout, setTimeoutVal] = useState(300);
  const [dedupMode, setDedupMode] = useState<'daily' | 'strict_forever' | 'hex_only'>('daily');
  const [immediate, setImmediate] = useState(false);

  // Installer configuration
  const [installDir, setInstallDir] = useState('/opt/adsb-logger');
  const [csvDir, setCsvDir] = useState('/home/pi/adsb-data');
  const [serviceName, setServiceName] = useState('adsb-logger');

  const [activeSubTab, setActiveSubTab] = useState<'installer' | 'webui' | 'script' | 'service' | 'guide'>('installer');

  // Generated CLI Command
  const generatedCommand = `python3 adsb_logger.py --source "${sourcePath}" --output "${outputPath}" --interval ${interval} --timeout ${timeout} --dedup-mode ${dedupMode}${immediate ? ' --immediate' : ''}`;

  const rawScriptUrl = `https://raw.githubusercontent.com/${githubRepo}/${githubBranch}/install_adsb_logger.sh`;
  const githubCurlCommand = `curl -sSL ${rawScriptUrl} | sudo bash`;
  const githubWgetCommand = `wget -qO- ${rawScriptUrl} | sudo bash`;

  const systemdContent = generateSystemdService(`${installDir}/adsb_logger.py`, `${csvDir}/${outputPath}`, sourcePath, 'pi');
  const installerScriptContent = generateInstallerBashScript({
    installDir,
    csvDir,
    serviceName,
    defaultSource: sourcePath,
    defaultNetworkUrl: 'http://192.168.1.200/data/aircraft.json',
    defaultInterval: interval,
    githubRepo,
    githubBranch
  });

  const handleDownloadScript = () => {
    const blob = new Blob([PYTHON_SCRIPT_CODE], { type: 'text/x-python;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'adsb_logger.py';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleDownloadInstaller = () => {
    const blob = new Blob([installerScriptContent], { type: 'text/x-shellscript;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'install_adsb_logger.sh';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleCopy = (text: string, setFn: (val: boolean) => void) => {
    navigator.clipboard.writeText(text);
    setFn(true);
    setTimeout(() => setFn(false), 2000);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 bg-indigo-50 text-indigo-600 rounded flex items-center justify-center">
              <Cpu className="w-3.5 h-3.5" />
            </div>
            <h2 className="text-base font-bold text-slate-900">Raspberry Pi ADS-B Logger &amp; Setup-Wizard</h2>
            <span className="bg-emerald-50 text-emerald-700 text-xs px-2.5 py-0.5 rounded-full border border-emerald-100 font-mono font-semibold">
              Automatischer Daemon
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Installationsskript für den 24/7 Hintergrundbetrieb auf dem Raspberry Pi (readsb / dump1090) inkl. systemd-Dienst.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={handleDownloadInstaller}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white shadow-2xs transition-all cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>install_adsb_logger.sh</span>
          </button>

          <button
            onClick={handleDownloadScript}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white shadow-2xs transition-all cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>adsb_logger.py</span>
          </button>
        </div>
      </div>

      {/* 1-Line GitHub One-Liner Banner */}
      <div className="bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 border border-slate-800 rounded-xl p-5 text-white shadow-md space-y-3.5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md bg-emerald-500/20 text-emerald-400 flex items-center justify-center border border-emerald-500/30">
              <Terminal className="w-3.5 h-3.5" />
            </div>
            <div>
              <span className="text-xs font-bold text-slate-100 uppercase tracking-wide flex items-center gap-1.5">
                1-Befehl-Installation via GitHub
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              </span>
              <p className="text-[11px] text-slate-400">
                Direkt im Terminal des Raspberry Pi ausführen (lädt das Skript von GitHub und startet das Setup)
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs">
            <label className="text-slate-400 text-[11px]">GitHub Repo:</label>
            <input
              type="text"
              value={githubRepo}
              onChange={(e) => setGithubRepo(e.target.value)}
              className="px-2 py-1 bg-slate-900 border border-slate-700 rounded text-emerald-300 font-mono text-[11px] w-48 focus:outline-none focus:border-indigo-400"
              placeholder="user/repo"
            />
          </div>
        </div>

        {/* Primary curl command */}
        <div className="space-y-1.5">
          <div className="text-[11px] text-slate-400 font-medium flex items-center justify-between">
            <span>Option 1: curl (Standard)</span>
            <span className="text-[10px] text-slate-500 font-mono">fragt Variante (1/2), Netzwerkpfad &amp; Intervall interaktiv ab</span>
          </div>
          <div className="bg-black/70 p-3 rounded-lg border border-slate-800 flex items-center justify-between gap-3">
            <div className="font-mono text-xs text-emerald-400 select-all overflow-x-auto py-0.5 whitespace-nowrap">
              {githubCurlCommand}
            </div>
            <button
              onClick={() => handleCopy(githubCurlCommand, setCopiedCurlCmd)}
              className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-md text-xs font-semibold transition-all cursor-pointer shadow-xs"
            >
              {copiedCurlCmd ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedCurlCmd ? 'Kopiert!' : 'Befehl kopieren'}</span>
            </button>
          </div>
        </div>

        {/* Alternative wget command */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 pt-1 border-t border-slate-800/80 text-[11px]">
          <div className="flex items-center gap-2 text-slate-400">
            <span className="text-slate-500">Alternative mit wget:</span>
            <code className="bg-slate-900 px-2 py-0.5 rounded text-slate-300 font-mono select-all">
              {githubWgetCommand}
            </code>
          </div>
          <button
            onClick={() => handleCopy(githubWgetCommand, setCopiedWgetCmd)}
            className="text-xs text-slate-400 hover:text-slate-200 flex items-center gap-1 cursor-pointer"
          >
            {copiedWgetCmd ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
            <span>wget-Befehl kopieren</span>
          </button>
        </div>
      </div>

      {/* CLI Customizer & Generator Card */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 shadow-xs space-y-4">
        <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
          <div className="w-5 h-5 bg-indigo-50 text-indigo-600 rounded flex items-center justify-center">
            <Settings className="w-3.5 h-3.5" />
          </div>
          <h3 className="text-sm font-bold text-slate-800">Standard-Vorgaben &amp; Pfade für das Skript</h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
          {/* Source Path / URL */}
          <div>
            <label className="text-slate-600 block font-semibold mb-1">Quelle (aircraft.json Pfad oder URL)</label>
            <div className="flex gap-1 mb-1.5 flex-wrap">
              <button
                type="button"
                onClick={() => { setSourceType('url'); setSourcePath('https://opendata.adsb.fi/api/v3/lat/47.259665/lon/11.3431121/dist/25'); }}
                className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors ${sourcePath.includes('adsb.fi') ? 'bg-indigo-600 text-white shadow-2xs font-semibold' : 'bg-slate-100 text-slate-600 hover:text-slate-900'}`}
              >
                📍 Innsbruck 25 NM (adsb.fi)
              </button>
              <button
                type="button"
                onClick={() => { setSourceType('local'); setSourcePath('/run/readsb/aircraft.json'); }}
                className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors ${sourcePath === '/run/readsb/aircraft.json' ? 'bg-indigo-600 text-white shadow-2xs' : 'bg-slate-100 text-slate-600 hover:text-slate-900'}`}
              >
                readsb / tar1090
              </button>
              <button
                type="button"
                onClick={() => { setSourceType('local'); setSourcePath('/run/dump1090-fa/aircraft.json'); }}
                className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors ${sourcePath === '/run/dump1090-fa/aircraft.json' ? 'bg-indigo-600 text-white shadow-2xs' : 'bg-slate-100 text-slate-600 hover:text-slate-900'}`}
              >
                dump1090-fa
              </button>
              <button
                type="button"
                onClick={() => { setSourceType('url'); setSourcePath('http://192.168.1.200/data/aircraft.json'); }}
                className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors ${sourcePath === 'http://192.168.1.200/data/aircraft.json' ? 'bg-indigo-600 text-white shadow-2xs' : 'bg-slate-100 text-slate-600 hover:text-slate-900'}`}
              >
                LAN-URL
              </button>
            </div>
            <input
              type="text"
              value={sourcePath}
              onChange={(e) => setSourcePath(e.target.value)}
              className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-slate-800 font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500 text-xs shadow-2xs"
            />
          </div>

          {/* Installation Directory & CSV Directory */}
          <div>
            <label className="text-slate-600 block font-semibold mb-1">Installations- &amp; Datenordner</label>
            <input
              type="text"
              value={installDir}
              onChange={(e) => setInstallDir(e.target.value)}
              className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-slate-800 font-mono mb-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-xs shadow-2xs"
              placeholder="/opt/adsb-logger"
            />
            <input
              type="text"
              value={csvDir}
              onChange={(e) => setCsvDir(e.target.value)}
              className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-slate-800 font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500 text-xs shadow-2xs"
              placeholder="/home/pi/adsb-data"
            />
          </div>

          {/* Deduplication & Timeout */}
          <div>
            <label className="text-slate-600 block font-semibold mb-1">Deduplizierungs-Strategie &amp; Intervall</label>
            <select
              value={dedupMode}
              onChange={(e) => setDedupMode(e.target.value as any)}
              className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-slate-800 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 mb-1.5 shadow-2xs"
            >
              <option value="daily">Täglich 1x pro Hex+Callsign (Standard)</option>
              <option value="strict_forever">Streng 1x für immer (Hex+Callsign)</option>
              <option value="hex_only">1x pro Hex-Adresse pro Tag</option>
            </select>
            <div className="flex items-center justify-between text-slate-500 text-[11px]">
              <span>Abfrage alle:</span>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  min="1"
                  max="60"
                  value={interval}
                  onChange={(e) => setInterval(Number(e.target.value))}
                  className="w-14 px-1.5 py-0.5 bg-white border border-slate-200 rounded-md text-slate-800 font-mono text-center shadow-2xs"
                />
                <span>Sek</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs for Subviews */}
      <div className="flex border-b border-slate-200 text-xs font-medium space-x-6 overflow-x-auto">
        <button
          onClick={() => setActiveSubTab('installer')}
          className={`pb-2.5 border-b-2 transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
            activeSubTab === 'installer' ? 'border-emerald-600 text-emerald-700 font-bold' : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Cpu className="w-3.5 h-3.5" />
          Installationsskript (install_adsb_logger.sh)
        </button>

        <button
          onClick={() => setActiveSubTab('webui')}
          className={`pb-2.5 border-b-2 transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
            activeSubTab === 'webui' ? 'border-sky-600 text-sky-600 font-bold' : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Globe className="w-3.5 h-3.5" />
          Web-Dashboard (Port 7001)
        </button>

        <button
          onClick={() => setActiveSubTab('script')}
          className={`pb-2.5 border-b-2 transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
            activeSubTab === 'script' ? 'border-indigo-600 text-indigo-600 font-bold' : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Code2 className="w-3.5 h-3.5" />
          Python Quellcode (adsb_logger.py)
        </button>

        <button
          onClick={() => setActiveSubTab('service')}
          className={`pb-2.5 border-b-2 transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
            activeSubTab === 'service' ? 'border-indigo-600 text-indigo-600 font-bold' : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Server className="w-3.5 h-3.5" />
          systemd Service ({serviceName}.service)
        </button>

        <button
          onClick={() => setActiveSubTab('guide')}
          className={`pb-2.5 border-b-2 transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
            activeSubTab === 'guide' ? 'border-indigo-600 text-indigo-600 font-bold' : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <HelpCircle className="w-3.5 h-3.5" />
          Installationsanleitung &amp; Befehle
        </button>
      </div>

      {/* Tab 1: Installer Script */}
      {activeSubTab === 'installer' && (
        <div className="space-y-4">
          <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 text-xs text-slate-600 space-y-3 shadow-xs">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h4 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-600" />
                  Was erledigt das Installationsskript automatisch?
                </h4>
                <p className="mt-1 leading-relaxed">
                  Dieses Bash-Skript bereitet den Raspberry Pi vollständig für den unbeaufsichtigten 24/7 Betrieb vor:
                </p>
              </div>
              <button
                onClick={handleDownloadInstaller}
                className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-semibold text-xs transition-all shadow-2xs cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>install_adsb_logger.sh herunterladen</span>
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2">
              <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
                <span className="font-bold text-slate-800 block mb-1">1. Paket- &amp; Modulprüfung</span>
                <span className="text-slate-500 text-[11px]">Prüft und installiert automatisch alle Systempakete (<code className="text-indigo-600 font-mono">python3</code>, <code className="text-indigo-600 font-mono">curl</code>, <code className="text-indigo-600 font-mono">gawk</code>) sowie die Python-Standardmodule.</span>
              </div>
              <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
                <span className="font-bold text-slate-800 block mb-1">2. Auto-Erkennung &amp; Ordner</span>
                <span className="text-slate-500 text-[11px]">Scannt nach aktiver <code className="text-indigo-600 font-mono">aircraft.json</code>, legt <code className="text-indigo-600 font-mono">{installDir}</code> &amp; CSV-Ordner an und setzt Benutzerrechte.</span>
              </div>
              <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
                <span className="font-bold text-slate-800 block mb-1">3. systemd Autostart</span>
                <span className="text-slate-500 text-[11px]">Erstellt die Service-Unit, aktiviert Autostart bei jedem Pi-Boot und startet den Logger &amp; Webserver (Port 7001) sofort.</span>
              </div>
            </div>
          </div>

          <div className="bg-slate-950 border border-slate-800 rounded-xl overflow-hidden shadow-xs">
            <div className="p-3 bg-slate-900 border-b border-slate-800 flex items-center justify-between text-xs">
              <span className="font-mono text-slate-300 font-semibold">install_adsb_logger.sh (Bash Setup Script)</span>
              <button
                onClick={() => handleCopy(installerScriptContent, setCopiedInstaller)}
                className="flex items-center gap-1 text-emerald-400 hover:text-emerald-300 font-semibold cursor-pointer"
              >
                {copiedInstaller ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedInstaller ? 'Kopiert!' : 'Skript kopieren'}</span>
              </button>
            </div>
            <pre className="p-4 text-xs font-mono text-slate-300 overflow-x-auto leading-relaxed max-h-[550px] select-all">
              <code>{installerScriptContent}</code>
            </pre>
          </div>
        </div>
      )}

      {/* Tab: Web Dashboard (Port 7001) */}
      {activeSubTab === 'webui' && (
        <div className="space-y-4">
          {/* Overview Banner */}
          <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 text-xs text-slate-600 space-y-3 shadow-xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h4 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                  <Globe className="w-4 h-4 text-sky-600" />
                  Integrierte Weboberfläche auf Port 7001
                </h4>
                <p className="mt-1 leading-relaxed">
                  Der Python-Daemon betreibt einen leichtgewichtigen Multithreading-HTTP-Server (<code className="text-indigo-600 font-mono">http://&lt;Pi-IP&gt;:7001</code>),
                  der keine externen Webserver (wie Apache oder Nginx) benötigt.
                </p>
              </div>
              <div className="shrink-0 flex items-center gap-2">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 font-semibold border border-emerald-200 text-xs">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                  Port 7001 aktiv
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-2">
              <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
                <span className="font-bold text-slate-800 block mb-1">1. Live Status &amp; Uptime</span>
                <span className="text-slate-500 text-[11px]">Echtzeit-Statistiken über aktive Flugzeuge, erfasste Rufzeichen und CSV-Dateigröße.</span>
              </div>
              <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
                <span className="font-bold text-slate-800 block mb-1">2. Konfiguration im Browser</span>
                <span className="text-slate-500 text-[11px]">Quelle (URL/Pfad) und Polling-Intervall live ohne SSH oder Neustart umstellen.</span>
              </div>
              <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
                <span className="font-bold text-slate-800 block mb-1">3. Live Statusfenster &amp; Suche</span>
                <span className="text-slate-500 text-[11px]">Tabelle mit den zuletzt geloggten Flügen, inkl. schneller Such- &amp; Filterfunktion.</span>
              </div>
              <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
                <span className="font-bold text-slate-800 block mb-1">4. Direkter CSV-Download</span>
                <span className="text-slate-500 text-[11px]">1-Klick Download der vollständigen <code className="text-indigo-600 font-mono">flights.csv</code> direkt über den Browser.</span>
              </div>
            </div>
          </div>

          {/* Interactive Web UI Simulation Mockup */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-md text-white">
            <div className="bg-slate-950 px-4 py-3 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="flex gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-full bg-red-500/80"></div>
                  <div className="w-2.5 h-2.5 rounded-full bg-amber-500/80"></div>
                  <div className="w-2.5 h-2.5 rounded-full bg-emerald-500/80"></div>
                </div>
                <span className="text-xs font-mono text-slate-400 ml-2">http://raspberrypi.local:7001</span>
              </div>
              <span className="text-[11px] bg-sky-500/20 text-sky-300 px-2 py-0.5 rounded border border-sky-500/30 font-mono">Vorschau Web-Dashboard</span>
            </div>

            <div className="p-4 space-y-4 text-xs">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-slate-800/80 border border-slate-700/70 rounded-lg p-3">
                  <div className="text-[10px] uppercase tracking-wider text-slate-400">Aktive Flugzeuge</div>
                  <div className="text-lg font-bold text-white mt-0.5">14</div>
                  <div className="text-[10px] text-emerald-400">11 mit Flugnummer</div>
                </div>
                <div className="bg-slate-800/80 border border-slate-700/70 rounded-lg p-3">
                  <div className="text-[10px] uppercase tracking-wider text-slate-400">Geloggte Flüge</div>
                  <div className="text-lg font-bold text-white mt-0.5">248</div>
                  <div className="text-[10px] text-slate-400">CSV-Größe: 42 KB</div>
                </div>
                <div className="bg-slate-800/80 border border-slate-700/70 rounded-lg p-3">
                  <div className="text-[10px] uppercase tracking-wider text-slate-400">Intervall / Uptime</div>
                  <div className="text-lg font-bold text-white mt-0.5">{interval}s</div>
                  <div className="text-[10px] text-slate-400">12:34:56 Std.</div>
                </div>
                <div className="bg-slate-800/80 border border-slate-700/70 rounded-lg p-3">
                  <div className="text-[10px] uppercase tracking-wider text-slate-400">Quelle</div>
                  <div className="text-xs font-mono text-sky-400 truncate mt-1">{sourcePath}</div>
                  <div className="text-[10px] text-emerald-400">Zyklus: vor 2s</div>
                </div>
              </div>

              {/* API Endpoints Reference Card */}
              <div className="bg-slate-950 rounded-lg p-3.5 border border-slate-800 space-y-2">
                <span className="font-bold text-slate-200 text-xs block">Verfügbare REST-Endpunkte auf Port 7001:</span>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-[11px] font-mono">
                  <div className="bg-slate-900 p-2 rounded border border-slate-800">
                    <span className="text-emerald-400 font-bold">GET /api/status</span>
                    <span className="text-slate-400 block text-[10px] font-sans">JSON-Status, Flugzahlen, Intervall, Fehlerstatus</span>
                  </div>
                  <div className="bg-slate-900 p-2 rounded border border-slate-800">
                    <span className="text-sky-400 font-bold">POST /api/config</span>
                    <span className="text-slate-400 block text-[10px] font-sans">Quelle &amp; Intervall dynamisch ohne Neustart ändern</span>
                  </div>
                  <div className="bg-slate-900 p-2 rounded border border-slate-800">
                    <span className="text-amber-400 font-bold">POST /api/restart</span>
                    <span className="text-slate-400 block text-[10px] font-sans">Logger-State zurücksetzen &amp; neu starten</span>
                  </div>
                  <div className="bg-slate-900 p-2 rounded border border-slate-800">
                    <span className="text-emerald-400 font-bold">GET /api/csv</span>
                    <span className="text-slate-400 block text-[10px] font-sans">Download der gesamten CSV-Datei</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: Python Script */}
      {activeSubTab === 'script' && (
        <div className="bg-slate-950 border border-slate-800 rounded-xl overflow-hidden shadow-xs">
          <div className="p-3 bg-slate-900 border-b border-slate-800 flex items-center justify-between text-xs">
            <span className="font-mono text-slate-300 font-medium">adsb_logger.py — Python 3 (Keine externen pip-Pakete nötig)</span>
            <span className="text-[11px] text-emerald-400 font-semibold">✓ Inkl. ADSBDB Online-Abfrage &amp; Flugnummer-Gating</span>
          </div>
          <pre className="p-4 overflow-x-auto text-xs font-mono text-slate-300 leading-relaxed max-h-[600px] select-all">
            <code>{PYTHON_SCRIPT_CODE}</code>
          </pre>
        </div>
      )}

      {/* Tab 3: systemd Service */}
      {activeSubTab === 'service' && (
        <div className="space-y-4">
          <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 text-xs text-slate-600 space-y-2 shadow-xs">
            <h4 className="font-bold text-slate-900 text-sm flex items-center gap-2">
              <div className="w-5 h-5 bg-indigo-50 text-indigo-600 rounded flex items-center justify-center">
                <Server className="w-3.5 h-3.5" />
              </div>
              24/7 Dauerbetrieb auf Raspberry Pi als Hintergrunddienst
            </h4>
            <p className="leading-relaxed">
              Damit das Skript rund um die Uhr läuft und bei einem Neustart des Raspberry Pi automatisch mit startet,
              wird die folgende systemd-Service-Datei verwendet (wird von <code className="text-emerald-700 font-mono font-semibold">install_adsb_logger.sh</code> automatisch angelegt).
            </p>
          </div>

          <div className="bg-slate-950 border border-slate-800 rounded-xl overflow-hidden shadow-xs">
            <div className="p-3 bg-slate-900 border-b border-slate-800 flex items-center justify-between text-xs">
              <span className="font-mono text-slate-300 font-semibold">/etc/systemd/system/{serviceName}.service</span>
              <button
                onClick={() => handleCopy(systemdContent, setCopiedService)}
                className="flex items-center gap-1 text-indigo-400 hover:text-indigo-300 font-semibold cursor-pointer"
              >
                {copiedService ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedService ? 'Kopiert!' : 'Service kopieren'}</span>
              </button>
            </div>
            <pre className="p-4 text-xs font-mono text-slate-300 overflow-x-auto select-all">
              <code>{systemdContent}</code>
            </pre>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 text-xs space-y-2 font-mono text-slate-700 shadow-xs">
            <p className="text-slate-800 font-sans font-bold">Dienst- & Update-Befehle auf dem Raspberry Pi:</p>
            <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 space-y-1.5 text-emerald-400">
              <p className="text-amber-400">sudo update-adsb-logger              # Stoppt Dienst, aktualisiert Skript &amp; startet neu</p>
              <p>sudo systemctl status {serviceName}.service     # Status prüfen</p>
              <p>sudo journalctl -u {serviceName}.service -f     # Live-Logs anzeigen</p>
              <p>sudo systemctl restart {serviceName}.service    # Dienst neu starten</p>
              <p>sudo systemctl stop {serviceName}.service       # Dienst stoppen</p>
            </div>
            <p className="text-slate-500 font-sans text-[11px] pt-1">
              ✓ <strong>Sicheres Update garantiert:</strong> Sowohl der Installer als auch das Web-Update halten den aktiven Dienst vor dem Überschreiben der Skriptdatei automatisch an und führen eine atomare Aktualisierung mit Syntax-Prüfung durch.
            </p>
          </div>
        </div>
      )}

      {/* Tab 4: Guide & Troubleshooting */}
      {activeSubTab === 'guide' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs text-slate-600">
          <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 space-y-3 shadow-xs">
            <h4 className="font-bold text-slate-900 text-sm">Schritt-für-Schritt Installation:</h4>
            <ol className="list-decimal list-inside space-y-2.5 text-slate-700">
              <li className="bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                <span className="font-semibold block text-slate-900">1. Skript auf den Raspberry Pi übertragen</span>
                <span className="text-slate-500 font-mono text-[11px]">scp install_adsb_logger.sh pi@raspberrypi.local:~</span>
              </li>
              <li className="bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                <span className="font-semibold block text-slate-900">2. Installer ausführen</span>
                <span className="text-slate-500 font-mono text-[11px]">sudo bash install_adsb_logger.sh</span>
              </li>
              <li className="bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                <span className="font-semibold block text-slate-900">3. Live-Status überprüfen</span>
                <span className="text-slate-500 font-mono text-[11px]">sudo journalctl -u adsb-logger -f</span>
              </li>
              <li className="bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                <span className="font-semibold block text-slate-900">4. CSV-Einträge verfolgen</span>
                <span className="text-slate-500 font-mono text-[11px]">tail -f ~/adsb-data/flights.csv</span>
              </li>
              <li className="bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                <span className="font-semibold block text-slate-900">5. Sicheres Skript-Update</span>
                <span className="text-slate-500 font-mono text-[11px]">sudo update-adsb-logger <span className="text-slate-400 font-sans">(oder im Web-Dashboard)</span></span>
              </li>
            </ol>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 space-y-3 shadow-xs">
            <h4 className="font-bold text-slate-900 text-sm">Typische Speicherorte für aircraft.json:</h4>
            <ul className="space-y-2">
              <li className="bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                <span className="font-bold text-indigo-600 block font-mono">/run/readsb/aircraft.json</span>
                <span className="text-slate-500 text-[11px]">Standard bei readsb / tar1090 (im schnellen RAM-Dateisystem).</span>
              </li>
              <li className="bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                <span className="font-bold text-indigo-600 block font-mono">/run/dump1090-fa/aircraft.json</span>
                <span className="text-slate-500 text-[11px]">FlightAware PiAware / dump1090-fa Standardpfad.</span>
              </li>
              <li className="bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                <span className="font-bold text-indigo-600 block font-mono">http://&lt;IP-Adresse&gt;/dump1090/data/aircraft.json</span>
                <span className="text-slate-500 text-[11px]">Netzwerk-Quelle über HTTP.</span>
              </li>
            </ul>
          </div>
        </div>
      )}
    </div>
  );
};
