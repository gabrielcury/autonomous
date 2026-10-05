import React, { useState, useEffect } from 'react';
import { Settings, X, Key, Send, Shield, Save, CheckCircle, ExternalLink } from 'lucide-react';
import { api } from '../api/client';

export default function SettingsModal({ isOpen, onClose, onSettingsUpdated }) {
  const [groqKey, setGroqKey] = useState('');
  const [telegramToken, setTelegramToken] = useState('');
  const [allowedUsers, setAllowedUsers] = useState('');
  const [autoMonitor, setAutoMonitor] = useState(false);
  const [cpuThreshold, setCpuThreshold] = useState(85);
  const [memThreshold, setMemThreshold] = useState(85);
  
  const [loading, setLoading] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [currentConfig, setCurrentConfig] = useState(null);

  useEffect(() => {
    if (isOpen) {
      api.getSettings().then(cfg => {
        setCurrentConfig(cfg);
        setAutoMonitor(cfg.auto_monitor_enabled ?? false);
        setCpuThreshold(cfg.alert_cpu_threshold ?? 85);
        setMemThreshold(cfg.alert_mem_threshold ?? 85);
        setAllowedUsers(cfg.telegram_allowed_users ?? '');
      });
      setSavedSuccess(false);
    }
  }, [isOpen]);

  const handleSave = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const payload = {
        auto_monitor_enabled: autoMonitor,
        alert_cpu_threshold: parseFloat(cpuThreshold),
        alert_mem_threshold: parseFloat(memThreshold),
        telegram_allowed_users: allowedUsers
      };

      if (groqKey.trim()) {
        payload.groq_api_key = groqKey.trim();
      }
      if (telegramToken.trim()) {
        payload.telegram_bot_token = telegramToken.trim();
      }

      await api.updateSettings(payload);
      setSavedSuccess(true);
      if (onSettingsUpdated) onSettingsUpdated();
      setTimeout(() => {
        setSavedSuccess(false);
        onClose();
      }, 1500);
    } catch (err) {
      console.error('Failed to save settings:', err);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="card-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div className="avatar-icon bg-primary-lt" style={{ width: '34px', height: '34px' }}>
              <Settings size={18} />
            </div>
            <div>
              <h3 className="card-title">Configurações do Agente &amp; Chaves de API</h3>
              <div className="card-subtitle">Groq LLM (Camada Grátis), Telegram Bot e Thresholds SRE</div>
            </div>
          </div>
          <button onClick={onClose} className="btn-icon">
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSave}>
          <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {/* Groq Key */}
            <div style={{ padding: '14px', background: 'var(--tblr-table-head-bg)', borderRadius: '6px', border: '1px solid var(--tblr-card-border)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                <label style={{ fontWeight: '600', fontSize: '0.82rem', color: 'var(--tblr-body-color)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Key size={14} color="var(--tblr-primary)" />
                  <span>Chave Groq API (Groq API Key)</span>
                </label>
                <a 
                  href="https://console.groq.com/keys" 
                  target="_blank" 
                  rel="noreferrer"
                  style={{ fontSize: '0.72rem', color: 'var(--tblr-primary)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '3px' }}
                >
                  <span>Obter Chave Grátis</span>
                  <ExternalLink size={11} />
                </a>
              </div>
              <p style={{ fontSize: '0.75rem', color: 'var(--tblr-muted)', marginBottom: '8px' }}>
                Necessária para LLaMA 3.3 70B e transcrição de áudio Whisper Large v3.
              </p>
              <input
                type="password"
                placeholder={currentConfig?.groq_api_key_set ? `Chave ativa: ${currentConfig.groq_api_key_masked}` : 'Cole aqui sua chave gsk_...'}
                value={groqKey}
                onChange={(e) => setGroqKey(e.target.value)}
                className="form-control"
                style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}
              />
            </div>

            {/* Telegram Bot Token */}
            <div style={{ padding: '14px', background: 'var(--tblr-table-head-bg)', borderRadius: '6px', border: '1px solid var(--tblr-card-border)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                <label style={{ fontWeight: '600', fontSize: '0.82rem', color: 'var(--tblr-body-color)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Send size={14} color="var(--tblr-primary)" />
                  <span>Token do Bot Telegram (@BotFather)</span>
                </label>
                <span className="badge badge-subtle-primary" style={{ fontSize: '0.7rem' }}>
                  {currentConfig?.telegram_bot_token_set ? 'Token Salvo' : 'Não Configurado'}
                </span>
              </div>
              <p style={{ fontSize: '0.75rem', color: 'var(--tblr-muted)', marginBottom: '8px' }}>
                Token gerado pelo @BotFather no Telegram para bot interativo com voz.
              </p>
              <input
                type="password"
                placeholder={currentConfig?.telegram_bot_token_set ? `Token ativo: ${currentConfig.telegram_bot_token_masked}` : 'Ex: 123456789:ABCdefGhIJKlmNoPQRsTUVwxyZ'}
                value={telegramToken}
                onChange={(e) => setTelegramToken(e.target.value)}
                className="form-control"
                style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', marginBottom: '8px' }}
              />

              <label style={{ fontSize: '0.75rem', fontWeight: '600', color: 'var(--tblr-muted)', display: 'block', marginBottom: '4px' }}>
                Chat IDs Autorizados (opcional - separados por vírgula):
              </label>
              <input
                type="text"
                placeholder="Ex: 987654321, 123456789"
                value={allowedUsers}
                onChange={(e) => setAllowedUsers(e.target.value)}
                className="form-control"
                style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}
              />
            </div>

            {/* Autonomous Monitor Toggle Switch */}
            <div style={{ padding: '14px', background: 'var(--tblr-table-head-bg)', borderRadius: '6px', border: '1px solid var(--tblr-card-border)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontWeight: '600', fontSize: '0.82rem', color: 'var(--tblr-body-color)' }}>
                    Monitoramento Autônomo em Segundo Plano
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--tblr-muted)', marginTop: '2px' }}>
                    O agente inicia sempre parado por padrão. Alterne aqui para ativar/pausar o loop de auto-cura.
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setAutoMonitor(!autoMonitor)}
                  className={`btn btn-sm ${autoMonitor ? 'btn-outline-danger' : 'btn-primary'}`}
                  style={{ minWidth: '90px', fontSize: '0.75rem' }}
                >
                  {autoMonitor ? 'Parar' : 'Iniciar'}
                </button>
              </div>
            </div>

            {/* Thresholds */}
            <div style={{ padding: '14px', background: 'var(--tblr-table-head-bg)', borderRadius: '6px', border: '1px solid var(--tblr-card-border)' }}>
              <label style={{ fontWeight: '600', fontSize: '0.82rem', color: 'var(--tblr-body-color)', display: 'block', marginBottom: '8px' }}>
                Limites de Alerta do Watchdog SRE (%)
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <span style={{ fontSize: '0.72rem', color: 'var(--tblr-muted)' }}>Alerta de CPU (%)</span>
                  <input
                    type="number"
                    min="10"
                    max="100"
                    value={cpuThreshold}
                    onChange={(e) => setCpuThreshold(e.target.value)}
                    className="form-control"
                    style={{ marginTop: '2px', fontSize: '0.8rem' }}
                  />
                </div>
                <div>
                  <span style={{ fontSize: '0.72rem', color: 'var(--tblr-muted)' }}>Alerta de Memória RAM (%)</span>
                  <input
                    type="number"
                    min="10"
                    max="100"
                    value={memThreshold}
                    onChange={(e) => setMemThreshold(e.target.value)}
                    className="form-control"
                    style={{ marginTop: '2px', fontSize: '0.8rem' }}
                  />
                </div>
              </div>
            </div>

            {savedSuccess && (
              <div style={{ padding: '10px 12px', background: 'var(--tblr-success-subtle)', border: '1px solid var(--tblr-success-border)', color: 'var(--tblr-success)', borderRadius: '6px', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <CheckCircle size={15} />
                <span>Configurações salvas e aplicadas com sucesso!</span>
              </div>
            )}
          </div>

          <div className="card-footer">
            <button type="button" onClick={onClose} className="btn btn-secondary btn-sm">
              Cancelar
            </button>
            <button type="submit" disabled={loading} className="btn btn-primary btn-sm">
              <Save size={14} />
              <span>{loading ? 'Salvando...' : 'Salvar Alterações'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
