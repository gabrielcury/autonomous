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

const INITIAL_CONTAINERS = [];

export default function App() {
  const [activeTab, setActiveTab] = useState('overview');
  const [theme, setTheme] = useState(() => localStorage.getItem('aegis_theme') || 'dark');
  const [statusData, setStatusData] = useState({
    status: 'healthy',
    health_score: 100,
    host: {
      cpu: { overall_percent: 0.0, cores: 1, load_avg: [0.0, 0.0, 0.0] },
      memory: { used_gb: 0.0, total_gb: 1.0, percent: 0.0, free_gb: 1.0, swap_used_gb: 0.0 },
      disks: [{ used_gb: 0.0, total_gb: 100.0, percent: 0.0, mountpoint: '/' }],
      network: { kb_sent_per_sec: 0.0, kb_recv_per_sec: 0.0 },
      os: { node: 'easypanel-vps', system: 'Linux', uptime_human: 'Carregando...' }
    },
    containers_summary: { total: 0, running: 0, stopped: 0, is_docker_connected: true },
    agent: { version: '1.0.0', groq_configured: false, groq_model: 'openai/gpt-oss-120b', whisper_model: 'whisper-large-v3', telegram_bot_active: false, telegram_configured: false, auto_monitor_enabled: false }
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
      if (Array.isArray(containersRes)) {
        setContainers(prev => {
          if (containersRes.length > 0) return containersRes;
          if (prev && prev.length > 0) return prev;
          return containersRes;
        });
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
                dockerDiagnostic={statusData?.containers_summary?.diagnostic}
                onRefreshData={refreshData}
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
                dockerDiagnostic={statusData?.containers_summary?.diagnostic}
                onRefreshData={refreshData}
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
                containers={containers}
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
