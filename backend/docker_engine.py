import os
import time
import logging
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import List, Dict, Any, Optional, Tuple
from datetime import datetime, timezone
from backend.config import settings

logger = logging.getLogger("docker_engine")

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
    def __init__(self, socket_url: str = "unix://var/run/docker.sock"):
        self.socket_url = socket_url
        self.client = None
        self.is_connected = False
        self._stats_cache: Dict[str, Tuple[float, float, float, float]] = {}  # container_id -> (cpu_pct, mem_mb, limit_mb, timestamp)
        self._stats_ttl = 8.0  # seconds
        self._init_client()

    def _init_client(self) -> bool:
        """Attempt to connect or reconnect to Docker daemon."""
        try:
            import docker
            # Method 1: Environment / Standard Docker socket
            try:
                c = docker.from_env(timeout=4)
                c.ping()
                self.client = c
                self.is_connected = True
                logger.info("Connected to Docker daemon successfully via environment.")
                return True
            except Exception:
                pass

            # Method 2: Comprehensive candidate socket list
            candidates = [
                self.socket_url,
                getattr(settings, "DOCKER_SOCKET", None),
                "unix:///var/run/docker.sock",
                "unix://var/run/docker.sock",
                "unix:///run/docker.sock",
                "unix://run/docker.sock",
            ]
            if os.name == "nt":
                candidates.extend(["npipe:////./pipe/docker_engine", "tcp://127.0.0.1:2375", "tcp://localhost:2375"])

            seen = set()
            for sock in candidates:
                if not sock or sock in seen:
                    continue
                seen.add(sock)
                try:
                    c = docker.DockerClient(base_url=sock, timeout=4)
                    c.ping()
                    self.client = c
                    self.is_connected = True
                    logger.info("Connected to Docker daemon via socket %s", sock)
                    return True
                except Exception:
                    pass

        except Exception as e:
            logger.warning(f"Docker connection initialization error: {e}")

        if not os.path.exists("/var/run/docker.sock") and os.name != "nt":
            logger.warning("[AegisSRE Notice]: /var/run/docker.sock não encontrado. No Easypanel, monte o Host Path '/var/run/docker.sock' -> '/var/run/docker.sock' na aba Mounts para listar os containeres.")

        self.is_connected = False
        return False

    def ensure_client(self):
        """Ensures the Docker client is connected."""
        if not self.is_connected or self.client is None:
            self._init_client()
        return self.client

    def _fetch_single_container_stats(self, container_obj) -> Tuple[float, float, float]:
        """Fetches and parses real CPU & Memory from Docker stats API with cache."""
        cid = container_obj.id
        now = time.time()

        # Check cache
        if cid in self._stats_cache:
            cpu_pct, mem_mb, limit_mb, ts = self._stats_cache[cid]
            if (now - ts) < self._stats_ttl:
                return cpu_pct, mem_mb, limit_mb

        try:
            stats = container_obj.stats(stream=False)
            
            # Memory calculation
            mem_stats = stats.get("memory_stats", {})
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

            # CPU calculation
            cpu_stats = stats.get("cpu_stats", {})
            precpu_stats = stats.get("precpu_stats", {})
            cpu_usage = cpu_stats.get("cpu_usage", {})
            precpu_usage = precpu_stats.get("cpu_usage", {})

            cpu_delta = cpu_usage.get("total_usage", 0) - precpu_usage.get("total_usage", 0)
            system_delta = cpu_stats.get("system_cpu_usage", 0) - precpu_stats.get("system_cpu_usage", 0)
            online_cpus = cpu_stats.get("online_cpus") or len(cpu_usage.get("percpu_usage", [1])) or 1

            if system_delta > 0 and cpu_delta > 0:
                cpu_pct = round((cpu_delta / system_delta) * online_cpus * 100.0, 1)
            else:
                cpu_pct = 0.0

            self._stats_cache[cid] = (cpu_pct, mem_mb, limit_mb, now)
            return cpu_pct, mem_mb, limit_mb

        except Exception as e:
            logger.debug(f"Could not read stats for {container_obj.name}: {e}")
            if cid in self._stats_cache:
                c, m, l, _ = self._stats_cache[cid]
                return c, m, l
            return 0.0, 0.0, 1024.0

    def list_containers(self, all: bool = True) -> List[Dict[str, Any]]:
        """List all REAL containers with live status and 100% real metrics."""
        client = self.ensure_client()
        if not client or not self.is_connected:
            logger.warning("Docker daemon is not connected. Returning empty container list.")
            return []

        try:
            containers = client.containers.list(all=all)
        except Exception as e:
            logger.error(f"Error listing containers from Docker daemon: {e}")
            # Try to reconnect once
            if self._init_client():
                try:
                    containers = self.client.containers.list(all=all)
                except Exception:
                    return []
            else:
                return []

        # Fast parallel stats fetching for running containers
        stats_map: Dict[str, Tuple[float, float, float]] = {}
        running_containers = [c for c in containers if c.status == "running"]
        if running_containers:
            with ThreadPoolExecutor(max_workers=min(len(running_containers), 8)) as executor:
                future_to_c = {executor.submit(self._fetch_single_container_stats, c): c.id for c in running_containers}
                for future in as_completed(future_to_c, timeout=2.5):
                    cid = future_to_c[future]
                    try:
                        stats_map[cid] = future.result()
                    except Exception:
                        stats_map[cid] = (0.0, 0.0, 1024.0)

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

    def get_container_details(self, name_or_id: str) -> Optional[Dict[str, Any]]:
        """Detailed real container inspection."""
        client = self.ensure_client()
        if not client or not self.is_connected:
            return None

        try:
            c = client.containers.get(name_or_id)
            attrs = c.attrs
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

            try:
                img_name = c.image.tags[0] if (c.image and c.image.tags) else c.image.short_id
            except Exception:
                img_name = config.get("Image", "unknown")

            c_name = c.name.lstrip("/")
            return {
                "id": c.short_id,
                "full_id": c.id,
                "name": c_name,
                "image": img_name,
                "status": c.status,
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
        except Exception as e:
            logger.error(f"Failed to inspect container {name_or_id}: {e}")
            return None

    def get_container_logs(self, name_or_id: str, tail: int = 150) -> str:
        """Fetch logs directly from Docker daemon."""
        client = self.ensure_client()
        if not client or not self.is_connected:
            return "[AegisSRE Notice]: Docker Socket não está disponível."

        try:
            c = client.containers.get(name_or_id)
            logs_bytes = c.logs(tail=tail, timestamps=True)
            return logs_bytes.decode("utf-8", errors="replace")
        except Exception as e:
            return f"[AegisSRE Error]: Falha ao ler logs do container {name_or_id}: {e}"

    def restart_container(self, name_or_id: str) -> Dict[str, Any]:
        """Restart real container."""
        client = self.ensure_client()
        if not client or not self.is_connected:
            return {"success": False, "error": "Docker Socket não disponível."}

        try:
            c = client.containers.get(name_or_id)
            c.restart(timeout=10)
            return {"success": True, "message": f"Container {name_or_id} reiniciado com sucesso."}
        except Exception as e:
            return {"success": False, "error": str(e)}

    def stop_container(self, name_or_id: str) -> Dict[str, Any]:
        """Stop real container."""
        client = self.ensure_client()
        if not client or not self.is_connected:
            return {"success": False, "error": "Docker Socket não disponível."}

        try:
            c = client.containers.get(name_or_id)
            c.stop(timeout=10)
            return {"success": True, "message": f"Container {name_or_id} parado."}
        except Exception as e:
            return {"success": False, "error": str(e)}

    def start_container(self, name_or_id: str) -> Dict[str, Any]:
        """Start real container."""
        client = self.ensure_client()
        if not client or not self.is_connected:
            return {"success": False, "error": "Docker Socket não disponível."}

        try:
            c = client.containers.get(name_or_id)
            c.start()
            return {"success": True, "message": f"Container {name_or_id} iniciado."}
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
