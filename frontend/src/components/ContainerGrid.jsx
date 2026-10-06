import React, { useState } from 'react';
import { 
  Box, 
  RotateCw, 
  Square, 
  Play, 
  Terminal, 
  Bug, 
  Search, 
  CheckCircle2, 
  AlertTriangle, 
  XCircle,
  ExternalLink,
  Layers,
  Cpu,
  ArrowUpDown
} from 'lucide-react';

export default function ContainerGrid({ 
  containers, 
  onSelectContainer, 
  onRestartContainer, 
  onStopContainer, 
  onStartContainer,
  onTraceContainer 
}) {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [actionLoading, setActionLoading] = useState({});

  const handleAction = async (actionFn, containerName) => {
    setActionLoading(prev => ({ ...prev, [containerName]: true }));
    try {
      await actionFn(containerName);
    } finally {
      setActionLoading(prev => ({ ...prev, [containerName]: false }));
    }
  };

  const filtered = (containers || []).filter(c => {
    const matchesSearch = c.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          c.image.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          (c.tech_stack && c.tech_stack.toLowerCase().includes(searchTerm.toLowerCase()));
    if (statusFilter === 'ALL') return matchesSearch;
    if (statusFilter === 'RUNNING') return matchesSearch && c.status === 'running';
    if (statusFilter === 'WARNING') return matchesSearch && c.health === 'warning';
    if (statusFilter === 'STOPPED') return matchesSearch && c.status !== 'running';
    return matchesSearch;
  });

  return (
    <div>
      {/* Tabler Page Header */}
      <div className="page-header">
        <div>
          <div className="page-pretitle">INFRAESTRUTURA &amp; RECURSOS</div>
          <h2 className="page-title">
            <Box size={22} color="var(--tblr-primary)" />
            <span>Parque de Containeres Docker</span>
          </h2>
        </div>
        <div className="btn-list">
          <span className="badge badge-subtle-primary" style={{ padding: '6px 12px', fontSize: '0.8rem' }}>
            {filtered.length} de {containers?.length || 0} containeres listados
          </span>
        </div>
      </div>

      {/* Main Tabler Card */}
      <div className="card">
        <div className="card-header">
          <div className="btn-list">
            <button 
              onClick={() => setStatusFilter('ALL')}
              className={`btn btn-sm ${statusFilter === 'ALL' ? 'btn-primary' : 'btn-secondary'}`}
            >
              Todos ({containers?.length || 0})
            </button>
            <button 
              onClick={() => setStatusFilter('RUNNING')}
              className={`btn btn-sm ${statusFilter === 'RUNNING' ? 'btn-primary' : 'btn-secondary'}`}
            >
              Em Execução ({containers?.filter(c => c.status === 'running').length || 0})
            </button>
            <button 
              onClick={() => setStatusFilter('WARNING')}
              className={`btn btn-sm ${statusFilter === 'WARNING' ? 'btn-primary' : 'btn-secondary'}`}
            >
              Com Atenção ({containers?.filter(c => c.health === 'warning').length || 0})
            </button>
          </div>

          <div style={{ position: 'relative', width: '260px' }}>
            <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--tblr-faint)' }} />
            <input
              type="text"
              placeholder="Buscar por serviço, imagem ou stack..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="form-control"
              style={{ paddingLeft: '32px', fontSize: '0.82rem' }}
            />
          </div>
        </div>

        <div className="table-responsive">
          <table className="table table-vcenter card-table table-hover">
            <thead>
              <tr>
                <th>Serviço / Container</th>
                <th>Stack Tecnológica</th>
                <th>Status &amp; Uptime</th>
                <th>Processador (CPU)</th>
                <th>Memória RAM</th>
                <th>Portas Mapeadas</th>
                <th style={{ textAlign: 'right' }}>Ações de Controle</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => {
                const isRunning = c.status === 'running';
                const isWarning = c.health === 'warning';
                const isLoading = actionLoading[c.name];

                return (
                  <tr key={c.name}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div className="avatar-icon bg-primary-subtle" style={{ width: '32px', height: '32px' }}>
                          <Box size={16} color="var(--tblr-primary)" />
                        </div>
                        <div>
                          <div style={{ fontWeight: '600', color: 'var(--tblr-body-color)', fontFamily: 'var(--font-mono)' }}>
                            {c.name}
                          </div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--tblr-muted)', fontFamily: 'var(--font-mono)' }}>
                            {c.image}
                          </div>
                        </div>
                      </div>
                    </td>

                    <td>
                      <span className="badge badge-subtle-primary">
                        {c.tech_stack || 'Docker Stack'}
                      </span>
                    </td>

                    <td>
                      <div>
                        {isWarning ? (
                          <span className="badge badge-subtle-warning">
                            <span className="status-dot status-yellow"></span>
                            Atenção SRE
                          </span>
                        ) : isRunning ? (
                          <span className="badge badge-subtle-success">
                            <span className="status-dot status-green status-dot-animated"></span>
                            Em Execução
                          </span>
                        ) : (
                          <span className="badge badge-subtle-danger">
                            <span className="status-dot status-red"></span>
                            Parado
                          </span>
                        )}
                        <div style={{ fontSize: '0.72rem', color: 'var(--tblr-muted)', marginTop: '3px', fontFamily: 'var(--font-mono)' }}>
                          {c.uptime || 'Up 4 days'}
                        </div>
                      </div>
                    </td>

                    <td>
                      <div style={{ width: '120px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', fontFamily: 'var(--font-mono)', marginBottom: '3px' }}>
                          <span>{c.cpu_percent || 0.8}%</span>
                        </div>
                        <div className="stat-progress">
                          <div 
                            className="stat-progress-bar" 
                            style={{ width: `${Math.min((c.cpu_percent || 0.8) * 4, 100)}%`, backgroundColor: 'var(--tblr-primary)' }} 
                          />
                        </div>
                      </div>
                    </td>

                    <td>
                      <div style={{ width: '120px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', fontFamily: 'var(--font-mono)', marginBottom: '3px' }}>
                          <span>{Math.round(c.memory_mb || 64)} MB</span>
                        </div>
                        <div className="stat-progress">
                          <div 
                            className="stat-progress-bar" 
                            style={{ width: `${Math.min((c.memory_mb || 64) / 5, 100)}%`, backgroundColor: isWarning ? 'var(--tblr-warning)' : 'var(--tblr-success)' }} 
                          />
                        </div>
                      </div>
                    </td>

                    <td>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                        {(c.ports && c.ports.length > 0) ? (
                          c.ports.map((p, i) => (
                            <span key={i} className="badge badge-subtle-purple" style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem' }}>
                              {p}
                            </span>
                          ))
                        ) : (
                          <span style={{ fontSize: '0.75rem', color: 'var(--tblr-faint)' }}>Rede Interna</span>
                        )}
                      </div>
                    </td>

                    <td style={{ textAlign: 'right' }}>
                      <div className="btn-list" style={{ justifyContent: 'flex-end' }}>
                        <button
                          onClick={() => onSelectContainer(c.name)}
                          className="btn-icon"
                          title="Terminal / Logs ao Vivo"
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
                          onClick={() => handleAction(onRestartContainer, c.name)}
                          disabled={isLoading}
                          className="btn-icon"
                          title="Reiniciar Container"
                        >
                          <RotateCw size={14} className={isLoading ? 'animate-spin' : ''} />
                        </button>

                        {isRunning ? (
                          <button
                            onClick={() => handleAction(onStopContainer, c.name)}
                            disabled={isLoading}
                            className="btn-icon"
                            title="Parar Container"
                            style={{ color: 'var(--tblr-danger)' }}
                          >
                            <Square size={14} />
                          </button>
                        ) : (
                          <button
                            onClick={() => handleAction(onStartContainer, c.name)}
                            disabled={isLoading}
                            className="btn-icon"
                            title="Iniciar Container"
                            style={{ color: 'var(--tblr-success)' }}
                          >
                            <Play size={14} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan="7" style={{ padding: '40px 20px', textAlign: 'center' }}>
                    <div style={{ color: 'var(--tblr-warning)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', marginBottom: '8px', fontWeight: '600' }}>
                      <AlertTriangle size={18} />
                      <span>Nenhum container catalogado via Docker Socket</span>
                    </div>
                    <div style={{ fontSize: '0.82rem', color: 'var(--tblr-muted)', maxWidth: '540px', margin: '0 auto', lineHeight: '1.6' }}>
                      Para que o agente consiga listar e operar os containeres da sua VPS, adicione o <strong>Bind Mount</strong> do Docker Socket na aba <strong>Mounts (Volumes)</strong> do seu serviço no Easypanel:
                      <div style={{ margin: '10px 0', padding: '10px 14px', background: 'var(--tblr-table-head-bg)', borderRadius: '6px', fontFamily: 'var(--font-mono)', fontSize: '0.8rem', display: 'inline-block' }}>
                        Host Path: <code>/var/run/docker.sock</code> &rarr; Mount Path: <code>/var/run/docker.sock</code>
                      </div>
                      <br />
                      Em seguida, salve e faça o <strong>Deploy</strong> para reconectar.
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
