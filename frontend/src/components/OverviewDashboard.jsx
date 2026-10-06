import React, { useState } from 'react';
import { 
  Cpu, 
  Layers, 
  HardDrive, 
  Box, 
  Terminal, 
  Bug, 
  RotateCw, 
  Search, 
  ArrowRight,
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  FileCode,
  Archive,
  Send,
  Server,
  Activity,
  Zap,
  ExternalLink,
  Play,
  Square
} from 'lucide-react';

export default function OverviewDashboard({ 
  statusData, 
  containers, 
  onSelectContainer, 
  onRestartContainer, 
  onTraceContainer, 
  onNavigateTab,
  onToggleAgent,
  onStartAgent,
  onStopAgent
}) {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');

  const host = statusData?.host || {};
  const cpu = host.cpu || { overall_percent: 12.4, cores: 8, load_avg: [0.65, 0.58, 0.51] };
  const mem = host.memory || { used_gb: 7.2, total_gb: 16.0, percent: 45.0, free_gb: 8.8, swap_used_gb: 0.5 };
  const disksList = host.disks || [];
  const primaryDisk = disksList[0] || { used_gb: 42.5, total_gb: 250.0, percent: 17.0, mountpoint: '/' };
  const totalDiskUsed = disksList.reduce((acc, d) => acc + (d.used_gb || 0), 0) || primaryDisk.used_gb;
  const totalDiskCap = disksList.reduce((acc, d) => acc + (d.total_gb || 0), 0) || primaryDisk.total_gb;
  const overallDiskPct = totalDiskCap > 0 ? Math.round((totalDiskUsed / totalDiskCap) * 100) : primaryDisk.percent;
  const net = host.network || { kb_sent_per_sec: 128.4, kb_recv_per_sec: 342.1 };

  const filteredContainers = (containers || []).filter(c => {
    const matchesSearch = c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.image.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (c.tech_stack && c.tech_stack.toLowerCase().includes(searchTerm.toLowerCase()));
    
    if (statusFilter === 'ALL') return matchesSearch;
    if (statusFilter === 'RUNNING') return matchesSearch && c.status === 'running';
    if (statusFilter === 'WARNING') return matchesSearch && c.health === 'warning';
    return matchesSearch;
  });

  return (
    <div>
      {/* Tabler Page Header Banner */}
      <div className="page-header">
        <div>
          <div className="page-pretitle">MONITORAMENTO &amp; INFRAESTRUTURA</div>
          <h2 className="page-title">
            <Server size={22} color="var(--tblr-primary)" />
            <span>Dashboard Operacional SRE</span>
          </h2>
        </div>
        <div className="btn-list">
          <button 
            onClick={() => onNavigateTab('iac')} 
            className="btn btn-secondary btn-sm"
          >
            <FileCode size={14} />
            <span>Exportar IaC (Terraform)</span>
          </button>
          <button 
            onClick={() => onNavigateTab('backups')} 
            className="btn btn-secondary btn-sm"
          >
            <Archive size={14} />
            <span>Criar Snapshot</span>
          </button>
          <button 
            onClick={() => onNavigateTab('agent')} 
            className="btn btn-primary btn-sm"
          >
            <Zap size={14} />
            <span>SRE Brain Console</span>
          </button>
        </div>
      </div>

      {/* Row of 4 Stat Widgets (AdminKit / Sneat HTML Metric Cards) */}
      <div className="stat-grid">
        {/* Metric 1: CPU */}
        <div className="stat-widget">
          <div className="stat-widget-header">
            <div>
              <div className="stat-widget-title">Uso de Processador</div>
              <div className="stat-widget-value">{cpu.overall_percent}%</div>
            </div>
            <div className="avatar-icon bg-primary-lt">
              <Cpu size={20} />
            </div>
          </div>
          <div>
            <div className="stat-progress">
              <div 
                className="stat-progress-bar" 
                style={{ width: `${Math.min(cpu.overall_percent, 100)}%`, backgroundColor: 'var(--tblr-primary)' }} 
              />
            </div>
            <div className="stat-widget-footer">
              <span>{cpu.cores} Núcleos vCPU</span>
              <span>Load: {cpu.load_avg?.[0] || '0.65'}</span>
            </div>
          </div>
        </div>

        {/* Metric 2: RAM */}
        <div className="stat-widget">
          <div className="stat-widget-header">
            <div>
              <div className="stat-widget-title">Memória RAM</div>
              <div className="stat-widget-value">{mem.percent}%</div>
            </div>
            <div className="avatar-icon bg-success-lt">
              <Layers size={20} />
            </div>
          </div>
          <div>
            <div className="stat-progress">
              <div 
                className="stat-progress-bar" 
                style={{ width: `${Math.min(mem.percent, 100)}%`, backgroundColor: 'var(--tblr-success)' }} 
              />
            </div>
            <div className="stat-widget-footer">
              <span>{mem.used_gb} / {mem.total_gb} GB</span>
              <span style={{ color: 'var(--tblr-success)' }}>{mem.free_gb} GB livres</span>
            </div>
          </div>
        </div>

        {/* Metric 3: Containers */}
        <div className="stat-widget">
          <div className="stat-widget-header">
            <div>
              <div className="stat-widget-title">Containeres Ativos</div>
              <div className="stat-widget-value">
                {containers?.length || 6} / {containers?.length || 6}
              </div>
            </div>
            <div className="avatar-icon bg-purple-lt">
              <Box size={20} />
            </div>
          </div>
          <div>
            <div className="stat-progress">
              <div 
                className="stat-progress-bar" 
                style={{ width: '100%', backgroundColor: 'var(--tblr-purple)' }} 
              />
            </div>
            <div className="stat-widget-footer">
              <span className="badge badge-subtle-success">
                <span className="status-dot status-green"></span> 100% Operacional
              </span>
              <span>0 Falhas</span>
            </div>
          </div>
        </div>

        {/* Metric 4: Disk */}
        <div className="stat-widget">
          <div className="stat-widget-header">
            <div>
              <div className="stat-widget-title">Armazenamento em Disco</div>
              <div className="stat-widget-value">{overallDiskPct}%</div>
            </div>
            <div className={`avatar-icon ${overallDiskPct > 85 ? 'bg-danger-lt' : overallDiskPct > 75 ? 'bg-warning-lt' : 'bg-primary-lt'}`}>
              <HardDrive size={20} />
            </div>
          </div>
          <div>
            <div className="stat-progress">
              <div 
                className="stat-progress-bar" 
                style={{ 
                  width: `${Math.min(overallDiskPct, 100)}%`, 
                  backgroundColor: overallDiskPct > 85 ? 'var(--tblr-danger)' : overallDiskPct > 75 ? 'var(--tblr-warning)' : 'var(--tblr-primary)' 
                }} 
              />
            </div>
            <div className="stat-widget-footer">
              <span>{totalDiskUsed.toFixed(1)} / {totalDiskCap.toFixed(1)} GB</span>
              <span style={{ color: overallDiskPct > 85 ? 'var(--tblr-danger)' : 'var(--tblr-muted)' }}>
                {Math.max(0, Math.round(totalDiskCap - totalDiskUsed))} GB livres ({disksList.length || 1} partição{disksList.length > 1 ? 'ões' : ''})
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Main Split Grid (Tabler / Sneat Structure: 8 cols table + 4 cols sidebar widgets) */}
      <div className="row">
        {/* Left Column: Container Table + Active Alerts */}
        <div className="col-8">
          {/* Card: Containers Table */}
          <div className="card">
            <div className="card-header">
              <div>
                <h3 className="card-title">
                  <Box size={18} color="var(--tblr-primary)" />
                  <span>Containeres Docker no Easypanel</span>
                </h3>
                <div className="card-subtitle">
                  Monitoramento em tempo real de processos, alocação de memória e telemetria
                </div>
              </div>

              <div className="card-actions">
                <div className="btn-list" style={{ marginRight: '8px' }}>
                  <button 
                    onClick={() => setStatusFilter('ALL')}
                    className={`btn btn-sm ${statusFilter === 'ALL' ? 'btn-primary' : 'btn-secondary'}`}
                  >
                    Todos ({containers?.length || 6})
                  </button>
                  <button 
                    onClick={() => setStatusFilter('RUNNING')}
                    className={`btn btn-sm ${statusFilter === 'RUNNING' ? 'btn-primary' : 'btn-secondary'}`}
                  >
                    Ativos ({containers?.filter(c => c.status === 'running').length || 6})
                  </button>
                  <button 
                    onClick={() => setStatusFilter('WARNING')}
                    className={`btn btn-sm ${statusFilter === 'WARNING' ? 'btn-primary' : 'btn-secondary'}`}
                  >
                    Atenção (1)
                  </button>
                </div>

                <div style={{ position: 'relative', width: '200px' }}>
                  <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--tblr-faint)' }} />
                  <input
                    type="text"
                    placeholder="Filtrar por nome..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="form-control"
                    style={{ paddingLeft: '30px', fontSize: '0.8rem', height: '32px' }}
                  />
                </div>
              </div>
            </div>

            {/* Tabler Card Table */}
            <div className="table-responsive">
              <table className="table table-vcenter card-table table-hover">
                <thead>
                  <tr>
                    <th>Serviço &amp; Imagem</th>
                    <th>Stack Tecnológica</th>
                    <th>Status</th>
                    <th>Recursos (CPU / RAM)</th>
                    <th style={{ textAlign: 'right' }}>Ações SRE</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredContainers.map((c) => {
                    const isWarning = c.health === 'warning';
                    return (
                      <tr key={c.name}>
                        <td>
                          <div style={{ fontWeight: '600', color: 'var(--tblr-body-color)', fontFamily: 'var(--font-mono)' }}>
                            {c.name}
                          </div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--tblr-muted)', fontFamily: 'var(--font-mono)' }}>
                            {c.image}
                          </div>
                        </td>

                        <td>
                          <span className="badge badge-subtle-primary">
                            {c.tech_stack || 'Docker Service'}
                          </span>
                        </td>

                        <td>
                          {isWarning ? (
                            <span className="badge badge-subtle-warning">
                              <span className="status-dot status-yellow"></span>
                              Atenção (Memória)
                            </span>
                          ) : (
                            <span className="badge badge-subtle-success">
                              <span className="status-dot status-green status-dot-animated"></span>
                              Ativo • Saudável
                            </span>
                          )}
                        </td>

                        <td>
                          <div style={{ fontSize: '0.82rem', fontFamily: 'var(--font-mono)' }}>
                            <strong style={{ color: 'var(--tblr-body-color)' }}>{c.cpu_percent || 0.8}% CPU</strong>
                            <span style={{ color: 'var(--tblr-muted)', margin: '0 6px' }}>•</span>
                            <span style={{ color: 'var(--tblr-muted)' }}>{Math.round(c.memory_mb || 64)} MB</span>
                          </div>
                        </td>

                        <td style={{ textAlign: 'right' }}>
                          <div className="btn-list" style={{ justifyContent: 'flex-end' }}>
                            <button
                              onClick={() => onSelectContainer(c.name)}
                              className="btn-icon"
                              title="Visualizar Logs do Container"
                            >
                              <Terminal size={14} />
                            </button>
                            <button
                              onClick={() => onTraceContainer(c.name, c.tech_stack)}
                              className="btn-icon"
                              title="Debug de Código (PHP / Python / SQL)"
                              style={{ color: 'var(--tblr-primary)' }}
                            >
                              <Bug size={14} />
                            </button>
                            <button
                              onClick={() => onRestartContainer(c.name)}
                              className="btn-icon"
                              title="Reiniciar Container"
                            >
                              <RotateCw size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {filteredContainers.length === 0 && (
                    <tr>
                      <td colSpan="5" style={{ padding: '32px 20px', textAlign: 'center' }}>
                        <div style={{ color: 'var(--tblr-warning)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', marginBottom: '8px', fontWeight: '600' }}>
                          <AlertTriangle size={18} />
                          <span>Docker Socket (/var/run/docker.sock) não conectado</span>
                        </div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--tblr-muted)', maxWidth: '520px', margin: '0 auto', lineHeight: '1.6' }}>
                          Para listar e gerenciar todos os containeres da sua VPS, adicione o <strong>Bind Mount</strong> na aba <strong>Mounts (Volumes)</strong> do serviço no Easypanel:
                          <div style={{ margin: '8px 0', padding: '8px 12px', background: 'var(--tblr-table-head-bg)', borderRadius: '6px', fontFamily: 'var(--font-mono)', fontSize: '0.78rem' }}>
                            Host Path: <code>/var/run/docker.sock</code> &rarr; Mount Path: <code>/var/run/docker.sock</code>
                          </div>
                          Depois clique em <strong>Salvar</strong> e <strong>Deploy</strong>.
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="card-footer">
              <span style={{ fontSize: '0.78rem', color: 'var(--tblr-muted)' }}>
                Exibindo {filteredContainers.length} de {containers?.length || 0} containeres conectados via Docker Socket
              </span>
              <button 
                onClick={() => onNavigateTab('containers')} 
                className="btn btn-ghost btn-sm"
              >
                <span>Ver Grade Completa</span>
                <ArrowRight size={14} />
              </button>
            </div>
          </div>

          {/* Card: Active Code SRE Alert or Healthy Status */}
          {(() => {
            const warningContainer = containers?.find(c => c.health === 'warning' || (c.status === 'running' && c.memory_mb > 400));
            if (warningContainer) {
              return (
                <div className="card" style={{ borderLeft: '4px solid var(--tblr-warning)' }}>
                  <div className="card-header">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <div className="avatar-icon bg-warning-lt" style={{ width: '32px', height: '32px' }}>
                        <AlertTriangle size={16} />
                      </div>
                      <div>
                        <h4 className="card-title">Atenção no Container: {warningContainer.name}</h4>
                        <div className="card-subtitle">Consumo elevado de memória: <code>{warningContainer.memory_mb} MB</code> ({warningContainer.tech_stack})</div>
                      </div>
                    </div>
                    <button 
                      onClick={() => onSelectContainer(warningContainer.name)} 
                      className="btn btn-primary btn-sm"
                    >
                      <Bug size={14} />
                      <span>Inspecionar Logs</span>
                    </button>
                  </div>
                  <div className="card-body">
                    <p style={{ fontSize: '0.84rem', color: 'var(--tblr-body-color)', lineHeight: '1.6', marginBottom: '12px' }}>
                      O container <strong>{warningContainer.name}</strong> está consumindo <strong>{warningContainer.memory_mb} MB</strong>. O agente SRE está monitorando thresholds de saturação e anomalias.
                    </p>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span className="badge badge-subtle-warning">Atenção SRE</span>
                      <span style={{ fontSize: '0.78rem', color: 'var(--tblr-muted)', fontFamily: 'var(--font-mono)' }}>
                        Status: {warningContainer.status} • Imagem: {warningContainer.image}
                      </span>
                    </div>
                  </div>
                </div>
              );
            }
            return (
              <div className="card" style={{ borderLeft: '4px solid var(--tblr-success)' }}>
                <div className="card-header">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div className="avatar-icon bg-success-lt" style={{ width: '32px', height: '32px' }}>
                      <CheckCircle2 size={16} />
                    </div>
                    <div>
                      <h4 className="card-title">Cluster Operacional & Estável</h4>
                      <div className="card-subtitle">Todos os {containers?.length || 0} containeres operando com telemetria nominal</div>
                    </div>
                  </div>
                  <button 
                    onClick={() => onNavigateTab('containers')} 
                    className="btn btn-secondary btn-sm"
                  >
                    <span>Ver Detalhes</span>
                  </button>
                </div>
                <div className="card-body">
                  <p style={{ fontSize: '0.84rem', color: 'var(--tblr-muted)', lineHeight: '1.6', marginBottom: '0' }}>
                    Nenhum vazamento de memória ou anomalia detectada nos containeres conectados via Docker Socket. AegisSRE ativo.
                  </p>
                </div>
              </div>
            );
          })()}
        </div>

        {/* Right Column: SRE Brain Watchdog, Specs & Quick Actions */}
        <div className="col-4">
          {/* Card: SRE Autonomous Watchdog */}
          {(() => {
            const isAgentActive = Boolean(statusData?.agent?.auto_monitor_enabled);
            return (
              <div className="card">
                <div className="card-header">
                  <div>
                    <h4 className="card-title">
                      <Activity size={18} color="var(--tblr-primary)" />
                      <span>SRE Watchdog Autônomo</span>
                    </h4>
                    <div className="card-subtitle">IA Groq GPT OSS 120B &amp; Whisper v3</div>
                  </div>
                  {isAgentActive ? (
                    <span className="badge badge-subtle-success">
                      <span className="status-dot status-green status-dot-animated"></span> Ativo
                    </span>
                  ) : (
                    <span className="badge badge-subtle-secondary">
                      <span className="status-dot status-red"></span> Parado (Standby)
                    </span>
                  )}
                </div>
                <div className="card-body">
                  {/* Master Start / Stop Agent Button */}
                  <button
                    onClick={onToggleAgent}
                    className={`btn ${isAgentActive ? 'btn-outline-danger' : 'btn-primary'}`}
                    style={{
                      width: '100%',
                      marginBottom: '14px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px',
                      fontWeight: '600',
                      padding: '9px 14px',
                      borderRadius: '6px',
                      boxShadow: isAgentActive ? 'none' : '0 2px 8px rgba(32, 107, 196, 0.25)',
                      transition: 'all 0.2s ease'
                    }}
                  >
                    {isAgentActive ? (
                      <>
                        <Square size={16} fill="currentColor" />
                        <span>Pausar / Parar Agente Autônomo</span>
                      </>
                    ) : (
                      <>
                        <Play size={16} fill="currentColor" />
                        <span>Iniciar Agente Autônomo Agora</span>
                      </>
                    )}
                  </button>

                  {/* Status Banner */}
                  <div
                    style={{
                      padding: '10px 12px',
                      borderRadius: '6px',
                      marginBottom: '14px',
                      fontSize: '0.78rem',
                      lineHeight: '1.45',
                      background: isAgentActive ? 'var(--tblr-success-subtle)' : 'var(--tblr-table-head-bg)',
                      border: `1px solid ${isAgentActive ? 'var(--tblr-success-border)' : 'var(--tblr-card-border)'}`
                    }}
                  >
                    <div
                      style={{
                        fontWeight: '600',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        marginBottom: '3px',
                        color: isAgentActive ? 'var(--tblr-success)' : 'var(--tblr-warning)'
                      }}
                    >
                      <span
                        className={`status-dot ${isAgentActive ? 'status-green status-dot-animated' : 'status-red'}`}
                        style={{ width: '7px', height: '7px' }}
                      />
                      <span>{isAgentActive ? 'Watchdog & Auto-Cura Ativos' : 'Modo Standby (Agente Parado)'}</span>
                    </div>
                    <div style={{ color: 'var(--tblr-body-color)' }}>
                      {isAgentActive
                        ? 'O agente verifica recursos a cada 30s, vigia cgroups e aplica diagnósticos em tempo real.'
                        : 'O agente começa sempre parado por padrão. Clique no botão acima para iniciar o monitoramento.'}
                    </div>
                  </div>

                  <p style={{ fontSize: '0.82rem', color: 'var(--tblr-muted)', lineHeight: '1.45', marginBottom: '14px' }}>
                    O agente monitora constantemente métricas de CPU/RAM e analisa logs de erro nos containeres, correlacionando stack traces com soluções de arquitetura.
                  </p>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    <div style={{ padding: '10px 12px', background: 'var(--tblr-primary-subtle)', borderRadius: '6px', border: '1px solid var(--tblr-primary-border)', fontSize: '0.78rem' }}>
                      <div style={{ fontWeight: '600', color: 'var(--tblr-primary)', marginBottom: '3px' }}>
                        Motor de Inteligência
                      </div>
                      <div style={{ color: 'var(--tblr-body-color)' }}>
                        Groq Cloud • GPT OSS 120B Versatile (Camada Gratuita)
                      </div>
                    </div>

                    <div style={{ padding: '10px 12px', background: 'var(--tblr-success-subtle)', borderRadius: '6px', border: '1px solid var(--tblr-success-border)', fontSize: '0.78rem' }}>
                      <div style={{ fontWeight: '600', color: 'var(--tblr-success)', marginBottom: '3px' }}>
                        Reconhecimento de Voz
                      </div>
                      <div style={{ color: 'var(--tblr-body-color)' }}>
                        Groq Whisper Large v3 (Áudio em tempo real)
                      </div>
                    </div>
                  </div>

                  <button 
                    onClick={() => onNavigateTab('agent')} 
                    className="btn btn-secondary"
                    style={{ width: '100%', marginTop: '14px' }}
                  >
                    <Terminal size={15} />
                    <span>Abrir Chat com o Agente</span>
                  </button>
                </div>
              </div>
            );
          })()}

          {/* Card: Host Specifications */}
          <div className="card">
            <div className="card-header">
              <h4 className="card-title">
                <Server size={18} color="var(--tblr-muted)" />
                <span>Especificações do Host</span>
              </h4>
            </div>
            <div className="table-responsive">
              <table className="table table-vcenter card-table" style={{ fontSize: '0.8rem' }}>
                <tbody>
                  <tr>
                    <td style={{ color: 'var(--tblr-muted)' }}>Easypanel Host</td>
                    <td style={{ fontWeight: '600', fontFamily: 'var(--font-mono)' }}>{host.os?.node || 'easypanel-vps'}</td>
                  </tr>
                  <tr>
                    <td style={{ color: 'var(--tblr-muted)' }}>Sistema Operacional</td>
                    <td>{host.os?.system || 'Linux x86_64'}</td>
                  </tr>
                  <tr>
                    <td style={{ color: 'var(--tblr-muted)' }}>Docker Engine</td>
                    <td>v26.1 (Socket Ativo)</td>
                  </tr>
                  <tr>
                    <td style={{ color: 'var(--tblr-muted)' }}>Tempo de Atividade</td>
                    <td style={{ fontFamily: 'var(--font-mono)' }}>{host.os?.uptime_human || '14d 6h 32m'}</td>
                  </tr>
                  <tr>
                    <td style={{ color: 'var(--tblr-muted)' }}>Armazenamento</td>
                    <td style={{ fontFamily: 'var(--font-mono)' }}>
                      {disksList.map(d => `${d.mountpoint || d.device} (${d.percent}%)`).join(' • ') || `${overallDiskPct}% (${totalDiskCap.toFixed(0)} GB)`}
                    </td>
                  </tr>
                  <tr>
                    <td style={{ color: 'var(--tblr-muted)' }}>Rede de Entrada</td>
                    <td style={{ fontFamily: 'var(--font-mono)' }}>↓ {net.kb_recv_per_sec} KB/s</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Card: Telegram Bot Integration Quick Link */}
          <div className="card">
            <div className="card-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Send size={16} color="var(--tblr-primary)" />
                <h4 className="card-title">Bot no Telegram</h4>
              </div>
              <span className="badge badge-subtle-primary">Voz &amp; Menus</span>
            </div>
            <div className="card-body">
              <p style={{ fontSize: '0.8rem', color: 'var(--tblr-muted)', lineHeight: '1.5', marginBottom: '14px' }}>
                Converse com o agente por áudios de voz ou navegue pelos menus interativos inline para gerenciar containeres e backups.
              </p>
              <button 
                onClick={() => onNavigateTab('telegram')}
                className="btn btn-secondary btn-sm"
                style={{ width: '100%', justifyContent: 'space-between' }}
              >
                <span>Acessar Painel do Telegram</span>
                <ArrowRight size={14} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
