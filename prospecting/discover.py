"""Découverte des commerces parisiens via Overpass/OpenStreetMap (gratuit).

Filtre par arrondissement (code postal 750XX) et catégorie. Stocke dans SQLite,
dédoublonné par domaine. Google Places en complément si clé fournie (optionnel).
"""
from __future__ import annotations

import os
import time

import httpx

from common import domain_of, get_logger, normalize_url

log = get_logger("discover")

# Catégorie -> filtres OSM (clé=valeurs). Déterministe, pas de LLM.
CATEGORY_OSM = {
    "restaurant":     [("amenity", ["restaurant", "fast_food"])],
    "coiffeur":       [("shop", ["hairdresser"])],
    "garage":         [("shop", ["car_repair"]), ("craft", ["car_repair"])],
    "clinique":       [("amenity", ["clinic", "doctors", "dentist"]), ("healthcare", ["clinic", "centre"])],
    "salle_de_sport": [("leisure", ["fitness_centre"]), ("sport", ["fitness"])],
    "auto_ecole":     [("amenity", ["driving_school"])],
    "traiteur":       [("shop", ["deli", "caterer"]), ("craft", ["caterer"])],
    "ecommerce":      [("shop", ["clothes", "shoes", "jewelry", "gift", "cosmetics", "bakery"])],
}

ALIASES = {
    "coiffeurs": "coiffeur", "restaurants": "restaurant", "garages": "garage",
    "cliniques": "clinique", "auto-ecole": "auto_ecole", "auto_ecoles": "auto_ecole",
    "salle-de-sport": "salle_de_sport", "traiteurs": "traiteur", "e-commerce": "ecommerce",
}


def _postcode(arr: str | int) -> str:
    n = int(arr)
    return f"750{n:02d}"


def _build_query(postcode: str, filters: list[tuple[str, list[str]]]) -> str:
    parts = []
    for key, values in filters:
        regex = "|".join(values)
        # nwr = node/way/relation ; on exige un code postal parisien
        parts.append(f'nwr["{key}"~"^({regex})$"]["addr:postcode"="{postcode}"];')
    body = "\n".join(parts)
    return f"[out:json][timeout:60];\n(\n{body}\n);\nout tags center 400;"


def _website_from_tags(tags: dict) -> str | None:
    for k in ("website", "contact:website", "url"):
        if tags.get(k):
            return tags[k]
    return None


def overpass(cfg: dict, postcode: str, filters: list) -> list[dict]:
    url = cfg["discover"]["overpass_url"]
    query = _build_query(postcode, filters)
    ua = cfg["network"]["user_agent"]
    with httpx.Client(timeout=90, headers={"User-Agent": ua}) as client:
        r = client.post(url, data={"data": query})
        r.raise_for_status()
        return r.json().get("elements", [])


def discover(db, cfg: dict, arrondissement: str, category: str, limit: int = 100) -> int:
    category = ALIASES.get(category.lower(), category.lower())
    if category not in CATEGORY_OSM:
        raise ValueError(f"Catégorie inconnue: {category}. Options: {list(CATEGORY_OSM)}")
    postcode = _postcode(arrondissement)
    log.info("Overpass: arr=%s (%s) categorie=%s", arrondissement, postcode, category)

    elements = overpass(cfg, postcode, CATEGORY_OSM[category])
    inserted = 0
    seen_no_site = 0
    for el in elements:
        if inserted >= limit:
            break
        tags = el.get("tags", {})
        name = tags.get("name")
        if not name:
            continue
        website = _website_from_tags(tags)
        norm = normalize_url(website)
        dom = domain_of(norm)
        if not dom:
            seen_no_site += 1
            continue  # on ne garde que les commerces avec site (dépendance web)
        addr = " ".join(filter(None, [
            tags.get("addr:housenumber"), tags.get("addr:street"),
            tags.get("addr:postcode"), "Paris"]))
        ok = db.upsert_business({
            "name": name, "category": category, "arrondissement": str(arrondissement),
            "address": addr, "website": norm, "domain": dom,
            "source": "osm", "osm_id": f"{el.get('type')}/{el.get('id')}",
        })
        if ok:
            inserted += 1

    log.info("Insérés: %d (sans site ignorés: %d, total OSM: %d)",
             inserted, seen_no_site, len(elements))

    if cfg["discover"].get("use_google_places") and os.environ.get("GOOGLE_PLACES_API_KEY"):
        inserted += _google_places(db, cfg, postcode, category, limit - inserted)
    return inserted


def _google_places(db, cfg, postcode, category, remaining) -> int:
    """Complément Google Places (Text Search) si clé dispo. Optionnel."""
    if remaining <= 0:
        return 0
    key = os.environ["GOOGLE_PLACES_API_KEY"]
    ua = cfg["network"]["user_agent"]
    added = 0
    try:
        with httpx.Client(timeout=30, headers={"User-Agent": ua}) as client:
            r = client.get(
                "https://maps.googleapis.com/maps/api/place/textsearch/json",
                params={"query": f"{category} {postcode} Paris", "key": key, "region": "fr"},
            )
            r.raise_for_status()
            for res in r.json().get("results", [])[:remaining]:
                pid = res.get("place_id")
                det = client.get(
                    "https://maps.googleapis.com/maps/api/place/details/json",
                    params={"place_id": pid, "fields": "name,website,formatted_address", "key": key},
                ).json().get("result", {})
                norm = normalize_url(det.get("website"))
                dom = domain_of(norm)
                if not dom:
                    continue
                if db.upsert_business({
                    "name": det.get("name"), "category": category, "arrondissement": postcode[-2:],
                    "address": det.get("formatted_address"), "website": norm, "domain": dom,
                    "source": "google", "osm_id": None,
                }):
                    added += 1
                time.sleep(0.2)
    except Exception as e:  # noqa: BLE001
        log.warning("Google Places ignoré: %s", e)
    return added
