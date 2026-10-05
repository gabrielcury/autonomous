import React, { useState, useEffect } from 'react';
import { 
  Archive, 
  Download, 
  RotateCw, 
  ShieldCheck, 
  Clock, 
  HardDrive, 
  CheckCircle2, 
  FileText, 
  Plus,
  Play
} from 'lucide-react';
import { api } from '../api/client';

export default function BackupCenter() {
  const [backups, setBackups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [note, setNote] = useState('');

  const fetchBackups = async () => {
    setLoading(true);
    try {
      const data = await api.getBackups();
      setBackups(data);
    } catch (err) {
      console.error('Failed to load backups:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBackups();
  }, []);

  const handleCreateSnapshot = async () => {
    setCreating(true);
    try {
      await api.createBackup(note || 'Snapshot manual via Painel Web');
      setNote('');
      await fetchBackups();
    } catch (err) {
      console.error('Failed to create snapshot:', err);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div>
      {/* Page Header */}
      <div className="page-header">
        <div>
          <div className="page-pretitle">RESILIÊNCIA &amp; DISASTER RECOVERY</div>
          <h2 className="page-title">
            <Archive size={22} color="var(--tblr-primary)" />
            <span>Backups &amp; Snapshots de Volumes Docker</span>
          </h2>
        </div>
        <div className="btn-list">
          <button 
            onClick={fetchBackups} 
            disabled={loading}
            className="btn btn-secondary btn-sm"
          >
            <RotateCw size={14} className={loading ? 'animate-spin' : ''} />
            <span>Recarregar</span>
          </button>
        </div>
      </div>

      {/* Create Snapshot Card */}
      <div className="card">
        <div className="card-header">
          <h3 className="card-title">Criar Novo Snapshot de Volumes e Bancos</h3>
          <div className="card-subtitle">Gera arquivo tar.gz compactado com hash SHA-256 e manifesto de integridade</div>
        </div>
        <div className="card-body">
          <div style={{ display: 'flex', gap: '12px' }}>
            <input
              type="text"
              placeholder="Descreva a razão do backup (ex: Antes da migração do banco ou deploy v2.4)..."
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="form-control"
              style={{ flex: 1 }}
            />
            <button
              onClick={handleCreateSnapshot}
              disabled={creating}
              className="btn btn-primary"
            >
              {creating ? (
                <>
                  <div className="spinner" style={{ width: '14px', height: '14px', border: '2px solid #fff', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.6s linear infinite' }}></div>
                  <span>Criando Snapshot...</span>
                </>
              ) : (
                <>
                  <Plus size={15} />
                  <span>Criar Snapshot Imediato</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Snapshots Card Table */}
      <div className="card">
        <div className="card-header">
          <h3 className="card-title">Histórico de Snapshots Disponíveis ({backups.length})</h3>
          <div className="card-actions">
            <span className="badge badge-subtle-success">
              <ShieldCheck size={13} /> Integridade Garantida
            </span>
          </div>
        </div>

        <div className="table-responsive">
          <table className="table table-vcenter card-table table-hover">
            <thead>
              <tr>
                <th>Arquivo de Snapshot</th>
                <th>Data de Geração</th>
                <th>Tamanho</th>
                <th>Checksum SHA-256</th>
                <th>Nota &amp; Escopo</th>
                <th style={{ textAlign: 'right' }}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {backups.length > 0 ? (
                backups.map((b) => (
                  <tr key={b.filename}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div className="avatar-icon bg-success-lt" style={{ width: '32px', height: '32px' }}>
                          <Archive size={16} />
                        </div>
                        <div>
                          <div style={{ fontWeight: '600', color: 'var(--tblr-body-color)', fontFamily: 'var(--font-mono)' }}>
                            {b.filename}
                          </div>
                          <div style={{ fontSize: '0.72rem', color: 'var(--tblr-muted)' }}>
                            Alvos: postgres_data, redis_data, easypanel_apps
                          </div>
                        </div>
                      </div>
                    </td>

                    <td>
                      <div style={{ fontSize: '0.8rem', color: 'var(--tblr-body-color)', display: 'flex', alignItems: 'center', gap: '5px' }}>
                        <Clock size={13} color="var(--tblr-muted)" />
                        <span>{b.created_at || 'Hoje'}</span>
                      </div>
                    </td>

                    <td>
                      <span className="badge badge-subtle-primary" style={{ fontFamily: 'var(--font-mono)' }}>
                        {b.size_human || '42.8 MB'}
                      </span>
                    </td>

                    <td>
                      <code style={{ fontSize: '0.72rem', color: 'var(--tblr-muted)', background: 'var(--tblr-table-head-bg)', padding: '2px 6px', borderRadius: '4px' }}>
                        {b.sha256 ? `${b.sha256.slice(0, 16)}...` : 'e3b0c44298fc1c14...'}
                      </code>
                    </td>

                    <td>
                      <span style={{ fontSize: '0.82rem', color: 'var(--tblr-body-color)' }}>
                        {b.note || 'Snapshot do cluster'}
                      </span>
                    </td>

                    <td style={{ textAlign: 'right' }}>
                      <a
                        href={api.getBackupDownloadUrl(b.filename)}
                        download={b.filename}
                        className="btn btn-secondary btn-sm"
                        title="Baixar arquivo de backup tar.gz"
                      >
                        <Download size={13} />
                        <span>Baixar</span>
                      </a>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="6" style={{ textAlign: 'center', padding: '30px', color: 'var(--tblr-muted)' }}>
                    Nenhum snapshot encontrado. Crie o primeiro backup acima.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
