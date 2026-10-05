import React from 'react';
import { 
  LayoutDashboard, 
  Box, 
  Terminal, 
  Bug, 
  FileCode, 
  Archive, 
  Send, 
  Settings,
  Server,
  ShieldCheck
} from 'lucide-react';

export default function Sidebar({ activeTab, setActiveTab, statusData, onOpenSettings }) {
  const containerCount = statusData?.containers_summary?.total ?? 6;
  const runningCount = statusData?.containers_summary?.running ?? 6;
  const nodeName = statusData?.host?.os?.node || 'easypanel-vps';
  const osName = statusData?.host?.os?.system || 'Linux';
  const isAgentActive = Boolean(statusData?.agent?.auto_monitor_enabled);

  return (
    <aside className="navbar-vertical">
      {/* Brand Header */}
      <div className="navbar-brand">
        <div className="brand-icon">
          <ShieldCheck size={18} />
        </div>
        <div>
          <div className="brand-title">Aegis<span>SRE</span></div>
        </div>
        <span className="brand-badge">Easypanel</span>
      </div>

      {/* Nav List */}
      <ul className="navbar-nav">
        {/* Category: Geral */}
        <li className="nav-category">Geral</li>
        
        <li className="nav-item">
          <button
            onClick={() => setActiveTab('overview')}
            className={`nav-link ${activeTab === 'overview' ? 'active' : ''}`}
          >
            <div className="nav-link-title">
              <LayoutDashboard size={18} />
              <span>Visão Geral</span>
            </div>
          </button>
        </li>

        <li className="nav-item">
          <button
            onClick={() => setActiveTab('containers')}
            className={`nav-link ${activeTab === 'containers' ? 'active' : ''}`}
          >
            <div className="nav-link-title">
              <Box size={18} />
              <span>Containeres</span>
            </div>
            <span className="badge badge-subtle-success">{runningCount}/{containerCount}</span>
          </button>
        </li>

        {/* Category: Inteligência & SRE */}
        <li className="nav-category">Inteligência &amp; SRE</li>

        <li className="nav-item">
          <button
            onClick={() => setActiveTab('agent')}
            className={`nav-link ${activeTab === 'agent' ? 'active' : ''}`}
          >
            <div className="nav-link-title">
              <Terminal size={18} />
              <span>SRE Brain &amp; Chat</span>
            </div>
            <span className={`badge ${isAgentActive ? 'badge-subtle-success' : 'badge-subtle-secondary'}`}>
              <span className={`status-dot ${isAgentActive ? 'status-green status-dot-animated' : 'status-red'}`} style={{ width: '6px', height: '6px' }}></span>
              {isAgentActive ? 'Ativo' : 'Parado'}
            </span>
          </button>
        </li>

        <li className="nav-item">
          <button
            onClick={() => setActiveTab('debugger')}
            className={`nav-link ${activeTab === 'debugger' ? 'active' : ''}`}
          >
            <div className="nav-link-title">
              <Bug size={18} />
              <span>Code Debugger</span>
            </div>
            <span className="badge badge-subtle-warning">PHP / Python</span>
          </button>
        </li>

        {/* Category: DevOps & Automação */}
        <li className="nav-category">DevOps &amp; Automação</li>

        <li className="nav-item">
          <button
            onClick={() => setActiveTab('iac')}
            className={`nav-link ${activeTab === 'iac' ? 'active' : ''}`}
          >
            <div className="nav-link-title">
              <FileCode size={18} />
              <span>IaC Studio</span>
            </div>
            <span className="badge badge-subtle-primary">Terraform</span>
          </button>
        </li>

        <li className="nav-item">
          <button
            onClick={() => setActiveTab('backups')}
            className={`nav-link ${activeTab === 'backups' ? 'active' : ''}`}
          >
            <div className="nav-link-title">
              <Archive size={18} />
              <span>Backups &amp; DR</span>
            </div>
          </button>
        </li>

        <li className="nav-item">
          <button
            onClick={() => setActiveTab('telegram')}
            className={`nav-link ${activeTab === 'telegram' ? 'active' : ''}`}
          >
            <div className="nav-link-title">
              <Send size={18} />
              <span>Telegram Bot</span>
            </div>
          </button>
        </li>
      </ul>

      {/* Footer Host Profile */}
      <div className="navbar-footer">
        <div className="user-menu-box">
          <div className="user-avatar">
            <Server size={15} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: '600', fontSize: '0.82rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {nodeName}
            </div>
            <div style={{ fontSize: '0.72rem', color: 'var(--tblr-muted)', display: 'flex', alignItems: 'center', gap: '5px' }}>
              <span className="status-dot status-dot-animated status-green"></span>
              <span>{osName} Ativo</span>
            </div>
          </div>
          <button 
            onClick={onOpenSettings}
            className="btn-icon" 
            title="Configurações"
            style={{ width: '28px', height: '28px' }}
          >
            <Settings size={14} />
          </button>
        </div>
      </div>
    </aside>
  );
}
