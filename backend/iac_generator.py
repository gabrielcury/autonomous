import os
import io
import zipfile
import yaml
from typing import List, Dict, Any
from pathlib import Path
from backend.config import settings

class IaCGenerator:
    """Converts live Docker architecture into production-ready Terraform and Ansible code."""

    def __init__(self, output_dir: Path = settings.IAC_OUTPUT_DIR):
        self.output_dir = output_dir

    def generate_iac_suite(self, containers: List[Dict[str, Any]]) -> Dict[str, str]:
        """Generates all Terraform, Ansible and Compose artifacts."""
        tf_main = self._generate_terraform_main(containers)
        tf_vars = self._generate_terraform_vars()
        tf_tfvars = self._generate_terraform_tfvars()
        tf_outputs = self._generate_terraform_outputs(containers)
        
        ansible_playbook = self._generate_ansible_playbook(containers)
        ansible_inventory = self._generate_ansible_inventory()
        
        docker_compose = self._generate_docker_compose(containers)
        restore_script = self._generate_restore_bash_script(containers)

        files = {
            "terraform/main.tf": tf_main,
            "terraform/variables.tf": tf_vars,
            "terraform/terraform.tfvars.example": tf_tfvars,
            "terraform/outputs.tf": tf_outputs,
            "ansible/playbook.yml": ansible_playbook,
            "ansible/inventory.ini": ansible_inventory,
            "docker-compose.yml": docker_compose,
            "restore_environment.sh": restore_script,
            "README_IAC.md": self._generate_iac_readme()
        }

        # Save to disk
        for rel_path, content in files.items():
            full_path = self.output_dir / rel_path
            full_path.parent.mkdir(parents=True, exist_ok=True)
            with open(full_path, "w", encoding="utf-8") as f:
                f.write(content)

        return files

    def create_iac_zip_bundle(self, containers: List[Dict[str, Any]]) -> bytes:
        """Create in-memory zip archive with all IaC files."""
        files = self.generate_iac_suite(containers)
        zip_buffer = io.BytesIO()
        with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zf:
            for filepath, content in files.items():
                zf.writestr(f"aegis-iac/{filepath}", content)
        zip_buffer.seek(0)
        return zip_buffer.getvalue()

    def _generate_terraform_main(self, containers: List[Dict[str, Any]]) -> str:
        code = [
            '# =============================================================================',
            '# AegisSRE Autonomous Agent - Auto-Generated Terraform Architecture',
            '# Provider: kreuzwerker/docker (v3.0.2)',
            '# Target: Production / Local Disaster Recovery Replica',
            '# =============================================================================\n',
            'terraform {',
            '  required_version = ">= 1.5.0"',
            '  required_providers {',
            '    docker = {',
            '      source  = "kreuzwerker/docker"',
            '      version = "~> 3.0.2"',
            '    }',
            '  }',
            '}\n',
            'provider "docker" {',
            '  host = var.docker_host',
            '}\n',
            '# Network definitions',
            'resource "docker_network" "aegis_net" {',
            '  name   = "aegis-production-network"',
            '  driver = "bridge"',
            '}\n'
        ]

        # Generate volumes and containers
        created_volumes = set()
        for c in containers:
            c_name = self._sanitize_tf_name(c.get("name", "app"))
            image = c.get("image", "ubuntu:latest")

            # Volumes
            for m in c.get("mounts", []):
                vol_name = m.get("source")
                if vol_name and not vol_name.startswith("/") and vol_name not in created_volumes:
                    created_volumes.add(vol_name)
                    code.extend([
                        f'resource "docker_volume" "vol_{self._sanitize_tf_name(vol_name)}" {{',
                        f'  name = "{vol_name}"',
                        '}\n'
                    ])

            # Container definition
            code.extend([
                f'# Container: {c.get("name")}',
                f'resource "docker_image" "img_{c_name}" {{',
                f'  name         = "{image}"',
                '  keep_locally = true',
                '}\n',
                f'resource "docker_container" "{c_name}" {{',
                f'  name  = "{c.get("name")}"',
                f'  image = docker_image.img_{c_name}.image_id',
                f'  restart = "{c.get("restart_policy", "unless-stopped")}"',
                '  networks_advanced {',
                '    name = docker_network.aegis_net.name',
                '  }'
            ])

            # Ports
            ports = c.get("ports", [])
            for p in ports:
                if ":" in str(p):
                    parts = str(p).split(":")
                    host_p = parts[0]
                    internal_p = parts[1].split("/")[0]
                    code.extend([
                        '  ports {',
                        f'    internal = {internal_p}',
                        f'    external = {host_p}',
                        '  }'
                    ])

            # Mounts
            for m in c.get("mounts", []):
                code.extend([
                    '  volumes {',
                    f'    container_path = "{m.get("destination")}"',
                    f'    host_path      = "{m.get("source")}"',
                    f'    read_only      = {str(m.get("mode", "rw") == "ro").lower()}',
                    '  }'
                ])

            # Environment variables
            env_vars = c.get("env", [])
            if env_vars:
                code.append('  env = [')
                for item in env_vars:
                    if isinstance(item, dict):
                        k = item.get("key", "")
                        v = item.get("value", "")
                        code.append(f'    "{k}={v}",')
                    elif isinstance(item, str):
                        code.append(f'    "{item}",')
                code.append('  ]')

            code.append('}\n')

        return "\n".join(code)

    def _generate_terraform_vars(self) -> str:
        return """# Terraform Variables
variable "docker_host" {
  description = "Docker daemon socket or TCP address"
  type        = string
  default     = "unix:///var/run/docker.sock"
}

variable "environment" {
  description = "Deployment environment (production / staging / local)"
  type        = string
  default     = "production"
}
"""

    def _generate_terraform_tfvars(self) -> str:
        return """# Terraform Variables Example
docker_host = "unix:///var/run/docker.sock"
environment = "production"
"""

    def _generate_terraform_outputs(self, containers: List[Dict[str, Any]]) -> str:
        lines = ["# Outputs\n"]
        for c in containers:
            c_name = self._sanitize_tf_name(c.get("name", "app"))
            lines.append(f'output "{c_name}_id" {{')
            lines.append(f'  description = "Container ID for {c.get("name")}"')
            lines.append(f'  value       = docker_container.{c_name}.id')
            lines.append('}\n')
        return "\n".join(lines)

    def _generate_ansible_playbook(self, containers: List[Dict[str, Any]]) -> str:
        tasks = [
            {
                "name": "Ensure prerequisite system packages are installed",
                "ansible.builtin.apt": {
                    "name": ["ca-certificates", "curl", "gnupg", "lsb-release", "ufw", "tar", "rsync"],
                    "state": "present",
                    "update_cache": True
                },
                "when": "ansible_os_family == 'Debian'"
            },
            {
                "name": "Ensure Docker engine service is running",
                "ansible.builtin.service": {
                    "name": "docker",
                    "state": "started",
                    "enabled": True
                }
            },
            {
                "name": "Create Aegis custom docker network",
                "community.docker.docker_network": {
                    "name": "aegis-production-network",
                    "driver": "bridge",
                    "state": "present"
                }
            }
        ]

        # Add container deployment tasks
        for c in containers:
            ports_mapped = []
            for p in c.get("ports", []):
                ports_mapped.append(str(p))

            volumes_mapped = []
            for m in c.get("mounts", []):
                volumes_mapped.append(f"{m.get('source')}:{m.get('destination')}:{m.get('mode', 'rw')}")

            env_dict = {}
            for item in c.get("env", []):
                if isinstance(item, dict):
                    env_dict[item.get("key")] = item.get("value")
                elif isinstance(item, str) and "=" in item:
                    k, v = item.split("=", 1)
                    env_dict[k] = v

            tasks.append({
                "name": f"Deploy container: {c.get('name')}",
                "community.docker.docker_container": {
                    "name": c.get("name"),
                    "image": c.get("image"),
                    "state": "started",
                    "restart_policy": c.get("restart_policy", "unless-stopped"),
                    "networks": [{"name": "aegis-production-network"}],
                    "published_ports": ports_mapped if ports_mapped else None,
                    "volumes": volumes_mapped if volumes_mapped else None,
                    "env": env_dict if env_dict else None
                }
            })

        playbook_dict = [
            {
                "name": "AegisSRE Automated Host Provisioning & Stack Recovery",
                "hosts": "easypanel_hosts",
                "become": True,
                "tasks": tasks
            }
        ]

        return yaml.dump(playbook_dict, sort_keys=False, default_flow_style=False)

    def _generate_ansible_inventory(self) -> str:
        return """[easypanel_hosts]
vps-production ansible_host=YOUR_SERVER_IP ansible_user=root ansible_ssh_private_key_file=~/.ssh/id_rsa

[easypanel_hosts:vars]
ansible_python_interpreter=/usr/bin/python3
"""

    def _generate_docker_compose(self, containers: List[Dict[str, Any]]) -> str:
        services = {}
        for c in containers:
            s_name = c.get("name", "app").replace("/", "")
            service_def: Dict[str, Any] = {
                "image": c.get("image"),
                "restart": c.get("restart_policy", "unless-stopped"),
                "networks": ["aegis_net"]
            }

            ports = c.get("ports", [])
            if ports:
                service_def["ports"] = [str(p) for p in ports]

            mounts = c.get("mounts", [])
            if mounts:
                service_def["volumes"] = [f"{m.get('source')}:{m.get('destination')}" for m in mounts]

            envs = c.get("env", [])
            if envs:
                env_list = []
                for item in envs:
                    if isinstance(item, dict):
                        env_list.append(f"{item.get('key')}={item.get('value')}")
                    elif isinstance(item, str):
                        env_list.append(item)
                service_def["environment"] = env_list

            services[s_name] = service_def

        compose_dict = {
            "version": "3.8",
            "networks": {
                "aegis_net": {
                    "name": "aegis-production-network",
                    "driver": "bridge"
                }
            },
            "services": services
        }

        return yaml.dump(compose_dict, sort_keys=False, default_flow_style=False)

    def _generate_restore_bash_script(self, containers: List[Dict[str, Any]]) -> str:
        return """#!/usr/bin/env bash
# =============================================================================
# AegisSRE - Instant Disaster Recovery & Local Test Environment Script
# =============================================================================
set -e

echo "🚀 [AegisSRE] Starting Disaster Recovery / Local Environment Spin-up..."

# 1. Verify Docker is available
if ! command -v docker &> /dev/null; then
    echo "❌ Docker is not installed. Installing Docker..."
    curl -fsSL https://get.docker.com | sh
    systemctl start docker
fi

# 2. Check for docker compose
if docker compose version &> /dev/null; then
    COMPOSE_CMD="docker compose"
elif command -v docker-compose &> /dev/null; then
    COMPOSE_CMD="docker-compose"
else
    echo "❌ Docker Compose not found. Please install docker-compose-plugin."
    exit 1
fi

echo "📦 Creating required network..."
docker network create aegis-production-network 2>/dev/null || true

echo "🚢 Launching full container stack with Docker Compose..."
$COMPOSE_CMD up -d

echo "✅ [AegisSRE] All services deployed successfully!"
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
"""

    def _generate_iac_readme(self) -> str:
        return """# 🏗️ AegisSRE - Infrastructure as Code Bundle

Este pacote foi gerado de forma autônoma pelo **AegisSRE Agent** a partir do estado em tempo real dos seus containeres no Docker / Easypanel.

## Como rodar localmente para testes:

### Opção 1: Docker Compose (Mais rápido - 1 comando)
```bash
docker compose up -d
```

### Opção 2: Terraform
```bash
cd terraform
terraform init
terraform plan
terraform apply
```

### Opção 3: Ansible (Para restaurar em uma VPS nova)
```bash
# Edite o IP da sua VPS no ansible/inventory.ini
ansible-playbook -i ansible/inventory.ini ansible/playbook.yml
```

### Opção 4: Script Universal de Restauração
```bash
chmod +x restore_environment.sh
./restore_environment.sh
```
"""

    def _sanitize_tf_name(self, name: str) -> str:
        return name.replace("/", "").replace("-", "_").replace(".", "_")

iac_generator = IaCGenerator()
