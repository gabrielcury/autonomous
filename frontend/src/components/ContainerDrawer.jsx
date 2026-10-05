import React, { useState, useEffect } from 'react';
import { 
  X, 
  Terminal, 
  Settings, 
  HardDrive, 
  RotateCw, 
  Square, 
  Play, 
  Copy, 
  Check, 
  Eye, 
  EyeOff, 
  RotateCcw 
} from 'lucide-react';
import { api } from '../api/client';

export default function ContainerDrawer({ containerName, onClose, onRestart, onStop, onStart }) {
  const [activeTab, setActiveTab] = useState('logs');
  const [logs, setLogs] = useState('');
  const [details, setDetails] = useState(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [showMasked, setShowMasked] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);

  const fetchContainerData = async () => {
    if (!containerName) return;
    try {
      const [logsRes, detailsRes] = await Promise.all([
        api.getContainerLogs(containerName, 200),
        api.getContainerDetail(containerName)
      ]);
      setLogs(logsRes.logs || 'Sem logs disponíveis.');
      setDetails(detailsRes);
    } catch (err) {
      console.error('Failed to load container data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchContainerData();
    let interval;
    if (autoRefresh) {
      interval = setInterval(fetchContainerData, 4000);
    }
    return () => clearInterval(interval);
  }, [containerName, autoRefresh]);

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!containerName) return null;

  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <div className="drawer-panel" onClick={(e) => e.stopPropagation()}>
        {/* Drawer Header */}
        <div className="card-header" style={{ padding: '16px 20px', borderBottom: '1px solid var(--tblr-card-border)' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <h3 style={{ fontSize: '1.05rem', fontWeight: '700', color: 'var(--tblr-body-color)', fontFamily: 'var(--font-mono)' }}>
                {containerName}
              </h3>
              <span className="badge badge-subtle-primary">
                {details?.tech_stack || 'Docker Stack'}
              </span>
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--tblr-muted)', fontFamily: 'var(--font-mono)', marginTop: '2px' }}>
              {details?.image || 'easypanel/service'}
            </div>
          </div>

          <div className="btn-list">
            <button
              onClick={() => onRestart(containerName)}
              className="btn-icon"
              title="Reiniciar Container"
            >
              <RotateCw size={14} />
            </button>
            <button
              onClick={onClose}
              className="btn-icon"
              title="Fechar Painel"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--tblr-card-border)', background: 'var(--tblr-table-head-bg)', padding: '0 16px' }}>
          <button
            onClick={() => setActiveTab('logs')}
            style={{
              padding: '12px 14px',
              border: 'none',
              background: 'transparent',
              borderBottom: activeTab === 'logs' ? '2px solid var(--tblr-primary)' : '2px solid transparent',
              color: activeTab === 'logs' ? 'var(--tblr-primary)' : 'var(--tblr-muted)',
              fontWeight: activeTab === 'logs' ? '600' : '500',
              fontSize: '0.8rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <Terminal size={14} />
            <span>Logs ao Vivo</span>
          </button>

          <button
            onClick={() => setActiveTab('env')}
            style={{
              padding: '12px 14px',
              border: 'none',
              background: 'transparent',
              borderBottom: activeTab === 'env' ? '2px solid var(--tblr-primary)' : '2px solid transparent',
              color: activeTab === 'env' ? 'var(--tblr-primary)' : 'var(--tblr-muted)',
              fontWeight: activeTab === 'env' ? '600' : '500',
              fontSize: '0.8rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <Settings size={14} />
            <span>Variáveis de Ambiente</span>
          </button>

          <button
            onClick={() => setActiveTab('mounts')}
            style={{
              padding: '12px 14px',
              border: 'none',
              background: 'transparent',
              borderBottom: activeTab === 'mounts' ? '2px solid var(--tblr-primary)' : '2px solid transparent',
              color: activeTab === 'mounts' ? 'var(--tblr-primary)' : 'var(--tblr-muted)',
              fontWeight: activeTab === 'mounts' ? '600' : '500',
              fontSize: '0.8rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <HardDrive size={14} />
            <span>Volumes &amp; Montagens</span>
          </button>
        </div>

        {/* Content Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '40px', color: 'var(--tblr-muted)' }}>
              Carregando dados do container...
            </div>
          ) : (
            <>
              {activeTab === 'logs' && (
                <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', color: 'var(--tblr-muted)' }}>
                      <span className="status-dot status-green status-dot-animated"></span>
                      <span>Stream de logs (últimas 200 linhas)</span>
                    </div>
                    <div className="btn-list">
                      <button
                        onClick={() => setAutoRefresh(!autoRefresh)}
                        className={`btn btn-sm ${autoRefresh ? 'btn-primary' : 'btn-secondary'}`}
                        style={{ fontSize: '0.72rem', padding: '3px 8px' }}
                      >
                        Auto-refresh: {autoRefresh ? 'Ligado' : 'Pausado'}
                      </button>
                      <button
                        onClick={() => copyToClipboard(logs)}
                        className="btn btn-secondary btn-sm"
                        style={{ fontSize: '0.72rem', padding: '3px 8px' }}
                      >
                        {copied ? <Check size={12} color="var(--tblr-success)" /> : <Copy size={12} />}
                        <span>{copied ? 'Copiado' : 'Copiar'}</span>
                      </button>
                    </div>
                  </div>

                  <div className="code-editor-box" style={{ flex: 1, minHeight: '400px' }}>
                    <pre className="code-editor-content" style={{ maxHeight: '520px' }}>
                      {logs}
                    </pre>
                  </div>
                </div>
              )}

              {activeTab === 'env' && (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                    <span style={{ fontSize: '0.8rem', color: 'var(--tblr-muted)' }}>
                      Variáveis passadas ao container via Dockerfile / Easypanel
                    </span>
                    <button
                      onClick={() => setShowMasked(!showMasked)}
                      className="btn btn-secondary btn-sm"
                      style={{ fontSize: '0.72rem' }}
                    >
                      {showMasked ? <EyeOff size={13} /> : <Eye size={13} />}
                      <span>{showMasked ? 'Ocultar Segredos' : 'Revelar Segredos'}</span>
                    </button>
                  </div>

                  <div className="table-responsive">
                    <table className="table table-vcenter card-table">
                      <thead>
                        <tr>
                          <th>Chave</th>
                          <th>Valor</th>
                        </tr>
                      </thead>
                      <tbody>
                        {details?.environment ? (
                          Object.entries(details.environment).map(([k, v]) => (
                            <tr key={k}>
                              <td style={{ fontWeight: '600', fontFamily: 'var(--font-mono)' }}>{k}</td>
                              <td style={{ fontFamily: 'var(--font-mono)' }}>
                                {showMasked || !k.toLowerCase().includes('pass') && !k.toLowerCase().includes('secret') && !k.toLowerCase().includes('key')
                                  ? String(v)
                                  : '••••••••••••••••'}
                              </td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td colSpan="2" style={{ textAlign: 'center', color: 'var(--tblr-muted)' }}>Nenhuma variável declarada</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {activeTab === 'mounts' && (
                <div>
                  <div className="table-responsive">
                    <table className="table table-vcenter card-table">
                      <thead>
                        <tr>
                          <th>Tipo</th>
                          <th>Origem (Host)</th>
                          <th>Destino (Container)</th>
                          <th>Modo</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(details?.mounts && details.mounts.length > 0) ? (
                          details.mounts.map((m, idx) => (
                            <tr key={idx}>
                              <td><span className="badge badge-subtle-primary">{m.Type || 'volume'}</span></td>
                              <td style={{ fontFamily: 'var(--font-mono)' }}>{m.Source}</td>
                              <td style={{ fontFamily: 'var(--font-mono)' }}>{m.Destination}</td>
                              <td><span className="badge badge-subtle-success">{m.RW ? 'Leitura/Escrita' : 'Somente Leitura'}</span></td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td colSpan="4" style={{ textAlign: 'center', color: 'var(--tblr-muted)' }}>Nenhum volume persistente montado</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
