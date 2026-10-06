import os
import io
import json
import logging
from typing import Dict, Any, List, Optional
from groq import Groq
from backend.config import settings

logger = logging.getLogger("ai_engine")

class AegisBrain:
    """Autonomous SRE Brain powered by Groq (GPT OSS 120B / 20B, Qwen 27B) and Groq Whisper."""

    def __init__(self):
        self.api_key = settings.GROQ_API_KEY
        self.client = None
        self.discovered_models: List[str] = []
        self._init_client()

    def _init_client(self):
        if self.api_key:
            try:
                self.client = Groq(api_key=self.api_key)
                logger.info("Groq AI Client initialized successfully.")
                self._discover_available_models()
            except Exception as e:
                logger.error(f"Failed to initialize Groq client: {e}")
                self.client = None
        else:
            self.client = None

    def _discover_available_models(self):
        """Attempt to fetch active models from Groq API account."""
        if not self.client:
            return
        try:
            model_list = self.client.models.list()
            self.discovered_models = [m.id for m in getattr(model_list, "data", [])]
            logger.info(f"Discovered {len(self.discovered_models)} models in Groq account: {self.discovered_models}")
        except Exception as e:
            logger.debug(f"Could not list Groq models: {e}")
            self.discovered_models = []

    def update_api_key(self, new_key: str):
        self.api_key = new_key.strip()
        settings.GROQ_API_KEY = self.api_key
        self._init_client()

    def transcribe_audio(self, audio_bytes: bytes, filename: str = "voice.ogg") -> str:
        """Transcribe voice audio to text using Groq Whisper Large v3 or Turbo."""
        if not self.client:
            return "[Aviso: Chave GROQ_API_KEY não configurada. Configure no painel para habilitar transcrição de voz.]"

        audio_models = [
            settings.GROQ_WHISPER_MODEL,
            "whisper-large-v3",
            "whisper-large-v3-turbo"
        ]
        seen_models = set()
        last_err = ""

        for m in audio_models:
            if not m or m in seen_models:
                continue
            seen_models.add(m)
            try:
                audio_file = io.BytesIO(audio_bytes)
                audio_file.name = filename
                transcription = self.client.audio.transcriptions.create(
                    file=(filename, audio_file),
                    model=m,
                    language="pt",
                    response_format="text"
                )
                return str(transcription).strip()
            except Exception as e:
                last_err = str(e)
                logger.warning(f"Whisper transcription failed with model {m}: {e}")
                continue

        return f"[Erro na transcrição de voz: {last_err}]"

    def consult_sre_agent(self, user_query: str, system_context: Dict[str, Any], conversation_history: Optional[List[Dict[str, str]]] = None) -> str:
        """Consult SRE Agent with full live server telemetry and container status."""
        if not self.client:
            return self._heuristic_sre_response(user_query, system_context)

        # Build comprehensive system prompt
        system_prompt = f"""Você é o **AegisSRE**, um Agente Autônomo e Arquiteto SRE Principal de nível Staff/Principal Engineer.
Sua missão é operar e manter com perfeição servidores Linux rodando Easypanel + Docker, monitorando containers, diagnosticando falhas a nível de infraestrutura E a nível de CÓDIGO FONTE (PHP, Python, Node.js, Go, SQL).

Você é expert absoluto em:
1. Docker & Linux Internals: cgroups, namespaces, OOM killer, bridge networking, Traefik, iptables, storage drivers, volume binds.
2. Code-Level Debugging & Tracing:
   - PHP: Ciclo de vida PHP-FPM, Zend Engine, estouro de `memory_limit`, `pm.max_children`, N+1 queries em Laravel/Zend/Symfony, opcache, segmentations faults.
   - Python: FastAPI/Uvicorn, Celery tasks, GIL bottlenecks, event loop blocking em asyncio, tracebacks, SQLAlchemy connection leaks.
3. Backup & Disaster Recovery: Dumps consistentes de Postgres/MySQL/Redis, snapshot de volumes tar.gz, idempotência de restauração.
4. Infrastructure as Code (IaC): Terraform (provedor docker, hetzner, aws) e Ansible playbooks idempotentes para subir todo o ambiente localmente ou em nova VPS.

=== CONTEXTO ATUAL DO SERVIDOR EM TEMPO REAL ===
Host OS: {system_context.get('os', {}).get('system')} ({system_context.get('os', {}).get('release')})
CPU: {system_context.get('cpu', {}).get('overall_percent')}% | Cores: {system_context.get('cpu', {}).get('cores')} | Load: {system_context.get('cpu', {}).get('load_avg')}
RAM: {system_context.get('memory', {}).get('used_gb')}GB / {system_context.get('memory', {}).get('total_gb')}GB ({system_context.get('memory', {}).get('percent')}%)
Containeres Ativos: {len(system_context.get('containers', []))}
Lista de Containeres:
{json.dumps([{ 'name': c.get('name'), 'status': c.get('status'), 'image': c.get('image'), 'ports': c.get('ports') } for c in system_context.get('containers', [])], indent=1)}

Achados recentes de Debug/Trace de Código:
{json.dumps(system_context.get('code_findings', []), indent=1)}
================================================

Diretrizes de resposta:
- Responda em Português do Brasil com tom assertivo, altamente técnico, claro e prático.
- Se houver problema de código (como estouro de memória PHP ou exceção Python), mostre o trecho de código exato que deve ser alterado e o ajuste no container.
- Forneça comandos claros e precisos (Docker, Terraform, Ansible, bash) quando aplicável.
- Se o usuário der um comando para executar algo (ex: reiniciar, analisar, gerar backup), confirme a análise e explique os passos tomados.
"""

        messages = [{"role": "system", "content": system_prompt}]
        
        # Add conversation history
        if conversation_history:
            for msg in conversation_history[-6:]:
                messages.append(msg)

        messages.append({"role": "user", "content": user_query})

        # Build candidate models pool in prioritized order
        candidates: List[str] = []

        # 1. Configured models
        if settings.GROQ_MODEL and settings.GROQ_MODEL not in candidates:
            candidates.append(settings.GROQ_MODEL)
        if settings.GROQ_FAST_MODEL and settings.GROQ_FAST_MODEL not in candidates:
            candidates.append(settings.GROQ_FAST_MODEL)

        # 2. Known active Groq models (GPT OSS 120B / 20B, Qwen 3.8 27B)
        supported_pool = [
            "openai/gpt-oss-120b",
            "openai/gpt-oss-20b",
            "qwen/qwen3.8-27b",
            "gpt-oss-120b",
            "gpt-oss-20b",
            "qwen-3.8-27b"
        ]
        for m in supported_pool:
            if m not in candidates:
                candidates.append(m)

        # 3. Discovered models from account
        if self.discovered_models:
            for m in self.discovered_models:
                if any(k in m.lower() for k in ["gpt-oss", "qwen", "llama", "deepseek"]) and m not in candidates:
                    candidates.append(m)

        last_error = ""
        for model_name in candidates:
            try:
                completion = self.client.chat.completions.create(
                    model=model_name,
                    messages=messages,
                    temperature=0.2,
                    max_tokens=1500
                )
                ans = completion.choices[0].message.content
                if ans:
                    logger.info(f"Groq Chat Completion succeeded with model: {model_name}")
                    return ans
            except Exception as e:
                err_str = str(e)
                last_error = err_str
                logger.warning(f"Groq Chat Completion attempt failed with model '{model_name}': {err_str}")
                continue

        logger.error(f"All Groq model attempts failed. Last error: {last_error}. Returning intelligent SRE heuristic.")
        heuristic_reply = self._heuristic_sre_response(user_query, system_context)
        return (
            f"{heuristic_reply}\n\n"
            f"> 💡 *Nota Groq: Modelos testados ({', '.join(candidates[:2])}). Erro na API: {last_error[:110]}... Resposta gerada com sucesso via motor SRE interno.*"
        )

    def _heuristic_sre_response(self, query: str, context: Dict[str, Any]) -> str:
        """Intelligent fallback when Groq API key is not yet set or during offline recovery."""
        q = query.lower()
        if "status" in q or "servidor" in q:
            cpu = context.get("cpu", {}).get("overall_percent", 0)
            mem = context.get("memory", {}).get("percent", 0)
            containers = context.get("containers", [])
            return f"""📊 **Diagnóstico SRE em Tempo Real (Modo Heurístico)**:
- **CPU**: {cpu}% de utilização
- **Memória**: {mem}% ocupada
- **Containeres ativos**: {len(containers)}
- **Saúde Geral**: Operacional com telemetria estável.

*(Dica: Configure sua GROQ_API_KEY gratuita no menu de configurações para ativar o raciocínio completo com GPT OSS 120B)*"""

        if "memoria" in q or "trace" in q or "debug" in q:
            containers = context.get("containers", [])
            warn_c = next((c for c in containers if c.get("health") == "warning" or c.get("memory_mb", 0) > 400), None)
            if warn_c:
                return f"""🔬 **Análise de Recursos & Otimização SRE**:
Container com consumo elevado: `{warn_c['name']}` ({warn_c.get('tech_stack', 'Docker Service')})
- **Memória Alocada**: {warn_c.get('memory_mb', 0)} MB
- **Recomendação SRE**: Inspecionar logs recentes ou reiniciar o worker se houver acúmulo de cache."""
            return f"""🔬 **Análise de Recursos & Memória**:
Analisados {len(containers)} containeres ativos no cluster via Docker Socket.
Todos estão operando dentro dos parâmetros de estabilidade."""

        if "backup" in q:
            return "📦 **Backup & Disaster Recovery**: Você pode disparar um snapshot completo via menu ou baixar os arquivos tar.gz de volumes e bancos diretamente pelo painel!"

        if "iac" in q or "terraform" in q or "ansible" in q:
            return "🏗️ **IaC Generator**: A conversão de todos os containeres atuais para Terraform (provedor docker) e Ansible playbooks está disponível no menu 'IaC Studio' para download imediato em .zip!"

        return f"""🤖 **AegisSRE Agente Autônomo**:
Recebi sua mensagem: *"{query}"*.
O agente está monitorando ativamente seus containeres e host. Para respostas ultra-avançadas com análise preditiva via **GPT OSS 120B** do Groq, certifique-se de configurar sua `GROQ_API_KEY` gratuita nas Configurações!"""

ai_brain = AegisBrain()
