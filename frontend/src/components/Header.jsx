import React from 'react';
import { 
  ShieldCheck, 
  Cpu, 
  Boxes, 
  Terminal, 
  Bug, 
  FileCode2, 
  Archive, 
  Send, 
  Settings, 
  Mic, 
  Activity, 
  Server
} from 'lucide-react';

export default function Header({ 
  activeTab, 
  setActiveTab, 
  statusData, 
  onOpenVoiceModal, 
  onOpenSettingsModal 
}) {
  const healthScore = statusData?.health_score ?? 98;
  const isHealthy = healthScore >= 80;
  const isWarning = healthScore >= 50 && healthScore < 80;

  const nodeName = statusData?.host?.os?.node || 'easypanel-vps';
  const osName = statusData?.host?.os?.system || 'Linux';
  const containerCount = statusData?.containers_summary?.total ?? 6;
  const runningCount = statusData?.containers_summary?.running ?? 6;

  const tabs = [
    { id: 'overview', label: 'War Room', icon: Activity },
    { id: 'containers', label: `Containeres (${runningCount}/${containerCount})`, icon: Boxes },
    { id: 'agent', label: 'SRE Brain & IA', icon: Terminal },
    { id: 'debugger', label: 'Code Debugger', icon: Bug },
    { id: 'iac', label: 'IaC Studio (Terraform)', icon: FileCode2 },
    { id: 'backups', label: 'Backups & DR', icon: Archive },
    { id: 'telegram', label: 'Telegram Bot', icon: Send },
  ];

  return (
    <header className="border-b border-[var(--border-subtle)] bg-[var(--bg-surface)] sticky top-0 z-40 backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Top Bar */}
        <div className="flex items-center justify-between py-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-cyan-500 via-blue-600 to-indigo-600 flex items-center justify-center shadow-lg shadow-cyan-500/20">
              <ShieldCheck className="w-6 h-6 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
                  Aegis<span className="text-[var(--accent-cyan)]">SRE</span>
                </h1>
                <span className="badge badge-cyan text-[10px] py-0.5 px-2">v1.0.0 Autônomo</span>
                <span className="text-xs text-[var(--text-muted)] flex items-center gap-1 font-mono">
                  <Server className="w-3.5 h-3.5" /> {nodeName} ({osName})
                </span>
              </div>
              <p className="text-xs text-[var(--text-secondary)]">
                Agente SRE Principal & Arquitetura DevOps • Easypanel & Docker
              </p>
            </div>
          </div>

          {/* Quick Metrics & Actions */}
          <div className="flex items-center gap-3">
            {/* Health Score Pill */}
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-[var(--bg-surface-elevated)] border border-[var(--border-subtle)]">
              <span className={`live-indicator ${isHealthy ? '' : isWarning ? 'live-indicator-warning' : 'live-indicator-danger'}`}></span>
              <span className="text-xs font-semibold text-slate-300">Health Score:</span>
              <span className={`text-xs font-bold font-mono ${isHealthy ? 'text-emerald-400' : isWarning ? 'text-amber-400' : 'text-rose-400'}`}>
                {healthScore}%
              </span>
            </div>

            {/* Voice Command Button */}
            <button 
              onClick={onOpenVoiceModal}
              className="btn btn-accent text-xs py-1.5 px-3 flex items-center gap-1.5 shadow-md shadow-purple-500/20"
              title="Falar com o Agente por Voz (Groq Whisper)"
            >
              <Mic className="w-3.5 h-3.5" />
              <span>Voz (Whisper)</span>
            </button>

            {/* Settings Button */}
            <button 
              onClick={onOpenSettingsModal}
              className="btn btn-ghost text-xs p-2 rounded-lg border border-[var(--border-subtle)]"
              title="Configurações (Groq API, Telegram Token)"
            >
              <Settings className="w-4 h-4 text-slate-300" />
            </button>
          </div>
        </div>

        {/* Navigation Tabs */}
        <nav className="flex space-x-1 overflow-x-auto py-2 border-t border-[var(--border-subtle)]/50 no-scrollbar">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
                  isActive
                    ? 'bg-[var(--bg-surface-elevated)] text-[var(--accent-cyan)] border border-[var(--border-glow)] shadow-sm'
                    : 'text-[var(--text-secondary)] hover:text-white hover:bg-[var(--bg-surface-elevated)]/50'
                }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? 'text-[var(--accent-cyan)]' : 'text-[var(--text-muted)]'}`} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
