import React, { useState, useEffect } from 'react';
import Sidebar from './components/Sidebar';
import TopNav from './components/TopNav';
import OverviewDashboard from './components/OverviewDashboard';
import ContainerGrid from './components/ContainerGrid';
import ContainerDrawer from './components/ContainerDrawer';
import SreBrainConsole from './components/SreBrainConsole';
import CodeTracer from './components/CodeTracer';
import IaCStudio from './components/IaCStudio';
import BackupCenter from './components/BackupCenter';
import TelegramStatus from './components/TelegramStatus';
import SettingsModal from './components/SettingsModal';
import VoiceCommandModal from './components/VoiceCommandModal';
import { api } from './api/client';

const INITIAL_CONTAINERS = [
  { id: 'e4a19b8c', name: 'easypanel-core', image: 'easypanel/easypanel:latest', status: 'running', health: 'healthy', tech_stack: 'Node.js / Go', cpu_percent: 1.2, memory_mb: 142.5, ports: ['3000:3000'], uptime: 'Up 4 days' },
  { id: 'b71c42f0', name: 'traefik-proxy', image: 'traefik:v3.1', status: 'running', health: 'healthy', tech_stack: 'Go / Reverse Proxy', cpu_percent: 0.8, memory_mb: 68.0, ports: ['80:80', '443:443'], uptime: 'Up 4 days' },
  { id: 'c8901ade', name: 'php-ecommerce-api', image: 'php:8.3-fpm-alpine', status: 'running', health: 'warning', tech_stack: 'PHP 8.3 / Laravel / Zend Engine', cpu_percent: 18.5, memory_mb: 420.0, ports: ['9000:9000'], uptime: 'Up 6 hours' },
  { id: 'f5123bc8', name: 'python-ai-worker', image: 'python:3.11-slim', status: 'running', health: 'healthy', tech_stack: 'Python 3.11 / FastAPI / Celery', cpu_percent: 4.1, memory_mb: 290.4, ports: ['8001:8000'], uptime: 'Up 2 days' },
  { id: 'd1283efa', name: 'postgres-production', image: 'postgres:16-alpine', status: 'running', health: 'healthy', tech_stack: 'PostgreSQL 16', cpu_percent: 2.3, memory_mb: 380.0, ports: ['5432:5432'], uptime: 'Up 10 days' },
  { id: 'a9018274', name: 'redis-cache', image: 'redis:7.2-alpine', status: 'running', health: 'healthy', tech_stack: 'Redis In-Memory', cpu_percent: 0.4, memory_mb: 52.0, ports: ['6379:6379'], uptime: 'Up 10 days' }
];

export default function App() {
  const [activeTab, setActiveTab] = useState('overview');
  const [theme, setTheme] = useState(() => localStorage.getItem('aegis_theme') || 'dark');
  const [statusData, setStatusData] = useState({
    status: 'warning',
    health_score: 85,
    host: {
      cpu: { overall_percent: 12.4, cores: 8, load_avg: [0.65, 0.58, 0.51] },
      memory: { used_gb: 7.2, total_gb: 16.0, percent: 45.0, free_gb: 8.8, swap_used_gb: 0.5 },
      disks: [{ used_gb: 42.5, total_gb: 250.0, percent: 17.0, mountpoint: '/' }],
      network: { kb_sent_per_sec: 128.4, kb_recv_per_sec: 342.1 },
      os: { node: 'easypanel-vps', system: 'Linux', uptime_human: '14d 6h 32m' }
    },
    containers_summary: { total: 6, running: 6, stopped: 0, is_docker_connected: true },
    agent: { version: '1.0.0', groq_configured: false, groq_model: 'llama-3.3-70b-versatile', whisper_model: 'whisper-large-v3', telegram_bot_active: false, telegram_configured: false, auto_monitor_enabled: false }
  });
  const [containers, setContainers] = useState(INITIAL_CONTAINERS);

  // Modals & Drawers
  const [selectedContainer, setSelectedContainer] = useState(null);
  const [isVoiceModalOpen, setIsVoiceModalOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);

  // Theme synchronization
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('aegis_theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => (prev === 'dark' ? 'light' : 'dark'));
  };

  // Initial load & Polling
  const refreshData = async () => {
    try {
      const [statusRes, containersRes] = await Promise.all([
        api.getStatus(),
        api.getContainers()
      ]);
      setStatusData(statusRes);
      if (Array.isArray(containersRes) && containersRes.length > 0) {
        setContainers(containersRes);
      }
    } catch (err) {
      console.error('Failed to refresh data:', err);
    }
  };

  useEffect(() => {
    refreshData();
    const interval = setInterval(refreshData, 6000);
    return () => clearInterval(interval);
  }, []);

  // WebSocket Live Telemetry
  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws/telemetry`;
    let ws;
    let isCancelled = false;

    function connectWs() {
      if (isCancelled) return;
      try {
        ws = new WebSocket(wsUrl);
        ws.onmessage = (event) => {
          try {
            const payload = JSON.parse(event.data);
            if (payload.host && payload.containers) {
              setStatusData(prev => ({ ...prev, host: payload.host }));
              if (Array.isArray(payload.containers) && payload.containers.length > 0) {
                setContainers(payload.containers);
              }
            }
          } catch (e) {}
        };
        ws.onclose = () => {
          if (!isCancelled) {
            setTimeout(connectWs, 5000);
          }
        };
        ws.onerror = () => {
          if (ws) ws.close();
        };
      } catch (e) {}
    }

    connectWs();

    return () => {
      isCancelled = true;
      if (ws) ws.close();
    };
  }, []);

  // Container Actions
  const handleRestartContainer = async (name) => {
    await api.restartContainer(name);
    await refreshData();
  };

  const handleStopContainer = async (name) => {
    await api.stopContainer(name);
    await refreshData();
  };

  const handleStartContainer = async (name) => {
    await api.startContainer(name);
    await refreshData();
  };

  const handleTraceContainer = (name, techStack) => {
    setActiveTab('debugger');
  };

  const handleConsultAiWithContext = (title, diagnosis) => {
    setActiveTab('agent');
  };

  // Autonomous Agent Control Handlers
  const handleToggleAgent = async () => {
    try {
      const res = await api.toggleAgent();
      setStatusData(prev => ({
        ...prev,
        agent: {
          ...prev.agent,
          auto_monitor_enabled: res.auto_monitor_enabled
        }
      }));
    } catch (err) {
      console.error('Failed to toggle agent:', err);
    }
  };

  const handleStartAgent = async () => {
    try {
      const res = await api.startAgent();
      setStatusData(prev => ({
        ...prev,
        agent: {
          ...prev.agent,
          auto_monitor_enabled: true
        }
      }));
    } catch (err) {
      console.error('Failed to start agent:', err);
    }
  };

  const handleStopAgent = async () => {
    try {
      const res = await api.stopAgent();
      setStatusData(prev => ({
        ...prev,
        agent: {
          ...prev.agent,
          auto_monitor_enabled: false
        }
      }));
    } catch (err) {
      console.error('Failed to stop agent:', err);
    }
  };

  return (
    <div className="page">
      {/* Sleek Admin Sidebar (Tabler Navbar Vertical) */}
      <Sidebar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        statusData={statusData}
        onOpenSettings={() => setIsSettingsModalOpen(true)}
      />

      {/* Main Workspace Area (Tabler Page Wrapper) */}
      <div className="page-wrapper">
        {/* Top Header Navbar with Master Agent Control */}
        <TopNav
          activeTab={activeTab}
          statusData={statusData}
          theme={theme}
          onToggleTheme={toggleTheme}
          onOpenVoiceModal={() => setIsVoiceModalOpen(true)}
          onToggleAgent={handleToggleAgent}
          onStartAgent={handleStartAgent}
          onStopAgent={handleStopAgent}
        />

        {/* Content Body Container */}
        <main className="page-body">
          <div className="container-xl">
            {/* Tab 1: Clean Executive Overview */}
            {activeTab === 'overview' && (
              <OverviewDashboard
                statusData={statusData}
                containers={containers}
                onSelectContainer={(name) => setSelectedContainer(name)}
                onRestartContainer={handleRestartContainer}
                onTraceContainer={handleTraceContainer}
                onNavigateTab={(tab) => setActiveTab(tab)}
                onToggleAgent={handleToggleAgent}
                onStartAgent={handleStartAgent}
                onStopAgent={handleStopAgent}
              />
            )}

            {/* Tab 2: Dedicated Full Containers War Room */}
            {activeTab === 'containers' && (
              <ContainerGrid
                containers={containers}
                onSelectContainer={(name) => setSelectedContainer(name)}
                onRestartContainer={handleRestartContainer}
                onStopContainer={handleStopContainer}
                onStartContainer={handleStartContainer}
                onTraceContainer={handleTraceContainer}
              />
            )}

            {/* Tab 3: Dedicated SRE Brain Console */}
            {activeTab === 'agent' && (
              <SreBrainConsole 
                onOpenVoiceModal={() => setIsVoiceModalOpen(true)}
                statusData={statusData}
                onToggleAgent={handleToggleAgent}
              />
            )}

            {/* Tab 4: Dedicated Code Debugger */}
            {activeTab === 'debugger' && (
              <CodeTracer
                containers={containers}
                onConsultAiWithContext={handleConsultAiWithContext}
              />
            )}

            {/* Tab 5: Dedicated IaC Studio */}
            {activeTab === 'iac' && (
              <IaCStudio />
            )}

            {/* Tab 6: Dedicated Backups & Disaster Recovery */}
            {activeTab === 'backups' && (
              <BackupCenter />
            )}

            {/* Tab 7: Dedicated Telegram Bot */}
            {activeTab === 'telegram' && (
              <TelegramStatus
                statusData={statusData}
                onOpenSettings={() => setIsSettingsModalOpen(true)}
              />
            )}
          </div>
        </main>
      </div>

      {/* Container Logs & Inspector Drawer */}
      {selectedContainer && (
        <ContainerDrawer
          containerName={selectedContainer}
          onClose={() => setSelectedContainer(null)}
          onRestart={handleRestartContainer}
          onStop={handleStopContainer}
          onStart={handleStartContainer}
        />
      )}

      {/* Voice Command Modal */}
      <VoiceCommandModal
        isOpen={isVoiceModalOpen}
        onClose={() => setIsVoiceModalOpen(false)}
      />

      {/* Settings Modal */}
      <SettingsModal
        isOpen={isSettingsModalOpen}
        onClose={() => setIsSettingsModalOpen(false)}
        onSettingsUpdated={refreshData}
      />
    </div>
  );
}
