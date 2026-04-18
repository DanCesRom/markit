import json
import base64
import time
import requests
from datetime import datetime
from pathlib import Path
from typing import Dict, Any, List, Tuple, Optional

HOST = "https://st.sirena.do"

# Token b64  en Network (parece constante en tu sesion/categorias)
TOKEN_B64 = "ZDE1ZTdhNjA1MTJiNTAwZDU5ZjY5ZmZkNWNlYjMwYzY="

# Categorias (slugs)  para Markit.
CATEGORY_SLUGS = [
    "alimentacion",
    "frutas-y-vegetales",
    "bebidas",
    "salud-bienestar",
    "cuidado-personal-y-belleza",
    "limpieza-",   #: si falla, cambiar al slug real sin el guion final
    "bebes-",      #si falla, cambiar al slug real sin el guion final
]

# Si quieres descargar TODO en 1 llamada, usamos x-l = total.
# Si el server limita el máximo, el script cae a paginado automático.
MODE = "ALL"     # "ALL" o "PAGED"
PAGE_LIMIT = 300 # si MODE="PAGED" (o fallback)

SLEEP_SECONDS = 0.6
TIMEOUT = 30

OUT_DIR = Path("backend/app/ingestion/output/sirena_selected")


def b64str(s: str) -> str:
    return base64.b64encode(s.encode("utf-8")).decode("utf-8")


def headers(page: int = 1, limit: Optional[int] = None, x_s: int = 1) -> Dict[str, str]:
    h = {
        "accept": "application/json",
        "origin": "https://sirena.do",
        "referer": "https://sirena.do/",
        "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Markit/0.1",
        "source": "c3RvcmVmcm9udA==",
        "x-p": b64str(str(page)),
        "x-s": b64str(str(x_s)),
    }
    if limit is not None:
        h["x-l"] = b64str(str(limit))
    return h


def fetch_category_page(slug_b64: str, token_b64: str, page: int, limit: Optional[int]) -> Dict[str, Any]:
    url = f"{HOST}/product/category/{slug_b64}/{token_b64}"
    r = requests.get(url, headers=headers(page=page, limit=limit), timeout=TIMEOUT)
    r.raise_for_status()
    return r.json()


def dump_json(obj: Dict[str, Any], path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, ensure_ascii=False, indent=2), encoding="utf-8")


def slug_to_b64(slug: str) -> str:
    return b64str(slug)


def enrich_items(items: List[Dict[str, Any]], base_img: Optional[str]) -> List[Dict[str, Any]]:
    out = []
    for it in items:
        thumbs = it.get("thumbs")
        friendlyurl = it.get("friendlyurl")
        image_url = (base_img + thumbs) if (base_img and thumbs) else None
        product_url = f"https://sirena.do/products/{friendlyurl}" if friendlyurl else None
        x = dict(it)
        x["image_url"] = image_url
        x["product_url"] = product_url
        out.append(x)
    return out


def dump_one_category(slug: str, token_b64: str, ts: str) -> Tuple[str, int, int, List[Dict[str, Any]]]:
    slug_b64 = slug_to_b64(slug)

    # Request inicial sin limit para leer total/per_page
    first = fetch_category_page(slug_b64, token_b64, page=1, limit=None)

    if not first.get("found", False) or first.get("error", False):
        msg = first.get("message")
        raise RuntimeError(f"Category '{slug}' failed: found={first.get('found')} error={first.get('error')} msg={msg}")

    total = int(first.get("total") or 0)
    per_page = int(first.get("per_page") or 15)
    base_img = first.get("base_img")
    category_name = first.get("category") or slug

    # Guardar RAW first
    dump_json(first, OUT_DIR / "raw" / f"{slug}_first_{ts}.json")

    # MODO ALL: pedir x-l = total (1 llamada)
    if MODE.upper() == "ALL":
        all_resp = fetch_category_page(slug_b64, token_b64, page=1, limit=total)
        items = all_resp.get("data") or []

        # Si el server recorta, caemos a paginado
        if len(items) < total and total > 0:
            print(f"[{slug}] ALL recortado: got={len(items)} total={total} -> fallback PAGED")
        else:
            dump_json(all_resp, OUT_DIR / "raw" / f"{slug}_all_raw_{ts}.json")
            enriched = enrich_items(items, base_img)
            dump_json(
                {
                    "slug": slug,
                    "category": category_name,
                    "total_reported": total,
                    "items_count": len(enriched),
                    "base_img": base_img,
                    "items": enriched,
                },
                OUT_DIR / "categories" / f"{slug}_all_{ts}.json",
            )
            return category_name, total, len(enriched), enriched

    # PAGINADO (o fallback)
    all_items: List[Dict[str, Any]] = []
    page = 1
    while True:
        resp = fetch_category_page(slug_b64, token_b64, page=page, limit=PAGE_LIMIT)
        dump_json(resp, OUT_DIR / "raw" / f"{slug}_page_{page}_{ts}.json")

        items = resp.get("data") or []
        all_items.extend(items)

        if not items:
            break

        # condicion de salida: si ya tenemos >= total, paramos
        if total and len(all_items) >= total:
            break

        page += 1
        time.sleep(SLEEP_SECONDS)

    enriched = enrich_items(all_items, base_img)
    dump_json(
        {
            "slug": slug,
            "category": category_name,
            "total_reported": total,
            "items_count": len(enriched),
            "base_img": base_img,
            "items": enriched,
        },
        OUT_DIR / "categories" / f"{slug}_all_{ts}.json",
    )

    return category_name, total, len(enriched), enriched


def main():
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")

    # dedupe slugs (por si pegaste repetidos)
    slugs = sorted(set(CATEGORY_SLUGS))

    summary = []
    merged_by_productid: Dict[str, Dict[str, Any]] = {}

    for slug in slugs:
        try:
            print(f"\n== Dump category: {slug} ==")
            cat_name, total, count, items = dump_one_category(slug, TOKEN_B64, ts)
            summary.append({"slug": slug, "category": cat_name, "total_reported": total, "items_count": count})

            # merge dedupe por productid
            for it in items:
                pid = it.get("productid")
                if not pid:
                    # fallback si no hay productid (raro)
                    pid = f"noid::{it.get('friendlyurl') or it.get('name')}"
                if pid not in merged_by_productid:
                    merged_by_productid[pid] = it
                else:
                    # Si aparece repetido, lo ignoramos (o podríamos guardar lista de categorías)
                    pass

            time.sleep(SLEEP_SECONDS)

        except Exception as e:
            summary.append({"slug": slug, "error": str(e)})
            print(f"[WARN] {slug} falló: {e}")

    merged_items = list(merged_by_productid.values())

    dump_json(
        {
            "source": "sirena",
            "dumped_at": ts,
            "mode": MODE,
            "slugs_requested": slugs,
            "summary": summary,
            "merged_unique_count": len(merged_items),
            "merged_items": merged_items,
        },
        OUT_DIR / f"sirena_selected_merged_{ts}.json",
    )

    dump_json(
        {
            "dumped_at": ts,
            "summary": summary,
            "merged_unique_count": len(merged_items),
        },
        OUT_DIR / f"index_{ts}.json",
    )

    print(f"\nOK: merged_unique_count={len(merged_items)}")
    print(f"OK: output -> {OUT_DIR}")


if __name__ == "__main__":
    main()