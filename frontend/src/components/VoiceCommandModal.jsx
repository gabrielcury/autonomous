import React, { useState, useRef, useEffect } from 'react';
import { Mic, Square, X, RotateCw, Sparkles, Volume2, Bot } from 'lucide-react';
import { api } from '../api/client';

export default function VoiceCommandModal({ isOpen, onClose }) {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [processing, setProcessing] = useState(false);
  const [transcription, setTranscription] = useState('');
  const [response, setResponse] = useState('');
  const [error, setError] = useState(null);

  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const timerRef = useRef(null);

  useEffect(() => {
    if (!isOpen) {
      setIsRecording(false);
      setRecordingTime(0);
      setProcessing(false);
      setTranscription('');
      setResponse('');
      setError(null);
      if (timerRef.current) clearInterval(timerRef.current);
    }
  }, [isOpen]);

  const startRecording = async () => {
    setError(null);
    setTranscription('');
    setResponse('');
    audioChunksRef.current = [];

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/ogg' });
        stream.getTracks().forEach(track => track.stop());
        await sendAudioToAgent(audioBlob);
      };

      mediaRecorder.start();
      setIsRecording(true);
      setRecordingTime(0);

      timerRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);
    } catch (err) {
      setError(`Erro ao acessar microfone: ${err.message}. Verifique as permissões.`);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (timerRef.current) clearInterval(timerRef.current);
    }
  };

  const sendAudioToAgent = async (blob) => {
    setProcessing(true);
    try {
      const res = await api.sendVoiceAudio(blob, 'browser_mic.ogg');
      setTranscription(res.transcription || 'Sem transcrição.');
      setResponse(res.reply || 'Sem resposta do agente.');
    } catch (err) {
      setError(`Erro ao processar áudio: ${err.message}`);
    } finally {
      setProcessing(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="card-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div className="avatar-icon bg-purple-lt" style={{ width: '34px', height: '34px' }}>
              <Mic size={18} />
            </div>
            <div>
              <h3 className="card-title">Comando de Voz para o Agente SRE</h3>
              <div className="card-subtitle">Groq Whisper Large v3 (Zero Latência)</div>
            </div>
          </div>
          <button onClick={onClose} className="btn-icon">
            <X size={16} />
          </button>
        </div>

        <div className="card-body">
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px 0', background: 'var(--tblr-table-head-bg)', borderRadius: '8px', border: '1px solid var(--tblr-card-border)', marginBottom: '16px' }}>
            <button
              onClick={isRecording ? stopRecording : startRecording}
              disabled={processing}
              style={{
                width: '72px',
                height: '72px',
                borderRadius: '50%',
                border: 'none',
                background: isRecording ? 'var(--tblr-danger)' : 'var(--tblr-primary)',
                color: '#ffffff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                boxShadow: isRecording ? '0 0 0 6px var(--tblr-danger-subtle)' : '0 4px 12px rgba(32, 107, 196, 0.35)',
                transition: 'all 0.2s ease'
              }}
            >
              {isRecording ? <Square size={28} /> : <Mic size={28} />}
            </button>

            <div style={{ marginTop: '14px', textAlign: 'center' }}>
              {isRecording ? (
                <div>
                  <p style={{ fontWeight: '600', color: 'var(--tblr-danger)', fontSize: '0.875rem' }}>
                    Gravando áudio... Clique para parar
                  </p>
                  <p style={{ fontSize: '0.75rem', fontFamily: 'var(--font-mono)', color: 'var(--tblr-muted)', marginTop: '2px' }}>
                    00:{recordingTime < 10 ? `0${recordingTime}` : recordingTime}
                  </p>
                </div>
              ) : processing ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.82rem', color: 'var(--tblr-primary)' }}>
                  <RotateCw size={14} className="animate-spin" />
                  <span>Transcrevendo áudio com Whisper e consultando SRE Agent...</span>
                </div>
              ) : (
                <p style={{ fontSize: '0.8rem', color: 'var(--tblr-muted)' }}>
                  Clique no microfone e dite sua pergunta sobre containeres, memória ou infraestrutura
                </p>
              )}
            </div>
          </div>

          {error && (
            <div style={{ padding: '10px 12px', background: 'var(--tblr-danger-subtle)', border: '1px solid var(--tblr-danger-border)', color: 'var(--tblr-danger)', borderRadius: '6px', fontSize: '0.8rem', marginBottom: '16px' }}>
              {error}
            </div>
          )}

          {transcription && (
            <div style={{ marginBottom: '14px', padding: '12px', background: 'var(--tblr-card-bg)', border: '1px solid var(--tblr-card-border)', borderRadius: '6px' }}>
              <div style={{ fontSize: '0.72rem', textTransform: 'uppercase', color: 'var(--tblr-muted)', fontWeight: '700', marginBottom: '4px' }}>
                Você disse (Transcrição Whisper):
              </div>
              <div style={{ fontSize: '0.85rem', color: 'var(--tblr-body-color)', fontStyle: 'italic' }}>
                "{transcription}"
              </div>
            </div>
          )}

          {response && (
            <div style={{ padding: '12px', background: 'var(--tblr-primary-subtle)', border: '1px solid var(--tblr-primary-border)', borderRadius: '6px' }}>
              <div style={{ fontSize: '0.72rem', textTransform: 'uppercase', color: 'var(--tblr-primary)', fontWeight: '700', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '5px' }}>
                <Bot size={13} />
                <span>Resposta do Agente SRE:</span>
              </div>
              <div style={{ fontSize: '0.85rem', color: 'var(--tblr-body-color)', lineHeight: '1.6', whiteSpace: 'pre-wrap' }}>
                {response}
              </div>
            </div>
          )}
        </div>

        <div className="card-footer">
          <span style={{ fontSize: '0.75rem', color: 'var(--tblr-muted)' }}>
            Groq Whisper Large v3 • Gratuito &amp; Ilimitado
          </span>
          <button onClick={onClose} className="btn btn-secondary btn-sm">
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}
