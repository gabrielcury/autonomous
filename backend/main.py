import asyncio
import io
import time
import json
import logging
from pathlib import Path
from typing import Dict, Any, List, Optional
from contextlib import asynccontextmanager

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, UploadFile, File, Form, HTTPException, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel

from backend.config import settings
from backend.host_metrics import host_metrics
from backend.docker_engine import docker_manager
from backend.ai_engine import ai_brain
from backend.code_debugger import code_tracer
from backend.iac_generator import iac_generator
from backend.backup_engine import backup_engine
from backend.telegram_bot import telegram_bot
from backend.chart_generator import sre_chart_generator

# Setup logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
logger = logging.getLogger("aegis_main")

# SRE Autonomous Event Log
sre_activity_log: List[Dict[str, Any]] = [
    {
        "timestamp": time.time(),
        "type": "INFO",
        "category": "INITIALIZATION",
        "message": "AegisSRE Autonomous Agent inicializado no modo STANDBY (PARADO). Inicie o monitoramento pelo painel quando desejar."
    }
]

# Alert broadcast cooldown tracker: category -> timestamp of last sent alert
_last_broadcast_times: Dict[str, float] = {}
ALERT_BROADCAST_COOLDOWN: float = 1800.0  # 30 minutos de intervalo mínimo entre alertas repetidos

async def autonomous_monitor_worker():
    """Background SRE watchdog monitoring resources."""
    logger.info("Autonomous SRE watchdog loop started.")
    while True:
        try:
            if settings.AUTO_MONITOR_ENABLED:
                overview = host_metrics.get_system_overview()
                cpu_p = overview["cpu"]["overall_percent"]
                mem_p = overview["memory"]["percent"]
                now = time.time()

                if cpu_p > settings.ALERT_CPU_THRESHOLD:
                    msg = f"Uso de CPU atingiu {cpu_p}% (Limite: {settings.ALERT_CPU_THRESHOLD}%)"
                    sre_activity_log.append({"timestamp": now, "type": "ALERT", "category": "HIGH_CPU", "message": msg})
                    if now - _last_broadcast_times.get("HIGH_CPU", 0.0) >= ALERT_BROADCAST_COOLDOWN:
                        _last_broadcast_times["HIGH_CPU"] = now
                        await telegram_bot.send_broadcast_alert("Alerta de CPU Elevada", msg, severity="WARNING")

                if mem_p > settings.ALERT_MEM_THRESHOLD:
                    msg = f"Uso de RAM atingiu {mem_p}% (Limite: {settings.ALERT_MEM_THRESHOLD}%)"
                    sre_activity_log.append({"timestamp": now, "type": "ALERT", "category": "HIGH_MEM", "message": msg})
                    if now - _last_broadcast_times.get("HIGH_MEM", 0.0) >= ALERT_BROADCAST_COOLDOWN:
                        _last_broadcast_times["HIGH_MEM"] = now
                        await telegram_bot.send_broadcast_alert("Alerta de Memória Crítica", msg, severity="CRITICAL")

            # Prune old logs
            if len(sre_activity_log) > 200:
                sre_activity_log[:] = sre_activity_log[-100:]

            await asyncio.sleep(settings.MONITOR_INTERVAL_SECONDS)
        except asyncio.CancelledError:
            break
        except Exception as e:
            logger.error(f"Error in autonomous monitor worker: {e}")
            await asyncio.sleep(10)

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup - Agente sempre inicializa parado por padrão ("o agente começa sempre parado, sempre")
    settings.AUTO_MONITOR_ENABLED = False
    logger.info("Starting AegisSRE application services... Autonomous Agent starts in STANDBY (STOPPED) mode.")
    monitor_task = asyncio.create_task(autonomous_monitor_worker())
    await telegram_bot.start()
    yield
    # Shutdown
    logger.info("Shutting down AegisSRE...")
    monitor_task.cancel()
    await telegram_bot.stop()

app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    description="Autonomous SRE & Architecture Agent for Easypanel + Docker with Telegram Bot & Groq LLM",
    lifespan=lifespan
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# -----------------------------------------------------------------------------
# REST API Models
# -----------------------------------------------------------------------------
class ChatRequest(BaseModel):
    message: str
    history: Optional[List[Dict[str, str]]] = None

class SettingsUpdateRequest(BaseModel):
    groq_api_key: Optional[str] = None
    telegram_bot_token: Optional[str] = None
    telegram_allowed_users: Optional[str] = None
    auto_monitor_enabled: Optional[bool] = None
    alert_cpu_threshold: Optional[float] = None
    alert_mem_threshold: Optional[float] = None

class CodeTraceRequest(BaseModel):
    container_name: str
    custom_logs: Optional[str] = None
    tech_stack: Optional[str] = None

# -----------------------------------------------------------------------------
# REST API Endpoints
# -----------------------------------------------------------------------------
@app.get("/api/status")
def get_system_status():
    """Consolidated host and container status for dashboard overview."""
    overview = host_metrics.get_system_overview()
    containers = docker_manager.list_containers()
    
    running_count = sum(1 for c in containers if c["status"] == "running")
    total_count = len(containers)
    
    # Calculate health score
    health_score = 98
    if overview["cpu"]["overall_percent"] > 80:
        health_score -= 20
    if overview["memory"]["percent"] > 85:
        health_score -= 25
    for c in containers:
        if c.get("health") == "warning":
            health_score -= 10
        elif c["status"] != "running":
            health_score -= 15
    health_score = max(health_score, 15)

    return {
        "status": "healthy" if health_score > 70 else "warning" if health_score > 40 else "critical",
        "health_score": health_score,
        "host": overview,
        "containers_summary": {
            "total": total_count,
            "running": running_count,
            "stopped": total_count - running_count,
            "is_docker_connected": docker_manager.is_connected
        },
        "agent": {
            "version": settings.VERSION,
            "groq_configured": bool(settings.GROQ_API_KEY),
            "groq_model": settings.GROQ_MODEL,
            "whisper_model": settings.GROQ_WHISPER_MODEL,
            "telegram_bot_active": telegram_bot.is_running,
            "telegram_configured": bool(settings.TELEGRAM_BOT_TOKEN),
            "auto_monitor_enabled": settings.AUTO_MONITOR_ENABLED
        }
    }

@app.get("/api/containers")
def get_containers():
    """List all containers."""
    return docker_manager.list_containers()

@app.get("/api/containers/{name}")
def get_container_detail(name: str):
    """Detailed container inspection."""
    detail = docker_manager.get_container_details(name)
    if not detail:
        raise HTTPException(status_code=404, detail="Container not found")
    return detail

@app.get("/api/containers/{name}/logs")
def get_container_logs(name: str, tail: int = 150):
    """Get container logs."""
    logs = docker_manager.get_container_logs(name, tail=tail)
    return {"container": name, "logs": logs}

@app.post("/api/containers/{name}/restart")
def restart_container(name: str):
    """Restart container."""
    res = docker_manager.restart_container(name)
    sre_activity_log.append({
        "timestamp": time.time(),
        "type": "ACTION",
        "category": "CONTAINER_RESTART",
        "message": f"Container '{name}' reiniciado. Status: {res.get('message', res.get('error'))}"
    })
    return res

@app.post("/api/containers/{name}/stop")
def stop_container(name: str):
    return docker_manager.stop_container(name)

@app.post("/api/containers/{name}/start")
def start_container(name: str):
    return docker_manager.start_container(name)

# -----------------------------------------------------------------------------
# Dynamic SRE Charts for Telegram & Dashboard
# -----------------------------------------------------------------------------
@app.get("/api/telegram/chart/cpu_ram")
def get_chart_cpu_ram():
    """Generates dynamic PNG chart of 24h CPU & RAM trends."""
    overview = host_metrics.get_system_overview()
    cpu = overview["cpu"]["overall_percent"]
    ram = overview["memory"]["percent"]
    png_bytes = sre_chart_generator.generate_cpu_ram_trend(cpu, ram)
    return Response(content=png_bytes, media_type="image/png")

@app.get("/api/telegram/chart/containers")
def get_chart_containers():
    """Generates dynamic PNG horizontal bar chart of container memory allocations."""
    containers = docker_manager.list_containers()
    png_bytes = sre_chart_generator.generate_container_memory_bars(containers)
    return Response(content=png_bytes, media_type="image/png")

@app.get("/api/telegram/chart/network")
def get_chart_network():
    """Generates dynamic PNG area chart of network I/O."""
    overview = host_metrics.get_system_overview()
    net = overview["network"]
    png_bytes = sre_chart_generator.generate_network_traffic_chart(net["kb_recv_per_sec"], net["kb_sent_per_sec"])
    return Response(content=png_bytes, media_type="image/png")

@app.post("/api/code/trace")
def trace_code(req: CodeTraceRequest):
    """Analyze code-level trace/logs for PHP, Python, SQL, etc."""
    logs = req.custom_logs or docker_manager.get_container_logs(req.container_name, tail=100)
    tech = req.tech_stack or ("php" if "php" in req.container_name else "python" if "python" in req.container_name else "general")
    analysis = code_tracer.analyze_container_code(req.container_name, tech, logs)
    return analysis

@app.get("/api/iac/suite")
def get_iac_suite():
    """Return all generated Terraform & Ansible configuration files."""
    containers = docker_manager.get_full_stack_architecture()
    files = iac_generator.generate_iac_suite(containers)
    return {
        "containers_count": len(containers),
        "files": files
    }

@app.get("/api/iac/download")
def download_iac_bundle():
    """Download in-memory zip file of all Terraform and Ansible files."""
    containers = docker_manager.get_full_stack_architecture()
    zip_bytes = iac_generator.create_iac_zip_bundle(containers)
    return Response(
        content=zip_bytes,
        media_type="application/zip",
        headers={"Content-Disposition": "attachment; filename=aegis_iac_bundle.zip"}
    )

@app.get("/api/backups")
def get_backups():
    """List catalog of backups and snapshots."""
    return backup_engine.list_backups()

@app.post("/api/backups/create")
def create_backup(note: str = "Disparado via Painel Web"):
    """Trigger an immediate snapshot backup."""
    containers = docker_manager.get_full_stack_architecture()
    res = backup_engine.create_snapshot(containers, note=note)
    sre_activity_log.append({
        "timestamp": time.time(),
        "type": "BACKUP",
        "category": "DISASTER_RECOVERY",
        "message": f"Snapshot {res['id']} ({res['size_mb']}MB) criado com sucesso para {res['containers_count']} containeres."
    })
    return res

@app.get("/api/backups/download/{backup_id}")
def download_backup(backup_id: str):
    """Download backup archive."""
    filepath = backup_engine.get_backup_path(backup_id)
    if not filepath or not filepath.exists():
        raise HTTPException(status_code=404, detail="Backup file not found")
    return FileResponse(path=str(filepath), filename=filepath.name, media_type="application/gzip")

@app.post("/api/agent/chat")
def chat_with_agent(req: ChatRequest):
    """Interact with Groq SRE Agent Brain."""
    # Gather live context
    context = host_metrics.get_system_overview()
    context["containers"] = docker_manager.list_containers()
    
    # Code findings
    findings = []
    for c in context["containers"]:
        logs = docker_manager.get_container_logs(c["name"], tail=30)
        tech = c.get("tech_stack", "php" if "php" in c["image"] else "python" if "python" in c["image"] else "general")
        trace = code_tracer.analyze_container_code(c["name"], tech, logs)
        if trace["findings"]:
            findings.extend(trace["findings"])
    context["code_findings"] = findings

    answer = ai_brain.consult_sre_agent(req.message, context, req.history)
    return {"reply": answer}

@app.post("/api/agent/voice")
async def process_voice_audio(audio: UploadFile = File(...)):
    """Accept voice recording from browser or mobile, transcribe via Groq Whisper, and consult SRE Brain."""
    audio_bytes = await audio.read()
    transcription = ai_brain.transcribe_audio(audio_bytes, filename=audio.filename or "voice.ogg")
    
    # Send transcribed query to SRE Agent
    context = host_metrics.get_system_overview()
    context["containers"] = docker_manager.list_containers()
    answer = ai_brain.consult_sre_agent(transcription, context)

    return {
        "transcription": transcription,
        "reply": answer
    }

@app.get("/api/agent/events")
def get_agent_events():
    """Return autonomous SRE activity and audit logs."""
    return sorted(sre_activity_log, key=lambda x: x["timestamp"], reverse=True)

@app.get("/api/agent/status")
def get_agent_status():
    """Return autonomous SRE agent operational state (active vs stopped)."""
    return {
        "auto_monitor_enabled": settings.AUTO_MONITOR_ENABLED,
        "status": "active" if settings.AUTO_MONITOR_ENABLED else "stopped",
        "status_label": "ATIVO (Monitorando)" if settings.AUTO_MONITOR_ENABLED else "PARADO (Standby)",
        "version": settings.VERSION,
        "groq_configured": bool(settings.GROQ_API_KEY),
        "telegram_bot_active": telegram_bot.is_running
    }

@app.post("/api/agent/start")
async def start_agent():
    """Start autonomous SRE monitoring and self-healing watchdog."""
    settings.AUTO_MONITOR_ENABLED = True
    msg = "Agente SRE AUTÔNOMO INICIADO pelo operador via painel. Monitoramento em tempo real, cgroups e auto-cura ATIVADOS."
    sre_activity_log.append({
        "timestamp": time.time(),
        "type": "INFO",
        "category": "AGENT_CONTROL",
        "message": msg
    })
    try:
        await telegram_bot.send_broadcast_alert("🚀 Agente SRE Ativado", "O agente autônomo foi INICIADO pelo operador no painel web. Watchdog de infraestrutura e cgroups ativo.", severity="INFO")
    except Exception:
        pass
    return {
        "success": True,
        "auto_monitor_enabled": True,
        "status": "active",
        "message": "Agente Autônomo iniciado com sucesso."
    }

@app.post("/api/agent/stop")
async def stop_agent():
    """Stop/pause autonomous SRE monitoring into Standby mode."""
    settings.AUTO_MONITOR_ENABLED = False
    msg = "Agente SRE AUTÔNOMO PARADO pelo operador via painel. O monitoramento automático e auto-cura foram colocados em Standby."
    sre_activity_log.append({
        "timestamp": time.time(),
        "type": "WARNING",
        "category": "AGENT_CONTROL",
        "message": msg
    })
    try:
        await telegram_bot.send_broadcast_alert("⏸️ Agente SRE Pausado", "O agente autônomo foi PARADO pelo operador no painel web. Monitoramento em Standby.", severity="WARNING")
    except Exception:
        pass
    return {
        "success": True,
        "auto_monitor_enabled": False,
        "status": "stopped",
        "message": "Agente Autônomo colocado em Standby (Parado)."
    }

@app.post("/api/agent/toggle")
async def toggle_agent():
    """Toggle autonomous SRE agent state between active and stopped."""
    if settings.AUTO_MONITOR_ENABLED:
        return await stop_agent()
    else:
        return await start_agent()

@app.get("/api/settings")
def get_settings():
    return {
        "groq_api_key_set": bool(settings.GROQ_API_KEY),
        "groq_api_key_masked": f"{settings.GROQ_API_KEY[:4]}...{settings.GROQ_API_KEY[-4:]}" if settings.GROQ_API_KEY else "",
        "groq_model": settings.GROQ_MODEL,
        "groq_whisper_model": settings.GROQ_WHISPER_MODEL,
        "telegram_bot_token_set": bool(settings.TELEGRAM_BOT_TOKEN),
        "telegram_bot_token_masked": f"{settings.TELEGRAM_BOT_TOKEN[:6]}...{settings.TELEGRAM_BOT_TOKEN[-4:]}" if settings.TELEGRAM_BOT_TOKEN else "",
        "telegram_allowed_users": settings.TELEGRAM_ALLOWED_USERS,
        "auto_monitor_enabled": settings.AUTO_MONITOR_ENABLED,
        "alert_cpu_threshold": settings.ALERT_CPU_THRESHOLD,
        "alert_mem_threshold": settings.ALERT_MEM_THRESHOLD,
        "docker_socket": settings.DOCKER_SOCKET,
        "is_docker_connected": docker_manager.is_connected
    }

@app.post("/api/settings")
async def update_settings(req: SettingsUpdateRequest):
    if req.groq_api_key is not None:
        ai_brain.update_api_key(req.groq_api_key)
    if req.telegram_bot_token is not None:
        token_to_set = req.telegram_bot_token.strip()
        if token_to_set != telegram_bot.token:
            await telegram_bot.update_token(token_to_set)
            if token_to_set:
                await telegram_bot.start()
            else:
                await telegram_bot.stop()
    if req.telegram_allowed_users is not None:
        settings.TELEGRAM_ALLOWED_USERS = req.telegram_allowed_users
        telegram_bot.allowed_users = [u.strip() for u in req.telegram_allowed_users.split(",") if u.strip()]
    if req.auto_monitor_enabled is not None:
        settings.AUTO_MONITOR_ENABLED = req.auto_monitor_enabled
    if req.alert_cpu_threshold is not None:
        settings.ALERT_CPU_THRESHOLD = req.alert_cpu_threshold
    if req.alert_mem_threshold is not None:
        settings.ALERT_MEM_THRESHOLD = req.alert_mem_threshold

    return {"success": True, "message": "Configurações atualizadas com sucesso."}

# -----------------------------------------------------------------------------
# WebSocket for Live Telemetry
# -----------------------------------------------------------------------------
@app.websocket("/ws/telemetry")
async def ws_telemetry(websocket: WebSocket):
    await websocket.accept()
    logger.info("WebSocket telemetry client connected.")
    try:
        while True:
            overview = host_metrics.get_system_overview()
            containers = docker_manager.list_containers()
            payload = {
                "timestamp": time.time(),
                "host": overview,
                "containers": containers
            }
            try:
                await websocket.send_text(json.dumps(payload))
            except Exception:
                break
            await asyncio.sleep(3.0)
    except Exception as e:
        pass
    finally:
        try:
            await websocket.close()
        except Exception:
            pass
        logger.info("WebSocket telemetry client session closed.")

# -----------------------------------------------------------------------------
# Static files / Frontend
# -----------------------------------------------------------------------------
frontend_dist = Path(__file__).resolve().parent.parent / "frontend" / "dist"
backend_static = Path(__file__).resolve().parent / "static"
dist_path = frontend_dist if frontend_dist.exists() else backend_static

assets_dir = dist_path / "assets"
if assets_dir.exists():
    app.mount("/assets", StaticFiles(directory=str(assets_dir)), name="assets")

if dist_path.exists() and (dist_path / "index.html").exists():
    @app.get("/")
    async def serve_index():
        return FileResponse(dist_path / "index.html")

    @app.get("/{full_path:path}")
    async def serve_spa_fallback(full_path: str):
        # Don't hijack API or WS routes
        if full_path.startswith("api/") or full_path.startswith("ws/"):
            raise HTTPException(status_code=404, detail="Not found")
        file_path = dist_path / full_path
        if file_path.is_file():
            return FileResponse(file_path)
        return FileResponse(dist_path / "index.html")
else:
    @app.get("/")
    def index_fallback():
        return {
            "name": settings.PROJECT_NAME,
            "version": settings.VERSION,
            "status": "online",
            "message": "AegisSRE API is running. Build frontend or run 'npm run dev' in /frontend directory.",
            "docs_url": "/docs"
        }
