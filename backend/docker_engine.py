import os
import time
import stat
import logging
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import List, Dict, Any, Optional, Tuple
from datetime import datetime, timezone
import httpx
from backend.config import settings

logger = logging.getLogger("docker_engine")

def demux_docker_stream(data: bytes) -> str:
    """Demultiplex Docker stdio stream into clean UTF-8 text."""
    if not data:
        return ""
    # Check if first byte is stream type (1=stdout, 2=stderr) and next 3 bytes are null
    if len(data) >= 8 and data[0] in (1, 2) and data[1:4] == b'\x00\x00\x00':
        lines = []
        offset = 0
        while offset + 8 <= len(data):
            size = int.from_bytes(data[offset+4:offset+8], byteorder="big")
            offset += 8
            payload = data[offset:offset+size]
            lines.append(payload.decode("utf-8", errors="replace"))
            offset += size
        return "".join(lines)
    return data.decode("utf-8", errors="replace")

def calculate_cpu_percent(cpu_stats: dict, precpu_stats: dict) -> float:
    """Calculates live container CPU percentage from Docker stats."""
    cpu_usage = cpu_stats.get("cpu_usage", {})
    precpu_usage = precpu_stats.get("cpu_usage", {})
    cpu_delta = cpu_usage.get("total_usage", 0) - precpu_usage.get("total_usage", 0)
    system_delta = cpu_stats.get("system_cpu_usage", 0) - precpu_stats.get("system_cpu_usage", 0)
    online_cpus = cpu_stats.get("online_cpus") or len(cpu_usage.get("percpu_usage", [1])) or 1
    if system_delta > 0 and cpu_delta > 0:
        return round((cpu_delta / system_delta) * online_cpus * 100.0, 1)
    return 0.0

def calculate_memory_mb(mem_stats: dict) -> Tuple[float, float]:
    """Calculates live container memory usage and limit in MB from Docker stats."""
    usage = mem_stats.get("usage", 0)
    details = mem_stats.get("stats", {})
    inactive = (
        details.get("total_inactive_file")
        or details.get("inactive_file")
        or details.get("cache", 0)
        or 0
    )
    real_mem_bytes = max(0, usage - inactive)
    mem_mb = round(real_mem_bytes / (1024 * 1024), 1)
    limit_bytes = mem_stats.get("limit", 0)
    limit_mb = round(limit_bytes / (1024 * 1024), 1) if limit_bytes else 1024.0
    return mem_mb, limit_mb

def format_uptime(started_at: str) -> str:
    """Calculates human-readable uptime from ISO timestamp."""
    if not started_at:
        return "Desconhecido"
    try:
        clean_ts = started_at.split(".")[0].replace("Z", "")
        start_dt = datetime.fromisoformat(clean_ts).replace(tzinfo=timezone.utc)
        now_dt = datetime.now(timezone.utc)
        diff = now_dt - start_dt
        seconds = int(diff.total_seconds())
        if seconds < 0:
            return "Recém-iniciado"
        if seconds < 60:
            return f"Up {seconds}s"
        minutes = seconds // 60
        if minutes < 60:
            return f"Up {minutes}m"
        hours = minutes // 60
        if hours < 24:
            return f"Up {hours}h {minutes % 60}m"
        days = hours // 24
        return f"Up {days}d {hours % 24}h"
    except Exception:
        return "Ativo"

def detect_tech_stack(image: str, name: str, labels: Optional[Dict[str, str]] = None) -> str:
    """Detects container tech stack dynamically based on image and name."""
    img = (image or "").lower()
    nm = (name or "").lower()

    if any(k in img or k in nm for k in ["php", "wordpress", "laravel", "zend", "drupal"]):
        return "PHP / Web"
    elif any(k in img or k in nm for k in ["python", "fastapi", "django", "flask", "uvicorn", "gunicorn"]):
        return "Python / API"
    elif any(k in img or k in nm for k in ["node", "next", "react", "express", "nest"]):
        return "Node.js"
    elif "postgres" in img or "postgres" in nm:
        return "PostgreSQL Database"
    elif any(k in img or k in nm for k in ["mysql", "mariadb"]):
        return "MySQL / MariaDB"
    elif "redis" in img or "redis" in nm:
        return "Redis In-Memory"
    elif "mongo" in img or "mongo" in nm:
        return "MongoDB"
    elif "traefik" in img or "traefik" in nm:
        return "Traefik Reverse Proxy"
    elif "nginx" in img or "nginx" in nm:
        return "Nginx Web Server"
    elif "caddy" in img or "caddy" in nm:
        return "Caddy Server"
    elif "easypanel" in img or "easypanel" in nm:
        return "Easypanel Daemon"
    elif "aegis" in img or "aegis" in nm:
        return "AegisSRE Agent"
    return "Docker Service"

def calculate_container_health(status: str, state: Dict[str, Any], cpu_pct: float, mem_mb: float, mem_limit_mb: float) -> str:
    """Calculates container health dynamically."""
    if status != "running":
        return "stopped"
    docker_health = state.get("Health", {}).get("Status")
    if docker_health == "unhealthy":
        return "critical"
    if cpu_pct > 85.0 or (mem_limit_mb > 0 and (mem_mb / mem_limit_mb) > 0.9):
        return "warning"
    return "healthy"

class DockerManager:
    def __init__(self, socket_url: str = "unix:///var/run/docker.sock"):
        self.socket_url = socket_url
        self.client = None
        self.is_connected = False
        self.connection_engine = "disconnected"  # "docker-py" | "httpx_uds" | "disconnected"
        self.active_socket: Optional[str] = None
        self.docker_version: Optional[str] = None
        self.api_version: Optional[str] = None
        self.last_error: Optional[str] = None
        self._probed_sockets: List[Dict[str, Any]] = []
        self._stats_cache: Dict[str, Tuple[float, float, float, float]] = {}  # container_id -> (cpu_pct, mem_mb, limit_mb, timestamp)
        self._stats_ttl = 8.0  # seconds
        self._containers_cache: List[Dict[str, Any]] = []
        self._containers_cache_time: float = 0.0
        self._containers_cache_ttl: float = 2.5  # seconds (prevents WebSocket & HTTP poll contention)
        self._last_init_time = 0.0
        self._init_client()

    def _get_candidate_socket_paths(self) -> List[str]:
        """Discovers all possible socket paths across host systems and Easypanel setups."""
        candidates = []

        # 1. Environment / Settings
        raw_env = os.getenv("DOCKER_HOST") or getattr(settings, "DOCKER_SOCKET", None) or self.socket_url
        if raw_env:
            clean = raw_env.replace("unix://", "")
            if clean and clean not in candidates:
                candidates.append(clean)

        # 2. Standard Linux / Easypanel paths
        standard_paths = [
            "/var/run/docker.sock",
            "/run/docker.sock",
            "/var/run/docker/docker.sock",
            "/run/user/1000/docker.sock",
            "/run/user/0/docker.sock",
            "/var/snap/docker/common/run/docker.sock",
        ]
        for p in standard_paths:
            if p not in candidates:
                candidates.append(p)

        # 3. Windows candidates
        if os.name == "nt":
            candidates.append("npipe:////./pipe/docker_engine")

        return candidates

    def _probe_socket_path(self, raw_path: str) -> Dict[str, Any]:
        """Inspects filesystem status and permissions of a socket candidate."""
        if raw_path.startswith("npipe://") or raw_path.startswith("tcp://"):
            return {
                "path": raw_path,
                "type": "named_pipe" if "npipe" in raw_path else "tcp",
                "exists": True,
                "is_socket": True,
                "is_directory": False,
                "readable": True,
                "writable": True,
                "mode": None,
                "owner_uid": None,
                "owner_gid": None
            }

        p = raw_path.replace("unix://", "")
        exists = os.path.exists(p)
        is_dir = os.path.isdir(p)
        is_sock = False
        mode_oct = None
        uid = None
        gid = None
        readable = False
        writable = False

        if exists:
            try:
                st = os.stat(p)
                is_sock = stat.S_ISSOCK(st.st_mode)
                mode_oct = oct(st.st_mode & 0o777)
                uid = getattr(st, "st_uid", None)
                gid = getattr(st, "st_gid", None)
                readable = os.access(p, os.R_OK)
                writable = os.access(p, os.W_OK)
            except Exception as e:
                logger.debug(f"Error inspecting stat for {p}: {e}")

        return {
            "path": p,
            "type": "directory" if is_dir else "socket" if is_sock else "file" if exists else "missing",
            "exists": exists,
            "is_socket": is_sock,
            "is_directory": is_dir,
            "readable": readable,
            "writable": writable,
            "mode": mode_oct,
            "owner_uid": uid,
            "owner_gid": gid
        }

    def _init_client(self) -> bool:
        """Attempt dual-engine connection: docker-py (auto-versioned) + httpx direct UDS fallback."""
        self._last_init_time = time.time()
        candidates = self._get_candidate_socket_paths()

        # Step 1: Probe candidate paths
        self._probed_sockets = [self._probe_socket_path(p) for p in candidates]

        # Check for common configuration mistake: Socket mounted as directory
        dir_mounts = [s["path"] for s in self._probed_sockets if s["is_directory"]]
        if dir_mounts:
            self.last_error = (
                f"Erro de Montagem: O caminho '{dir_mounts[0]}' foi montado como DIRETÓRIO (PASTA), "
                f"e não como Socket Unix! No Easypanel, altere o Type de 'Volume' para 'Bind'."
            )
            logger.error(f"[AegisSRE Alert]: {self.last_error}")

        # Step 2: Try docker-py with version="auto" and short timeout
        timeout_val = 2 if os.name == "nt" else 5
        try:
            import docker

            # 2a. Try from_env
            try:
                c = docker.from_env(version="auto", timeout=timeout_val)
                c.ping()
                self.client = c
                self.is_connected = True
                self.connection_engine = "docker-py"
                self.active_socket = "/var/run/docker.sock"
                ver = c.version()
                self.docker_version = ver.get("Version")
                self.api_version = ver.get("ApiVersion")
                self.last_error = None
                logger.info(f"Connected to Docker daemon via docker-py environment (Version: {self.docker_version}, API: {self.api_version})")
                return True
            except Exception as env_err:
                self.last_error = f"docker-py from_env falhou: {env_err}"
                logger.debug(self.last_error)

            # 2b. Try explicit candidates via DockerClient
            for probe in self._probed_sockets:
                p = probe["path"]
                # Skip known directories
                if probe["is_directory"]:
                    continue
                # If on Linux and file does not exist, skip
                if os.name != "nt" and not probe["exists"]:
                    continue

                sock_url = p if (p.startswith("tcp://") or p.startswith("npipe://")) else f"unix://{p}"
                try:
                    c = docker.DockerClient(base_url=sock_url, version="auto", timeout=8)
                    c.ping()
                    self.client = c
                    self.is_connected = True
                    self.connection_engine = "docker-py"
                    self.active_socket = p
                    ver = c.version()
                    self.docker_version = ver.get("Version")
                    self.api_version = ver.get("ApiVersion")
                    self.last_error = None
                    logger.info(f"Connected to Docker daemon via docker-py ({sock_url})")
                    return True
                except Exception as c_err:
                    self.last_error = f"docker-py em {sock_url} falhou: {c_err}"
                    logger.debug(self.last_error)

        except ImportError:
            logger.warning("docker python library not found, falling back to direct httpx UDS")
        except Exception as e:
            self.last_error = f"docker-py init error: {e}"
            logger.debug(self.last_error)

        # Step 3: Direct httpx Unix Domain Socket Fallback (Bypasses docker-py version & urllib3 negotiation bugs)
        for probe in self._probed_sockets:
            p = probe["path"]
            if probe["is_directory"] or p.startswith("npipe://") or (os.name != "nt" and not probe["exists"]):
                continue

            # UDS HTTP direct query
            try:
                if p.startswith("tcp://") or p.startswith("http://"):
                    http_base = p.replace("tcp://", "http://")
                    transport = httpx.HTTPTransport()
                else:
                    clean_uds = p.replace("unix://", "")
                    transport = httpx.HTTPTransport(uds=clean_uds)
                    http_base = "http://docker"

                with httpx.Client(transport=transport, base_url=http_base, timeout=6.0) as http_client:
                    resp = http_client.get("/version")
                    if resp.status_code == 200:
                        ver_data = resp.json()
                        self.is_connected = True
                        self.connection_engine = "httpx_uds"
                        self.active_socket = p
                        self.docker_version = ver_data.get("Version")
                        self.api_version = ver_data.get("ApiVersion")
                        self.last_error = None
                        logger.info(f"Connected to Docker daemon via direct httpx UDS: {p} (Version: {self.docker_version}, API: {self.api_version})")
                        return True
            except Exception as uds_err:
                self.last_error = f"httpx UDS em {p} falhou: {uds_err}"
                logger.debug(self.last_error)

        # Step 4: Final diagnostics if connection failed
        self.is_connected = False
        self.connection_engine = "disconnected"
        if not any(s["exists"] for s in self._probed_sockets if s["type"] != "tcp"):
            self.last_error = (
                "O arquivo '/var/run/docker.sock' não foi encontrado dentro do container. "
                "No Easypanel, certifique-se de configurar o Bind Mount (Host: /var/run/docker.sock -> Mount: /var/run/docker.sock) "
                "e OBRIGATORIAMENTE clicar no botão 'Deploy' para recriar o container com a montagem."
            )
        return False

    def ensure_client(self):
        """Ensures Docker connectivity is active, reconnecting if needed."""
        # Cooldown of 15 seconds between reconnect attempts to avoid spamming
        if not self.is_connected or (self.connection_engine == "docker-py" and self.client is None):
            if (time.time() - self._last_init_time) > 15.0:
                self._init_client()
        return self.is_connected

    def get_diagnostic(self) -> Dict[str, Any]:
        """Provides full real-time diagnostic of Docker socket and connection state."""
        # Ensure fresh probe
        self.ensure_client()

        uid = getattr(os, "getuid", lambda: None)()
        gid = getattr(os, "getgid", lambda: None)()
        is_root = (uid == 0) if uid is not None else True

        # Generate human-readable actionable guidance
        actionable_steps = []
        if self.is_connected:
            status_level = "success"
            summary = f"Conectado com sucesso ao Docker Engine via {self.connection_engine} ({self.active_socket}). Versão: {self.docker_version or 'N/A'}, API: {self.api_version or 'N/A'}."
        else:
            status_level = "error"
            # Check if directory
            dir_mount = next((s for s in self._probed_sockets if s["is_directory"]), None)
            missing_mount = not any(s["exists"] for s in self._probed_sockets if s["type"] != "tcp")
            perm_denied = any(s["exists"] and not s["readable"] for s in self._probed_sockets)

            if dir_mount:
                summary = f"ATENÇÃO: '{dir_mount['path']}' foi montado como PASTA / DIRETÓRIO em vez de arquivo socket!"
                actionable_steps = [
                    "No Easypanel, abra a aba 'Mounts' (Montagens) deste serviço.",
                    "Verifique o campo 'Type': certifique-se de selecionar 'Bind' (não Volume).",
                    "Configure Host Path: /var/run/docker.sock e Mount Path: /var/run/docker.sock.",
                    "IMPORTANTE: Clique no botão 'Deploy' no canto superior direito para aplicar a montagem!"
                ]
            elif missing_mount:
                summary = "O arquivo /var/run/docker.sock não existe dentro do container."
                actionable_steps = [
                    "No Easypanel, acesse este serviço (aiagent / aegis-sre).",
                    "Vá na aba 'Mounts' (Montagens).",
                    "Adicione um novo Mount:",
                    "  • Type: Bind",
                    "  • Host Path: /var/run/docker.sock",
                    "  • Mount Path: /var/run/docker.sock",
                    "CRÍTICO: No Easypanel, adicionar um mount NÃO altera o container ativo automaticamente. Você PRECISA clicar no botão azul/verde 'Deploy' no topo!",
                    "Aguarde o deploy finalizar e recarregue a página."
                ]
            elif perm_denied:
                summary = "Permissão negada ao acessar /var/run/docker.sock."
                actionable_steps = [
                    "Conecte-se via SSH ao terminal da sua VPS.",
                    "Execute: sudo chmod 666 /var/run/docker.sock",
                    "Isso concede permissão de leitura e escrita ao socket do Docker.",
                    "Recarregue esta página."
                ]
            else:
                summary = f"Falha ao conectar com o daemon Docker: {self.last_error or 'Conexão recusada'}"
                actionable_steps = [
                    "Verifique se o serviço Docker está em execução no host: sudo systemctl status docker",
                    "Certifique-se de que o Easypanel concluiu o deploy do serviço."
                ]

        return {
            "connected": self.is_connected,
            "engine": self.connection_engine,
            "active_socket": self.active_socket,
            "docker_version": self.docker_version,
            "api_version": self.api_version,
            "status_level": status_level,
            "summary": summary,
            "last_error": self.last_error,
            "actionable_steps": actionable_steps,
            "current_process": {
                "uid": uid,
                "gid": gid,
                "is_root": is_root
            },
            "probed_sockets": self._probed_sockets
        }

    # -------------------------------------------------------------------------
    # Container Listing (Dual-Engine: docker-py + httpx UDS)
    # -------------------------------------------------------------------------
    def list_containers(self, all: bool = True) -> List[Dict[str, Any]]:
        """List all REAL containers with live status, cache, and zero flickering."""
        now = time.time()
        # Serve from memory cache if fresh (prevents Docker socket contention between WebSocket & HTTP poll)
        if (now - self._containers_cache_time) < self._containers_cache_ttl and self._containers_cache:
            return self._containers_cache

        if not self.ensure_client():
            if self._containers_cache:
                return self._containers_cache
            return []

        fresh_containers = None

        # Method 1: docker-py list
        if self.connection_engine == "docker-py" and self.client:
            try:
                fresh_containers = self._list_containers_dockerpy(all=all)
            except Exception as py_err:
                logger.warning(f"docker-py list failed ({py_err}), falling back to direct httpx UDS...")

        # Method 2: direct httpx UDS fallback
        if fresh_containers is None:
            try:
                fresh_containers = self._list_containers_httpx(all=all)
            except Exception as e:
                logger.error(f"Error listing containers via httpx: {e}")

        if fresh_containers is not None and len(fresh_containers) > 0:
            self._containers_cache = fresh_containers
            self._containers_cache_time = now
            return fresh_containers

        # If fresh query returned empty or had a transient glitch, but we previously had valid containers:
        # DO NOT wipe out the list!
        if self._containers_cache:
            return self._containers_cache

        return fresh_containers or []

    def _list_containers_dockerpy(self, all: bool = True) -> List[Dict[str, Any]]:
        """Listing via docker-py."""
        containers = self.client.containers.list(all=all)

        # Fast parallel stats fetching for running containers
        stats_map: Dict[str, Tuple[float, float, float]] = {}
        running_containers = [c for c in containers if c.status == "running"]
        if running_containers:
            with ThreadPoolExecutor(max_workers=min(len(running_containers), 6)) as executor:
                future_to_c = {executor.submit(self._fetch_single_container_stats, c): c.id for c in running_containers}
                try:
                    for future in as_completed(future_to_c, timeout=2.0):
                        cid = future_to_c[future]
                        try:
                            stats_map[cid] = future.result()
                        except Exception:
                            stats_map[cid] = (0.0, 0.0, 1024.0)
                except Exception as t_err:
                    logger.debug(f"Stats fetch partial timeout: {t_err}")

        result = []
        for c in containers:
            try:
                attrs = c.attrs
                state = attrs.get("State", {})
                config = attrs.get("Config", {})
                created = attrs.get("Created", "")
                started_at = state.get("StartedAt", "")

                try:
                    image_name = c.image.tags[0] if (c.image and c.image.tags) else (c.image.short_id if c.image else "unknown")
                except Exception:
                    image_name = config.get("Image", "unknown")

                # Ports extraction
                ports_raw = attrs.get("NetworkSettings", {}).get("Ports", {}) or {}
                ports_list = []
                for container_port, host_bindings in ports_raw.items():
                    if host_bindings:
                        for b in host_bindings:
                            ports_list.append(f"{b.get('HostPort')}:{container_port}")
                    else:
                        ports_list.append(container_port)

                # Real metrics
                if c.status == "running":
                    cpu_pct, mem_mb, limit_mb = stats_map.get(c.id, self._fetch_single_container_stats(c))
                else:
                    cpu_pct, mem_mb, limit_mb = 0.0, 0.0, 1024.0

                c_name = c.name.lstrip("/")
                stack = detect_tech_stack(image_name, c_name, config.get("Labels"))
                health = calculate_container_health(c.status, state, cpu_pct, mem_mb, limit_mb)
                uptime = format_uptime(started_at) if c.status == "running" else "Parado"

                result.append({
                    "id": c.short_id,
                    "full_id": c.id,
                    "name": c_name,
                    "image": image_name,
                    "status": c.status,
                    "state_detail": state.get("Status", c.status),
                    "created": created,
                    "uptime": uptime,
                    "ports": ports_list,
                    "ip_address": attrs.get("NetworkSettings", {}).get("IPAddress", ""),
                    "is_simulated": False,
                    "health": health,
                    "tech_stack": stack,
                    "cpu_percent": cpu_pct,
                    "memory_mb": mem_mb,
                    "memory_limit_mb": limit_mb
                })
            except Exception as item_err:
                logger.debug(f"Skipping container due to inspect error: {item_err}")
                continue

        return result

    def _get_httpx_client(self, timeout: float = 6.0) -> httpx.Client:
        """Helper to instantiate properly routed httpx client for active socket."""
        sock = self.active_socket or "/var/run/docker.sock"
        if sock.startswith("tcp://") or sock.startswith("http://"):
            return httpx.Client(base_url=sock.replace("tcp://", "http://"), timeout=timeout)
        clean_uds = sock.replace("unix://", "").strip()
        if "(" in clean_uds:
            clean_uds = clean_uds.split("(")[-1].replace(")", "").strip()
        if not clean_uds or "from_env" in clean_uds or (os.name != "nt" and not os.path.exists(clean_uds)):
            clean_uds = "/var/run/docker.sock"
        transport = httpx.HTTPTransport(uds=clean_uds)
        return httpx.Client(transport=transport, base_url="http://docker", timeout=timeout)

    def _list_containers_httpx(self, all: bool = True) -> List[Dict[str, Any]]:
        """Listing via direct HTTP Unix Domain Socket."""
        with self._get_httpx_client(timeout=8.0) as client:
            resp = client.get(f"/containers/json?all={1 if all else 0}")
            if resp.status_code != 200:
                logger.error(f"Docker API /containers/json returned status {resp.status_code}: {resp.text}")
                return []
            raw_items = resp.json()

        result = []
        for item in raw_items:
            try:
                cid = item.get("Id", "")
                short_id = cid[:12] if cid else "unknown"
                raw_names = item.get("Names") or []
                c_name = raw_names[0].lstrip("/") if raw_names else short_id
                image_name = item.get("Image", "unknown")
                state = item.get("State", "unknown").lower()
                status_text = item.get("Status", state)
                labels = item.get("Labels") or {}
                created_ts = item.get("Created", 0)
                try:
                    created_iso = datetime.fromtimestamp(created_ts, tz=timezone.utc).isoformat()
                except Exception:
                    created_iso = ""

                # Ports
                ports_list = []
                for p in item.get("Ports", []):
                    pub = p.get("PublicPort")
                    priv = p.get("PrivatePort")
                    ptype = p.get("Type", "tcp")
                    if pub:
                        ports_list.append(f"{pub}:{priv}/{ptype}")
                    elif priv:
                        ports_list.append(f"{priv}/{ptype}")

                # IP Address
                networks = item.get("NetworkSettings", {}).get("Networks", {})
                ip = ""
                for net_data in networks.values():
                    ip = net_data.get("IPAddress", "")
                    if ip:
                        break

                # Real metrics
                if state == "running":
                    cpu_pct, mem_mb, limit_mb = self._fetch_single_container_stats_httpx(cid)
                else:
                    cpu_pct, mem_mb, limit_mb = 0.0, 0.0, 1024.0

                stack = detect_tech_stack(image_name, c_name, labels)
                fake_state_obj = {"Status": state, "Health": {"Status": "healthy" if state == "running" else "none"}}
                health = calculate_container_health(state, fake_state_obj, cpu_pct, mem_mb, limit_mb)
                uptime = status_text if status_text else ("Ativo" if state == "running" else "Parado")

                result.append({
                    "id": short_id,
                    "full_id": cid,
                    "name": c_name,
                    "image": image_name,
                    "status": state,
                    "state_detail": status_text,
                    "created": created_iso,
                    "uptime": uptime,
                    "ports": ports_list,
                    "ip_address": ip,
                    "is_simulated": False,
                    "health": health,
                    "tech_stack": stack,
                    "cpu_percent": cpu_pct,
                    "memory_mb": mem_mb,
                    "memory_limit_mb": limit_mb
                })
            except Exception as item_err:
                logger.debug(f"Skipping container item due to error: {item_err}")
                continue

        return result

    def _fetch_single_container_stats(self, container_obj) -> Tuple[float, float, float]:
        """Fetches and parses real CPU & Memory from Docker stats API with cache (docker-py)."""
        cid = container_obj.id
        now = time.time()

        if cid in self._stats_cache:
            cpu_pct, mem_mb, limit_mb, ts = self._stats_cache[cid]
            if (now - ts) < self._stats_ttl:
                return cpu_pct, mem_mb, limit_mb

        try:
            stats = container_obj.stats(stream=False)
            mem_mb, limit_mb = calculate_memory_mb(stats.get("memory_stats", {}))
            cpu_pct = calculate_cpu_percent(stats.get("cpu_stats", {}), stats.get("precpu_stats", {}))
            self._stats_cache[cid] = (cpu_pct, mem_mb, limit_mb, now)
            return cpu_pct, mem_mb, limit_mb
        except Exception as e:
            logger.debug(f"Could not read stats for {container_obj.name}: {e}")
            if cid in self._stats_cache:
                c, m, l, _ = self._stats_cache[cid]
                return c, m, l
            return 0.0, 0.0, 1024.0

    def _fetch_single_container_stats_httpx(self, cid: str) -> Tuple[float, float, float]:
        """Fetches and parses real CPU & Memory from Docker stats API with cache (httpx UDS)."""
        now = time.time()
        if cid in self._stats_cache:
            cpu_pct, mem_mb, limit_mb, ts = self._stats_cache[cid]
            if (now - ts) < self._stats_ttl:
                return cpu_pct, mem_mb, limit_mb

        try:
            with self._get_httpx_client(timeout=3.0) as client:
                resp = client.get(f"/containers/{cid}/stats?stream=false")
                if resp.status_code == 200:
                    st = resp.json()
                    mem_mb, limit_mb = calculate_memory_mb(st.get("memory_stats", {}))
                    cpu_pct = calculate_cpu_percent(st.get("cpu_stats", {}), st.get("precpu_stats", {}))
                    self._stats_cache[cid] = (cpu_pct, mem_mb, limit_mb, now)
                    return cpu_pct, mem_mb, limit_mb
        except Exception as ex:
            logger.debug(f"Failed to fetch stats for {cid} via httpx: {ex}")

        return 0.0, 0.0, 1024.0

    # -------------------------------------------------------------------------
    # Container Details Inspection
    # -------------------------------------------------------------------------
    def get_container_details(self, name_or_id: str) -> Optional[Dict[str, Any]]:
        """Detailed real container inspection."""
        if not self.ensure_client():
            return None

        # Try docker-py
        if self.connection_engine == "docker-py" and self.client:
            try:
                c = self.client.containers.get(name_or_id)
                attrs = c.attrs
                return self._parse_container_inspect_attrs(c.short_id, c.id, c.name, attrs)
            except Exception as py_err:
                logger.warning(f"docker-py inspect failed ({py_err}), falling back to direct httpx...")

        # Direct httpx UDS fallback
        try:
            with self._get_httpx_client(timeout=6.0) as client:
                resp = client.get(f"/containers/{name_or_id}/json")
                if resp.status_code != 200:
                    return None
                attrs = resp.json()
                cid = attrs.get("Id", name_or_id)
                short_id = cid[:12] if cid else name_or_id
                c_name = attrs.get("Name", name_or_id).lstrip("/")
                return self._parse_container_inspect_attrs(short_id, cid, c_name, attrs)
        except Exception as e:
            logger.error(f"Failed to inspect container {name_or_id}: {e}")
            return None

    def _parse_container_inspect_attrs(self, short_id: str, full_id: str, name: str, attrs: Dict[str, Any]) -> Dict[str, Any]:
        """Formats Docker inspect JSON into clean AegisSRE structure."""
        config = attrs.get("Config", {})
        host_config = attrs.get("HostConfig", {})
        mounts = attrs.get("Mounts", [])

        formatted_mounts = [
            {
                "source": m.get("Source"),
                "destination": m.get("Destination"),
                "mode": m.get("Mode", "rw"),
                "type": m.get("Type", "bind")
            }
            for m in mounts
        ]

        envs = config.get("Env", [])
        sanitized_envs = []
        for env in envs:
            if "=" in env:
                k, v = env.split("=", 1)
                if any(s in k.lower() for s in ["key", "secret", "pass", "token"]):
                    sanitized_envs.append({"key": k, "value": "••••••••", "masked": True})
                else:
                    sanitized_envs.append({"key": k, "value": v, "masked": False})

        img_name = config.get("Image", "unknown")
        c_name = name.lstrip("/")
        state = attrs.get("State", {})

        return {
            "id": short_id,
            "full_id": full_id,
            "name": c_name,
            "image": img_name,
            "status": state.get("Status", "unknown"),
            "command": config.get("Cmd", []),
            "entrypoint": config.get("Entrypoint", []),
            "env": sanitized_envs,
            "mounts": formatted_mounts,
            "network_mode": host_config.get("NetworkMode", "bridge"),
            "restart_policy": host_config.get("RestartPolicy", {}).get("Name", "unless-stopped"),
            "created": attrs.get("Created"),
            "tech_stack": detect_tech_stack(img_name, c_name),
            "is_simulated": False
        }

    # -------------------------------------------------------------------------
    # Container Logs & Controls
    # -------------------------------------------------------------------------
    def get_container_logs(self, name_or_id: str, tail: int = 150) -> str:
        """Fetch logs directly from Docker daemon."""
        if not self.ensure_client():
            return f"[AegisSRE Notice]: Docker Socket não está disponível. Detalhes: {self.last_error or 'Desconectado'}"

        if self.connection_engine == "docker-py" and self.client:
            try:
                c = self.client.containers.get(name_or_id)
                logs_bytes = c.logs(tail=tail, timestamps=True)
                return logs_bytes.decode("utf-8", errors="replace")
            except Exception as py_err:
                logger.warning(f"docker-py logs failed: {py_err}, falling back to httpx...")

        try:
            with self._get_httpx_client(timeout=10.0) as client:
                resp = client.get(f"/containers/{name_or_id}/logs?stdout=1&stderr=1&tail={tail}&timestamps=1")
                if resp.status_code == 200:
                    return demux_docker_stream(resp.content)
                return f"[AegisSRE Error]: Docker API retornou HTTP {resp.status_code}: {resp.text}"
        except Exception as e:
            return f"[AegisSRE Error]: Falha ao ler logs do container {name_or_id}: {e}"

    def restart_container(self, name_or_id: str) -> Dict[str, Any]:
        """Restart real container."""
        if not self.ensure_client():
            return {"success": False, "error": "Docker Socket não disponível."}

        if self.connection_engine == "docker-py" and self.client:
            try:
                c = self.client.containers.get(name_or_id)
                c.restart(timeout=10)
                return {"success": True, "message": f"Container {name_or_id} reiniciado com sucesso."}
            except Exception as py_err:
                logger.warning(f"docker-py restart failed: {py_err}, falling back to httpx...")

        try:
            with self._get_httpx_client(timeout=15.0) as client:
                resp = client.post(f"/containers/{name_or_id}/restart?t=10")
                if resp.status_code in (204, 200):
                    return {"success": True, "message": f"Container {name_or_id} reiniciado com sucesso."}
                return {"success": False, "error": f"HTTP {resp.status_code}: {resp.text}"}
        except Exception as e:
            return {"success": False, "error": str(e)}

    def stop_container(self, name_or_id: str) -> Dict[str, Any]:
        """Stop real container."""
        if not self.ensure_client():
            return {"success": False, "error": "Docker Socket não disponível."}

        if self.connection_engine == "docker-py" and self.client:
            try:
                c = self.client.containers.get(name_or_id)
                c.stop(timeout=10)
                return {"success": True, "message": f"Container {name_or_id} parado com sucesso."}
            except Exception as py_err:
                logger.warning(f"docker-py stop failed: {py_err}, falling back to httpx...")

        try:
            with self._get_httpx_client(timeout=15.0) as client:
                resp = client.post(f"/containers/{name_or_id}/stop?t=10")
                if resp.status_code in (204, 200):
                    return {"success": True, "message": f"Container {name_or_id} parado com sucesso."}
                return {"success": False, "error": f"HTTP {resp.status_code}: {resp.text}"}
        except Exception as e:
            return {"success": False, "error": str(e)}

    def start_container(self, name_or_id: str) -> Dict[str, Any]:
        """Start real container."""
        if not self.ensure_client():
            return {"success": False, "error": "Docker Socket não disponível."}

        if self.connection_engine == "docker-py" and self.client:
            try:
                c = self.client.containers.get(name_or_id)
                c.start()
                return {"success": True, "message": f"Container {name_or_id} iniciado com sucesso."}
            except Exception as py_err:
                logger.warning(f"docker-py start failed: {py_err}, falling back to httpx...")

        try:
            with self._get_httpx_client(timeout=15.0) as client:
                resp = client.post(f"/containers/{name_or_id}/start")
                if resp.status_code in (204, 200):
                    return {"success": True, "message": f"Container {name_or_id} iniciado com sucesso."}
                return {"success": False, "error": f"HTTP {resp.status_code}: {resp.text}"}
        except Exception as e:
            return {"success": False, "error": str(e)}

    def get_full_stack_architecture(self) -> List[Dict[str, Any]]:
        """Introspect full architecture for IaC (Terraform & Ansible)."""
        containers = self.list_containers(all=True)
        stack = []
        for c in containers:
            detail = self.get_container_details(c["id"])
            if detail:
                stack.append(detail)
            else:
                stack.append(c)
        return stack

docker_manager = DockerManager()
