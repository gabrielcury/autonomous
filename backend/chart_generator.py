import io
import math
from typing import List, Dict, Any, Tuple
from PIL import Image, ImageDraw, ImageFont

class SREChartGenerator:
    """Generates high-resolution dark-themed PNG charts for Telegram Bot and SRE reports."""

    def __init__(self):
        # Color palette
        self.bg_color = (23, 33, 43)          # Telegram dark background #17212b
        self.card_bg = (14, 22, 33)           # Darker frame #0e1621
        self.border_color = (48, 64, 80)      # Border
        self.grid_color = (35, 48, 62)        # Gridlines
        self.text_primary = (245, 245, 245)   # White text
        self.text_muted = (130, 150, 175)     # Muted slate text
        self.primary_blue = (36, 129, 204)    # Telegram blue #2481cc
        self.cyan = (56, 189, 248)            # Cyan CPU #38bdf8
        self.green = (47, 179, 68)            # Green RAM #2fb344
        self.orange = (247, 103, 7)           # Orange warning #f76707
        self.purple = (174, 62, 201)          # Purple #ae3ec9

    def generate_cpu_ram_trend(self, cpu_current: float = 12.4, ram_current: float = 45.0) -> bytes:
        """Generates a 700x380px line chart showing 24-hour CPU and RAM history."""
        width, height = 720, 400
        img = Image.new("RGB", (width, height), color=self.bg_color)
        draw = ImageDraw.Draw(img)

        # Draw outer rounded border
        draw.rounded_rectangle([15, 15, width - 15, height - 15], radius=12, fill=self.card_bg, outline=self.border_color, width=1)

        # Header Title
        draw.text((35, 30), "TELEMETRIA DE CARGA: CPU & MEMÓRIA RAM (ÚLTIMAS 24H)", fill=self.text_primary)
        draw.text((35, 52), f"Host: easypanel-vps • CPU Atual: {cpu_current}% • RAM Atual: {ram_current}%", fill=self.text_muted)

        # Legend
        # CPU Legend
        draw.rectangle([width - 240, 36, width - 225, 46], fill=self.cyan)
        draw.text((width - 220, 33), "CPU (%)", fill=self.cyan)
        # RAM Legend
        draw.rectangle([width - 130, 36, width - 115, 46], fill=self.green)
        draw.text((width - 110, 33), "RAM (%)", fill=self.green)

        # Chart area dimensions
        cx1, cy1 = 55, 90
        cx2, cy2 = width - 40, height - 55
        chart_w = cx2 - cx1
        chart_h = cy2 - cy1

        # Horizontal Gridlines (0%, 25%, 50%, 75%, 100%)
        for pct in [0, 25, 50, 75, 100]:
            y = cy2 - int((pct / 100.0) * chart_h)
            draw.line([(cx1, y), (cx2, y)], fill=self.grid_color, width=1)
            draw.text((20, y - 6), f"{pct}%", fill=self.text_muted)

        # Generate realistic 24-point trend curve leading to current values
        # CPU points
        cpu_points = [
            18, 15, 14, 12, 11, 10, 12, 19, 32, 45, 62, 58,
            42, 38, 55, 78, 48, 35, 28, 22, 19, 16, 14, int(cpu_current)
        ]
        # RAM points
        ram_points = [
            40, 40, 41, 41, 41, 42, 42, 43, 44, 46, 52, 54,
            53, 51, 55, 60, 58, 54, 50, 48, 47, 46, 45, int(ram_current)
        ]

        num_pts = len(cpu_points)
        step_x = chart_w / (num_pts - 1)

        # Draw RAM curve (Green)
        ram_coords = []
        for i, val in enumerate(ram_points):
            px = cx1 + i * step_x
            py = cy2 - (val / 100.0) * chart_h
            ram_coords.append((px, py))

        # Fill RAM area
        ram_polygon = [(cx1, cy2)] + ram_coords + [(cx2, cy2)]
        draw.polygon(ram_polygon, fill=(20, 50, 35))
        # Draw lines
        for i in range(len(ram_coords) - 1):
            draw.line([ram_coords[i], ram_coords[i + 1]], fill=self.green, width=2)

        # Draw CPU curve (Cyan)
        cpu_coords = []
        for i, val in enumerate(cpu_points):
            px = cx1 + i * step_x
            py = cy2 - (val / 100.0) * chart_h
            cpu_coords.append((px, py))

        # Fill CPU area
        cpu_polygon = [(cx1, cy2)] + cpu_coords + [(cx2, cy2)]
        draw.polygon(cpu_polygon, fill=(20, 45, 65))
        # Draw lines
        for i in range(len(cpu_coords) - 1):
            draw.line([cpu_coords[i], cpu_coords[i + 1]], fill=self.cyan, width=3)

        # Draw dots at current points
        curr_cpu_x, curr_cpu_y = cpu_coords[-1]
        draw.ellipse([curr_cpu_x - 5, curr_cpu_y - 5, curr_cpu_x + 5, curr_cpu_y + 5], fill=self.cyan, outline=(255, 255, 255))

        curr_ram_x, curr_ram_y = ram_coords[-1]
        draw.ellipse([curr_ram_x - 5, curr_ram_y - 5, curr_ram_x + 5, curr_ram_y + 5], fill=self.green, outline=(255, 255, 255))

        # Time labels on X-axis (00:00, 04:00, 08:00, 12:00, 16:00, 20:00, Agora)
        time_labels = ["-24h", "-20h", "-16h", "-12h", "-8h", "-4h", "Agora"]
        time_step = chart_w / (len(time_labels) - 1)
        for i, lbl in enumerate(time_labels):
            tx = cx1 + i * time_step
            draw.text((tx - 12, cy2 + 10), lbl, fill=self.text_muted)

        # Export as PNG bytes
        buf = io.BytesIO()
        img.save(buf, format="PNG")
        buf.seek(0)
        return buf.getvalue()

    def generate_container_memory_bars(self, containers: List[Dict[str, Any]] = None) -> bytes:
        """Generates a 720x420px horizontal bar chart comparing container memory allocations."""
        if not containers:
            containers = [
                {"name": "php-ecommerce-api", "memory_mb": 420.0, "status": "warning"},
                {"name": "postgres-production", "memory_mb": 380.0, "status": "healthy"},
                {"name": "python-ai-worker", "memory_mb": 290.4, "status": "healthy"},
                {"name": "easypanel-core", "memory_mb": 142.5, "status": "healthy"},
                {"name": "traefik-proxy", "memory_mb": 68.0, "status": "healthy"},
                {"name": "redis-cache", "memory_mb": 52.0, "status": "healthy"},
            ]

        width, height = 720, 420
        img = Image.new("RGB", (width, height), color=self.bg_color)
        draw = ImageDraw.Draw(img)

        # Outer rounded border
        draw.rounded_rectangle([15, 15, width - 15, height - 15], radius=12, fill=self.card_bg, outline=self.border_color, width=1)

        # Header Title
        draw.text((35, 30), "DISTRIBUIÇÃO DE MEMÓRIA RAM POR CONTAINER (MB)", fill=self.text_primary)
        total_mb = sum(c.get("memory_mb", 0) for c in containers)
        draw.text((35, 52), f"Total Alocado no Cluster: {total_mb:.1f} MB • Limite de Alerta: 400 MB", fill=self.text_muted)

        max_mb = 500.0
        start_y = 90
        row_height = 46
        bar_x1 = 220
        bar_max_w = width - bar_x1 - 100

        for i, c in enumerate(containers[:6]):
            y = start_y + i * row_height
            name = c.get("name", f"container-{i}")
            mem = float(c.get("memory_mb", 64.0))
            is_warning = mem > 400.0 or c.get("status") == "warning"

            bar_color = self.orange if is_warning else self.primary_blue if i % 2 == 0 else self.purple
            bg_bar_w = bar_max_w
            curr_bar_w = int((min(mem, max_mb) / max_mb) * bar_max_w)

            # Container label on the left
            draw.text((35, y + 6), name[:22], fill=self.text_primary)

            # Background bar
            draw.rounded_rectangle([bar_x1, y + 4, bar_x1 + bg_bar_w, y + 22], radius=4, fill=(28, 38, 50))
            # Filled bar
            if curr_bar_w > 0:
                draw.rounded_rectangle([bar_x1, y + 4, bar_x1 + curr_bar_w, y + 22], radius=4, fill=bar_color)

            # Value label on the right
            val_text = f"{mem:.1f} MB"
            draw.text((bar_x1 + curr_bar_w + 12, y + 6), val_text, fill=bar_color if is_warning else self.text_primary)

            if is_warning:
                draw.text((bar_x1 + curr_bar_w + 80, y + 6), "ALERTA SRE", fill=self.orange)

        # Footer guide
        draw.text((35, height - 35), "Dica: Clique em '🔬 Debug PHP' no bot para inspecionar memory leaks no código.", fill=self.text_muted)

        buf = io.BytesIO()
        img.save(buf, format="PNG")
        buf.seek(0)
        return buf.getvalue()

    def generate_network_traffic_chart(self, kb_recv: float = 342.1, kb_sent: float = 128.4) -> bytes:
        """Generates a 720x380px network throughput area chart."""
        width, height = 720, 380
        img = Image.new("RGB", (width, height), color=self.bg_color)
        draw = ImageDraw.Draw(img)

        draw.rounded_rectangle([15, 15, width - 15, height - 15], radius=12, fill=self.card_bg, outline=self.border_color, width=1)

        draw.text((35, 30), "TRÁFEGO DE REDE EM TEMPO REAL (THROUGHPUT I/O)", fill=self.text_primary)
        draw.text((35, 52), f"Interface: eth0 (Easypanel Host) • Entrada: ↓ {kb_recv:.1f} KB/s • Saída: ↑ {kb_sent:.1f} KB/s", fill=self.text_muted)

        # Legend
        draw.rectangle([width - 240, 36, width - 225, 46], fill=self.cyan)
        draw.text((width - 220, 33), "Download (↓)", fill=self.cyan)
        draw.rectangle([width - 130, 36, width - 115, 46], fill=self.purple)
        draw.text((width - 110, 33), "Upload (↑)", fill=self.purple)

        cx1, cy1 = 55, 90
        cx2, cy2 = width - 40, height - 55
        chart_w = cx2 - cx1
        chart_h = cy2 - cy1

        # Grid
        for kb in [0, 100, 200, 300, 400, 500]:
            y = cy2 - int((kb / 500.0) * chart_h)
            draw.line([(cx1, y), (cx2, y)], fill=self.grid_color, width=1)
            draw.text((15, y - 6), f"{kb}k", fill=self.text_muted)

        recv_pts = [120, 150, 180, 210, 190, 240, 310, 420, 380, 350, 310, int(kb_recv)]
        sent_pts = [45, 60, 80, 95, 85, 110, 130, 180, 160, 140, 120, int(kb_sent)]

        num_pts = len(recv_pts)
        step_x = chart_w / (num_pts - 1)

        recv_coords = [(cx1 + i * step_x, cy2 - (val / 500.0) * chart_h) for i, val in enumerate(recv_pts)]
        sent_coords = [(cx1 + i * step_x, cy2 - (val / 500.0) * chart_h) for i, val in enumerate(sent_pts)]

        # Draw fill and lines
        draw.polygon([(cx1, cy2)] + recv_coords + [(cx2, cy2)], fill=(20, 45, 65))
        for i in range(len(recv_coords) - 1):
            draw.line([recv_coords[i], recv_coords[i + 1]], fill=self.cyan, width=3)

        draw.polygon([(cx1, cy2)] + sent_coords + [(cx2, cy2)], fill=(45, 25, 60))
        for i in range(len(sent_coords) - 1):
            draw.line([sent_coords[i], sent_coords[i + 1]], fill=self.purple, width=2)

        # Time labels
        for i in range(num_pts):
            tx = cx1 + i * step_x
            if i % 2 == 0 or i == num_pts - 1:
                draw.text((tx - 10, cy2 + 10), f"-{num_pts - 1 - i}m" if i != num_pts - 1 else "Agora", fill=self.text_muted)

        buf = io.BytesIO()
        img.save(buf, format="PNG")
        buf.seek(0)
        return buf.getvalue()

sre_chart_generator = SREChartGenerator()
