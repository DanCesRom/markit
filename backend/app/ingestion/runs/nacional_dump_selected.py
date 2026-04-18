import json
import time
from datetime import datetime
from pathlib import Path
from typing import Dict, Any, List, Optional

import requests


# =========================
# CONFIG
# =========================
GRAPHQL_URL = "https://supermercadosnacional.com/graphql"

CATEGORY_URL_KEYS = [
    "complementos-del-hogar",
    "mascotas",
    "bebe",
    "salud-y-belleza",
    "limpieza-y-desechables",
    "cervezas-vinos-y-licores",
    "bebidas",
    "despensa",
    "congelados",
    "platos-preparados",
    "panaderia-y-reposteria",
    "quesos-y-embutidos",
    "lacteos-y-huevos",
    "frutas-y-vegetales",
    "carnes-pescados-y-mariscos",
]

PAGE_SIZE = 60         # sube/baja según estabilidad
SLEEP_SECONDS = 0.6
TIMEOUT = 40

OUT_DIR = Path("backend/app/ingestion/output/nacional_selected")


# =========================
# GraphQL queries
# =========================
QUERY_CATEGORY_UID = """
query GetCategoryUid($urlKey: String!) {
  categoryList(filters: { url_key: { eq: $urlKey } }) {
    id
    uid
    name
    url_key
  }
}
"""

QUERY_PRODUCTS_BY_CATEGORY_UID = """
query ProductsByCategory($uid: String!, $pageSize: Int!, $currentPage: Int!) {
  products(
    filter: { category_uid: { eq: $uid } }
    pageSize: $pageSize
    currentPage: $currentPage
  ) {
    total_count
    page_info {
      current_page
      page_size
      total_pages
    }
    items {
      id
      sku
      name
      url_key
      url_suffix
      stock_status

      small_image { url }
      thumbnail { url }

      price_range {
        minimum_price {
          regular_price { value currency }
          final_price { value currency }
          discount { amount_off percent_off }
        }
      }
    }
  }
}
"""


def gql(query: str, variables: Dict[str, Any]) -> Dict[str, Any]:
    r = requests.post(
        GRAPHQL_URL,
        json={"query": query, "variables": variables},
        headers={
            "User-Agent": "Mozilla/5.0 Markit/0.1",
            "Accept": "application/json",
            "Content-Type": "application/json",
            "Origin": "https://supermercadosnacional.com",
            "Referer": "https://supermercadosnacional.com/",
        },
        timeout=TIMEOUT,
    )
    r.raise_for_status()
    data = r.json()
    if "errors" in data:
        # deja el error completo para debug
        raise RuntimeError(json.dumps(data["errors"], ensure_ascii=False, indent=2))
    return data["data"]


def dump_json(obj: Dict[str, Any], path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, ensure_ascii=False, indent=2), encoding="utf-8")


def resolve_category(url_key: str) -> Optional[Dict[str, Any]]:
    data = gql(QUERY_CATEGORY_UID, {"urlKey": url_key})
    cats = data.get("categoryList") or []
    if not cats:
        return None
    # normalmente viene 1
    return cats[0]


def fetch_all_products_for_category(uid: str) -> Dict[str, Any]:
    all_items: List[Dict[str, Any]] = []

    # page 1
    page = 1
    first = gql(QUERY_PRODUCTS_BY_CATEGORY_UID, {"uid": uid, "pageSize": PAGE_SIZE, "currentPage": page})
    prod = first["products"]
    all_items.extend(prod.get("items") or [])

    page_info = prod.get("page_info") or {}
    total_pages = int(page_info.get("total_pages") or 1)
    total_count = int(prod.get("total_count") or 0)

    # resto
    for page in range(2, total_pages + 1):
        data = gql(QUERY_PRODUCTS_BY_CATEGORY_UID, {"uid": uid, "pageSize": PAGE_SIZE, "currentPage": page})
        prod = data["products"]
        all_items.extend(prod.get("items") or [])
        time.sleep(SLEEP_SECONDS)

    return {
        "total_count": total_count,
        "total_pages": total_pages,
        "page_size": PAGE_SIZE,
        "items_count": len(all_items),
        "items": all_items,
    }


def main():
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")

    # dedupe url_keys por si repetiste
    url_keys = sorted(set(CATEGORY_URL_KEYS))

    summary = []
    merged_by_sku: Dict[str, Dict[str, Any]] = {}

    for url_key in url_keys:
        print(f"\n== Nacional category: {url_key} ==")

        try:
            cat = resolve_category(url_key)
            if not cat:
                raise RuntimeError("No categoryList match (url_key no encontrado)")

            uid = cat["uid"]
            cat_name = cat.get("name") or url_key

            products_pack = fetch_all_products_for_category(uid)

            # Guardar por categoría
            out = {
                "source": "nacional",
                "dumped_at": ts,
                "category": {
                    "url_key": url_key,
                    "id": cat.get("id"),
                    "uid": uid,
                    "name": cat_name,
                },
                "products": products_pack,
            }

            dump_json(out, OUT_DIR / "categories" / f"{url_key}_{ts}.json")

            # merge sin duplicados por sku
            for it in products_pack["items"]:
                sku = it.get("sku")
                if not sku:
                    continue
                if sku not in merged_by_sku:
                    merged_by_sku[sku] = it

            summary.append({
                "url_key": url_key,
                "name": cat_name,
                "total_count": products_pack["total_count"],
                "items_count": products_pack["items_count"],
                "total_pages": products_pack["total_pages"],
            })

            print(f"OK {url_key}: items={products_pack['items_count']} total_count={products_pack['total_count']} pages={products_pack['total_pages']}")

        except Exception as e:
            summary.append({"url_key": url_key, "error": str(e)})
            print(f"[WARN] {url_key} falló: {e}")

        time.sleep(SLEEP_SECONDS)

    merged_items = list(merged_by_sku.values())

    dump_json(
        {
            "source": "nacional",
            "dumped_at": ts,
            "categories_requested": url_keys,
            "summary": summary,
            "merged_unique_count": len(merged_items),
            "merged_items": merged_items,
        },
        OUT_DIR / f"nacional_selected_merged_{ts}.json",
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