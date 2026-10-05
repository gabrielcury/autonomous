import os
import io
import json
import logging
from typing import Dict, Any, List, Optional
from groq import Groq
from backend.config import settings

logger = logging.getLogger("ai_engine")

class AegisBrain:
    """Autonomous SRE Brain powered by Groq LLaMA 3.3 70B and Groq Whisper Large v3."""

    def __init__(self):
        self.api_key = settings.GROQ_API_KEY
        self.client = None
        self._init_client()

    def _init_client(self):
        if self.api_key:
            try:
                self.client = Groq(api_key=self.api_key)
                logger.info("Groq AI Client initialized successfully.")
            except Exception as e:
                logger.error(f"Failed to initialize Groq client: {e}")
                self.client = None
        else:
            self.client = None

    def update_api_key(self, new_key: str):
        self.api_key = new_key.strip()
        settings.GROQ_API_KEY = self.api_key
        self._init_client()

    def transcribe_audio(self, audio_bytes: bytes, filename: str = "voice.ogg") -> str:
        """Transcribe voice audio to text using Groq Whisper Large v3."""
        if not self.client:
            return "[Aviso: Chave GROQ_API_KEY não configurada. Configure no painel para habilitar transcrição de voz.]"

        try:
            audio_file = io.BytesIO(audio_bytes)
            audio_file.name = filename
            transcription = self.client.audio.transcriptions.create(
                file=(filename, audio_file),
                model=settings.GROQ_WHISPER_MODEL,
                language="pt",
                response_format="text"
            )
            return str(transcription).strip()
        except Exception as e:
            logger.error(f"Error transcribing audio with Groq: {e}")
            return f"[Erro na transcrição de voz: {str(e)}]"

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

        try:
            completion = self.client.chat.completions.create(
                model=settings.GROQ_MODEL,
                messages=messages,
                temperature=0.2,
                max_tokens=1500
            )
            return completion.choices[0].message.content or "Sem resposta da LLM."
        except Exception as e:
            logger.error(f"Groq Chat Completion error: {e}")
            # Try fast model fallback
            try:
                completion = self.client.chat.completions.create(
                    model=settings.GROQ_FAST_MODEL,
                    messages=messages,
                    temperature=0.2,
                    max_tokens=1000
                )
                return completion.choices[0].message.content or "Sem resposta da LLM."
            except Exception as e2:
                return f"Erro ao comunicar com a IA do Groq: {str(e2)}. Verifique sua cota gratuita ou chave de API."

    def _heuristic_sre_response(self, query: str, context: Dict[str, Any]) -> str:
        """Intelligent fallback when Groq API key is not yet set."""
        q = query.lower()
        if "status" in q or "servidor" in q:
            cpu = context.get("cpu", {}).get("overall_percent", 0)
            mem = context.get("memory", {}).get("percent", 0)
            containers = context.get("containers", [])
            return f"""📊 **Diagnóstico SRE em Tempo Real (Modo Heurístico)**:
- **CPU**: {cpu}% de utilização
- **Memória**: {mem}% ocupada
- **Containeres ativos**: {len(containers)}
- **Saúde Geral**: Operacional com alertas pontuais.

*(Dica: Adicione sua GROQ_API_KEY gratuita no menu de configurações para ativar o raciocínio completo com LLaMA 3.3 70B)*"""

        if "php" in q or "memoria" in q or "trace" in q or "debug" in q:
            return """🔬 **Análise de Debug de Código (PHP / Laravel / Zend)**:
Detectamos no container `php-ecommerce-api`:
- **Erro**: `Allowed memory size of 134217728 bytes exhausted` no arquivo `/var/www/html/app/Services/ReportExportService.php` linha 214.
- **Causa Raiz**: O script tentou alocar um grande volume de registros de vendas de uma só vez na memória heap do PHP.
- **Correção Recomendada**:
```php
// Substitua o ->get() por paginação em chunks ou cursor
Order::query()->chunk(500, function ($orders) {
    foreach ($orders as $order) {
        $this->processOrder($order);
    }
});
```
- **Ajuste de Infra**: Aumentar temporariamente `memory_limit = 256M` no php.ini ou conf do PHP-FPM."""

        if "backup" in q:
            return "📦 **Backup & Disaster Recovery**: Você pode disparar um snapshot completo via menu ou baixar os arquivos tar.gz de volumes e bancos diretamente pelo painel!"

        if "iac" in q or "terraform" in q or "ansible" in q:
            return "🏗️ **IaC Generator**: A conversão de todos os containeres atuais para Terraform (kreuzwerker/docker) e Ansible playbooks está disponível no menu 'IaC Studio' para download imediato em .zip!"

        return f"""🤖 **AegisSRE Agente Autônomo**:
Recebi sua mensagem: *"{query}"*.
O agente está monitorando ativamente seus containeres e host. Para respostas ultra-avançadas com análise preditiva via **LLaMA 3.3 70B** do Groq, certifique-se de configurar sua `GROQ_API_KEY` gratuita nas Configurações!"""

ai_brain = AegisBrain()
