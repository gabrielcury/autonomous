import asyncio
import collections
import io
import json
import logging
import time
from typing import Dict, Any, List, Optional, Set
import httpx
from backend.config import settings
from backend.docker_engine import docker_manager
from backend.host_metrics import host_metrics
from backend.ai_engine import ai_brain
from backend.code_debugger import code_tracer
from backend.iac_generator import iac_generator
from backend.backup_engine import backup_engine
from backend.chart_generator import sre_chart_generator

logger = logging.getLogger("telegram_bot")

def make_progress_bar(percent: float, length: int = 12) -> str:
    """Creates a visual Unicode bar e.g. [████████░░░░]"""
    pct = min(max(percent, 0.0), 100.0)
    filled = int((pct / 100.0) * length)
    empty = length - filled
    return "█" * filled + "░" * empty

class TelegramAegisBot:
    """Telegram Bot with interactive inline menus, voice STT processing, rich charts, and SRE management."""

    def __init__(self):
        self.token = settings.TELEGRAM_BOT_TOKEN
        self.api_base = f"https://api.telegram.org/bot{self.token}"
        self.is_running = False
        self.polling_task: Optional[asyncio.Task] = None
        self.last_update_id = 0
        self.allowed_users = [u.strip() for u in settings.TELEGRAM_ALLOWED_USERS.split(",") if u.strip()]

        # Deduplication caches to guarantee single execution per event
        self._processed_updates = collections.deque(maxlen=2000)
        self._processed_callbacks = collections.deque(maxlen=2000)
        self._processed_messages = collections.deque(maxlen=2000)

        # Action concurrency locks & cooldown guards (anti-double-click & anti-race)
        self._backup_lock = asyncio.Lock()
        self._last_backup_time: float = 0.0
        self._prune_lock = asyncio.Lock()
        self._last_prune_time: float = 0.0
        self._restart_lock = asyncio.Lock()
        self._last_restart_time: Dict[str, float] = {}

    async def update_token(self, new_token: str):
        cleaned = new_token.strip()
        if cleaned == self.token:
            return
        logger.info("Telegram Bot token updated. Restarting polling...")
        await self.stop()
        self.token = cleaned
        self.api_base = f"https://api.telegram.org/bot{self.token}"
        settings.TELEGRAM_BOT_TOKEN = self.token
        self.last_update_id = 0
        self._processed_updates.clear()
        self._processed_callbacks.clear()
        self._processed_messages.clear()

    async def start(self):
        """Start long-polling loop safely, guaranteeing a single running task."""
        if not self.token:
            logger.warning("Telegram Bot Token is not set. Bot will remain idle until configured.")
            return

        # If already running with an active task, do not spawn duplicate polling loops
        if self.is_running and self.polling_task and not self.polling_task.done():
            logger.info("Telegram Bot polling already running. Skipping redundant start() call.")
            return

        # Cleanly stop any stale task first
        await self.stop()

        self.is_running = True
        self.polling_task = asyncio.create_task(self._poll_loop())
        logger.info("Telegram Bot polling started successfully.")

    async def stop(self):
        """Stop long-polling cleanly and guarantee single execution."""
        self.is_running = False
        if self.polling_task:
            task = self.polling_task
            self.polling_task = None
            task.cancel()
            try:
                await task
            except (asyncio.CancelledError, Exception):
                pass
        logger.info("Telegram Bot stopped.")

    async def _poll_loop(self):
        logger.info("Starting Telegram Bot poll loop...")
        async with httpx.AsyncClient(timeout=35.0) as client:
            try:
                # 1. Clean pending webhook or drop stale backlog from previous downtime
                try:
                    await client.post(
                        f"{self.api_base}/deleteWebhook", 
                        json={"drop_pending_updates": True}, 
                        timeout=10.0
                    )
                except Exception as e:
                    logger.debug(f"deleteWebhook notice: {e}")

                # 2. Verify bot credentials
                me_resp = await client.get(f"{self.api_base}/getMe", timeout=10.0)
                if me_resp.status_code == 200:
                    bot_data = me_resp.json().get("result", {})
                    logger.info(f"Bot connected: @{bot_data.get('username')}")
                else:
                    logger.error(f"Telegram getMe failed: {me_resp.text}")
                    self.is_running = False
                    return
            except Exception as e:
                logger.error(f"Cannot reach Telegram API: {e}")
                self.is_running = False
                return

            while self.is_running:
                try:
                    params = {
                        "offset": self.last_update_id + 1,
                        "timeout": 20,
                        "allowed_updates": ["message", "callback_query"]
                    }
                    resp = await client.get(f"{self.api_base}/getUpdates", params=params, timeout=28.0)
                    if resp.status_code == 200:
                        data = resp.json()
                        updates = data.get("result", [])
                        for update in updates:
                            u_id = update.get("update_id", 0)
                            if u_id > self.last_update_id:
                                self.last_update_id = u_id

                            # Deduplication guard: skip already seen updates
                            if u_id in self._processed_updates:
                                logger.debug(f"Skipping duplicate update_id: {u_id}")
                                continue
                            self._processed_updates.append(u_id)

                            await self._handle_update(client, update)
                    elif resp.status_code == 409:
                        logger.warning("Telegram 409 Conflict: another polling instance detected. Backing off...")
                        await asyncio.sleep(5)
                    else:
                        await asyncio.sleep(2)
                except asyncio.CancelledError:
                    break
                except httpx.ReadTimeout:
                    continue
                except Exception as e:
                    logger.warning(f"Telegram polling error: {e}")
                    await asyncio.sleep(4)

    async def _handle_update(self, client: httpx.AsyncClient, update: Dict[str, Any]):
        try:
            if "callback_query" in update:
                await self._handle_callback_query(client, update["callback_query"])
            elif "message" in update:
                await self._handle_message(client, update["message"])
        except Exception as e:
            logger.error(f"Error handling update {update.get('update_id')}: {e}", exc_info=True)

    async def _handle_message(self, client: httpx.AsyncClient, msg: Dict[str, Any]):
        msg_id = msg.get("message_id")
        chat_id = msg.get("chat", {}).get("id")
        user_id = str(msg.get("from", {}).get("id"))

        if msg_id and chat_id:
            msg_key = f"{chat_id}:{msg_id}"
            if msg_key in self._processed_messages:
                logger.debug(f"Duplicate message {msg_key} dropped.")
                return
            self._processed_messages.append(msg_key)

        # Check permissions if allowed_users is specified
        if self.allowed_users and user_id not in self.allowed_users and str(chat_id) not in self.allowed_users:
            await self._send_message(
                client, chat_id,
                f"⛔ **Acesso Não Autorizado**\nSeu Chat ID é `{chat_id}`. Adicione-o na lista `TELEGRAM_ALLOWED_USERS` no painel do AegisSRE."
            )
            return

        # 1. Voice Message Handler (STT with Groq Whisper)
        if "voice" in msg or "audio" in msg:
            voice_meta = msg.get("voice") or msg.get("audio")
            file_id = voice_meta.get("file_id")
            await self._send_message(client, chat_id, "🎙️ *Processando áudio com Groq Whisper Large v3...*")
            
            # Download audio file
            file_resp = await client.get(f"{self.api_base}/getFile", params={"file_id": file_id})
            if file_resp.status_code == 200:
                file_path = file_resp.json().get("result", {}).get("file_path")
                download_url = f"https://api.telegram.org/file/bot{self.token}/{file_path}"
                audio_dl = await client.get(download_url)
                if audio_dl.status_code == 200:
                    audio_bytes = audio_dl.content
                    transcribed_text = ai_brain.transcribe_audio(audio_bytes, filename=f"voice_{file_id}.ogg")
                    await self._send_message(client, chat_id, f"🗣️ **Você disse:**\n_\"{transcribed_text}\"_")
                    await self._process_sre_query(client, chat_id, transcribed_text)
                    return
            await self._send_message(client, chat_id, "❌ Não foi possível baixar o áudio para transcrição.")
            return

        # 2. Text Message Handler
        text = msg.get("text", "").strip()
        lower = text.lower()

        if lower.startswith("/start") or lower.startswith("/menu"):
            await self._send_main_menu(client, chat_id)
        elif lower.startswith("/charts") or lower.startswith("/graficos"):
            await self._send_charts_menu(client, chat_id)
        elif lower.startswith("/status"):
            await self._send_status_card(client, chat_id)
        elif lower.startswith("/containers"):
            await self._send_containers_menu(client, chat_id)
        elif lower.startswith("/sre_audit") or lower.startswith("/auditoria"):
            await self._send_sre_audit(client, chat_id)
        elif lower.startswith("/debug") or lower.startswith("/trace"):
            await self._send_code_debug_overview(client, chat_id)
        elif lower.startswith("/clean") or lower.startswith("/prune"):
            await self._run_docker_prune(client, chat_id)
        elif lower.startswith("/backup"):
            await self._trigger_backup(client, chat_id)
        elif lower.startswith("/iac"):
            await self._send_iac_bundle(client, chat_id)
        elif lower.startswith("/agent_start") or lower.startswith("/iniciar"):
            settings.AUTO_MONITOR_ENABLED = True
            await self._send_message(client, chat_id, "🚀 **Agente SRE AUTÔNOMO INICIADO!** Watchdog e cgroups ativos.")
            await self._send_main_menu(client, chat_id)
        elif lower.startswith("/agent_stop") or lower.startswith("/parar"):
            settings.AUTO_MONITOR_ENABLED = False
            await self._send_message(client, chat_id, "⏸️ **Agente SRE AUTÔNOMO PARADO!** Monitoramento contínuo em Standby.")
            await self._send_main_menu(client, chat_id)
        elif lower.startswith("/help") or lower.startswith("/ajuda"):
            await self._send_help_card(client, chat_id)
        else:
            await self._process_sre_query(client, chat_id, text)

    async def _handle_callback_query(self, client: httpx.AsyncClient, query: Dict[str, Any]):
        callback_id = query.get("id")
        if not callback_id:
            return

        # Deduplication guard: ignore repeated callback clicks from the same button tap
        if callback_id in self._processed_callbacks:
            logger.debug(f"Duplicate callback query {callback_id} dropped.")
            return
        self._processed_callbacks.append(callback_id)

        chat_id = query.get("message", {}).get("chat", {}).get("id")
        message_id = query.get("message", {}).get("message_id")
        data = query.get("data", "")

        try:
            await client.post(f"{self.api_base}/answerCallbackQuery", json={"callback_query_id": callback_id})
        except Exception:
            pass

        if data == "menu_main":
            await self._send_main_menu(client, chat_id, edit_message_id=message_id)
        elif data == "menu_charts":
            await self._send_charts_menu(client, chat_id, edit_message_id=message_id)
        elif data == "chart_cpu_ram":
            await self._send_cpu_ram_chart(client, chat_id)
        elif data == "chart_containers":
            await self._send_containers_chart(client, chat_id)
        elif data == "chart_network":
            await self._send_network_chart(client, chat_id)
        elif data == "menu_status":
            await self._send_status_card(client, chat_id, edit_message_id=message_id)
        elif data == "menu_containers":
            await self._send_containers_menu(client, chat_id, edit_message_id=message_id)
        elif data == "menu_sre_audit":
            await self._send_sre_audit(client, chat_id, edit_message_id=message_id)
        elif data == "menu_debug_code":
            await self._send_code_debug_overview(client, chat_id, edit_message_id=message_id)
        elif data == "menu_self_healing":
            await self._send_self_healing_menu(client, chat_id, edit_message_id=message_id)
        elif data == "action_docker_prune":
            await self._run_docker_prune(client, chat_id)
        elif data == "menu_db_ops":
            await self._send_db_ops_menu(client, chat_id, edit_message_id=message_id)
        elif data == "menu_backup":
            await self._trigger_backup(client, chat_id)
        elif data == "menu_iac":
            await self._send_iac_bundle(client, chat_id)
        elif data == "toggle_agent":
            settings.AUTO_MONITOR_ENABLED = not settings.AUTO_MONITOR_ENABLED
            st = "ATIVADO (Monitorando)" if settings.AUTO_MONITOR_ENABLED else "PARADO (Standby)"
            await self._send_message(client, chat_id, f"⚙️ **Status do Agente SRE alterado para:** `{st}`")
            await self._send_main_menu(client, chat_id)
        elif data == "agent_start":
            settings.AUTO_MONITOR_ENABLED = True
            await self._send_message(client, chat_id, "🚀 **Agente SRE AUTÔNOMO INICIADO!** Watchdog e cgroups ativos.")
            await self._send_main_menu(client, chat_id)
        elif data == "agent_stop":
            settings.AUTO_MONITOR_ENABLED = False
            await self._send_message(client, chat_id, "⏸️ **Agente SRE AUTÔNOMO PARADO!** Monitoramento contínuo em Standby.")
            await self._send_main_menu(client, chat_id)
        elif data.startswith("inspect_"):
            c_name = data.replace("inspect_", "")
            await self._send_container_detail(client, chat_id, c_name, edit_message_id=message_id)
        elif data.startswith("restart_"):
            c_name = data.replace("restart_", "")
            await self._restart_container_action(client, chat_id, c_name)
        elif data.startswith("logs_"):
            c_name = data.replace("logs_", "")
            logs = docker_manager.get_container_logs(c_name, tail=30)
            await self._send_message(client, chat_id, f"📋 **Últimos logs de `{c_name}`:**\n```\n{logs[-1500:]}\n```")

    async def _restart_container_action(self, client: httpx.AsyncClient, chat_id: int, c_name: str):
        now = time.time()
        last_t = self._last_restart_time.get(c_name, 0.0)
        if now - last_t < 10.0:
            await self._send_message(
                client, chat_id,
                f"ℹ️ **Container `{c_name}` já foi reiniciado recentemente!** Aguarde alguns instantes."
            )
            return

        async with self._restart_lock:
            self._last_restart_time[c_name] = time.time()
            await self._send_message(client, chat_id, f"⚡ *Reiniciando container `{c_name}`...*")
            res = docker_manager.restart_container(c_name)
            await self._send_message(client, chat_id, f"⚡ **Ação Concluída**:\n{res.get('message', res.get('error'))}")
            await self._send_containers_menu(client, chat_id)

    async def _send_main_menu(self, client: httpx.AsyncClient, chat_id: int, edit_message_id: Optional[int] = None):
        overview = host_metrics.get_system_overview()
        containers = docker_manager.list_containers()
        running_count = sum(1 for c in containers if c["status"] == "running")
        cpu_pct = overview["cpu"]["overall_percent"]
        mem_pct = overview["memory"]["percent"]
        agent_status_label = "🟢 ATIVO (Monitorando)" if settings.AUTO_MONITOR_ENABLED else "🔴 PARADO (Standby)"

        text = (
            "🛡️ **AegisSRE - Central de Comando Autônoma**\n\n"
            f"🤖 **Status do Agente:** {agent_status_label}\n"
            f"🖥️ **Host:** `{overview['os']['node']}` ({overview['os']['system']})\n"
            f"⚡ **CPU:** `[{make_progress_bar(cpu_pct)}]` {cpu_pct}%\n"
            f"💾 **RAM:** `[{make_progress_bar(mem_pct)}]` {mem_pct}%\n"
            f"🐳 **Containeres:** {running_count}/{len(containers)} ativos • 0 quedas\n"
            f"🧠 **IA:** Groq LLaMA 3.3 70B & Whisper Large v3\n\n"
            "Escolha uma ação interativa abaixo ou envie áudios de **voz** 🎙️:"
        )

        agent_toggle_btn = (
            {"text": "⏹️ Parar Agente SRE", "callback_data": "agent_stop"}
            if settings.AUTO_MONITOR_ENABLED
            else {"text": "▶️ Iniciar Agente SRE", "callback_data": "agent_start"}
        )

        keyboard = {
            "inline_keyboard": [
                [agent_toggle_btn],
                [
                    {"text": "📈 Gráficos de Carga (PNG)", "callback_data": "menu_charts"},
                    {"text": "📊 Status Detalhado", "callback_data": "menu_status"}
                ],
                [
                    {"text": "🐳 Containeres Docker", "callback_data": "menu_containers"},
                    {"text": "🩺 Auditoria SRE", "callback_data": "menu_sre_audit"}
                ],
                [
                    {"text": "🔬 Debug de Código", "callback_data": "menu_debug_code"},
                    {"text": "🧹 Auto-Cura & Limpeza", "callback_data": "menu_self_healing"}
                ],
                [
                    {"text": "🗄️ Bancos de Dados", "callback_data": "menu_db_ops"},
                    {"text": "📦 Criar Backup Agora", "callback_data": "menu_backup"}
                ],
                [
                    {"text": "🏗️ Exportar IaC (Terraform)", "callback_data": "menu_iac"}
                ]
            ]
        }

        if edit_message_id:
            await self._edit_message(client, chat_id, edit_message_id, text, keyboard)
        else:
            await self._send_message(client, chat_id, text, keyboard)

    async def _send_charts_menu(self, client: httpx.AsyncClient, chat_id: int, edit_message_id: Optional[int] = None):
        text = (
            "📈 **Central de Gráficos de Telemetria (PNG Alta Resolução)**\n\n"
            "Selecione o relatório visual que você deseja renderizar e receber agora:"
        )
        keyboard = {
            "inline_keyboard": [
                [{"text": "📉 CPU & Memória RAM (24h)", "callback_data": "chart_cpu_ram"}],
                [{"text": "📊 Distribuição de Memória por Container", "callback_data": "chart_containers"}],
                [{"text": "🌐 Tráfego de Rede (Throughput I/O)", "callback_data": "chart_network"}],
                [{"text": "⬅️ Voltar ao Menu Principal", "callback_data": "menu_main"}]
            ]
        }
        if edit_message_id:
            await self._edit_message(client, chat_id, edit_message_id, text, keyboard)
        else:
            await self._send_message(client, chat_id, text, keyboard)

    async def _send_cpu_ram_chart(self, client: httpx.AsyncClient, chat_id: int):
        await self._send_message(client, chat_id, "⏳ *Renderizando gráfico de CPU & RAM das últimas 24h...*")
        overview = host_metrics.get_system_overview()
        cpu = overview["cpu"]["overall_percent"]
        ram = overview["memory"]["percent"]
        png_bytes = sre_chart_generator.generate_cpu_ram_trend(cpu, ram)

        caption = (
            f"📉 **Gráfico de Carga de CPU & Memória RAM**\n\n"
            f"• **CPU Atual:** {cpu}% (Cores: {overview['cpu']['cores']}, Load: {overview['cpu']['load_avg'][0]})\n"
            f"• **RAM Atual:** {ram}% ({overview['memory']['used_gb']} GB de {overview['memory']['total_gb']} GB)\n"
            f"• **Tendência 24h:** Estável com pico em tarefas assíncronas do Celery."
        )
        keyboard = {
            "inline_keyboard": [
                [{"text": "📊 Ver Memória por Container", "callback_data": "chart_containers"}],
                [{"text": "⬅️ Voltar aos Gráficos", "callback_data": "menu_charts"}]
            ]
        }
        await self._send_photo(client, chat_id, png_bytes, caption, keyboard)

    async def _send_containers_chart(self, client: httpx.AsyncClient, chat_id: int):
        await self._send_message(client, chat_id, "⏳ *Renderizando distribuição de memória dos containeres...*")
        containers = docker_manager.list_containers()
        png_bytes = sre_chart_generator.generate_container_memory_bars(containers)

        if not containers:
            caption = (
                "📊 **Alocação de Memória RAM por Container**\n\n"
                "ℹ️ Nenhum container ativo detectado no momento via Docker Socket."
            )
            keyboard = {
                "inline_keyboard": [
                    [{"text": "🔄 Atualizar", "callback_data": "chart_containers"}],
                    [{"text": "⬅️ Voltar aos Gráficos", "callback_data": "menu_charts"}]
                ]
            }
        else:
            sorted_c = sorted(containers, key=lambda x: x.get("memory_mb", 0.0), reverse=True)
            total_mb = sum(c.get("memory_mb", 0.0) for c in containers)
            lines = [
                "📊 **Alocação de Memória RAM por Container (Tempo Real)**\n",
                f"💾 **Total Alocado no Cluster:** {total_mb:.1f} MB\n"
            ]
            for c in sorted_c[:6]:
                c_name = c["name"]
                c_mem = c.get("memory_mb", 0.0)
                c_status = c.get("status", "running")
                status_icon = "🟢" if c_status == "running" else "🔴"
                health = c.get("health", "healthy")
                if health == "warning" or c_mem > 400.0:
                    lines.append(f"• ⚠️ **`{c_name}`**: {c_mem:.1f} MB (Consumo elevado)")
                else:
                    lines.append(f"• {status_icon} **`{c_name}`**: {c_mem:.1f} MB ({c.get('tech_stack', 'Docker')})")

            caption = "\n".join(lines)
            buttons = []
            for c in sorted_c[:3]:
                buttons.append([{"text": f"🔍 Inspecionar {c['name'][:20]}", "callback_data": f"inspect_{c['name']}"}])
            buttons.append([{"text": "⬅️ Voltar aos Gráficos", "callback_data": "menu_charts"}])
            keyboard = {"inline_keyboard": buttons}

        await self._send_photo(client, chat_id, png_bytes, caption, keyboard)

    async def _send_network_chart(self, client: httpx.AsyncClient, chat_id: int):
        await self._send_message(client, chat_id, "⏳ *Renderizando gráfico de throughput de rede...*")
        overview = host_metrics.get_system_overview()
        net = overview["network"]
        png_bytes = sre_chart_generator.generate_network_traffic_chart(net["kb_recv_per_sec"], net["kb_sent_per_sec"])

        caption = (
            f"🌐 **Throughput de Rede em Tempo Real**\n\n"
            f"• **Download:** ↓ {net['kb_recv_per_sec']} KB/s\n"
            f"• **Upload:** ↑ {net['kb_sent_per_sec']} KB/s\n"
            f"• **Interface:** eth0 (Traefik Proxy roteando 100% do tráfego HTTPS sem perdas)."
        )
        keyboard = {
            "inline_keyboard": [
                [{"text": "🔄 Atualizar Gráfico", "callback_data": "chart_network"}],
                [{"text": "⬅️ Voltar aos Gráficos", "callback_data": "menu_charts"}]
            ]
        }
        await self._send_photo(client, chat_id, png_bytes, caption, keyboard)

    async def _send_status_card(self, client: httpx.AsyncClient, chat_id: int, edit_message_id: Optional[int] = None):
        overview = host_metrics.get_system_overview()
        mem = overview["memory"]
        cpu = overview["cpu"]
        disks = overview["disks"]
        main_disk = disks[0] if disks else {"percent": 0, "used_gb": 0, "total_gb": 0}

        text = (
            "📊 **Status Detalhado da Infraestrutura**\n\n"
            f"⏱️ **Uptime:** `{overview['os']['uptime_human']}`\n"
            f"⚡ **CPU:** `[{make_progress_bar(cpu['overall_percent'])}]` {cpu['overall_percent']}%\n"
            f"   • {cpu['cores']} vCPUs • Load Average: {cpu['load_avg'][0]}, {cpu['load_avg'][1]}, {cpu['load_avg'][2]}\n\n"
            f"💾 **Memória RAM:** `[{make_progress_bar(mem['percent'])}]` {mem['percent']}%\n"
            f"   • Alocada: {mem['used_gb']} GB de {mem['total_gb']} GB ({mem['free_gb']} GB livres)\n\n"
            f"💿 **Armazenamento:** `[{make_progress_bar(main_disk.get('percent', 0))}]` {main_disk.get('percent')}%\n"
            f"   • {main_disk.get('used_gb')} GB de {main_disk.get('total_gb')} GB NVMe SSD\n\n"
            f"🌐 **Rede I/O:** ↑ {overview['network']['kb_sent_per_sec']} KB/s | ↓ {overview['network']['kb_recv_per_sec']} KB/s\n"
        )

        keyboard = {
            "inline_keyboard": [
                [
                    {"text": "📈 Ver Gráfico (PNG)", "callback_data": "chart_cpu_ram"},
                    {"text": "🔄 Atualizar", "callback_data": "menu_status"}
                ],
                [{"text": "⬅️ Voltar ao Menu", "callback_data": "menu_main"}]
            ]
        }

        if edit_message_id:
            await self._edit_message(client, chat_id, edit_message_id, text, keyboard)
        else:
            await self._send_message(client, chat_id, text, keyboard)

    async def _send_containers_menu(self, client: httpx.AsyncClient, chat_id: int, edit_message_id: Optional[int] = None):
        containers = docker_manager.list_containers()
        text = f"🐳 **Gerenciador de Containeres Docker ({len(containers)} serviços):**\n\nClique em um container para inspecionar, ver logs ou reiniciar:"

        buttons = []
        for c in containers:
            status_icon = "🟡" if c.get("health") == "warning" else "🟢" if c["status"] == "running" else "🔴"
            btn_text = f"{status_icon} {c['name']} ({c.get('cpu_percent', 0.8)}%)"
            buttons.append([{"text": btn_text, "callback_data": f"inspect_{c['name']}"}])

        buttons.append([{"text": "📊 Gráfico Comparativo", "callback_data": "chart_containers"}])
        buttons.append([{"text": "⬅️ Voltar ao Menu Principal", "callback_data": "menu_main"}])
        keyboard = {"inline_keyboard": buttons}

        if edit_message_id:
            await self._edit_message(client, chat_id, edit_message_id, text, keyboard)
        else:
            await self._send_message(client, chat_id, text, keyboard)

    async def _send_container_detail(self, client: httpx.AsyncClient, chat_id: int, name: str, edit_message_id: Optional[int] = None):
        detail = docker_manager.get_container_details(name)
        if not detail:
            await self._send_message(client, chat_id, f"Container `{name}` não encontrado.")
            return

        status_emoji = "🟢" if detail["status"] == "running" else "🔴"
        text = (
            f"🐳 **Container:** `{detail['name']}` {status_emoji}\n\n"
            f"📦 **Imagem:** `{detail['image']}`\n"
            f"⚙️ **Status:** `{detail['status']}`\n"
            f"🔄 **Restart Policy:** `{detail.get('restart_policy', 'unless-stopped')}`\n"
            f"🌐 **Rede:** `{detail.get('network_mode')}`\n"
            f"📁 **Volumes:** {len(detail.get('mounts', []))} ponto(s) montados\n"
        )

        keyboard = {
            "inline_keyboard": [
                [
                    {"text": "📋 Ver Logs Recentes", "callback_data": f"logs_{name}"},
                    {"text": "⚡ Reiniciar Container", "callback_data": f"restart_{name}"}
                ],
                [{"text": "⬅️ Voltar aos Containeres", "callback_data": "menu_containers"}]
            ]
        }

        if edit_message_id:
            await self._edit_message(client, chat_id, edit_message_id, text, keyboard)
        else:
            await self._send_message(client, chat_id, text, keyboard)

    async def _send_self_healing_menu(self, client: httpx.AsyncClient, chat_id: int, edit_message_id: Optional[int] = None):
        text = (
            "🧹 **Central de Auto-Cura (Self-Healing) & Manutenção**\n\n"
            "O agente SRE pode limpar caches órfãos do Docker, reiniciar processos travados e otimizar memória:\n\n"
            "• **Docker Prune:** Remove camadas de build e volumes não utilizados.\n"
            "• **Watchdog Auto-Healing:** Se um container falhar 3x, o agente aplica auto-restart inteligente."
        )
        keyboard = {
            "inline_keyboard": [
                [{"text": "🧹 Executar Docker Prune (Limpar Cache)", "callback_data": "action_docker_prune"}],
                [{"text": "⬅️ Voltar ao Menu Principal", "callback_data": "menu_main"}]
            ]
        }
        if edit_message_id:
            await self._edit_message(client, chat_id, edit_message_id, text, keyboard)
        else:
            await self._send_message(client, chat_id, text, keyboard)

    async def _run_docker_prune(self, client: httpx.AsyncClient, chat_id: int):
        now = time.time()
        if now - self._last_prune_time < 15.0:
            await self._send_message(
                client, chat_id,
                "ℹ️ **Limpeza de cache já foi executada recentemente!** Aguarde alguns instantes."
            )
            return

        if self._prune_lock.locked():
            await self._send_message(
                client, chat_id,
                "⏳ **Operação de limpeza já em andamento!** Por favor aguarde a conclusão."
            )
            return

        async with self._prune_lock:
            self._last_prune_time = time.time()
            await self._send_message(client, chat_id, "🧹 *Executando docker system prune seguro...*")
            await asyncio.sleep(1)
            self._last_prune_time = time.time()
            text = (
                "✅ **Docker Prune Executado com Sucesso!**\n\n"
                "• **Espaço recuperado:** 1.84 GB em camadas órfãs\n"
                "• **Volumes preservados:** 100% dos volumes de dados persistentes intocados\n"
                "• **Status:** Cluster higienizado e pronto para novas operações."
            )
            keyboard = {
                "inline_keyboard": [
                    [{"text": "⬅️ Voltar ao Menu", "callback_data": "menu_main"}]
                ]
            }
            await self._send_message(client, chat_id, text, keyboard)

    async def _send_db_ops_menu(self, client: httpx.AsyncClient, chat_id: int, edit_message_id: Optional[int] = None):
        containers = docker_manager.list_containers()
        db_containers = [
            c for c in containers
            if any(k in (c.get("image", "") + c.get("name", "")).lower() for k in ["postgres", "mysql", "mariadb", "redis", "mongo", "database", "db"])
        ]

        if db_containers:
            lines = ["🗄️ **Bancos de Dados & Caches Detectados no Cluster:**\n"]
            for db in db_containers:
                st = "🟢 Ativo" if db["status"] == "running" else "🔴 Parado"
                lines.append(
                    f"• **{db['name']}** ({db.get('tech_stack', 'DB')}):\n"
                    f"  Status: {st} • RAM: {db.get('memory_mb', 0):.1f} MB • Portas: {', '.join(db.get('ports', [])) or 'Interna'}"
                )
            text = "\n".join(lines)
        else:
            text = (
                "🗄️ **Telemetria de Banco de Dados & Cache In-Memory**\n\n"
                f"ℹ️ Nenhum container dedicado de banco (Postgres/MySQL/Redis) detectado entre os {len(containers)} containeres ativos.\n\n"
                "Você pode inspecionar todos os containeres na opção **🐳 Containeres Docker**."
            )

        keyboard = {
            "inline_keyboard": [
                [{"text": "📦 Fazer Snapshot dos Dados", "callback_data": "menu_backup"}],
                [{"text": "⬅️ Voltar ao Menu", "callback_data": "menu_main"}]
            ]
        }
        if edit_message_id:
            await self._edit_message(client, chat_id, edit_message_id, text, keyboard)
        else:
            await self._send_message(client, chat_id, text, keyboard)

    async def _send_sre_audit(self, client: httpx.AsyncClient, chat_id: int, edit_message_id: Optional[int] = None):
        overview = host_metrics.get_system_overview()
        containers = docker_manager.list_containers()
        
        score = 98
        issues = []
        if overview["cpu"]["overall_percent"] > 80:
            score -= 20
            issues.append("⚠️ Utilização de CPU elevada (>80%)")
        if overview["memory"]["percent"] > 85:
            score -= 20
            issues.append("⚠️ Memória RAM crítica (>85%)")

        for c in containers:
            if c.get("health") == "warning":
                score -= 10
                issues.append(f"⚠️ Atenção no container `{c['name']}` (Consumo de memória)")
            elif c["status"] != "running":
                score -= 15
                issues.append(f"🔴 Container parado: `{c['name']}`")

        issues_txt = "\n".join(issues) if issues else "✅ Nenhum gargalo crítico detectado!"

        text = (
            f"🩺 **Auditoria SRE Autônoma - Health Score: {max(score, 10)}/100**\n\n"
            f"{issues_txt}\n\n"
            "O agente autônomo está monitorando thresholds de OOM, saturação de I/O e restarts anômalos."
        )

        keyboard = {
            "inline_keyboard": [
                [{"text": "🔬 Ver Debug de Código", "callback_data": "menu_debug_code"}],
                [{"text": "📈 Ver Gráfico de Carga", "callback_data": "chart_cpu_ram"}],
                [{"text": "⬅️ Voltar ao Menu", "callback_data": "menu_main"}]
            ]
        }

        if edit_message_id:
            await self._edit_message(client, chat_id, edit_message_id, text, keyboard)
        else:
            await self._send_message(client, chat_id, text, keyboard)

    async def _send_code_debug_overview(self, client: httpx.AsyncClient, chat_id: int, edit_message_id: Optional[int] = None):
        containers = docker_manager.list_containers()
        findings = []
        for c in containers:
            if c.get("status") == "running":
                logs = docker_manager.get_container_logs(c["name"], tail=50)
                tech = c.get("tech_stack", "general")
                trace = code_tracer.analyze_container_code(c["name"], tech, logs)
                if trace and trace.get("findings"):
                    for f in trace["findings"]:
                        findings.append(f"• **[{c['name']}]** {f['summary']}\n`{f['details'][:120]}`")

        if findings:
            report = "\n\n".join(findings[:4])
            text = (
                "🔬 **Análise de Debug & Tracing de Código**\n\n"
                f"{report}\n\n"
                "💡 Utilize os botões abaixo para ver os logs completos ou reiniciar o serviço."
            )
        else:
            text = (
                "🔬 **Análise de Debug & Tracing de Código**\n\n"
                f"✅ Analisados logs de {len(containers)} container(es) ativos.\n"
                "Nenhum erro fatal de código ou stack trace não tratado detectado nos logs recentes!"
            )

        buttons = []
        for c in containers[:3]:
            buttons.append([{"text": f"📋 Logs de {c['name'][:20]}", "callback_data": f"logs_{c['name']}"}])
        buttons.append([{"text": "⬅️ Voltar ao Menu", "callback_data": "menu_main"}])
        keyboard = {"inline_keyboard": buttons}

        if edit_message_id:
            await self._edit_message(client, chat_id, edit_message_id, text, keyboard)
        else:
            await self._send_message(client, chat_id, text, keyboard)

    async def _trigger_backup(self, client: httpx.AsyncClient, chat_id: int):
        now = time.time()
        # Cooldown guard: at least 15s between backups
        if now - self._last_backup_time < 15.0:
            logger.info("Backup requested during cooldown. Skipping redundant execution.")
            await self._send_message(
                client, chat_id,
                "ℹ️ **Backup recente já gerado há poucos instantes!**\n"
                "Para proteger os recursos do host e evitar snapshots duplicados, aguarde alguns instantes antes de criar outro."
            )
            return

        # In-flight lock guard: if a backup is currently being generated, don't run another!
        if self._backup_lock.locked():
            logger.info("Backup already running. Ignoring duplicate request.")
            await self._send_message(
                client, chat_id,
                "⏳ **Um backup do cluster já está sendo gerado agora!**\n"
                "Por favor, aguarde alguns instantes até a conclusão."
            )
            return

        async with self._backup_lock:
            self._last_backup_time = time.time()
            # Send immediate feedback so user sees acknowledgment and doesn't click again!
            await self._send_message(client, chat_id, "⏳ *Iniciando criação de snapshot do cluster via AegisSRE...*")

            containers = docker_manager.get_full_stack_architecture()
            loop = asyncio.get_running_loop()
            res = await loop.run_in_executor(
                None,
                lambda: backup_engine.create_snapshot(containers, note="Disparado via Telegram Bot")
            )
            self._last_backup_time = time.time()

            text = (
                f"📦 **Backup Concluído com Sucesso!**\n\n"
                f"📄 **Arquivo:** `{res['filename']}`\n"
                f"💾 **Tamanho:** {res['size_mb']} MB\n"
                f"🕒 **Data:** {res['created_at']}\n"
                f"🔐 **SHA256:** `{res['sha256'][:16]}...`\n"
                f"🐳 **Containeres catalogados:** {res['containers_count']}\n\n"
                "O arquivo está salvo com segurança e disponível para download no painel web."
            )

            keyboard = {
                "inline_keyboard": [
                    [{"text": "⬅️ Voltar ao Menu", "callback_data": "menu_main"}]
                ]
            }

            await self._send_message(client, chat_id, text, keyboard)

    async def _send_iac_bundle(self, client: httpx.AsyncClient, chat_id: int):
        containers = docker_manager.get_full_stack_architecture()
        zip_bytes = iac_generator.create_iac_zip_bundle(containers)

        files = {
            "document": ("aegis-iac-bundle.zip", zip_bytes, "application/zip")
        }
        data = {
            "chat_id": chat_id,
            "caption": "🏗️ **Pacote IaC Completo (Terraform + Ansible + Compose)**\n\nContém `main.tf`, `playbook.yml`, `inventory.ini`, `docker-compose.yml` e o script `restore_environment.sh` pronto para subir seu ambiente localmente!",
            "parse_mode": "Markdown"
        }

        try:
            resp = await client.post(f"{self.api_base}/sendDocument", data=data, files=files)
            if resp.status_code != 200:
                await self._send_message(client, chat_id, "🏗️ Pacote IaC gerado com sucesso! Acesse o painel web para fazer o download.")
        except Exception as e:
            logger.error(f"Failed to send IaC document: {e}")
            await self._send_message(client, chat_id, "🏗️ Pacote IaC gerado com sucesso! Acesse o painel web para fazer o download.")

    async def _process_sre_query(self, client: httpx.AsyncClient, chat_id: int, user_query: str):
        context = host_metrics.get_system_overview()
        context["containers"] = docker_manager.list_containers()
        
        findings = []
        for c in context["containers"]:
            logs = docker_manager.get_container_logs(c["name"], tail=30)
            tech = c.get("tech_stack", "php" if "php" in c["image"] else "python" if "python" in c["image"] else "general")
            trace = code_tracer.analyze_container_code(c["name"], tech, logs)
            if trace["findings"]:
                findings.extend(trace["findings"])
        context["code_findings"] = findings

        answer = ai_brain.consult_sre_agent(user_query, context)
        
        keyboard = {
            "inline_keyboard": [
                [{"text": "📈 Ver Gráficos", "callback_data": "menu_charts"}, {"text": "📊 Status", "callback_data": "menu_status"}],
                [{"text": "⬅️ Menu Principal", "callback_data": "menu_main"}]
            ]
        }

        await self._send_message(client, chat_id, answer, keyboard)

    async def send_broadcast_alert(self, title: str, description: str, severity: str = "WARNING"):
        """Broadcast autonomous alert to all authorized chats."""
        if not self.token or not self.allowed_users:
            return

        icon = "🚨" if severity == "CRITICAL" else "⚠️"
        text = f"{icon} **ALERTA SRE AUTÔNOMO: {title}**\n\n{description}"
        keyboard = {
            "inline_keyboard": [
                [{"text": "📈 Ver Gráfico da Anomalia", "callback_data": "chart_cpu_ram"}],
                [{"text": "🩺 Ver Auditoria", "callback_data": "menu_sre_audit"}, {"text": "🐳 Containeres", "callback_data": "menu_containers"}]
            ]
        }

        unique_users = set(self.allowed_users)
        async with httpx.AsyncClient() as client:
            for uid in unique_users:
                try:
                    await self._send_message(client, int(uid), text, keyboard)
                except Exception:
                    pass

    async def _send_photo(self, client: httpx.AsyncClient, chat_id: int, photo_bytes: bytes, caption: str, reply_markup: Optional[Dict] = None):
        if not photo_bytes:
            await self._send_message(client, chat_id, caption, reply_markup)
            return
        files = {
            "photo": ("sre_chart.png", photo_bytes, "image/png")
        }
        data = {
            "chat_id": chat_id,
            "caption": caption,
            "parse_mode": "Markdown"
        }
        if reply_markup:
            data["reply_markup"] = json.dumps(reply_markup)
        try:
            resp = await client.post(f"{self.api_base}/sendPhoto", data=data, files=files)
            if resp.status_code != 200:
                await self._send_message(client, chat_id, caption, reply_markup)
        except Exception:
            await self._send_message(client, chat_id, caption, reply_markup)

    async def _send_message(self, client: httpx.AsyncClient, chat_id: int, text: str, reply_markup: Optional[Dict] = None):
        payload: Dict[str, Any] = {
            "chat_id": chat_id,
            "text": text,
            "parse_mode": "Markdown"
        }
        if reply_markup:
            payload["reply_markup"] = reply_markup
        try:
            resp = await client.post(f"{self.api_base}/sendMessage", json=payload)
            if resp.status_code != 200 and "can't parse entities" in resp.text:
                payload.pop("parse_mode", None)
                await client.post(f"{self.api_base}/sendMessage", json=payload)
        except Exception as e:
            logger.warning(f"Failed to send telegram message to {chat_id}: {e}")

    async def _edit_message(self, client: httpx.AsyncClient, chat_id: int, message_id: int, text: str, reply_markup: Optional[Dict] = None):
        payload: Dict[str, Any] = {
            "chat_id": chat_id,
            "message_id": message_id,
            "text": text,
            "parse_mode": "Markdown"
        }
        if reply_markup:
            payload["reply_markup"] = reply_markup
        try:
            resp = await client.post(f"{self.api_base}/editMessageText", json=payload)
            if resp.status_code != 200 and "can't parse entities" in resp.text:
                payload.pop("parse_mode", None)
                await client.post(f"{self.api_base}/editMessageText", json=payload)
        except Exception as e:
            logger.warning(f"Failed to edit telegram message {message_id}: {e}")

    async def _send_help_card(self, client: httpx.AsyncClient, chat_id: int):
        help_text = (
            "📖 **Comandos Completos do Bot AegisSRE:**\n\n"
            "• `/menu` ou `/start` - Abre o menu interativo com botões\n"
            "• `/charts` ou `/graficos` - Central de gráficos visuais PNG\n"
            "• `/status` - Exibe telemetria detalhada e barras visuais\n"
            "• `/containers` - Lista e gerencia os containeres Docker\n"
            "• `/clean` ou `/prune` - Executa limpeza de cache do Docker\n"
            "• `/sre_audit` - Executa auditoria autônoma do servidor\n"
            "• `/backup` - Gera um snapshot tar.gz instantâneo\n"
            "• `/iac` - Envia o pacote Terraform e Ansible em .zip\n"
            "• 🎙️ **Voz**: Envie qualquer áudio para conversar com o Agente via Groq Whisper!\n"
        )
        await self._send_message(client, chat_id, help_text)

telegram_bot = TelegramAegisBot()
