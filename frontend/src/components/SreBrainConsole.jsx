import React, { useState, useEffect, useRef } from 'react';
import { 
  Terminal, 
  Send, 
  Sparkles, 
  Bot, 
  User, 
  Mic, 
  Activity, 
  RotateCw, 
  ShieldAlert, 
  CheckCircle,
  Copy,
  Check,
  Zap,
  Clock,
  Play,
  Square
} from 'lucide-react';
import { api } from '../api/client';

export default function SreBrainConsole({ onOpenVoiceModal, statusData, onToggleAgent }) {
  const isAgentActive = Boolean(statusData?.agent?.auto_monitor_enabled);
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      content: `👋 Olá! Eu sou o **AegisSRE**, seu Agente Autônomo e Arquiteto SRE Principal.
Estou monitorando seu servidor Easypanel, containeres Docker e o código das aplicações (PHP, Python, SQL, etc.).

Como posso te ajudar agora? Você pode digitar, clicar nas sugestões abaixo ou **falar por voz** 🎙️ usando o Groq Whisper!`
    }
  ]);
  const [inputMessage, setInputMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [events, setEvents] = useState([]);
  const [copiedIdx, setCopiedIdx] = useState(null);
  const messagesEndRef = useRef(null);

  const fetchEvents = async () => {
    try {
      const data = await api.getAgentEvents();
      setEvents(data);
    } catch (err) {
      console.error('Failed to fetch events:', err);
    }
  };

  useEffect(() => {
    fetchEvents();
    const interval = setInterval(fetchEvents, 8000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const handleSend = async (textToSend = null) => {
    const text = textToSend || inputMessage;
    if (!text.trim() || loading) return;

    const userMsg = { role: 'user', content: text };
    setMessages(prev => [...prev, userMsg]);
    if (!textToSend) setInputMessage('');
    setLoading(true);

    try {
      const history = messages.slice(-6).map(m => ({ role: m.role, content: m.content }));
      const res = await api.chatWithAgent(text, history);
      setMessages(prev => [...prev, { role: 'assistant', content: res.reply }]);
    } catch (err) {
      setMessages(prev => [
        ...prev, 
        { role: 'assistant', content: `❌ Erro ao consultar o Agente SRE: ${err.message}` }
      ]);
    } finally {
      setLoading(false);
    }
  };

  const copyCode = (text, idx) => {
    navigator.clipboard.writeText(text);
    setCopiedIdx(idx);
    setTimeout(() => setCopiedIdx(null), 2000);
  };

  return (
    <div>
      {/* Page Header */}
      <div className="page-header">
        <div>
          <div className="page-pretitle">COPILOT &amp; DIAGNÓSTICO</div>
          <h2 className="page-title">
            <Zap size={22} color="var(--tblr-primary)" />
            <span>SRE Brain Console (Groq LLaMA 3.3 70B)</span>
          </h2>
        </div>
        <div className="btn-list">
          {/* Agent Master Control Button */}
          <button
            onClick={onToggleAgent}
            className={`btn btn-sm ${isAgentActive ? 'btn-outline-danger' : 'btn-primary'}`}
            style={{ display: 'flex', alignItems: 'center', gap: '7px', fontWeight: '600' }}
            title={isAgentActive ? 'Clique para Parar o Agente SRE' : 'Clique para Iniciar o Agente SRE'}
          >
            <span
              className={`status-dot ${isAgentActive ? 'status-green status-dot-animated' : 'status-red'}`}
              style={{ width: '8px', height: '8px' }}
            />
            <span>{isAgentActive ? 'Agente: ATIVO (Parar)' : 'Agente: PARADO (Iniciar)'}</span>
            {isAgentActive ? <Square size={13} fill="currentColor" /> : <Play size={13} fill="currentColor" />}
          </button>

          <button
            onClick={onOpenVoiceModal}
            className="btn btn-secondary btn-sm"
          >
            <Mic size={14} />
            <span>Falar por Voz (Whisper)</span>
          </button>
        </div>
      </div>

      <div className="row">
        {/* Left Column: Chat Box */}
        <div className="col-8">
          <div className="card" style={{ display: 'flex', flexDirection: 'column', height: '620px' }}>
            <div className="card-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div className="avatar-icon bg-primary-lt" style={{ width: '32px', height: '32px' }}>
                  <Bot size={18} />
                </div>
                <div>
                  <h3 className="card-title">Sessão Interativa com o Agente SRE</h3>
                  <div className="card-subtitle">
                    Modelo: <strong>llama-3.3-70b-versatile</strong> • Contexto: Telemetria Completa do Docker
                  </div>
                </div>
              </div>
              <span className="badge badge-subtle-success">
                <span className="status-dot status-green status-dot-animated"></span> Online
              </span>
            </div>

            {/* Messages Area */}
            <div className="card-body" style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {messages.map((m, idx) => {
                const isAssistant = m.role === 'assistant';
                return (
                  <div 
                    key={idx}
                    style={{
                      display: 'flex',
                      gap: '12px',
                      alignItems: 'flex-start',
                      alignSelf: isAssistant ? 'flex-start' : 'flex-end',
                      maxWidth: '85%'
                    }}
                  >
                    {isAssistant && (
                      <div className="avatar-icon bg-primary-lt" style={{ width: '30px', height: '30px', flexShrink: 0 }}>
                        <Bot size={16} />
                      </div>
                    )}

                    <div 
                      style={{
                        padding: '12px 16px',
                        borderRadius: '8px',
                        background: isAssistant ? 'var(--tblr-card-bg)' : 'var(--tblr-primary)',
                        color: isAssistant ? 'var(--tblr-body-color)' : '#ffffff',
                        border: isAssistant ? '1px solid var(--tblr-card-border)' : 'none',
                        boxShadow: 'var(--tblr-card-shadow)',
                        fontSize: '0.85rem',
                        lineHeight: '1.6',
                        whiteSpace: 'pre-wrap'
                      }}
                    >
                      {m.content}
                    </div>

                    {!isAssistant && (
                      <div className="avatar-icon bg-primary" style={{ width: '30px', height: '30px', color: '#fff', flexShrink: 0 }}>
                        <User size={16} />
                      </div>
                    )}
                  </div>
                );
              })}

              {loading && (
                <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                  <div className="avatar-icon bg-primary-lt" style={{ width: '30px', height: '30px' }}>
                    <Bot size={16} />
                  </div>
                  <div style={{ padding: '8px 14px', background: 'var(--tblr-card-bg)', border: '1px solid var(--tblr-card-border)', borderRadius: '8px', fontSize: '0.8rem', color: 'var(--tblr-muted)' }}>
                    O agente SRE está raciocinando com LLaMA 3.3 70B...
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* Quick Prompts Bar */}
            <div style={{ padding: '8px 16px', background: 'var(--tblr-table-head-bg)', borderTop: '1px solid var(--tblr-card-border)', display: 'flex', gap: '6px', overflowX: 'auto' }}>
              <button
                onClick={() => handleSend('Qual é o status geral de saúde do servidor e dos containeres?')}
                className="btn btn-secondary btn-sm"
                style={{ fontSize: '0.72rem', whiteSpace: 'nowrap' }}
              >
                📊 Status Geral
              </button>
              <button
                onClick={() => handleSend('Por que o php-ecommerce-api está consumindo tanta memória e como otimizar?')}
                className="btn btn-secondary btn-sm"
                style={{ fontSize: '0.72rem', whiteSpace: 'nowrap' }}
              >
                🐘 Investigar PHP Memory Leak
              </button>
              <button
                onClick={() => handleSend('Como posso subir essa infraestrutura localmente usando o Terraform gerado?')}
                className="btn btn-secondary btn-sm"
                style={{ fontSize: '0.72rem', whiteSpace: 'nowrap' }}
              >
                🏗️ Instruções Terraform IaC
              </button>
            </div>

            {/* Input Bar */}
            <div className="card-footer" style={{ padding: '12px 16px' }}>
              <form 
                onSubmit={(e) => { e.preventDefault(); handleSend(); }} 
                style={{ display: 'flex', width: '100%', gap: '10px' }}
              >
                <input
                  type="text"
                  placeholder="Pergunte ao SRE sobre arquitetura, logs, otimização de consultas SQL, etc..."
                  value={inputMessage}
                  onChange={(e) => setInputMessage(e.target.value)}
                  className="form-control"
                  style={{ flex: 1 }}
                />
                <button
                  type="submit"
                  disabled={loading || !inputMessage.trim()}
                  className="btn btn-primary"
                >
                  <Send size={15} />
                  <span>Enviar</span>
                </button>
              </form>
            </div>
          </div>
        </div>

        {/* Right Column: SRE Autonomous Audit Log Timeline */}
        <div className="col-4">
          <div className="card" style={{ height: '620px', display: 'flex', flexDirection: 'column' }}>
            <div className="card-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Activity size={16} color="var(--tblr-primary)" />
                <h4 className="card-title">Auditoria Autônoma</h4>
              </div>
              <button onClick={fetchEvents} className="btn-icon" title="Atualizar Logs">
                <RotateCw size={13} />
              </button>
            </div>

            <div className="card-body" style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
              {/* Agent Status Bar */}
              <div
                style={{
                  padding: '9px 12px',
                  borderRadius: '6px',
                  marginBottom: '14px',
                  background: isAgentActive ? 'var(--tblr-success-subtle)' : 'var(--tblr-table-head-bg)',
                  border: `1px solid ${isAgentActive ? 'var(--tblr-success-border)' : 'var(--tblr-card-border)'}`,
                  fontSize: '0.75rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: '600', color: isAgentActive ? 'var(--tblr-success)' : 'var(--tblr-muted)' }}>
                  <span
                    className={`status-dot ${isAgentActive ? 'status-green status-dot-animated' : 'status-red'}`}
                    style={{ width: '7px', height: '7px' }}
                  />
                  <span>{isAgentActive ? 'Watchdog Ativo' : 'Watchdog Parado (Standby)'}</span>
                </div>
                <button
                  onClick={onToggleAgent}
                  className={`btn btn-sm ${isAgentActive ? 'btn-outline-danger' : 'btn-primary'}`}
                  style={{ padding: '2px 10px', fontSize: '0.72rem', height: '24px' }}
                >
                  {isAgentActive ? 'Parar' : 'Iniciar'}
                </button>
              </div>

              {events.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  {events.map((ev, i) => (
                    <div 
                      key={i} 
                      style={{ 
                        padding: '10px 12px', 
                        borderRadius: '6px', 
                        background: 'var(--tblr-table-head-bg)', 
                        border: '1px solid var(--tblr-card-border)',
                        fontSize: '0.78rem'
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                        <span className={`badge ${ev.level === 'WARNING' ? 'badge-subtle-warning' : ev.level === 'CRITICAL' ? 'badge-subtle-danger' : 'badge-subtle-success'}`}>
                          {ev.level || 'INFO'}
                        </span>
                        <span style={{ fontSize: '0.7rem', color: 'var(--tblr-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <Clock size={11} /> {ev.timestamp || 'Agora'}
                        </span>
                      </div>
                      <div style={{ fontWeight: '600', color: 'var(--tblr-body-color)', marginBottom: '3px' }}>
                        {ev.title || ev.type}
                      </div>
                      <div style={{ color: 'var(--tblr-muted)', lineHeight: '1.4' }}>
                        {ev.message || ev.details}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ textAlign: 'center', padding: '40px 10px', color: 'var(--tblr-muted)', fontSize: '0.8rem' }}>
                  Nenhum evento anômalo registrado. O cluster está operando com estabilidade.
                </div>
              )}
            </div>

            <div className="card-footer" style={{ fontSize: '0.75rem', color: 'var(--tblr-muted)' }}>
              Watchdog em ciclo ativo a cada 30 segundos
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
