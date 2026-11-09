"""Vérifications PASSIVES et non intrusives.

- HTTPS valide, expiration TLS
- En-têtes de sécurité : HSTS, CSP, X-Frame-Options, Referrer-Policy
- Version CMS obsolète (table de versions connues)
- Expiration du domaine via RDAP
- Mixed content (ressources http:// sur page https)
- Site lent (TTFB)
Aucune requête active : on exploite le GET déjà effectué + un lookup RDAP.
"""
from __future__ import annotations

import datetime as dt
import re

import httpx

from common import get_logger
from fetch import FetchResult

log = get_logger("checks")

# Dernières versions majeures connues (pour repérer un CMS franchement obsolète).
CMS_LATEST = {
    "WordPress": (6, 7),
    "Joomla": (5, 2),
    "Drupal": (11, 0),
    "PrestaShop": (8, 1),
}

SLOW_TTFB_MS = 1500


def _header_present(headers: dict, name: str) -> bool:
    return bool((headers or {}).get(name.lower()))


def analyze_headers(headers: dict) -> dict:
    return {
        "hsts": int(_header_present(headers, "strict-transport-security")),
        "csp": int(_header_present(headers, "content-security-policy")),
        "x_frame_options": int(_header_present(headers, "x-frame-options")),
        "referrer_policy": int(_header_present(headers, "referrer-policy")),
    }


def detect_mixed_content(html: str, final_url: str | None) -> int:
    if not final_url or not final_url.lower().startswith("https"):
        return 0
    # ressources chargées en http:// sur une page https
    return int(bool(re.search(r'(?:src|href)=["\']http://', html or "", re.I)))


def cms_outdated(cms: str | None, version: str | None) -> int:
    if not cms or not version or cms not in CMS_LATEST:
        return 0
    try:
        parts = tuple(int(x) for x in version.split(".")[:2])
    except ValueError:
        return 0
    major_latest = CMS_LATEST[cms][0]
    # Obsolète si on a au moins une version majeure de retard.
    return int(parts and parts[0] < major_latest)


def tls_days_left(not_after: dt.datetime | None) -> int | None:
    if not not_after:
        return None
    now = dt.datetime.now(dt.timezone.utc)
    return (not_after - now).days


def rdap_domain_days_left(domain: str, cfg: dict) -> tuple[int | None, str | None]:
    """Expiration du domaine via RDAP (passif). Renvoie (jours_restants, erreur)."""
    ua = cfg["network"]["user_agent"]
    url = f"https://rdap.org/domain/{domain}"
    try:
        with httpx.Client(timeout=cfg["network"]["timeout_s"], headers={"User-Agent": ua},
                          follow_redirects=True) as c:
            r = c.get(url)
            if r.status_code >= 400:
                return None, f"rdap_status_{r.status_code}"
            data = r.json()
        for ev in data.get("events", []):
            if ev.get("eventAction") == "expiration":
                exp = dt.datetime.fromisoformat(ev["eventDate"].replace("Z", "+00:00"))
                return (exp - dt.datetime.now(dt.timezone.utc)).days, None
        return None, "no_expiration_event"
    except Exception as e:  # noqa: BLE001
        return None, f"{type(e).__name__}"


def run_checks(fr: FetchResult, fingerprint: dict, domain: str, cfg: dict,
               do_rdap: bool = True) -> dict:
    """Combine un FetchResult + empreinte en un dict de vérifs (pour SQLite/score)."""
    hdr = analyze_headers(fr.headers)
    dom_days, rdap_err = (None, "skipped")
    if do_rdap:
        dom_days, rdap_err = rdap_domain_days_left(domain, cfg)

    result = {
        "html_hash": fingerprint.get("html_hash"),
        "https_valid": int(fr.https_ok and not fr.tls_error),
        "tls_days_left": tls_days_left(fr.tls_not_after),
        **hdr,
        "cms_outdated": cms_outdated(fingerprint.get("cms"), fingerprint.get("cms_version")),
        "domain_days_left": dom_days,
        "mixed_content": detect_mixed_content(fr.html, fr.final_url),
        "ttfb_ms": fr.ttfb_ms,
        "status_code": fr.status_code,
        "notes": {
            "tls_error": fr.tls_error, "fetch_error": fr.error,
            "rdap_error": rdap_err, "blocked_by_robots": fr.blocked_by_robots,
            "slow": int(bool(fr.ttfb_ms and fr.ttfb_ms > SLOW_TTFB_MS)),
        },
    }
    return result
