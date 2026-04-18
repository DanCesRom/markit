# backend/app/ingestion/runs/bravo_dump_custom.py
from __future__ import annotations

import json
import os
import re
import time
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import requests

# ✅ nuevo
import tls_client

BASE_URL = "https://bravova-api.superbravo.com.do"
DEFAULT_URL_STORAGE = "https://bravova-resources.superbravo.com.do/"
DUMPS_DIR = Path("backend/app/ingestion/dumps")


def _now_tag() -> str:
    return datetime.now().strftime("%Y%m%d_%H%M%S")


def _env_int(name: str, default: int) -> int:
    v = os.getenv(name)
    if v is None or str(v).strip() == "":
        return default
    return int(v)


def _env_bool(name: str, default: bool) -> bool:
    v = os.getenv(name)
    if v is None or str(v).strip() == "":
        return default
    v = str(v).strip().lower()
    return v in ("1", "true", "yes", "y", "on")


def _env_str(name: str, default: str = "") -> str:
    v = os.getenv(name)
    if v is None:
        return default
    return str(v)


def _normalize_name(s: str) -> str:
    s = s.strip().lower()
    s = re.sub(r"\s+", " ", s)
    s = (
        s.replace("á", "a")
        .replace("é", "e")
        .replace("í", "i")
        .replace("ó", "o")
        .replace("ú", "u")
        .replace("ü", "u")
        .replace("ñ", "n")
    )
    return s


def _split_csv(s: str) -> List[str]:
    parts = [p.strip() for p in s.split(",")]
    return [p for p in parts if p]


def dump_json_pretty(fp: Path, obj: Any) -> None:
    fp.parent.mkdir(parents=True, exist_ok=True)
    fp.write_text(json.dumps(obj, ensure_ascii=False, indent=2), encoding="utf-8")


def _safe_json_min(obj: Any) -> str:
    return json.dumps(obj, ensure_ascii=False, separators=(",", ":"))


def _fmt_secs(secs: float) -> str:
    if secs < 0:
        return "?"
    m, s = divmod(int(secs), 60)
    h, m = divmod(m, 60)
    if h:
        return f"{h}h{m:02d}m{s:02d}s"
    if m:
        return f"{m}m{s:02d}s"
    return f"{s}s"


@dataclass
class Section:
    idSeccion: int
    nombreSeccion: str
    raw: Dict[str, Any]


# -------------------------
# HTTP Clients
# -------------------------

def make_requests_session(token: str) -> requests.Session:
    """
    Requests session para endpoints que ya funcionan (list/seccion).
    """
    sess = requests.Session()
    sess.headers.update(
        {
            "Accept": "application/json",
            "User-Agent": _env_str("BRAVO_USER_AGENT", "okhttp/4.9.3"),
            "Authorization": f"Bearer {token}",
            "servicesToken": token,
            "Connection": "keep-alive",
        }
    )
    return sess


def make_tls_session(token: str) -> tls_client.Session:
    """
    tls-client para /public/articulo/get (precio), para evitar bloqueo por fingerprint.
    """
    # Puedes probar otros perfiles: "chrome_120", "chrome_118", "safari_16_0"
    client_id = _env_str("BRAVO_TLS_CLIENT_ID", "chrome_120").strip() or "chrome_120"

    s = tls_client.Session(
        client_identifier=client_id,
        random_tls_extension_order=True,
    )

    # headers "tipo app" + auth
    headers = {
        "Accept": "application/json",
        "Accept-Language": _env_str("BRAVO_ACCEPT_LANGUAGE", "es-DO,es;q=0.9,en;q=0.8"),
        "User-Agent": _env_str("BRAVO_TLS_USER_AGENT", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"),
        "Authorization": f"Bearer {token}",
        "servicesToken": token,
        "Referer": _env_str("BRAVO_REFERER", f"{BASE_URL}/"),
        "Origin": _env_str("BRAVO_ORIGIN", BASE_URL),
        "Connection": "keep-alive",
    }

    cookie = _env_str("BRAVO_COOKIE", "").strip()
    if cookie:
        headers["Cookie"] = cookie

    extra = _env_str("BRAVO_EXTRA_HEADERS", "").strip()
    if extra:
        try:
            d = json.loads(extra)
            if isinstance(d, dict):
                for k, v in d.items():
                    if v is None:
                        continue
                    headers[str(k)] = str(v)
        except Exception:
            pass

    s.headers.update(headers)
    return s


def http_get_json_requests(
    sess: requests.Session,
    path: str,
    params: Dict[str, Any],
    timeout: int = 30,
) -> Tuple[int, Any, str, Dict[str, str]]:
    url = BASE_URL + path
    r = sess.get(url, params=params, timeout=timeout)
    text = r.text or ""
    headers = {k: v for k, v in r.headers.items()}
    try:
        data = r.json()
    except Exception:
        data = None
    return r.status_code, data, text, headers


def http_get_json_tls(
    sess: tls_client.Session,
    path: str,
    params: Dict[str, Any],
    timeout: int = 30,
) -> Tuple[int, Any, str, Dict[str, str], str]:
    """
    Retorna también la URL final (con querystring) para debug.
    """
    url = BASE_URL + path
    # tls-client acepta params, pero para asegurar querystring usamos requests-like:
    r = sess.get(url, params=params, timeout_seconds=timeout)

    text = r.text or ""
    headers = dict(r.headers) if isinstance(r.headers, dict) else {}
    final_url = r.url if hasattr(r, "url") else url

    try:
        data = r.json()
    except Exception:
        data = None
    return int(r.status_code), data, text, headers, str(final_url)


def http_head(sess: requests.Session, url: str, timeout: int = 15) -> int:
    try:
        r = sess.head(url, timeout=timeout, allow_redirects=True)
        return r.status_code
    except Exception:
        return 0


# -------------------------
# Secciones / List
# -------------------------

def fetch_sections_raw(sess: requests.Session) -> Dict[str, Any]:
    code, data, text, _ = http_get_json_requests(sess, "/public/seccion/list", params={})
    if code != 200 or not isinstance(data, dict):
        raise RuntimeError(f"Secciones: HTTP {code}. Body={text[:400]}")
    return data


def fetch_sections(sess: requests.Session) -> List[Section]:
    data = fetch_sections_raw(sess)
    lst = (((data.get("data") or {}).get("list")) or [])
    out: List[Section] = []
    for it in lst:
        try:
            out.append(
                Section(
                    idSeccion=int(it["idSeccion"]),
                    nombreSeccion=str(it["nombreSeccion"]),
                    raw=dict(it),
                )
            )
        except Exception:
            continue
    return out


def pick_sections(all_sections: List[Section], only_names_csv: str) -> List[Section]:
    if not only_names_csv.strip():
        return all_sections

    wanted_raw = _split_csv(only_names_csv)
    wanted = [_normalize_name(x) for x in wanted_raw]

    alias = {
        "limpieza": "hogar y limpieza",
        "hogar": "hogar y limpieza",
        "hogar y limpieza": "hogar y limpieza",
        "frutas y vegetales": "frutas y vegetales",
        "bebes": "bebes",
        "bebés": "bebes",
        "alimentacion general": "alimentacion general",
        "alimentación general": "alimentacion general",
    }
    wanted_norm = [alias.get(w, w) for w in wanted]

    picked: List[Section] = []
    for s in all_sections:
        sn = _normalize_name(s.nombreSeccion)
        for w in wanted_norm:
            if sn == w or w in sn:
                picked.append(s)
                break

    seen = set()
    uniq: List[Section] = []
    for s in picked:
        if s.idSeccion in seen:
            continue
        seen.add(s.idSeccion)
        uniq.append(s)
    return uniq


def bravo_list_call(
    sess: requests.Session,
    store_id: int,
    section_id: int,
    max_items: int,
    offset: int,
    show_order: Any,
) -> Tuple[int, Any, str, Dict[str, str]]:
    params = {
        "idTienda": store_id,
        "idSeccion": section_id,
        "paginationMaxItems": max_items,
        "paginationOffset": offset,
        "showOrder": show_order,
    }
    return http_get_json_requests(sess, "/public/articulo/list", params=params)


def is_showorder_error(data: Any) -> bool:
    if not isinstance(data, dict):
        return False
    errs = data.get("errors")
    if not isinstance(errs, list):
        return False
    for e in errs:
        if isinstance(e, dict) and e.get("field") == "showOrder":
            return True
    return False


def extract_list(data: Any) -> Optional[List[Dict[str, Any]]]:
    if not isinstance(data, dict):
        return None
    d = data.get("data")
    if not isinstance(d, dict):
        return None
    lst = d.get("list")
    if isinstance(lst, list):
        return lst
    return None


def discover_show_order(
    sess: requests.Session,
    store_id: int,
    section_id: int,
    page_size: int,
    debug_tag: str,
) -> Any:
    attempts: List[Dict[str, Any]] = []
    candidates: List[Any] = [
        1, 0, True, False,
        "1", "0", "true", "false",
        "ASC", "DESC",
        "importerankingArticulo",
        "importerankingArticulo:ASC",
        "importerankingArticulo,DESC",
        _safe_json_min([{"field": "importerankingArticulo", "dir": "ASC"}]),
        _safe_json_min([{"field": "idArticulo", "dir": "ASC"}]),
    ]

    for cand in candidates:
        code, data, text, _hdr = bravo_list_call(
            sess=sess,
            store_id=store_id,
            section_id=section_id,
            max_items=page_size,
            offset=0,
            show_order=cand,
        )

        if isinstance(data, dict) and "errors" in data:
            info = _safe_json_min({"errors": data.get("errors")})
        else:
            lst = extract_list(data)
            info = f"data.list count={len(lst) if lst is not None else 'None'}" if isinstance(data, dict) else (text or "")[:200]

        attempts.append({"cand": cand, "code": code, "info": info})

        lst = extract_list(data)
        if code == 200 and lst is not None:
            dump_json_pretty(DUMPS_DIR / f"bravo_showorder_chosen_{debug_tag}.json", {"chosen": cand, "attempts": attempts})
            return cand

        if code == 200 and is_showorder_error(data):
            continue

        time.sleep(0.05)

    fp = DUMPS_DIR / f"bravo_showorder_discovery_failed_{debug_tag}.json"
    dump_json_pretty(fp, {"attempts": attempts})
    raise RuntimeError(f"No pude descubrir showOrder. Guardé intentos en: {fp}")


def fetch_all_articles_for_section(
    sess: requests.Session,
    store_id: int,
    section: Section,
    page_size: int,
    show_order: Any,
) -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []
    offset = 0

    while True:
        code, data, text, _hdr = bravo_list_call(
            sess=sess,
            store_id=store_id,
            section_id=section.idSeccion,
            max_items=page_size,
            offset=offset,
            show_order=show_order,
        )

        if code != 200 or not isinstance(data, dict):
            raise RuntimeError(f"Listado artículos falló sec={section.idSeccion} HTTP={code}. Body={text[:300]}")
        if "errors" in data:
            raise RuntimeError(f"Listado devolvió errors sec={section.idSeccion}. Errors={data.get('errors')}")

        lst = extract_list(data) or []
        if not lst:
            break

        out.extend(lst)
        offset += page_size

        if len(lst) < page_size:
            break

        time.sleep(0.02)

    return out


def item_key(it: Dict[str, Any]) -> str:
    ida = it.get("idArticulo")
    if ida is not None:
        return f"idArticulo:{ida}"
    iex = it.get("idexternoArticulo")
    if iex is not None:
        return f"idexternoArticulo:{iex}"
    return f"fallback:{it.get('nombreArticulo')}|{it.get('associatedPvp')}"


# -------------------------
# Imágenes
# -------------------------

def _ensure_trailing_slash(s: str) -> str:
    s = (s or "").strip()
    if not s:
        return s
    return s if s.endswith("/") else (s + "/")


def build_small_image(url_storage: str, idexterno: str, version: str) -> str:
    base = _ensure_trailing_slash(url_storage)
    return f"{base}images/catalogo/small/{idexterno}_1.png?v={version}"


def build_big_image(url_storage: str, idexterno: str, idx: int, version: str) -> str:
    base = _ensure_trailing_slash(url_storage)
    return f"{base}images/catalogo/big/{idexterno}_{idx}.png?v={version}"


def _load_resume_processed_ids(resume_path: str) -> set:
    if not resume_path:
        return set()
    p = Path(resume_path)
    if not p.exists():
        return set()
    try:
        raw = json.loads(p.read_text(encoding="utf-8"))
        lst = (((raw.get("data") or {}).get("list")) or [])
        out = set()
        for it in lst:
            ida = it.get("idArticulo")
            if ida is None:
                continue
            try:
                out.add(int(ida))
            except Exception:
                continue
        return out
    except Exception:
        return set()


# -------------------------
# Precios (GET /public/articulo/get)
# -------------------------

def _extract_price_from_get(detail_data: Any, store_id: int) -> Dict[str, Any]:
    if not isinstance(detail_data, dict):
        return {}
    d = detail_data.get("data")
    if not isinstance(d, dict):
        d = detail_data

    out: Dict[str, Any] = {}
    if "associatedPvp" in d:
        out["associatedPvp"] = d.get("associatedPvp")
    if "originalPvp" in d:
        out["originalPvp"] = d.get("originalPvp")

    tienda_list = d.get("associatedTienda")
    if isinstance(tienda_list, list):
        chosen_tienda = None
        for t in tienda_list:
            if not isinstance(t, dict):
                continue
            tid = t.get("idTiendaArticuloTienda")
            try:
                tid_int = int(tid) if tid is not None else None
            except Exception:
                tid_int = None
            if tid_int == int(store_id):
                chosen_tienda = t
                break
        if chosen_tienda is None and tienda_list and isinstance(tienda_list[0], dict):
            chosen_tienda = tienda_list[0]

        if isinstance(chosen_tienda, dict):
            out["idTiendaArticuloTienda"] = chosen_tienda.get("idTiendaArticuloTienda")
            out["pvpArticuloTienda"] = chosen_tienda.get("pvpArticuloTienda")
            out["disponibleArticuloTienda"] = chosen_tienda.get("disponibleArticuloTienda")
            out["stockArticuloTienda"] = chosen_tienda.get("stockArticuloTienda")

    final_price = None
    for k in ("pvpArticuloTienda", "associatedPvp", "originalPvp"):
        v = out.get(k)
        if v is None:
            continue
        try:
            final_price = float(v)
            break
        except Exception:
            continue
    if final_price is not None:
        out["__finalPrice"] = final_price

    return out


def main() -> None:
    store_id = _env_int("BRAVO_STORE_ID", 1000)
    only_sections = _env_str("BRAVO_ONLY_SECTIONS", "").strip()
    page_size = _env_int("BRAVO_PAGE_SIZE", 100)
    token = _env_str("BRAVO_SERVICES_TOKEN", "").strip()

    fetch_images = _env_bool("BRAVO_FETCH_IMAGES", True)
    url_storage = _env_str("BRAVO_URL_STORAGE", DEFAULT_URL_STORAGE).strip()

    validate_images = _env_bool("BRAVO_VALIDATE_IMAGES", False)
    validate_timeout_s = _env_int("BRAVO_VALIDATE_TIMEOUT_S", 10)
    validate_sample_big = _env_int("BRAVO_VALIDATE_BIG_SAMPLE", 3)

    # Precios
    fetch_prices = _env_bool("BRAVO_FETCH_PRICES", False)
    keep_detail_raw = _env_bool("BRAVO_KEEP_DETAIL_RAW", False)
    detail_timeout_s = _env_int("BRAVO_DETAIL_TIMEOUT_S", 25)
    detail_sleep_s = float(_env_str("BRAVO_DETAIL_SLEEP_S", "0.02") or "0.02")
    detail_sample = _env_int("BRAVO_DETAIL_SAMPLE", 0)  # 0=all, >0=N items por sección

    # tls-client tuning
    tls_client_id = _env_str("BRAVO_TLS_CLIENT_ID", "chrome_120")
    print(f"🔐 TLS client profile: {tls_client_id}")

    progress_every = _env_int("BRAVO_PROGRESS_EVERY", 50)
    checkpoint_every = _env_int("BRAVO_CHECKPOINT_EVERY", 200)
    resume_from = _env_str("BRAVO_RESUME_FROM", "").strip()

    if not token:
        raise RuntimeError("Falta BRAVO_SERVICES_TOKEN en env.")

    # requests para list/secciones
    sess = make_requests_session(token)
    # tls para detalle/precio
    tls_sess = make_tls_session(token)

    DUMPS_DIR.mkdir(parents=True, exist_ok=True)

    sections_raw = fetch_sections_raw(sess)
    sections = fetch_sections(sess)
    print(f"✅ Secciones obtenidas vía GET /public/seccion/list (count={len(sections)})")

    tag = _now_tag()
    dump_json_pretty(DUMPS_DIR / f"bravo_sections_full_store{store_id}_{tag}.json", sections_raw)
    dump_json_pretty(
        DUMPS_DIR / f"bravo_sections_list_store{store_id}_{tag}.json",
        {"data": {"list": [s.raw for s in sections], "totalCount": len(sections)}},
    )

    picked = pick_sections(sections, only_sections)
    print(f"🧾 Secciones seleccionadas: {len(picked)}")
    for s in picked[:200]:
        print(f" - {s.idSeccion}: {s.nombreSeccion}")
    if not picked:
        raise RuntimeError("No encontré secciones que coincidan con BRAVO_ONLY_SECTIONS.")

    show_tag = f"{tag}_sec{picked[0].idSeccion}"
    print(f"\n🔎 Descubriendo showOrder válido usando sección {picked[0].idSeccion}...")
    show_order = discover_show_order(sess, store_id, picked[0].idSeccion, page_size, debug_tag=show_tag)
    print(f"✅ showOrder elegido: {repr(show_order)}")

    combined_map: Dict[str, Dict[str, Any]] = {}
    resume_processed = _load_resume_processed_ids(resume_from)
    if resume_from:
        print(f"↩️ Resume enabled: {len(resume_processed)} ids ya procesados desde {resume_from}")

    detail_cache: Dict[int, Dict[str, Any]] = {}
    detail_errors: List[Dict[str, Any]] = []

    global_start = time.time()

    for sec_idx, sec in enumerate(picked, start=1):
        print(f"\n=== Sección {sec.idSeccion} | {sec.nombreSeccion} ({sec_idx}/{len(picked)}) ===")

        items = fetch_all_articles_for_section(sess, store_id, sec, page_size, show_order)
        total_items = len(items)
        print(f"✅ Artículos (list): {total_items}")

        if detail_sample and detail_sample > 0 and total_items > detail_sample:
            items = items[:detail_sample]
            total_items = len(items)
            print(f"🧪 Sample activado (BRAVO_DETAIL_SAMPLE): tomando {total_items} items en esta sección")

        sec_start = time.time()
        sec_checkpoint_fp = DUMPS_DIR / f"bravo_checkpoint_store{store_id}_sec{sec.idSeccion}_{tag}.json"

        for idx, it in enumerate(items, start=1):
            ida = it.get("idArticulo")
            try:
                ida_int = int(ida) if ida is not None else None
            except Exception:
                ida_int = None

            if ida_int is not None and ida_int in resume_processed and "__images" in it:
                continue
            if ida_int is not None and ida_int in resume_processed and "__images" not in it:
                it["__skippedByResume"] = True
                continue

            # PRECIOS usando tls-client
            if fetch_prices and ida_int is not None:
                if ida_int in detail_cache:
                    it["__price"] = detail_cache[ida_int].get("__price", {})
                    it["__detailMeta"] = detail_cache[ida_int].get("__detailMeta", {})
                    if keep_detail_raw and "__detailRaw" in detail_cache[ida_int]:
                        it["__detailRaw"] = detail_cache[ida_int]["__detailRaw"]
                    it["__detailFromCache"] = True
                else:
                    params = {"idTienda": store_id, "idArticulo": ida_int}
                    code, ddata, dtext, dhdr, final_url = http_get_json_tls(
                        tls_sess,
                        "/public/articulo/get",
                        params=params,
                        timeout=detail_timeout_s,
                    )

                    meta = {
                        "endpoint": "/public/articulo/get",
                        "method": "GET",
                        "code": code,
                        "finalUrl": final_url,
                        "hdrServer": dhdr.get("Server"),
                        "hdrVia": dhdr.get("Via"),
                        "hdrCF": dhdr.get("cf-ray") or dhdr.get("CF-RAY"),
                    }

                    if code == 200 and isinstance(ddata, dict) and "errors" not in ddata:
                        price_obj = _extract_price_from_get(ddata, store_id=store_id)
                        it["__price"] = price_obj
                        it["__detailMeta"] = meta
                        if keep_detail_raw:
                            it["__detailRaw"] = ddata

                        detail_cache[ida_int] = {
                            "__price": price_obj,
                            "__detailMeta": meta,
                            **({"__detailRaw": ddata} if keep_detail_raw else {}),
                        }
                    else:
                        err_obj = {
                            "idArticulo": ida_int,
                            "storeId": store_id,
                            "code": code,
                            "endpoint": "/public/articulo/get",
                            "method": "GET",
                            "finalUrl": final_url,
                            "body": (dtext or "")[:400],
                            "errors": (ddata.get("errors") if isinstance(ddata, dict) else None),
                            "hdrServer": meta.get("hdrServer"),
                            "hdrVia": meta.get("hdrVia"),
                            "hdrCF": meta.get("hdrCF"),
                        }
                        it["__priceError"] = err_obj
                        it["__detailMeta"] = meta
                        detail_errors.append(err_obj)

                    if detail_sleep_s > 0:
                        time.sleep(detail_sleep_s)

            # IMÁGENES
            if fetch_images:
                idext = str(it.get("idexternoArticulo") or "").strip()
                ver = str(it.get("imageCatalogVersion") or "").strip()
                try:
                    nimg_int = int(it.get("nimgArticulo") or 0)
                except Exception:
                    nimg_int = 0

                if not idext or not ver:
                    it["__imagesSmall"] = []
                    it["__imagesBig"] = []
                    it["__images"] = []
                    it["__imagesCount"] = 0
                    it["__imagesError"] = "missing idexternoArticulo or imageCatalogVersion"
                else:
                    small = build_small_image(url_storage, idext, ver)
                    big_count = max(nimg_int, 1)
                    bigs = [build_big_image(url_storage, idext, i, ver) for i in range(1, big_count + 1)]

                    it["__imagesSmall"] = [small]
                    it["__imagesBig"] = bigs
                    it["__images"] = [small] + bigs
                    it["__imagesCount"] = len(it["__images"])

                    if validate_images:
                        it["__smallHead"] = http_head(sess, small, timeout=validate_timeout_s)
                        sample_n = max(0, min(validate_sample_big, len(bigs)))
                        it["__bigHeadSample"] = [
                            {"url": u, "code": http_head(sess, u, timeout=validate_timeout_s)}
                            for u in bigs[:sample_n]
                        ]

            # progreso
            if (idx % progress_every) == 0 or idx == total_items:
                elapsed = time.time() - sec_start
                rate = (idx / elapsed) if elapsed > 0 else 0.0
                remaining = total_items - idx
                eta = (remaining / rate) if rate > 0 else -1
                pct = (idx * 100.0 / total_items) if total_items else 100.0
                print(
                    f"🧭 Progress sec {sec.idSeccion}: {idx}/{total_items} ({pct:.1f}%)"
                    f" | rate={rate:.2f} item/s"
                    f" | ETA={_fmt_secs(eta)}"
                )

            if checkpoint_every > 0 and (idx % checkpoint_every) == 0:
                dump_json_pretty(
                    sec_checkpoint_fp,
                    {
                        "storeId": store_id,
                        "section": sec.raw,
                        "showOrder": show_order,
                        "tag": tag,
                        "checkpoint": {"idx": idx, "total": total_items, "timestamp": _now_tag()},
                        "data": {"list": items, "count": len(items)},
                        "detailErrorsLast50": detail_errors[-50:],
                    },
                )
                print(f"💾 Checkpoint guardado: {sec_checkpoint_fp}")

        sec_fp = DUMPS_DIR / f"bravo_articles_store{store_id}_sec{sec.idSeccion}_{_now_tag()}.json"
        dump_json_pretty(
            sec_fp,
            {
                "storeId": store_id,
                "section": sec.raw,
                "showOrder": show_order,
                "data": {"list": items, "count": len(items)},
                "detailErrors": detail_errors,
            },
        )
        print(f"💾 Dump sección guardado en: {sec_fp}")

        for it in items:
            k = item_key(it)
            if k not in combined_map:
                combined_map[k] = it

    combined_items = list(combined_map.values())
    all_fp = DUMPS_DIR / f"bravo_articles_store{store_id}_ALL_DEDUP_{tag}.json"
    dump_json_pretty(
        all_fp,
        {
            "storeId": store_id,
            "showOrder": show_order,
            "sections": [s.raw for s in picked],
            "data": {"list": combined_items, "count": len(combined_items), "priceField": "__price"},
            "stats": {
                "elapsed": _fmt_secs(time.time() - global_start),
                "detailCacheSize": len(detail_cache),
                "detailErrorsCount": len(detail_errors),
            },
        },
    )
    print(f"\n🧠 Combined dedup: {len(combined_items)} items")
    print(f"💾 Dump combined guardado en: {all_fp}")


if __name__ == "__main__":
    main()