import os
import time
import logging
from typing import List, Dict, Any, Optional
from datetime import datetime

logger = logging.getLogger("docker_engine")

class DockerManager:
    def __init__(self, socket_url: str = "unix:///var/run/docker.sock"):
        self.socket_url = socket_url
        self.client = None
        self.is_connected = False
        self._init_client()
        
        # State for simulated containers (used when Docker socket is not available)
        self._simulated_containers = self._build_default_simulation_stack()

    def _init_client(self):
        try:
            import docker
            # Attempt to connect to local docker socket / env
            try:
                self.client = docker.from_env(timeout=3)
                self.client.ping()
                self.is_connected = True
                logger.info("Connected to Docker daemon successfully via environment.")
                return
            except Exception:
                pass

            if os.path.exists("/var/run/docker.sock") or self.socket_url.startswith("unix://"):
                self.client = docker.DockerClient(base_url=self.socket_url, timeout=3)
                self.client.ping()
                self.is_connected = True
                logger.info("Connected to Docker daemon via socket %s", self.socket_url)
                return
        except Exception as e:
            logger.warning(f"Could not connect to Docker daemon: {e}. Running in Simulation Mode.")
            self.is_connected = False

    def list_containers(self, all: bool = True) -> List[Dict[str, Any]]:
        """List all containers with status and normalized metrics."""
        if self.is_connected and self.client:
            try:
                containers = self.client.containers.list(all=all)
                result = []
                for c in containers:
                    try:
                        attrs = c.attrs
                        state = attrs.get("State", {})
                        created = attrs.get("Created", "")
                        try:
                            image_name = c.image.tags[0] if (c.image and c.image.tags) else (c.image.short_id if c.image else "unknown")
                        except Exception:
                            image_name = attrs.get("Config", {}).get("Image", "unknown")
                        
                        # Compute ports
                        ports_raw = attrs.get("NetworkSettings", {}).get("Ports", {}) or {}
                        ports_list = []
                        for container_port, host_bindings in ports_raw.items():
                            if host_bindings:
                                for b in host_bindings:
                                    ports_list.append(f"{b.get('HostPort')}:{container_port}")
                            else:
                                ports_list.append(container_port)

                        result.append({
                            "id": c.short_id,
                            "full_id": c.id,
                            "name": c.name.lstrip("/"),
                            "image": image_name,
                            "status": c.status, # running, exited, paused, restarting
                            "state_detail": state.get("Status", c.status),
                            "created": created,
                            "uptime": state.get("StartedAt", ""),
                            "ports": ports_list,
                            "ip_address": attrs.get("NetworkSettings", {}).get("IPAddress", ""),
                            "is_simulated": False
                        })
                    except Exception as item_err:
                        continue
                return result
            except Exception as e:
                logger.error(f"Error fetching containers from real Docker: {e}")
                # Fallback to simulated if real connection drops
        
        # Return simulated containers
        return [
            {
                "id": c["id"],
                "full_id": c["full_id"],
                "name": c["name"],
                "image": c["image"],
                "status": c["status"],
                "state_detail": c["status"],
                "created": c["created"],
                "uptime": c["uptime"],
                "ports": c["ports"],
                "ip_address": c["ip_address"],
                "is_simulated": True,
                "health": c.get("health", "healthy"),
                "tech_stack": c.get("tech_stack", "unknown"),
                "cpu_percent": c.get("cpu_percent", 0.0),
                "memory_mb": c.get("memory_mb", 0.0),
                "memory_limit_mb": c.get("memory_limit_mb", 1024.0)
            }
            for c in self._simulated_containers.values()
        ]

    def get_container_details(self, name_or_id: str) -> Optional[Dict[str, Any]]:
        """Detailed container inspection."""
        if self.is_connected and self.client:
            try:
                c = self.client.containers.get(name_or_id)
                attrs = c.attrs
                config = attrs.get("Config", {})
                host_config = attrs.get("HostConfig", {})
                mounts = attrs.get("Mounts", [])
                
                # Format mounts
                formatted_mounts = [
                    {
                        "source": m.get("Source"),
                        "destination": m.get("Destination"),
                        "mode": m.get("Mode", "rw"),
                        "type": m.get("Type", "bind")
                    }
                    for m in mounts
                ]

                # Format env vars (masking sensitive keys)
                envs = config.get("Env", [])
                sanitized_envs = []
                for env in envs:
                    if "=" in env:
                        k, v = env.split("=", 1)
                        if any(s in k.lower() for s in ["key", "secret", "pass", "token"]):
                            sanitized_envs.append({"key": k, "value": "••••••••", "masked": True})
                        else:
                            sanitized_envs.append({"key": k, "value": v, "masked": False})

                return {
                    "id": c.short_id,
                    "full_id": c.id,
                    "name": c.name.lstrip("/"),
                    "image": c.image.tags[0] if c.image.tags else c.image.short_id,
                    "status": c.status,
                    "command": config.get("Cmd", []),
                    "entrypoint": config.get("Entrypoint", []),
                    "env": sanitized_envs,
                    "mounts": formatted_mounts,
                    "network_mode": host_config.get("NetworkMode", "bridge"),
                    "restart_policy": host_config.get("RestartPolicy", {}).get("Name", "no"),
                    "created": attrs.get("Created"),
                    "is_simulated": False
                }
            except Exception as e:
                logger.error(f"Failed to inspect container {name_or_id}: {e}")

        # Simulated lookup
        for key, sc in self._simulated_containers.items():
            if sc["name"] == name_or_id or sc["id"] == name_or_id:
                return {
                    "id": sc["id"],
                    "full_id": sc["full_id"],
                    "name": sc["name"],
                    "image": sc["image"],
                    "status": sc["status"],
                    "tech_stack": sc.get("tech_stack", "General"),
                    "command": sc.get("command", ["entrypoint.sh"]),
                    "entrypoint": ["/bin/sh", "-c"],
                    "env": [
                        {"key": "APP_ENV", "value": "production", "masked": False},
                        {"key": "DB_CONNECTION", "value": "pgsql", "masked": False},
                        {"key": "DB_HOST", "value": "postgres-production", "masked": False},
                        {"key": "APP_KEY", "value": "••••••••", "masked": True}
                    ],
                    "mounts": [
                        {"source": f"/var/easypanel/volumes/{sc['name']}/data", "destination": "/app/storage", "mode": "rw", "type": "bind"}
                    ],
                    "network_mode": "easypanel-bridge",
                    "restart_policy": "unless-stopped",
                    "created": sc["created"],
                    "is_simulated": True,
                    "health": sc.get("health", "healthy")
                }
        return None

    def get_container_logs(self, name_or_id: str, tail: int = 150) -> str:
        """Fetch logs from container."""
        if self.is_connected and self.client:
            try:
                c = self.client.containers.get(name_or_id)
                logs_bytes = c.logs(tail=tail, timestamps=True)
                return logs_bytes.decode("utf-8", errors="replace")
            except Exception as e:
                return f"[AegisSRE Error]: Failed to read container logs: {e}"

        # Simulated logs tailored to tech stack
        for key, sc in self._simulated_containers.items():
            if sc["name"] == name_or_id or sc["id"] == name_or_id:
                return sc.get("logs", f"[{datetime.now().isoformat()}] Service {sc['name']} running normally.")
        return f"[AegisSRE Notice]: Container {name_or_id} not found."

    def restart_container(self, name_or_id: str) -> Dict[str, Any]:
        """Restart container."""
        if self.is_connected and self.client:
            try:
                c = self.client.containers.get(name_or_id)
                c.restart(timeout=10)
                return {"success": True, "message": f"Container {name_or_id} restarted successfully."}
            except Exception as e:
                return {"success": False, "error": str(e)}

        # Simulated restart
        for key, sc in self._simulated_containers.items():
            if sc["name"] == name_or_id or sc["id"] == name_or_id:
                sc["status"] = "running"
                sc["health"] = "healthy"
                sc["uptime"] = "Just now"
                sc["logs"] += f"\n[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] [SIGTERM] Container restarting gracefully..."
                sc["logs"] += f"\n[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] [NOTICE] Service reloaded and listening on standard port."
                return {"success": True, "message": f"[Simulation] Container {sc['name']} restarted and recovered."}

        return {"success": False, "error": f"Container {name_or_id} not found."}

    def stop_container(self, name_or_id: str) -> Dict[str, Any]:
        """Stop container."""
        if self.is_connected and self.client:
            try:
                c = self.client.containers.get(name_or_id)
                c.stop(timeout=10)
                return {"success": True, "message": f"Container {name_or_id} stopped."}
            except Exception as e:
                return {"success": False, "error": str(e)}

        for key, sc in self._simulated_containers.items():
            if sc["name"] == name_or_id or sc["id"] == name_or_id:
                sc["status"] = "exited"
                sc["health"] = "stopped"
                return {"success": True, "message": f"[Simulation] Container {sc['name']} stopped."}
        return {"success": False, "error": "Not found"}

    def start_container(self, name_or_id: str) -> Dict[str, Any]:
        """Start container."""
        if self.is_connected and self.client:
            try:
                c = self.client.containers.get(name_or_id)
                c.start()
                return {"success": True, "message": f"Container {name_or_id} started."}
            except Exception as e:
                return {"success": False, "error": str(e)}

        for key, sc in self._simulated_containers.items():
            if sc["name"] == name_or_id or sc["id"] == name_or_id:
                sc["status"] = "running"
                sc["health"] = "healthy"
                return {"success": True, "message": f"[Simulation] Container {sc['name']} started."}
        return {"success": False, "error": "Not found"}

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

    def _build_default_simulation_stack(self) -> Dict[str, Dict[str, Any]]:
        """Mock production stack typical of an Easypanel Docker VPS."""
        return {
            "easypanel-core": {
                "id": "e4a19b8c",
                "full_id": "e4a19b8cf30a12e8b01239aa812f",
                "name": "easypanel-core",
                "image": "easypanel/easypanel:latest",
                "status": "running",
                "health": "healthy",
                "tech_stack": "Node.js / Go",
                "ports": ["3000:3000"],
                "ip_address": "172.20.0.2",
                "created": "4 days ago",
                "uptime": "Up 4 days",
                "cpu_percent": 1.2,
                "memory_mb": 142.5,
                "memory_limit_mb": 1024.0,
                "logs": """[2026-10-04 18:30:11] [INFO] Easypanel server daemon active on port 3000
[2026-10-04 18:45:00] [INFO] Cron worker: Heartbeat check passed (7 services alive)
[2026-10-04 19:00:22] [INFO] Automated volume sync verified: OK"""
            },
            "traefik-proxy": {
                "id": "b71c42f0",
                "full_id": "b71c42f018e47201aa99c8211029",
                "name": "traefik-proxy",
                "image": "traefik:v3.1",
                "status": "running",
                "health": "healthy",
                "tech_stack": "Go / Reverse Proxy",
                "ports": ["80:80", "443:443", "8080:8080"],
                "ip_address": "172.20.0.3",
                "created": "4 days ago",
                "uptime": "Up 4 days",
                "cpu_percent": 0.8,
                "memory_mb": 68.0,
                "memory_limit_mb": 512.0,
                "logs": """[2026-10-04 19:02:11] [INFO] Configuration loaded from Docker Provider
[2026-10-04 19:05:43] [INFO] ACME Let's Encrypt certificates verified for all domains
[2026-10-04 19:08:12] [INFO] HTTP/2 router handling 42 req/s with average latency 4.2ms"""
            },
            "php-ecommerce-api": {
                "id": "c8901ade",
                "full_id": "c8901ade29019283749281aef12",
                "name": "php-ecommerce-api",
                "image": "php:8.3-fpm-alpine",
                "status": "running",
                "health": "warning",
                "tech_stack": "PHP 8.3 / Laravel / Zend Engine",
                "ports": ["9000:9000"],
                "ip_address": "172.20.0.4",
                "created": "2 days ago",
                "uptime": "Up 6 hours",
                "cpu_percent": 18.5,
                "memory_mb": 420.0,
                "memory_limit_mb": 512.0,
                "logs": """[2026-10-04 18:50:12] NOTICE: fpm is running, pid 1
[2026-10-04 18:50:12] NOTICE: ready to handle connections
[2026-10-04 19:01:45] WARNING: [pool www] server reached max_children setting (10), consider raising it
[2026-10-04 19:07:33] [ERROR] PHP Fatal error: Allowed memory size of 134217728 bytes exhausted (tried to allocate 20480 bytes) in /var/www/html/app/Services/ReportExportService.php on line 214
Stack trace:
#0 /var/www/html/app/Http/Controllers/OrderController.php(88): App\\Services\\ReportExportService->generateCsv()
#1 /var/www/html/vendor/laravel/framework/src/Illuminate/Routing/Controller.php(54): App\\Http\\Controllers\\OrderController->export()
#2 /var/www/html/public/index.php(52): Illuminate\\Foundation\\Http\\Kernel->handle()"""
            },
            "python-ai-worker": {
                "id": "f5123bc8",
                "full_id": "f5123bc8481923049182390a1b2",
                "name": "python-ai-worker",
                "image": "python:3.11-slim",
                "status": "running",
                "health": "healthy",
                "tech_stack": "Python 3.11 / FastAPI / Celery",
                "ports": ["8001:8000"],
                "ip_address": "172.20.0.5",
                "created": "2 days ago",
                "uptime": "Up 2 days",
                "cpu_percent": 4.1,
                "memory_mb": 290.4,
                "memory_limit_mb": 1024.0,
                "logs": """[2026-10-04 18:40:02] [INFO] [celery.worker.strategy] Task tasks.process_embeddings[b38f-491a] received
[2026-10-04 18:40:05] [INFO] [celery.app.trace] Task tasks.process_embeddings[b38f-491a] succeeded in 2.91s
[2026-10-04 19:08:10] [INFO] Redis PubSub connection alive. 0 dropped packets."""
            },
            "postgres-production": {
                "id": "d1283efa",
                "full_id": "d1283efa901823019283019283",
                "name": "postgres-production",
                "image": "postgres:16-alpine",
                "status": "running",
                "health": "healthy",
                "tech_stack": "PostgreSQL 16",
                "ports": ["5432:5432"],
                "ip_address": "172.20.0.6",
                "created": "10 days ago",
                "uptime": "Up 10 days",
                "cpu_percent": 2.3,
                "memory_mb": 380.0,
                "memory_limit_mb": 2048.0,
                "logs": """2026-10-04 18:00:00.120 UTC [1] LOG:  database system is ready to accept connections
2026-10-04 18:30:00.000 UTC [45] LOG:  checkpoint starting: time
2026-10-04 18:30:14.230 UTC [45] LOG:  checkpoint complete: wrote 412 buffers (2.5%); 0 WAL file(s) added
2026-10-04 19:04:12.180 UTC [88] LOG:  duration: 1245.221 ms  statement: SELECT * FROM orders WHERE status = 'pending'"""
            },
            "redis-cache": {
                "id": "a9018274",
                "full_id": "a9018274192830192830192830",
                "name": "redis-cache",
                "image": "redis:7.2-alpine",
                "status": "running",
                "health": "healthy",
                "tech_stack": "Redis In-Memory",
                "ports": ["6379:6379"],
                "ip_address": "172.20.0.7",
                "created": "10 days ago",
                "uptime": "Up 10 days",
                "cpu_percent": 0.4,
                "memory_mb": 52.0,
                "memory_limit_mb": 512.0,
                "logs": """1:M 04 Oct 2026 18:00:00.042 * DB loaded from disk: 0.012 seconds
1:M 04 Oct 2026 18:00:00.043 * Ready to accept connections tcp
1:M 04 Oct 2026 19:00:15.110 * 100 changes in 300 seconds. Saving...
1:M 04 Oct 2026 19:00:15.122 * Background saving terminated with success"""
            }
        }

docker_manager = DockerManager()
