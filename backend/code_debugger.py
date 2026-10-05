import re
from typing import Dict, Any, List, Optional
import logging

logger = logging.getLogger("code_debugger")

class CodeTracerEngine:
    """Specialized engine for code-level tracing & debugging inside containers."""

    def __init__(self):
        # Common regex patterns for PHP & Python errors
        self.php_memory_pattern = re.compile(
            r"Allowed memory size of (\d+) bytes exhausted \(tried to allocate (\d+) bytes\) in (.+?) on line (\d+)",
            re.IGNORECASE
        )
        self.php_fpm_max_children = re.compile(
            r"server reached max_children setting \((\d+)\), consider raising it",
            re.IGNORECASE
        )
        self.php_fatal_error = re.compile(
            r"PHP Fatal error:\s*(.+?) in (.+?) on line (\d+)",
            re.IGNORECASE
        )
        self.python_traceback_header = re.compile(
            r"Traceback \(most recent call last\):",
            re.IGNORECASE
        )
        self.python_exception = re.compile(
            r"^([a-zA-Z0-9_\.]+(?:Error|Exception)): (.+)$",
            re.MULTILINE
        )

    def analyze_container_code(self, container_name: str, tech_stack: str, logs: str) -> Dict[str, Any]:
        """Examine logs and return structured code-level findings."""
        findings: List[Dict[str, Any]] = []

        # 1. PHP Deep Analysis
        if "php" in tech_stack.lower() or "laravel" in tech_stack.lower() or "zend" in tech_stack.lower():
            # Memory exhaustion
            for match in self.php_memory_pattern.finditer(logs):
                limit_bytes = int(match.group(1))
                alloc_bytes = int(match.group(2))
                filepath = match.group(3)
                line = match.group(4)
                findings.append({
                    "severity": "CRITICAL",
                    "category": "PHP_MEMORY_EXHAUSTION",
                    "summary": f"Estouro de Memória PHP ({round(limit_bytes/(1024*1024))}MB esgotados)",
                    "file": filepath,
                    "line": int(line),
                    "details": f"Tentativa de alocar {round(alloc_bytes/1024, 2)}KB excedeu o memory_limit.",
                    "code_diagnosis": "O código tentou carregar uma coleção inteira ou array em memória de uma vez só (ex: SELECT gigante sem paginação ou parse de arquivo sem streaming).",
                    "recommended_code_fix": """// Em Laravel / PHP:
// Substitua: Model::all() ou ->get()
// Por streaming / paginação:
Model::query()->chunk(250, function ($records) {
    foreach ($records as $item) {
        // processar individualmente
    }
});
// Ou use LazyCollection::cursor() para consumo constante de RAM (O(1)).""",
                    "infra_fix": "No php.ini ou conf do PHP-FPM, ajuste temporariamente: memory_limit = 256M ou 512M se a carga for legítima."
                })

            # PHP-FPM Pool Starvation
            for match in self.php_fpm_max_children.finditer(logs):
                current_max = match.group(1)
                findings.append({
                    "severity": "HIGH",
                    "category": "PHP_FPM_STARVATION",
                    "summary": f"Pool PHP-FPM esgotado (limite de {current_max} processos)",
                    "file": "/usr/local/etc/php-fpm.d/www.conf",
                    "line": 0,
                    "details": "Todas as threads de processamento PHP estão ocupadas. Novas requisições entram em fila ou sofrem timeout 502/504 Bad Gateway no Nginx/Traefik.",
                    "code_diagnosis": "Rotas lentas ou queries bloqueantes estão retendo processos do PHP-FPM por muito tempo.",
                    "recommended_code_fix": "Auditar queries lentas (Slow Queries) e colocar tarefas demoradas em filas assíncronas (RabbitMQ / Redis / Celery / Laravel Queue).",
                    "infra_fix": f"Aumente pm.max_children de {current_max} para um valor baseado na RAM livre: (RAM_Disponivel_MB - 300MB) / 60MB_por_processo."
                })

            # PHP Fatal Errors
            for match in self.php_fatal_error.finditer(logs):
                msg = match.group(1)
                filepath = match.group(2)
                line = match.group(3)
                findings.append({
                    "severity": "CRITICAL",
                    "category": "PHP_FATAL_ERROR",
                    "summary": f"PHP Fatal: {msg[:80]}",
                    "file": filepath,
                    "line": int(line),
                    "details": msg,
                    "code_diagnosis": "Erro fatal em tempo de execução causando encerramento do script e HTTP 500.",
                    "recommended_code_fix": f"Verifique o tratamento de exceções (try/catch) ou validação de tipos nulos em {filepath}:{line}.",
                    "infra_fix": "Verificar se extensões PHP necessárias (ex: pdo_pgsql, opcache, gd, redis) estão compiladas no Dockerfile."
                })

        # 2. Python Deep Analysis
        if "python" in tech_stack.lower() or "fastapi" in tech_stack.lower() or "celery" in tech_stack.lower():
            if self.python_traceback_header.search(logs):
                # Extract Python exceptions
                for match in self.python_exception.finditer(logs):
                    exc_type = match.group(1)
                    exc_msg = match.group(2)
                    findings.append({
                        "severity": "HIGH",
                        "category": "PYTHON_UNCAUGHT_EXCEPTION",
                        "summary": f"Python Exception: {exc_type}",
                        "file": "Detected in application logs",
                        "line": 0,
                        "details": exc_msg,
                        "code_diagnosis": f"Exceção não tratada do tipo {exc_type}: {exc_msg}",
                        "recommended_code_fix": "Implementar middleware global de captura de exceções (FastAPI exception_handler) e validação de schema Pydantic.",
                        "infra_fix": "Verificar se o worker Celery ou Gunicorn/Uvicorn tem worker_timeout adequado e auto-restart."
                    })

        # 3. Database / SQL Slow query checks
        if "duration:" in logs.lower() and "ms" in logs.lower():
            # Potential Postgres slow query
            findings.append({
                "severity": "MEDIUM",
                "category": "SQL_SLOW_QUERY",
                "summary": "Query SQL com tempo de execução elevado (> 1000ms)",
                "file": "Postgres Query Engine",
                "line": 0,
                "details": "Detecção de query operando com tempo de resposta lento.",
                "code_diagnosis": "Possível Full Table Scan (Seq Scan) por ausência de índice em colunas de filtro WHERE ou ORDER BY.",
                "recommended_code_fix": "Executar 'EXPLAIN ANALYZE' na query e adicionar índice composto nas colunas mais frequentes.",
                "infra_fix": "Ajustar work_mem e shared_buffers do Postgres no postgresql.conf."
            })

        # Health score calculation
        health_score = 100
        for f in findings:
            if f["severity"] == "CRITICAL":
                health_score -= 25
            elif f["severity"] == "HIGH":
                health_score -= 15
            elif f["severity"] == "MEDIUM":
                health_score -= 8
        health_score = max(health_score, 10)

        return {
            "container": container_name,
            "tech_stack": tech_stack,
            "health_score": health_score,
            "findings_count": len(findings),
            "findings": findings
        }

code_tracer = CodeTracerEngine()
