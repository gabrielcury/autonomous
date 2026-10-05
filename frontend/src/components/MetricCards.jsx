import React from 'react';
import { Cpu, HardDrive, Network, Clock, Activity, Zap } from 'lucide-react';

export default function MetricCards({ hostData }) {
  const cpu = hostData?.cpu || { overall_percent: 0, cores: 4, load_avg: [0, 0, 0] };
  const memory = hostData?.memory || { used_gb: 0, total_gb: 0, percent: 0, free_gb: 0 };
  const disk = hostData?.disks?.[0] || { used_gb: 0, total_gb: 0, percent: 0, mountpoint: '/' };
  const network = hostData?.network || { kb_sent_per_sec: 0, kb_recv_per_sec: 0 };
  const uptime = hostData?.os?.uptime_human || '0h 0m';

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      {/* CPU Card */}
      <div className="glass-panel p-4 flex flex-col justify-between relative overflow-hidden group">
        <div className="absolute top-0 right-0 w-24 h-24 bg-cyan-500/5 rounded-full blur-xl group-hover:bg-cyan-500/10 transition-all pointer-events-none" />
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-cyan-500/10 text-[var(--accent-cyan)]">
              <Cpu className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-xs font-semibold text-slate-400">Processador (CPU)</h3>
              <p className="text-lg font-bold font-mono text-white">{cpu.overall_percent}%</p>
            </div>
          </div>
          <span className="badge badge-cyan text-[11px] font-mono">{cpu.cores} Cores</span>
        </div>
        
        {/* Progress Bar */}
        <div className="w-full bg-slate-800 rounded-full h-2 mb-2 overflow-hidden">
          <div 
            className="h-full bg-gradient-to-r from-cyan-500 to-blue-500 rounded-full transition-all duration-500"
            style={{ width: `${Math.min(cpu.overall_percent, 100)}%` }}
          />
        </div>

        <div className="flex items-center justify-between text-[11px] text-slate-400 font-mono">
          <span>Load Avg:</span>
          <span className="text-slate-200">
            {cpu.load_avg?.[0] || 0} • {cpu.load_avg?.[1] || 0} • {cpu.load_avg?.[2] || 0}
          </span>
        </div>
      </div>

      {/* Memory Card */}
      <div className="glass-panel p-4 flex flex-col justify-between relative overflow-hidden group">
        <div className="absolute top-0 right-0 w-24 h-24 bg-purple-500/5 rounded-full blur-xl group-hover:bg-purple-500/10 transition-all pointer-events-none" />
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-purple-500/10 text-purple-400">
              <Activity className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-xs font-semibold text-slate-400">Memória RAM</h3>
              <p className="text-lg font-bold font-mono text-white">{memory.percent}%</p>
            </div>
          </div>
          <span className="text-xs text-slate-400 font-mono">
            {memory.used_gb} / {memory.total_gb} GB
          </span>
        </div>

        {/* Progress Bar */}
        <div className="w-full bg-slate-800 rounded-full h-2 mb-2 overflow-hidden">
          <div 
            className={`h-full rounded-full transition-all duration-500 ${
              memory.percent > 85 ? 'bg-gradient-to-r from-rose-500 to-red-600' : 'bg-gradient-to-r from-purple-500 to-indigo-500'
            }`}
            style={{ width: `${Math.min(memory.percent, 100)}%` }}
          />
        </div>

        <div className="flex items-center justify-between text-[11px] text-slate-400 font-mono">
          <span>Livre: {memory.free_gb} GB</span>
          <span>Swap: {memory.swap_used_gb || 0} GB</span>
        </div>
      </div>

      {/* Disk Storage Card */}
      <div className="glass-panel p-4 flex flex-col justify-between relative overflow-hidden group">
        <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/5 rounded-full blur-xl group-hover:bg-emerald-500/10 transition-all pointer-events-none" />
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400">
              <HardDrive className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-xs font-semibold text-slate-400">Armazenamento ({disk.mountpoint || '/'})</h3>
              <p className="text-lg font-bold font-mono text-white">{disk.percent}%</p>
            </div>
          </div>
          <span className="text-xs text-slate-400 font-mono">
            {disk.used_gb} / {disk.total_gb} GB
          </span>
        </div>

        {/* Progress Bar */}
        <div className="w-full bg-slate-800 rounded-full h-2 mb-2 overflow-hidden">
          <div 
            className="h-full bg-gradient-to-r from-emerald-500 to-teal-500 rounded-full transition-all duration-500"
            style={{ width: `${Math.min(disk.percent, 100)}%` }}
          />
        </div>

        <div className="flex items-center justify-between text-[11px] text-slate-400 font-mono">
          <span>Disponível:</span>
          <span className="text-slate-200">{disk.free_gb || 0} GB livres</span>
        </div>
      </div>

      {/* Network & Uptime Card */}
      <div className="glass-panel p-4 flex flex-col justify-between relative overflow-hidden group">
        <div className="absolute top-0 right-0 w-24 h-24 bg-amber-500/5 rounded-full blur-xl group-hover:bg-amber-500/10 transition-all pointer-events-none" />
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-amber-500/10 text-amber-400">
              <Network className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-xs font-semibold text-slate-400">Rede I/O (Taxa)</h3>
              <p className="text-sm font-bold font-mono text-white">
                ↑ {network.kb_sent_per_sec || 0} KB/s
              </p>
            </div>
          </div>
          <div className="text-right">
            <span className="text-xs font-bold font-mono text-cyan-400">
              ↓ {network.kb_recv_per_sec || 0} KB/s
            </span>
          </div>
        </div>

        <div className="pt-2 border-t border-slate-800 flex items-center justify-between text-[11px] text-slate-400">
          <span className="flex items-center gap-1">
            <Clock className="w-3.5 h-3.5 text-slate-500" /> Uptime:
          </span>
          <span className="font-mono text-slate-200 font-semibold">{uptime}</span>
        </div>
      </div>
    </div>
  );
}
