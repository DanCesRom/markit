# backend/app/ai/tools/text.py
import re

def normalize_text(t: str) -> str:
    t = (t or "").strip()
    t = re.sub(r"\s+", " ", t)
    return t

def clean_query_phrase(q: str) -> str:
    q = normalize_text(q)

    prefix_pattern = r"^(necesito|quiero|quisiera|dame|me\s+das|por\s+favor|porfa|favor)\s+"
    q = re.sub(prefix_pattern, "", q, flags=re.IGNORECASE).strip()

    suffix_pattern = r"\s*(lo\s+m(a|á)s\s+barato|mas\s+barato|m(a|á)s\s+barato|mejor\s+precio)\s*$"
    q = re.sub(suffix_pattern, "", q, flags=re.IGNORECASE).strip()

    return normalize_text(q)

def split_items(text: str) -> list[str]:
    t = f" {text.strip()} "
    t = t.replace(";", ",")
    parts: list[str] = []
    for chunk in t.split(","):
        chunk = chunk.strip()
        if not chunk:
            continue
        sub = re.split(r"\s+y\s+|\s+con\s+", chunk, flags=re.IGNORECASE)
        for s in sub:
            s = s.strip()
            if s:
                parts.append(s)
    return parts