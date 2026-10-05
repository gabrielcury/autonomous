import React, { useState } from 'react';
import { 
  Bug, 
  Play, 
  FileCode, 
  AlertCircle, 
  CheckCircle, 
  Sparkles, 
  Copy, 
  Check, 
  FileSearch,
  Zap,
  ArrowRight
} from 'lucide-react';
import { api } from '../api/client';

export default function CodeTracer({ containers, onConsultAiWithContext }) {
  const [selectedContainer, setSelectedContainer] = useState(containers?.[0]?.name || 'php-ecommerce-api');
  const [customLogs, setCustomLogs] = useState('');
  const [loading, setLoading] = useState(false);
  const [analysisResult, setAnalysisResult] = useState(null);
  const [copiedIdx, setCopiedIdx] = useState(null);

  const runCodeTrace = async () => {
    setLoading(true);
    try {
      const containerObj = containers?.find(c => c.name === selectedContainer);
      const techStack = containerObj?.tech_stack || 'General';
      const result = await api.traceCode(selectedContainer, customLogs || null, techStack);
      setAnalysisResult(result);
    } catch (err) {
      console.error('Failed to run code trace:', err);
    } finally {
      setLoading(false);
    }
  };

  const copyCode = (codeText, idx) => {
    navigator.clipboard.writeText(codeText);
    setCopiedIdx(idx);
    setTimeout(() => setCopiedIdx(null), 2000);
  };

  return (
    <div>
      {/* Page Header */}
      <div className="page-header">
        <div>
          <div className="page-pretitle">INTELIGÊNCIA &amp; ANÁLISE DE CÓDIGO</div>
          <h2 className="page-title">
            <Bug size={22} color="var(--tblr-primary)" />
            <span>Code-Level Debugger &amp; Tracing Engine</span>
          </h2>
        </div>
        <div className="btn-list">
          <span className="badge badge-subtle-primary" style={{ padding: '6px 12px', fontSize: '0.8rem' }}>
            PHP (Zend) • Python (Traceback) • SQL • Node.js
          </span>
        </div>
      </div>

      {/* Input / Control Card */}
      <div className="card">
        <div className="card-header">
          <div>
            <h3 className="card-title">Configurar Injeção de Diagnóstico</h3>
            <div className="card-subtitle">Selecione o container e opcionalmente cole logs ou stack traces reais</div>
          </div>
        </div>

        <div className="card-body">
          <div className="row">
            <div className="col-6">
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '600', marginBottom: '6px', color: 'var(--tblr-body-color)' }}>
                Container Alvo para Inspeção
              </label>
              <select
                value={selectedContainer}
                onChange={(e) => setSelectedContainer(e.target.value)}
                className="form-control"
              >
                {(containers || []).map(c => (
                  <option key={c.name} value={c.name}>
                    {c.name} ({c.tech_stack || 'Generic Container'})
                  </option>
                ))}
              </select>
            </div>

            <div className="col-6">
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '600', marginBottom: '6px', color: 'var(--tblr-body-color)' }}>
                Logs / Stack Trace Opcionais (Vazio para inspeção automática)
              </label>
              <input
                type="text"
                placeholder="Ex: Fatal error: Allowed memory size of 134217728 bytes exhausted..."
                value={customLogs}
                onChange={(e) => setCustomLogs(e.target.value)}
                className="form-control"
              />
            </div>
          </div>

          <div style={{ marginTop: '16px', display: 'flex', justifyContent: 'flex-end' }}>
            <button
              onClick={runCodeTrace}
              disabled={loading}
              className="btn btn-primary"
            >
              {loading ? (
                <>
                  <div className="spinner" style={{ width: '14px', height: '14px', border: '2px solid #fff', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.6s linear infinite' }}></div>
                  <span>Analisando com Groq LLaMA 3.3 70B...</span>
                </>
              ) : (
                <>
                  <Zap size={15} />
                  <span>Executar Diagnóstico a Nível de Código</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Results View */}
      {analysisResult ? (
        <div>
          {/* Executive Summary Card */}
          <div className="card" style={{ borderLeft: '4px solid var(--tblr-primary)' }}>
            <div className="card-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div className="avatar-icon bg-primary-lt" style={{ width: '34px', height: '34px' }}>
                  <Sparkles size={18} />
                </div>
                <div>
                  <h3 className="card-title">{analysisResult.title || 'Diagnóstico de Código Concluído'}</h3>
                  <div className="card-subtitle">
                    Container: <code>{analysisResult.container}</code> • Stack: <strong>{analysisResult.tech_stack}</strong>
                  </div>
                </div>
              </div>
              <span className="badge badge-subtle-success">
                <CheckCircle size={12} /> Diagnóstico Preciso
              </span>
            </div>

            <div className="card-body">
              <p style={{ fontSize: '0.875rem', lineHeight: '1.6', color: 'var(--tblr-body-color)', marginBottom: '14px' }}>
                {analysisResult.diagnosis || analysisResult.summary}
              </p>

              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <span className="badge badge-subtle-primary">
                  Causa Raiz Identificada
                </span>
                <span className="badge badge-subtle-warning">
                  Otimização de Memória &amp; I/O
                </span>
              </div>
            </div>
          </div>

          {/* Code Issues Detected */}
          {(analysisResult.issues || []).map((issue, idx) => (
            <div key={idx} className="card">
              <div className="card-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div className="avatar-icon bg-warning-lt" style={{ width: '32px', height: '32px' }}>
                    <AlertCircle size={16} />
                  </div>
                  <div>
                    <h4 className="card-title">{issue.issue_title || issue.title}</h4>
                    <div className="card-subtitle" style={{ fontFamily: 'var(--font-mono)' }}>
                      {issue.file}:{issue.line}
                    </div>
                  </div>
                </div>

                <div className="card-actions">
                  <span className={`badge ${issue.severity === 'CRITICAL' ? 'badge-subtle-danger' : 'badge-subtle-warning'}`}>
                    {issue.severity || 'ALTA PRIORIDADE'}
                  </span>
                </div>
              </div>

              <div className="card-body">
                <p style={{ fontSize: '0.84rem', color: 'var(--tblr-muted)', lineHeight: '1.6', marginBottom: '16px' }}>
                  {issue.explanation || issue.description}
                </p>

                {/* Diff / Code Block */}
                {issue.code_snippet && (
                  <div className="code-editor-box">
                    <div className="code-editor-header">
                      <span style={{ fontSize: '0.78rem', color: 'var(--tblr-faint)' }}>
                        <FileCode size={13} style={{ display: 'inline', marginRight: '6px' }} />
                        {issue.file} (Linha {issue.line})
                      </span>
                      <button
                        onClick={() => copyCode(issue.code_snippet, idx)}
                        className="btn btn-secondary btn-sm"
                        style={{ padding: '3px 8px', fontSize: '0.72rem' }}
                      >
                        {copiedIdx === idx ? <Check size={12} color="var(--tblr-success)" /> : <Copy size={12} />}
                        <span>{copiedIdx === idx ? 'Copiado!' : 'Copiar Snippet'}</span>
                      </button>
                    </div>
                    <pre className="code-editor-content">
                      {issue.code_snippet}
                    </pre>
                  </div>
                )}
              </div>

              <div className="card-footer">
                <span style={{ fontSize: '0.78rem', color: 'var(--tblr-muted)' }}>
                  Recomendação de SRE: Aplicação de cursor streaming / processamento assíncrono
                </span>
                <button
                  onClick={() => onConsultAiWithContext(issue.issue_title || issue.title, issue.explanation)}
                  className="btn btn-primary btn-sm"
                >
                  <Sparkles size={13} />
                  <span>Consultar Solução com LLaMA 3.3</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        /* Empty State / Initial Demonstration */
        <div className="card" style={{ textAlign: 'center', padding: '40px 20px' }}>
          <div className="avatar-icon bg-primary-lt" style={{ width: '54px', height: '54px', margin: '0 auto 16px auto' }}>
            <FileSearch size={28} />
          </div>
          <h3 style={{ fontSize: '1.1rem', fontWeight: '700', color: 'var(--tblr-body-color)', marginBottom: '8px' }}>
            Nenhum Diagnóstico Ativo em Execução
          </h3>
          <p style={{ fontSize: '0.84rem', color: 'var(--tblr-muted)', maxWidth: '520px', margin: '0 auto 20px auto', lineHeight: '1.5' }}>
            Clique em <strong>"Executar Diagnóstico a Nível de Código"</strong> acima para inspecionar os processos internos de PHP-FPM, chamadas do Zend Engine, memory exhaustion e tracebacks de workers Python.
          </p>
          <div>
            <button onClick={runCodeTrace} className="btn btn-primary">
              <Zap size={14} />
              <span>Simular Diagnóstico Automático</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
