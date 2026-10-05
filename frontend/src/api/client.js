// REST & WebSocket client for AegisSRE
const API_BASE = '/api';

export const api = {
  // Status & Telemetry
  async getStatus() {
    const res = await fetch(`${API_BASE}/status`);
    return res.json();
  },

  // Containers
  async getContainers() {
    const res = await fetch(`${API_BASE}/containers`);
    return res.json();
  },

  async getContainerDetail(name) {
    const res = await fetch(`${API_BASE}/containers/${name}`);
    return res.json();
  },

  async getContainerLogs(name, tail = 150) {
    const res = await fetch(`${API_BASE}/containers/${name}/logs?tail=${tail}`);
    return res.json();
  },

  async restartContainer(name) {
    const res = await fetch(`${API_BASE}/containers/${name}/restart`, { method: 'POST' });
    return res.json();
  },

  async stopContainer(name) {
    const res = await fetch(`${API_BASE}/containers/${name}/stop`, { method: 'POST' });
    return res.json();
  },

  async startContainer(name) {
    const res = await fetch(`${API_BASE}/containers/${name}/start`, { method: 'POST' });
    return res.json();
  },

  // Code Tracing & Debug
  async traceCode(containerName, customLogs = null, techStack = null) {
    const res = await fetch(`${API_BASE}/code/trace`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        container_name: containerName,
        custom_logs: customLogs,
        tech_stack: techStack
      })
    });
    return res.json();
  },

  // IaC
  async getIaCSuite() {
    const res = await fetch(`${API_BASE}/iac/suite`);
    return res.json();
  },

  getIaCDownloadUrl() {
    return `${API_BASE}/iac/download`;
  },

  getIaCZipUrl() {
    return `${API_BASE}/iac/download`;
  },

  // Backups
  async getBackups() {
    const res = await fetch(`${API_BASE}/backups`);
    return res.json();
  },

  async createBackup(note = 'Disparado pelo Painel Web') {
    const res = await fetch(`${API_BASE}/backups/create?note=${encodeURIComponent(note)}`, { method: 'POST' });
    return res.json();
  },

  getBackupDownloadUrl(backupId) {
    return `${API_BASE}/backups/download/${backupId}`;
  },

  // SRE AI Agent
  async chatWithAgent(message, history = []) {
    const res = await fetch(`${API_BASE}/agent/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, history })
    });
    return res.json();
  },

  async sendVoiceAudio(audioBlob, filename = 'mic_voice.ogg') {
    const formData = new FormData();
    formData.append('audio', audioBlob, filename);
    const res = await fetch(`${API_BASE}/agent/voice`, {
      method: 'POST',
      body: formData
    });
    return res.json();
  },

  async getAgentEvents() {
    const res = await fetch(`${API_BASE}/agent/events`);
    return res.json();
  },

  // Autonomous Agent Controls (Start / Stop / Status)
  async getAgentStatus() {
    const res = await fetch(`${API_BASE}/agent/status`);
    return res.json();
  },

  async startAgent() {
    const res = await fetch(`${API_BASE}/agent/start`, { method: 'POST' });
    return res.json();
  },

  async stopAgent() {
    const res = await fetch(`${API_BASE}/agent/stop`, { method: 'POST' });
    return res.json();
  },

  async toggleAgent() {
    const res = await fetch(`${API_BASE}/agent/toggle`, { method: 'POST' });
    return res.json();
  },

  // Settings
  async getSettings() {
    const res = await fetch(`${API_BASE}/settings`);
    return res.json();
  },

  async updateSettings(settingsData) {
    const res = await fetch(`${API_BASE}/settings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settingsData)
    });
    return res.json();
  }
};
