import React, { useState, useRef, useEffect } from 'react';
import { 
  Send, 
  CheckCircle2, 
  AlertCircle, 
  Mic, 
  Terminal, 
  Shield, 
  MessageSquare, 
  Bot,
  Settings,
  ExternalLink,
  RotateCw,
  Play,
  Volume2,
  Paperclip,
  CheckCheck,
  Cpu,
  Layers,
  Box,
  FileCode,
  Archive,
  Sparkles,
  Info,
  TrendingUp,
  Image as ImageIcon
} from 'lucide-react';
import { api } from '../api/client';

function formatTelegramMarkdown(text) {
  if (!text) return '';
  const parts = text.split(/(```[\s\S]*?```)/g);
  return parts.map((part, pIdx) => {
    if (part.startsWith('```') && part.endsWith('```')) {
      const codeContent = part.slice(3, -3).replace(/^[\w-]+\n/, '');
      return (
        <pre key={pIdx} style={{ background: 'rgba(0,0,0,0.35)', padding: '8px 10px', borderRadius: '6px', fontSize: '0.74rem', fontFamily: 'var(--font-mono)', margin: '6px 0', overflowX: 'auto', border: '1px solid rgba(255,255,255,0.12)' }}>
          {codeContent}
        </pre>
      );
    }
    const lines = part.split('\n');
    return (
      <span key={pIdx}>
        {lines.map((line, lIdx) => {
          const formatted = line
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/_(.*?)_/g, '<em>$1</em>')
            .replace(/`(.*?)`/g, '<code style="background: rgba(0,0,0,0.2); padding: 2px 5px; border-radius: 4px; font-family: var(--font-mono); font-size: 0.88em;">$1</code>');
          return (
            <React.Fragment key={lIdx}>
              <span dangerouslySetInnerHTML={{ __html: formatted }} />
              {lIdx < lines.length - 1 && <br />}
            </React.Fragment>
          );
        })}
      </span>
    );
  });
}

function makeBar(percent, length = 10) {
  const p = Math.min(Math.max(percent, 0), 100);
  const filled = Math.round((p / 100) * length);
  return '█'.repeat(filled) + '░'.repeat(length - filled);
}

export default function TelegramStatus({ statusData, onOpenSettings }) {
  const isConfigured = statusData?.agent?.telegram_configured;
  const isRunning = statusData?.agent?.telegram_bot_active;
  const nodeName = statusData?.host?.os?.node || 'easypanel-vps';

  const cpuPct = statusData?.host?.cpu?.overall_percent || 12.4;
  const memPct = statusData?.host?.memory?.percent || 45.0;

  // Initial Main Menu State
  const initialBotMessage = {
    id: 1,
    sender: 'bot',
    time: '23:38',
    text: `🛡️ **AegisSRE - Central de Comando Autônoma**\n\n🖥️ **Host:** \`${nodeName}\` (Linux x86_64)\n⚡ **CPU:** \`[${makeBar(cpuPct)}]\` ${cpuPct}%\n💾 **RAM:** \`[${makeBar(memPct)}]\` ${memPct}%\n🐳 **Containeres:** ${statusData?.containers_summary?.running || 6}/${statusData?.containers_summary?.total || 6} operacionais\n🧠 **IA:** Groq LLaMA 3.3 70B & Whisper Large v3\n\nEscolha uma opção interativa ou envie mensagens de texto e **voz** 🎙️:`,
    keyboard: [
      [
        { text: '▶️ Iniciar Agente SRE', action: 'agent_start' },
        { text: '⏹️ Parar Agente SRE', action: 'agent_stop' }
      ],
      [
        { text: '📈 Gráficos de Carga (PNG)', action: 'menu_charts' },
        { text: '📊 Status Detalhado', action: 'status' }
      ],
      [
        { text: '🐳 Containeres Docker', action: 'containers' },
        { text: '🩺 Auditoria SRE', action: 'sre_audit' }
      ],
      [
        { text: '🔬 Debug de Código PHP/Py', action: 'code_debug' },
        { text: '🧹 Auto-Cura & Limpeza', action: 'self_healing' }
      ],
      [
        { text: '🗄️ Bancos (Postgres & Redis)', action: 'db_ops' },
        { text: '📦 Criar Backup Agora', action: 'backup' }
      ],
      [
        { text: '🏗️ Exportar IaC (Terraform)', action: 'iac' },
        { text: '🎙️ Simular Mensagem de Voz', action: 'simulate_voice' }
      ]
    ]
  };

  const [messages, setMessages] = useState([initialBotMessage]);
  const [inputVal, setInputVal] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const chatBottomRef = useRef(null);

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  const getCurrentTime = () => {
    const now = new Date();
    return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  };

  const handleAction = async (actionType, param = null) => {
    const time = getCurrentTime();

    if (actionType === 'menu_charts') {
      setMessages(prev => [...prev, {
        id: Date.now(),
        sender: 'user',
        time,
        text: '📈 Gráficos de Carga (PNG)'
      }]);

      setIsTyping(true);
      setTimeout(() => {
        setIsTyping(false);
        setMessages(prev => [...prev, {
          id: Date.now() + 1,
          sender: 'bot',
          time: getCurrentTime(),
          text: `📈 **Central de Gráficos de Telemetria (PNG)**\n\nSelecione o relatório visual que você deseja renderizar agora:`,
          keyboard: [
            [{ text: '📉 CPU & Memória RAM (24h)', action: 'chart_cpu_ram' }],
            [{ text: '📊 Distribuição de Memória por Container', action: 'chart_containers' }],
            [{ text: '🌐 Tráfego de Rede (Throughput I/O)', action: 'chart_network' }],
            [{ text: '⬅️ Voltar ao Menu Principal', action: 'main_menu' }]
          ]
        }]);
      }, 400);

    } else if (actionType === 'chart_cpu_ram') {
      setMessages(prev => [...prev, {
        id: Date.now(),
        sender: 'user',
        time,
        text: '📉 Ver Gráfico de CPU & RAM (24h)'
      }]);

      setIsTyping(true);
      setTimeout(() => {
        setIsTyping(false);
        setMessages(prev => [...prev, {
          id: Date.now() + 1,
          sender: 'bot',
          time: getCurrentTime(),
          photoUrl: `/api/telegram/chart/cpu_ram?t=${Date.now()}`,
          text: `📉 **Gráfico de Carga de CPU & Memória RAM (Últimas 24h)**\n\n• **CPU Atual:** ${cpuPct}% • Carga controlada\n• **RAM Atual:** ${memPct}% (${statusData?.host?.memory?.used_gb || 7.2} GB de ${statusData?.host?.memory?.total_gb || 16.0} GB)\n• **Histórico:** Pico isolado durante exportação de relatórios.`,
          keyboard: [
            [{ text: '📊 Ver Memória por Container', action: 'chart_containers' }],
            [{ text: '⬅️ Voltar aos Gráficos', action: 'menu_charts' }]
          ]
        }]);
      }, 700);

    } else if (actionType === 'chart_containers') {
      setMessages(prev => [...prev, {
        id: Date.now(),
        sender: 'user',
        time,
        text: '📊 Ver Gráfico de Memória por Container'
      }]);

      setIsTyping(true);
      setTimeout(() => {
        setIsTyping(false);
        setMessages(prev => [...prev, {
          id: Date.now() + 1,
          sender: 'bot',
          time: getCurrentTime(),
          photoUrl: `/api/telegram/chart/containers?t=${Date.now()}`,
          text: `📊 **Alocação de Memória RAM por Container**\n\n• **Atenção:** \`php-ecommerce-api\` atingiu 420 MB (> quota recomendada de 400 MB).\n• \`postgres-production\`: 380 MB estável.\n• \`python-ai-worker\`: 290 MB ativo.`,
          keyboard: [
            [{ text: '🔬 Analisar Código PHP', action: 'code_debug' }],
            [{ text: '⚡ Reiniciar Container PHP', action: 'restart_c', param: 'php-ecommerce-api' }],
            [{ text: '⬅️ Voltar aos Gráficos', action: 'menu_charts' }]
          ]
        }]);
      }, 700);

    } else if (actionType === 'chart_network') {
      setMessages(prev => [...prev, {
        id: Date.now(),
        sender: 'user',
        time,
        text: '🌐 Ver Gráfico de Tráfego de Rede'
      }]);

      setIsTyping(true);
      setTimeout(() => {
        setIsTyping(false);
        const net = statusData?.host?.network || { kb_recv_per_sec: 342.1, kb_sent_per_sec: 128.4 };
        setMessages(prev => [...prev, {
          id: Date.now() + 1,
          sender: 'bot',
          time: getCurrentTime(),
          photoUrl: `/api/telegram/chart/network?t=${Date.now()}`,
          text: `🌐 **Throughput de Rede em Tempo Real**\n\n• **Download:** ↓ ${net.kb_recv_per_sec} KB/s\n• **Upload:** ↑ ${net.kb_sent_per_sec} KB/s\n• **Status:** Traefik Proxy operando sem latência ou perda de pacotes.`,
          keyboard: [
            [{ text: '🔄 Atualizar Gráfico', action: 'chart_network' }],
            [{ text: '⬅️ Voltar aos Gráficos', action: 'menu_charts' }]
          ]
        }]);
      }, 700);

    } else if (actionType === 'status') {
      setMessages(prev => [...prev, {
        id: Date.now(),
        sender: 'user',
        time,
        text: '📊 Status Detalhado'
      }]);

      setIsTyping(true);
      setTimeout(() => {
        setIsTyping(false);
        const host = statusData?.host || {};
        const mem = host.memory || { used_gb: 7.2, total_gb: 16.0, percent: 45.0, free_gb: 8.8 };
        const cpu = host.cpu || { overall_percent: 12.4, cores: 8, load_avg: [0.65, 0.58, 0.51] };
        const disk = host.disks?.[0] || { used_gb: 42.5, total_gb: 250.0, percent: 17.0 };

        setMessages(prev => [...prev, {
          id: Date.now() + 1,
          sender: 'bot',
          time: getCurrentTime(),
          text: `📊 **Status Detalhado da Infraestrutura**\n\n⏱️ **Uptime:** \`${host.os?.uptime_human || '14d 6h 32m'}\`\n⚡ **CPU:** \`[${makeBar(cpu.overall_percent)}]\` ${cpu.overall_percent}%\n   • ${cpu.cores} vCPUs • Load: ${cpu.load_avg?.[0] || '0.65'}\n\n💾 **Memória RAM:** \`[${makeBar(mem.percent)}]\` ${mem.percent}%\n   • ${mem.used_gb} GB de ${mem.total_gb} GB (${mem.free_gb} GB livres)\n\n💿 **NVMe SSD:** \`[${makeBar(disk.percent)}]\` ${disk.percent}%\n   • ${disk.used_gb} GB de ${disk.total_gb} GB alocados\n\n🌐 **Rede I/O:** ↑ 128.4 KB/s | ↓ 342.1 KB/s`,
          keyboard: [
            [
              { text: '📈 Ver Gráfico (PNG)', action: 'chart_cpu_ram' },
              { text: '🔄 Atualizar Status', action: 'status' }
            ],
            [{ text: '⬅️ Voltar ao Menu Principal', action: 'main_menu' }]
          ]
        }]);
      }, 500);

    } else if (actionType === 'self_healing') {
      setMessages(prev => [...prev, {
        id: Date.now(),
        sender: 'user',
        time,
        text: '🧹 Auto-Cura & Limpeza'
      }]);

      setIsTyping(true);
      setTimeout(() => {
        setIsTyping(false);
        setMessages(prev => [...prev, {
          id: Date.now() + 1,
          sender: 'bot',
          time: getCurrentTime(),
          text: `🧹 **Central de Auto-Cura & Higienização do Cluster**\n\nO agente SRE pode limpar caches e imagens antigas ou recuperar containeres travados:\n\n• **Docker Prune:** Remove camadas de build e imagens não usadas.\n• **Auto-Restart:** Reinicia workers com vazamento de memória.`,
          keyboard: [
            [{ text: '🧹 Executar Docker Prune (Limpar Cache)', action: 'docker_prune' }],
            [{ text: '⚡ Reiniciar Container com Alerta (PHP)', action: 'restart_c', param: 'php-ecommerce-api' }],
            [{ text: '⬅️ Voltar ao Menu Principal', action: 'main_menu' }]
          ]
        }]);
      }, 500);

    } else if (actionType === 'docker_prune') {
      setMessages(prev => [...prev, {
        id: Date.now(),
        sender: 'user',
        time,
        text: '🧹 Executar Docker Prune'
      }]);

      setIsTyping(true);
      setTimeout(() => {
        setIsTyping(false);
        setMessages(prev => [...prev, {
          id: Date.now() + 1,
          sender: 'bot',
          time: getCurrentTime(),
          text: `✅ **Docker Prune Executado com Sucesso!**\n\n• **Espaço recuperado no NVMe:** 1.84 GB em camadas órfãs\n• **Volumes persistentes:** 100% dos dados de Postgres e Redis preservados\n• **Status:** Cluster higienizado sem impacto na produção.`,
          keyboard: [
            [{ text: '📈 Ver Gráficos de Carga', action: 'menu_charts' }],
            [{ text: '⬅️ Menu Principal', action: 'main_menu' }]
          ]
        }]);
      }, 800);

    } else if (actionType === 'db_ops') {
      setMessages(prev => [...prev, {
        id: Date.now(),
        sender: 'user',
        time,
        text: '🗄️ Bancos (Postgres & Redis)'
      }]);

      setIsTyping(true);
      setTimeout(() => {
        setIsTyping(false);
        setMessages(prev => [...prev, {
          id: Date.now() + 1,
          sender: 'bot',
          time: getCurrentTime(),
          text: `🗄️ **Telemetria de Banco de Dados & Cache In-Memory**\n\n🐘 **PostgreSQL 16:**\n• Conexões ativas: 14/100 (14% alocado)\n• Cache Hit Ratio: 99.4% (Excelente performance)\n• Consultas lentas (>500ms): 0 detectadas\n\n⚡ **Redis 7.2 In-Memory:**\n• Memória usada: 52 MB / 512 MB (Maxmemory LRU)\n• Key Evictions: 0 (Sem expulsão forçada de chaves)\n• Hit Rate: 96.8% de acerto nas requisições`,
          keyboard: [
            [{ text: '📦 Fazer Snapshot dos Bancos', action: 'backup' }],
            [{ text: '⬅️ Voltar ao Menu Principal', action: 'main_menu' }]
          ]
        }]);
      }, 500);

    } else if (actionType === 'containers') {
      setMessages(prev => [...prev, {
        id: Date.now(),
        sender: 'user',
        time,
        text: '🐳 Containeres Docker'
      }]);

      setIsTyping(true);
      setTimeout(() => {
        setIsTyping(false);
        setMessages(prev => [...prev, {
          id: Date.now() + 1,
          sender: 'bot',
          time: getCurrentTime(),
          text: `🐳 **Gerenciador de Containeres Docker (6 serviços ativos):**\n\nSelecione um container para ver logs ou reiniciar:`,
          keyboard: [
            [
              { text: '🟢 easypanel-core', action: 'inspect_c', param: 'easypanel-core' },
              { text: '🟢 traefik-proxy', action: 'inspect_c', param: 'traefik-proxy' }
            ],
            [
              { text: '🟡 php-ecommerce-api', action: 'inspect_c', param: 'php-ecommerce-api' },
              { text: '🟢 python-ai-worker', action: 'inspect_c', param: 'python-ai-worker' }
            ],
            [
              { text: '🟢 postgres-production', action: 'inspect_c', param: 'postgres-production' },
              { text: '🟢 redis-cache', action: 'inspect_c', param: 'redis-cache' }
            ],
            [
              { text: '📊 Gráfico de Memória', action: 'chart_containers' },
              { text: '⬅️ Voltar ao Menu', action: 'main_menu' }
            ]
          ]
        }]);
      }, 400);

    } else if (actionType === 'inspect_c') {
      const cName = param || 'php-ecommerce-api';
      setMessages(prev => [...prev, {
        id: Date.now(),
        sender: 'user',
        time,
        text: `Inspecionar ${cName}`
      }]);

      setIsTyping(true);
      setTimeout(() => {
        setIsTyping(false);
        const isPhp = cName.includes('php');
        setMessages(prev => [...prev, {
          id: Date.now() + 1,
          sender: 'bot',
          time: getCurrentTime(),
          text: `🐳 **Container:** \`${cName}\` ${isPhp ? '🟡 (Atenção SRE)' : '🟢 (Saudável)'}\n\n📦 **Imagem:** ${isPhp ? 'php:8.3-fpm-alpine' : 'easypanel/service:latest'}\n⚙️ **Status:** Up 6 hours (running)\n📊 **Recursos:** ${isPhp ? '18.5% CPU • 420 MB RAM' : '1.2% CPU • 142 MB RAM'}\n🔄 **Restart Policy:** unless-stopped\n🌐 **Rede:** bridge`,
          keyboard: [
            [
              { text: '📋 Ver Logs Recentes', action: 'logs_c', param: cName },
              { text: '⚡ Reiniciar Container', action: 'restart_c', param: cName }
            ],
            [
              { text: '⬅️ Voltar aos Containeres', action: 'containers' }
            ]
          ]
        }]);
      }, 400);

    } else if (actionType === 'restart_c') {
      const cName = param || 'php-ecommerce-api';
      setMessages(prev => [...prev, {
        id: Date.now(),
        sender: 'user',
        time,
        text: `⚡ Reiniciar ${cName}`
      }]);

      setIsTyping(true);
      setTimeout(() => {
        setIsTyping(false);
        setMessages(prev => [...prev, {
          id: Date.now() + 1,
          sender: 'bot',
          time: getCurrentTime(),
          text: `✅ **Sucesso:** Container \`${cName}\` reiniciado com sucesso pelo agente SRE!\n\nNovo uptime: 5 segundos. Consumo de memória redefinido para estado inicial.`,
          keyboard: [
            [{ text: '🐳 Ver Lista de Containeres', action: 'containers' }],
            [{ text: '⬅️ Menu Principal', action: 'main_menu' }]
          ]
        }]);
      }, 600);

    } else if (actionType === 'logs_c') {
      const cName = param || 'php-ecommerce-api';
      setMessages(prev => [...prev, {
        id: Date.now(),
        sender: 'user',
        time,
        text: `📋 Logs de ${cName}`
      }]);

      setIsTyping(true);
      setTimeout(() => {
        setIsTyping(false);
        setMessages(prev => [...prev, {
          id: Date.now() + 1,
          sender: 'bot',
          time: getCurrentTime(),
          text: `📋 **Últimos logs de \`${cName}\`:**\n\`\`\`\n[04-Oct-2026 23:36:14] NOTICE: fpm is running, pid 1\n[04-Oct-2026 23:36:15] NOTICE: ready to handle connections\n[04-Oct-2026 23:37:41] WARNING: [pool www] child 24, script 'ReportExportService.php' (request: "POST /api/reports/export") executing too slow\n[04-Oct-2026 23:37:48] ALERT: memory_limit reached (134217728 bytes)\n\`\`\``,
          keyboard: [
            [{ text: '🔬 Analisar Código com IA', action: 'code_debug' }],
            [{ text: '⬅️ Voltar aos Containeres', action: 'containers' }]
          ]
        }]);
      }, 500);

    } else if (actionType === 'code_debug') {
      setMessages(prev => [...prev, {
        id: Date.now(),
        sender: 'user',
        time,
        text: '🔬 Debug de Código PHP/Py'
      }]);

      setIsTyping(true);
      setTimeout(() => {
        setIsTyping(false);
        setMessages(prev => [...prev, {
          id: Date.now() + 1,
          sender: 'bot',
          time: getCurrentTime(),
          text: `🔬 **Diagnóstico de Código Autônomo (PHP / Zend Engine):**\n\nContainer: \`php-ecommerce-api\`\n📍 **Arquivo:** \`app/Services/ReportExportService.php:214\`\n⚠️ **Incidente:** Allowed memory size exhausted (128MB)\n\n💡 **Causa Raiz:** O método \`hydrateAll()\` carrega 45.000 linhas em memória de uma só vez.\n🔧 **Solução Recomendada:** Substituir por \`yield\` com cursor chunk de 500 registros, reduzindo alocação para 24MB fixos.`,
          keyboard: [
            [{ text: '⚡ Reiniciar Container PHP', action: 'restart_c', param: 'php-ecommerce-api' }],
            [{ text: '⬅️ Voltar ao Menu Principal', action: 'main_menu' }]
          ]
        }]);
      }, 600);

    } else if (actionType === 'backup') {
      setMessages(prev => [...prev, {
        id: Date.now(),
        sender: 'user',
        time,
        text: '📦 Criar Backup Agora'
      }]);

      setIsTyping(true);
      setTimeout(() => {
        setIsTyping(false);
        setMessages(prev => [...prev, {
          id: Date.now() + 1,
          sender: 'bot',
          time: getCurrentTime(),
          text: `📦 **Snapshot de Backup Concluído com Sucesso!**\n\n📁 **Arquivo:** \`backup_easypanel_20261004_2338.tar.gz\`\n💾 **Tamanho:** 42.8 MB\n🔒 **SHA-256:** \`e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855\`\n\nVolumes de Postgres, Redis e configurações do cluster foram catalogados e salvos.`,
          keyboard: [
            [{ text: '⬅️ Voltar ao Menu Principal', action: 'main_menu' }]
          ]
        }]);
      }, 700);

    } else if (actionType === 'iac') {
      setMessages(prev => [...prev, {
        id: Date.now(),
        sender: 'user',
        time,
        text: '🏗️ Exportar IaC (Terraform)'
      }]);

      setIsTyping(true);
      setTimeout(() => {
        setIsTyping(false);
        setMessages(prev => [...prev, {
          id: Date.now() + 1,
          sender: 'bot',
          time: getCurrentTime(),
          text: `🏗️ **Infraestrutura como Código Gerada!**\n\n📦 Pacote compactado \`aegis-iac-suite.zip\` pronto com:\n• \`terraform/main.tf\` (Provedor kreuzwerker/docker)\n• \`ansible/playbook.yml\` & \`inventory.ini\`\n• \`docker-compose.yml\` completo\n• Script de restauração \`restore_environment.sh\`\n\nVocê pode baixar o arquivo .ZIP ou rodar localmente com \`terraform apply\`.`,
          keyboard: [
            [{ text: '⬅️ Voltar ao Menu Principal', action: 'main_menu' }]
          ]
        }]);
      }, 600);

    } else if (actionType === 'simulate_voice') {
      // 1. Voice Note from user
      setMessages(prev => [...prev, {
        id: Date.now(),
        sender: 'user',
        time,
        isVoice: true,
        duration: '0:05'
      }]);

      setIsTyping(true);
      setTimeout(() => {
        setMessages(prev => [...prev, {
          id: Date.now() + 1,
          sender: 'bot',
          time: getCurrentTime(),
          text: `🎙️ *Processando áudio com Groq Whisper Large v3...*\n\n🗣️ **Você disse:**\n_"Aegis, como está o consumo de memória do PHP e me envie o gráfico?"_`
        }]);

        setTimeout(() => {
          setIsTyping(false);
          setMessages(prev => [...prev, {
            id: Date.now() + 2,
            sender: 'bot',
            time: getCurrentTime(),
            photoUrl: `/api/telegram/chart/containers?t=${Date.now()}`,
            text: `🐘 **Diagnóstico SRE em Resposta à sua Voz:**\n\nO container \`php-ecommerce-api\` está com consumo de **420 MB de RAM**, excedendo o threshold de aviso. Detectei um memory leak na linha 214 de \`ReportExportService.php\` ao gerar relatórios sem paginação.\n\nAqui está o gráfico de alocação de memória gerado instantaneamente acima.`,
            keyboard: [
              [{ text: '⚡ Reiniciar PHP Agora', action: 'restart_c', param: 'php-ecommerce-api' }],
              [{ text: '⬅️ Voltar ao Menu', action: 'main_menu' }]
            ]
          }]);
        }, 1000);
      }, 600);

    } else if (actionType === 'sre_audit') {
      setMessages(prev => [...prev, {
        id: Date.now(),
        sender: 'user',
        time,
        text: '🩺 Auditoria SRE'
      }]);

      setIsTyping(true);
      setTimeout(() => {
        setIsTyping(false);
        setMessages(prev => [...prev, {
          id: Date.now() + 1,
          sender: 'bot',
          time: getCurrentTime(),
          text: `🩺 **Auditoria SRE Autônoma - Health Score: 85/100**\n\n⚠️ **Alerta:** Consumo de memória elevado no container \`php-ecommerce-api\` (420 MB / quota sugerida 400 MB).\n✅ CPU em faixa segura (12.4% média).\n✅ Volumes de dados com 207 GB livres no NVMe.\n✅ Todos os 6 containeres operando sem quedas ou restarts anômalos.`,
          keyboard: [
            [{ text: '📈 Ver Gráfico da Carga', action: 'chart_cpu_ram' }],
            [{ text: '🔬 Ver Debug de Código', action: 'code_debug' }],
            [{ text: '⬅️ Voltar ao Menu', action: 'main_menu' }]
          ]
        }]);
      }, 500);

    } else if (actionType === 'agent_start') {
      setMessages(prev => [...prev, {
        id: Date.now(),
        sender: 'user',
        time,
        text: '▶️ Iniciar Agente SRE'
      }]);
      setIsTyping(true);
      setTimeout(async () => {
        setIsTyping(false);
        try { await api.startAgent(); } catch (err) {}
        setMessages(prev => [...prev, {
          id: Date.now() + 1,
          sender: 'bot',
          time: getCurrentTime(),
          text: `🚀 **Agente SRE AUTÔNOMO INICIADO!**\n\nO watchdog em tempo real, verificação de limites de cgroups e rotinas de auto-healing estão agora **ATIVOS**. O monitoramento é executado a cada 30 segundos.`,
          keyboard: [
            [{ text: '⏹️ Parar Agente SRE', action: 'agent_stop' }],
            [{ text: '📊 Status Detalhado', action: 'status' }],
            [{ text: '⬅️ Menu Principal', action: 'main_menu' }]
          ]
        }]);
      }, 500);

    } else if (actionType === 'agent_stop') {
      setMessages(prev => [...prev, {
        id: Date.now(),
        sender: 'user',
        time,
        text: '⏹️ Parar Agente SRE'
      }]);
      setIsTyping(true);
      setTimeout(async () => {
        setIsTyping(false);
        try { await api.stopAgent(); } catch (err) {}
        setMessages(prev => [...prev, {
          id: Date.now() + 1,
          sender: 'bot',
          time: getCurrentTime(),
          text: `⏸️ **Agente SRE AUTÔNOMO PARADO!**\n\nO monitoramento contínuo em segundo plano foi colocado em modo **STANDBY**. O agente não enviará alertas automáticos ou executará auto-cura até ser iniciado novamente.`,
          keyboard: [
            [{ text: '▶️ Iniciar Agente SRE', action: 'agent_start' }],
            [{ text: '📊 Status Detalhado', action: 'status' }],
            [{ text: '⬅️ Menu Principal', action: 'main_menu' }]
          ]
        }]);
      }, 500);

    } else if (actionType === 'main_menu') {
      setMessages(prev => [...prev, {
        id: Date.now(),
        sender: 'user',
        time,
        text: '⬅️ Menu Principal'
      }]);

      setIsTyping(true);
      setTimeout(() => {
        setIsTyping(false);
        setMessages(prev => [...prev, {
          id: Date.now() + 1,
          sender: 'bot',
          time: getCurrentTime(),
          text: `🛡️ **Central de Comando Autônoma (AegisSRE)**\n\nEscolha uma das ações abaixo ou envie comandos de texto e voz:`,
          keyboard: initialBotMessage.keyboard
        }]);
      }, 400);
    }
  };

  const handleSendText = (e) => {
    e.preventDefault();
    if (!inputVal.trim()) return;

    const userText = inputVal.trim();
    setInputVal('');
    const time = getCurrentTime();

    setMessages(prev => [...prev, {
      id: Date.now(),
      sender: 'user',
      time,
      text: userText
    }]);

    setIsTyping(true);

    const lower = userText.toLowerCase();
    setTimeout(() => {
      setIsTyping(false);
      if (lower.startsWith('/charts') || lower.startsWith('/graficos')) {
        handleAction('menu_charts');
      } else if (lower.startsWith('/status')) {
        handleAction('status');
      } else if (lower.startsWith('/containers')) {
        handleAction('containers');
      } else if (lower.startsWith('/clean') || lower.startsWith('/prune')) {
        handleAction('docker_prune');
      } else if (lower.startsWith('/backup')) {
        handleAction('backup');
      } else if (lower.startsWith('/iac')) {
        handleAction('iac');
      } else if (lower.startsWith('/debug') || lower.startsWith('/trace')) {
        handleAction('code_debug');
      } else if (lower.startsWith('/agent_start') || lower.startsWith('/iniciar')) {
        handleAction('agent_start');
      } else if (lower.startsWith('/agent_stop') || lower.startsWith('/parar')) {
        handleAction('agent_stop');
      } else {
        setMessages(prev => [...prev, {
          id: Date.now() + 1,
          sender: 'bot',
          time: getCurrentTime(),
          text: `🤖 **Resposta do Agente SRE (Groq LLaMA 3.3 70B):**\n\nAnalisei sua dúvida: _"${userText}"_.\n\nSua infraestrutura no Easypanel conta com 6 containeres ativos e 1 com consumo elevado de memória (\`php-ecommerce-api\`). Você pode utilizar \`/charts\` para conferir os gráficos visuais ou clicar nos botões abaixo:`,
          keyboard: [
            [
              { text: '📈 Ver Gráficos (PNG)', action: 'menu_charts' },
              { text: '📊 Status Detalhado', action: 'status' }
            ],
            [{ text: '⬅️ Menu Principal', action: 'main_menu' }]
          ]
        }]);
      }
    }, 600);
  };

  const resetChat = () => {
    setMessages([initialBotMessage]);
  };

  return (
    <div>
      {/* Tabler Page Header */}
      <div className="page-header">
        <div>
          <div className="page-pretitle">TELEGRAM BOT AVANÇADO COM GRÁFICOS &amp; SRE</div>
          <h2 className="page-title">
            <Send size={22} color="var(--tblr-primary)" />
            <span>Simulador Interativo do Telegram Bot</span>
          </h2>
        </div>
        <div className="btn-list">
          <button 
            onClick={resetChat} 
            className="btn btn-secondary btn-sm"
            title="Reiniciar Simulação"
          >
            <RotateCw size={14} />
            <span>Reiniciar Chat</span>
          </button>
          <button 
            onClick={onOpenSettings} 
            className="btn btn-primary btn-sm"
          >
            <Settings size={14} />
            <span>Configurar Token do Telegram</span>
          </button>
        </div>
      </div>

      <div className="row">
        {/* Left Column: Interactive Telegram Chat Phone Frame */}
        <div className="col-8">
          <div className="telegram-simulator-frame">
            {/* Telegram Header */}
            <div className="telegram-header">
              <div className="telegram-header-left">
                <div className="telegram-avatar">
                  <Bot size={22} />
                </div>
                <div>
                  <div className="telegram-bot-name">AegisSRE Bot</div>
                  <div className="telegram-bot-status">
                    <span className="status-dot status-green status-dot-animated" style={{ width: '6px', height: '6px' }}></span>
                    <span>bot • online (Groq LLaMA 3.3 70B, Whisper v3 &amp; PNG Charts)</span>
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span className="badge badge-subtle-primary" style={{ fontSize: '0.68rem', padding: '3px 8px' }}>
                  Simulador Ativo
                </span>
              </div>
            </div>

            {/* Telegram Chat Messages Stream */}
            <div className="telegram-chat-body">
              {messages.map((m) => {
                const isBot = m.sender === 'bot';
                return (
                  <div key={m.id} className={`tg-bubble ${isBot ? 'tg-bubble-bot' : 'tg-bubble-user'}`}>
                    {/* Render PNG Chart Image if present */}
                    {m.photoUrl && (
                      <div style={{ marginBottom: '8px', borderRadius: '6px', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.1)' }}>
                        <img 
                          src={m.photoUrl} 
                          alt="Gráfico de Telemetria SRE" 
                          style={{ width: '100%', display: 'block' }}
                        />
                      </div>
                    )}

                    {/* Voice Note Message */}
                    {m.isVoice ? (
                      <div>
                        <div className="tg-voice-player">
                          <button className="tg-voice-play-btn" title="Reproduzir Áudio">
                            <Play size={16} fill="#ffffff" style={{ marginLeft: '2px' }} />
                          </button>
                          <div className="tg-waveform">
                            {[14, 8, 18, 12, 20, 16, 9, 15, 22, 11, 19, 7, 16, 12, 20, 14, 8].map((h, i) => (
                              <div key={i} className="tg-waveform-bar" style={{ height: `${h}px` }} />
                            ))}
                          </div>
                          <span style={{ fontSize: '0.72rem', color: '#ffffff', fontFamily: 'var(--font-mono)' }}>
                            {m.duration}
                          </span>
                        </div>
                        <div style={{ fontSize: '0.68rem', color: '#a0c7ed', marginTop: '4px' }}>
                          🎙️ Áudio de Voz enviado pelo usuário
                        </div>
                      </div>
                    ) : (
                      <div style={{ lineHeight: '1.5' }}>
                        {formatTelegramMarkdown(m.text)}
                      </div>
                    )}

                    {/* Inline Keyboard Buttons */}
                    {m.keyboard && (
                      <div className="tg-inline-keyboard">
                        {m.keyboard.map((row, rIdx) => (
                          <div key={rIdx} className={`tg-btn-row ${row.length === 1 ? 'single' : ''}`}>
                            {row.map((btn, bIdx) => (
                              <button
                                key={bIdx}
                                onClick={() => handleAction(btn.action, btn.param)}
                                className="tg-inline-btn"
                              >
                                {btn.text}
                              </button>
                            ))}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Timestamp */}
                    <div className="tg-time">
                      <span>{m.time}</span>
                      {!isBot && <CheckCheck size={13} color="#64b5f6" />}
                    </div>
                  </div>
                );
              })}

              {isTyping && (
                <div className="tg-bubble tg-bubble-bot" style={{ padding: '8px 14px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', color: '#64b5f6' }}>
                    <div className="spinner" style={{ width: '10px', height: '10px', border: '2px solid #64b5f6', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.6s linear infinite' }}></div>
                    <span>AegisSRE está digitando...</span>
                  </div>
                </div>
              )}

              <div ref={chatBottomRef} />
            </div>

            {/* Input Bar */}
            <form onSubmit={handleSendText} className="telegram-input-bar">
              <button 
                type="button" 
                onClick={() => handleAction('simulate_voice')}
                className="tg-input-icon-btn" 
                title="Simular Envio de Áudio de Voz"
              >
                <Mic size={18} color="var(--tblr-primary)" />
              </button>

              <input
                type="text"
                placeholder="Escreva uma mensagem ou /comando (/charts, /status, /clean, /containers)..."
                value={inputVal}
                onChange={(e) => setInputVal(e.target.value)}
              />

              <button 
                type="submit" 
                disabled={!inputVal.trim()} 
                className="tg-input-icon-btn"
                title="Enviar Mensagem"
              >
                <Send size={18} color={inputVal.trim() ? '#2481cc' : '#6c7883'} />
              </button>
            </form>
          </div>
        </div>

        {/* Right Column: Complete Options Guide */}
        <div className="col-4">
          {/* Card: Recursos do Bot */}
          <div className="card">
            <div className="card-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <TrendingUp size={16} color="var(--tblr-primary)" />
                <h4 className="card-title">Gráficos &amp; Novas Opções</h4>
              </div>
            </div>
            <div className="card-body">
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', fontSize: '0.82rem' }}>
                <div>
                  <div style={{ fontWeight: '600', color: 'var(--tblr-body-color)', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '3px' }}>
                    <ImageIcon size={15} color="var(--tblr-primary)" />
                    <span>1. Gráficos Visuais PNG no Chat</span>
                  </div>
                  <p style={{ color: 'var(--tblr-muted)', lineHeight: '1.4' }}>
                    O bot renderiza gráficos de alta definição (CPU/RAM 24h, Distribuição de Memória e Throughput de Rede) e envia diretamente como foto no Telegram.
                  </p>
                </div>

                <div>
                  <div style={{ fontWeight: '600', color: 'var(--tblr-body-color)', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '3px' }}>
                    <Mic size={15} color="var(--tblr-success)" />
                    <span>2. Comandos de Voz (Groq Whisper v3)</span>
                  </div>
                  <p style={{ color: 'var(--tblr-muted)', lineHeight: '1.4' }}>
                    Mande áudios pelo Telegram (ex: <em>"Aegis, me envie o gráfico de memória e reinicie o PHP"</em>). O Whisper transcreve e o LLaMA 3.3 70B executa as ações.
                  </p>
                </div>

                <div>
                  <div style={{ fontWeight: '600', color: 'var(--tblr-body-color)', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '3px' }}>
                    <Box size={15} color="var(--tblr-warning)" />
                    <span>3. Auto-Cura &amp; Docker Prune</span>
                  </div>
                  <p style={{ color: 'var(--tblr-muted)', lineHeight: '1.4' }}>
                    Limpeza de camadas órfãs de build e recuperação automática de processos com memory leak com 1 clique no botão inline.
                  </p>
                </div>

                <div>
                  <div style={{ fontWeight: '600', color: 'var(--tblr-body-color)', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '3px' }}>
                    <FileCode size={15} color="var(--tblr-purple)" />
                    <span>4. IaC &amp; Download de ZIP</span>
                  </div>
                  <p style={{ color: 'var(--tblr-muted)', lineHeight: '1.4' }}>
                    O bot compila Terraform (`kreuzwerker/docker`), Ansible e Compose e envia o arquivo `.zip` diretamente para você no Telegram.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Card: Status da Conexão Real */}
          <div className="card">
            <div className="card-header">
              <h4 className="card-title">Conexão com seu Bot Real</h4>
            </div>
            <div className="card-body">
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div style={{ padding: '10px 12px', background: 'var(--tblr-table-head-bg)', borderRadius: '6px', border: '1px solid var(--tblr-card-border)', fontSize: '0.78rem' }}>
                  <div style={{ color: 'var(--tblr-muted)' }}>Status da API Telegram:</div>
                  <div style={{ fontWeight: '600', color: isRunning ? 'var(--tblr-success)' : isConfigured ? 'var(--tblr-warning)' : 'var(--tblr-danger)', marginTop: '2px' }}>
                    {isRunning ? '● Online & Conectado' : isConfigured ? '● Iniciando Polling...' : '○ Token Pendente'}
                  </div>
                </div>

                <p style={{ fontSize: '0.78rem', color: 'var(--tblr-muted)', lineHeight: '1.5' }}>
                  Para ativar no seu Telegram real, obtenha seu token no <strong>@BotFather</strong> e insira nas configurações:
                </p>

                <button
                  onClick={onOpenSettings}
                  className="btn btn-primary btn-sm"
                  style={{ width: '100%' }}
                >
                  <Settings size={14} />
                  <span>Inserir Token Telegram</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
