import React, { useState, useEffect } from 'react';
import { 
  FileCode2, 
  Download, 
  Copy, 
  Check, 
  RotateCw, 
  Terminal, 
  Server, 
  Play, 
  ShieldCheck,
  FolderGit2
} from 'lucide-react';
import { api } from '../api/client';

export default function IaCStudio() {
  const [suite, setSuite] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedFile, setSelectedFile] = useState('terraform/main.tf');
  const [copied, setCopied] = useState(false);

  const fetchIaC = async () => {
    setLoading(true);
    try {
      const data = await api.getIaCSuite();
      setSuite(data);
      if (data.files && !data.files[selectedFile]) {
        setSelectedFile(Object.keys(data.files)[0]);
      }
    } catch (err) {
      console.error('Failed to fetch IaC suite:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchIaC();
  }, []);

  const copyCode = (codeText) => {
    navigator.clipboard.writeText(codeText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const files = suite?.files || {};
  const currentCode = files[selectedFile] || '';

  return (
    <div>
      {/* Page Header */}
      <div className="page-header">
        <div>
          <div className="page-pretitle">DEVOPS &amp; REPRODUTIBILIDADE</div>
          <h2 className="page-title">
            <FileCode2 size={22} color="var(--tblr-primary)" />
            <span>IaC Architecture Studio (Terraform &amp; Ansible)</span>
          </h2>
        </div>
        <div className="btn-list">
          <button 
            onClick={fetchIaC}
            disabled={loading}
            className="btn btn-secondary btn-sm"
          >
            <RotateCw size={14} className={loading ? 'animate-spin' : ''} />
            <span>Atualizar</span>
          </button>
          <a
            href={api.getIaCZipUrl()}
            download="aegis-iac-suite.zip"
            className="btn btn-primary btn-sm"
          >
            <Download size={14} />
            <span>Baixar Bundle ZIP Completo</span>
          </a>
        </div>
      </div>

      {/* Main Studio Card */}
      <div className="card">
        {/* Navigation Tabs Header */}
        <div className="card-header" style={{ padding: '0 16px', borderBottom: '1px solid var(--tblr-card-border)', overflowX: 'auto' }}>
          <div style={{ display: 'flex', gap: '4px' }}>
            {Object.keys(files).map((fileName) => {
              const isActive = selectedFile === fileName;
              return (
                <button
                  key={fileName}
                  onClick={() => setSelectedFile(fileName)}
                  style={{
                    padding: '14px 16px',
                    border: 'none',
                    background: 'transparent',
                    borderBottom: isActive ? '2px solid var(--tblr-primary)' : '2px solid transparent',
                    color: isActive ? 'var(--tblr-primary)' : 'var(--tblr-muted)',
                    fontWeight: isActive ? '600' : '500',
                    fontSize: '0.82rem',
                    fontFamily: 'var(--font-mono)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    whiteSpace: 'nowrap'
                  }}
                >
                  <FolderGit2 size={13} />
                  <span>{fileName}</span>
                </button>
              );
            })}
          </div>

          <div className="card-actions" style={{ padding: '8px 0' }}>
            <button
              onClick={() => copyCode(currentCode)}
              className="btn btn-secondary btn-sm"
            >
              {copied ? <Check size={13} color="var(--tblr-success)" /> : <Copy size={13} />}
              <span>{copied ? 'Copiado!' : 'Copiar Arquivo'}</span>
            </button>
          </div>
        </div>

        {/* Code Content */}
        <div className="card-body" style={{ padding: '16px' }}>
          <div className="code-editor-box">
            <div className="code-editor-header">
              <span style={{ fontSize: '0.78rem', color: 'var(--tblr-faint)' }}>
                {selectedFile}
              </span>
              <span className="badge badge-subtle-primary" style={{ fontSize: '0.68rem' }}>
                {selectedFile.endsWith('.tf') ? 'Terraform HCL' : selectedFile.endsWith('.yml') ? 'YAML Playbook' : 'Script'}
              </span>
            </div>
            <pre className="code-editor-content">
              {currentCode || '// Carregando código da infraestrutura...'}
            </pre>
          </div>
        </div>

        {/* Instructions Footer */}
        <div className="card-footer">
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '0.8rem', color: 'var(--tblr-muted)' }}>
            <ShieldCheck size={16} color="var(--tblr-success)" />
            <span>Código 100% idempotente testado para restaurar ambiente local via Docker Socket ou Easypanel.</span>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <code style={{ fontSize: '0.75rem', padding: '4px 8px', background: 'var(--tblr-primary-subtle)', color: 'var(--tblr-primary)', borderRadius: '4px' }}>
              terraform init &amp;&amp; terraform apply
            </code>
          </div>
        </div>
      </div>
    </div>
  );
}
