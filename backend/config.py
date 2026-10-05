import os
from pathlib import Path
from pydantic import BaseModel
from dotenv import load_dotenv

# Load environment variables from .env if present
BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR / ".env")

class Settings(BaseModel):
    PROJECT_NAME: str = "AegisSRE - Autonomous SRE & Architecture Agent"
    VERSION: str = "1.0.0"
    HOST: str = os.getenv("HOST", "0.0.0.0")
    PORT: int = int(os.getenv("PORT", "8000"))
    
    # Groq API settings
    GROQ_API_KEY: str = os.getenv("GROQ_API_KEY", "")
    GROQ_MODEL: str = os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile")
    GROQ_FAST_MODEL: str = os.getenv("GROQ_FAST_MODEL", "llama-3.1-8b-instant")
    GROQ_WHISPER_MODEL: str = os.getenv("GROQ_WHISPER_MODEL", "whisper-large-v3")
    
    # Telegram Bot settings
    TELEGRAM_BOT_TOKEN: str = os.getenv("TELEGRAM_BOT_TOKEN", "")
    TELEGRAM_ALLOWED_USERS: str = os.getenv("TELEGRAM_ALLOWED_USERS", "") # comma separated chat IDs
    
    # Docker & System settings
    DOCKER_SOCKET: str = os.getenv("DOCKER_SOCKET", "unix:///var/run/docker.sock")
    DOCKER_SIMULATION_MODE: bool = os.getenv("DOCKER_SIMULATION_MODE", "auto").lower() in ("true", "1")
    
    # Storage & Backups
    DATA_DIR: Path = Path(os.getenv("DATA_DIR", str(BASE_DIR / "data")))
    BACKUPS_DIR: Path = Path(os.getenv("BACKUPS_DIR", str(BASE_DIR / "backups")))
    IAC_OUTPUT_DIR: Path = Path(os.getenv("IAC_OUTPUT_DIR", str(BASE_DIR / "iac_output")))
    
    # Autonomous Agent Settings (O agente começa SEMPRE parado por padrão)
    AUTO_MONITOR_ENABLED: bool = os.getenv("AUTO_MONITOR_ENABLED", "false").lower() in ("true", "1")
    MONITOR_INTERVAL_SECONDS: int = int(os.getenv("MONITOR_INTERVAL_SECONDS", "30"))
    ALERT_CPU_THRESHOLD: float = float(os.getenv("ALERT_CPU_THRESHOLD", "85.0"))
    ALERT_MEM_THRESHOLD: float = float(os.getenv("ALERT_MEM_THRESHOLD", "85.0"))
    ALERT_DISK_THRESHOLD: float = float(os.getenv("ALERT_DISK_THRESHOLD", "90.0"))

settings = Settings()

# Ensure directories exist
settings.DATA_DIR.mkdir(parents=True, exist_ok=True)
settings.BACKUPS_DIR.mkdir(parents=True, exist_ok=True)
settings.IAC_OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
