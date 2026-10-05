# =============================================================================
# AegisSRE - Local Development & Testing Launcher (Windows PowerShell)
# =============================================================================

Write-Host "🚀 Iniciando AegisSRE Autonomous Agent..." -ForegroundColor Cyan

# 1. Check Python
$pythonVer = python --version 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Python não encontrado. Instale o Python 3.11+." -ForegroundColor Red
    exit 1
}
Write-Host "🐍 $pythonVer detectado." -ForegroundColor Green

# 2. Check if dependencies are installed
python -c "import fastapi, uvicorn, groq, psutil, docker" 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "📦 Instalando dependências do backend..." -ForegroundColor Yellow
    python -m pip install -r requirements.txt
}

# 3. Check if frontend is built
if (-not (Test-Path ".\frontend\dist")) {
    Write-Host "🔨 Gerando bundle de produção do frontend (Vite)..." -ForegroundColor Yellow
    npm --prefix .\frontend run build
}

# 4. Start ASGI Web Server
Write-Host "`n✅ Tudo pronto! Iniciando painel no endereço: http://localhost:8000" -ForegroundColor Green
Write-Host "Pressione CTRL+C para encerrar.`n" -ForegroundColor DarkGray

python -m uvicorn backend.main:app --host 0.0.0.0 --port 8000 --reload
