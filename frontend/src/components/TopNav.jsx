import { 
  Sun, 
  Moon, 
  Mic, 
  Search, 
  Clock, 
  ShieldCheck, 
  Bell, 
  Layers,
  Sparkles,
  Play,
  Square
} from 'lucide-react';

export default function TopNav({ 
  activeTab, 
  statusData, 
  theme, 
  onToggleTheme, 
  onOpenVoiceModal,
  onToggleAgent,
  onStartAgent,
  onStopAgent
}) {
  const healthScore = statusData?.health_score ?? 85;
  const uptime = statusData?.host?.os?.uptime_human || '14d 6h';
  const nodeName = statusData?.host?.os?.node || 'easypanel-vps';
  const isHealthy = healthScore >= 80;
  const isAgentActive = Boolean(statusData?.agent?.auto_monitor_enabled);

  return (
    <header className="page-header-navbar">
      {/* Global Search Bar (Tabler / AdminKit style) */}
      <div className="navbar-search">
        <Search size={15} className="navbar-search-icon" />
        <input 
          type="text" 
          placeholder="Buscar containeres, logs, métricas..." 
          readOnly
          onClick={onOpenVoiceModal}
          style={{ cursor: 'pointer' }}
        />
        <span className="navbar-search-shortcut">⌘K</span>
      </div>

      {/* Right Actions */}
      <div className="header-actions">
        {/* Cluster Status Pill */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 12px', background: 'var(--tblr-card-bg)', border: '1px solid var(--tblr-card-border)', borderRadius: '6px', fontSize: '0.78rem' }}>
          <span className={`status-dot status-dot-animated ${isHealthy ? 'status-green' : 'status-yellow'}`}></span>
          <span style={{ fontWeight: '600', color: 'var(--tblr-body-color)' }}>{nodeName}</span>
          <span style={{ color: 'var(--tblr-muted)' }}>•</span>
          <span style={{ color: 'var(--tblr-muted)', fontFamily: 'var(--font-mono)' }}>{uptime}</span>
        </div>

        {/* Health Score Badge */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px', background: isHealthy ? 'var(--tblr-success-subtle)' : 'var(--tblr-warning-subtle)', border: `1px solid ${isHealthy ? 'var(--tblr-success-border)' : 'var(--tblr-warning-border)'}`, borderRadius: '6px', fontSize: '0.78rem' }}>
          <ShieldCheck size={14} color={isHealthy ? 'var(--tblr-success)' : 'var(--tblr-warning)'} />
          <span style={{ fontWeight: '600', color: isHealthy ? 'var(--tblr-success)' : 'var(--tblr-warning)', fontFamily: 'var(--font-mono)' }}>
            Saúde {healthScore}%
          </span>
        </div>

        {/* Theme Toggle Button (Tabler Sun / Moon) */}
        <button
          onClick={onToggleTheme}
          className="btn-icon"
          title={`Alternar para ${theme === 'dark' ? 'Modo Claro' : 'Modo Escuro'}`}
          aria-label="Alternar tema"
        >
          {theme === 'dark' ? (
            <Sun size={16} color="var(--tblr-warning)" />
          ) : (
            <Moon size={16} color="var(--tblr-primary)" />
          )}
        </button>

        {/* Master Agent Start / Stop Switch Button */}
        <button
          onClick={onToggleAgent}
          className={`btn btn-sm ${isAgentActive ? 'btn-outline-danger' : 'btn-primary'}`}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            fontWeight: '600',
            fontSize: '0.78rem',
            padding: '6px 14px',
            borderRadius: '6px',
            transition: 'all 0.2s ease',
            boxShadow: isAgentActive ? '0 0 0 2px rgba(214, 57, 57, 0.25)' : 'none'
          }}
          title={isAgentActive ? 'Clique para Parar o Agente SRE Autônomo' : 'Clique para Iniciar o Agente SRE Autônomo'}
        >
          <span
            className={`status-dot ${isAgentActive ? 'status-green status-dot-animated' : 'status-red'}`}
            style={{ width: '8px', height: '8px' }}
          />
          <span>{isAgentActive ? 'Agente: ATIVO (Parar)' : 'Agente: PARADO (Iniciar)'}</span>
          {isAgentActive ? (
            <Square size={13} fill="currentColor" />
          ) : (
            <Play size={13} fill="currentColor" />
          )}
        </button>

        {/* Voice Command Button (Groq Whisper) */}
        <button
          onClick={onOpenVoiceModal}
          className="btn btn-secondary btn-sm"
          title="Comandos de Voz com Whisper Large v3"
        >
          <Mic size={14} />
          <span>Voz (Whisper)</span>
        </button>
      </div>
    </header>
  );
}
