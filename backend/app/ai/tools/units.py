# backend/app/ai/tools/units.py
import re
from decimal import Decimal
from typing import Tuple
from backend.app.ai.tools.text import normalize_text

def extract_qty(segment: str) -> Tuple[str, Decimal]:
    """
    Soporta:
      - "4 manzanas"
      - "x4 manzanas"
      - "manzanas x4"
      - "1.5 lb pollo" (lo dejaremos como qty decimal)
    """
    s = normalize_text(segment)

    m = re.search(r"\bx\s*(\d+(?:\.\d+)?)\b", s, flags=re.IGNORECASE)
    if m:
        qty = Decimal(m.group(1))
        s = re.sub(r"\bx\s*\d+(?:\.\d+)?\b", "", s, flags=re.IGNORECASE).strip()
        return s, max(qty, Decimal("1"))

    m = re.search(r"\b(\d+(?:\.\d+)?)\s*x\b", s, flags=re.IGNORECASE)
    if m:
        qty = Decimal(m.group(1))
        s = re.sub(r"\b\d+(?:\.\d+)?\s*x\b", "", s, flags=re.IGNORECASE).strip()
        return s, max(qty, Decimal("1"))

    # "4 unidades manzana"
    m = re.search(r"\b(\d+(?:\.\d+)?)\s*(unidades|unidad|uds|ud|unit)\b", s, flags=re.IGNORECASE)
    if m:
        qty = Decimal(m.group(1))
        s = re.sub(r"\b\d+(?:\.\d+)?\s*(unidades|unidad|uds|ud|unit)\b", "", s, flags=re.IGNORECASE).strip()
        return s, max(qty, Decimal("1"))

    # "4 manzanas" (numero al inicio)
    m = re.match(r"^\s*(\d+(?:\.\d+)?)\s+(.+)$", s)
    if m:
        qty = Decimal(m.group(1))
        rest = m.group(2).strip()
        return rest, max(qty, Decimal("1"))

    return s, Decimal("1")