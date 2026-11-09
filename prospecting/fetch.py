"""Récupération PASSIVE d'une page d'accueil : un seul GET, politesse stricte.

- Respecte robots.txt (si config.respect_robots).
- Rate-limit 1 req/s par domaine.
- User-Agent identifiable, timeout, taille HTML plafonnée.
- Expose aussi les infos TLS du certificat.
AUCUN scan, fuzzing, login ou test actif.
"""
from __future__ import annotations

import datetime as dt
import socket
import ssl
import time
import urllib.robotparser
from dataclasses import dataclass, field
from urllib.parse import urlparse

import httpx

from common import get_logger

log = get_logger("fetch")

_last_hit: dict[str, float] = {}  # domaine -> timestamp dernier accès


@dataclass
class FetchResult:
    url: str
    final_url: str | None = None
    status_code: int | None = None
    headers: dict = field(default_factory=dict)
    html: str = ""
    ttfb_ms: int | None = None
    https_ok: bool = False
    tls_not_after: dt.datetime | None = None
    tls_error: str | None = None
    error: str | None = None
    blocked_by_robots: bool = False


def _respect_rate_limit(domain: str, min_interval: float):
    now = time.monotonic()
    last = _last_hit.get(domain)
    if last is not None:
        wait = min_interval - (now - last)
        if wait > 0:
            time.sleep(wait)
    _last_hit[domain] = time.monotonic()


def _robots_allows(base: str, path: str, ua: str, timeout: float) -> bool:
    rp = urllib.robotparser.RobotFileParser()
    rp.set_url(base.rstrip("/") + "/robots.txt")
    try:
        with httpx.Client(timeout=timeout, headers={"User-Agent": ua}, follow_redirects=True) as c:
            r = c.get(base.rstrip("/") + "/robots.txt")
            if r.status_code >= 400:
                return True  # pas de robots -> autorisé
            rp.parse(r.text.splitlines())
    except Exception:  # noqa: BLE001
        return True
    return rp.can_fetch(ua, path or "/")


def tls_cert_expiry(host: str, timeout: float) -> tuple[dt.datetime | None, str | None]:
    """Date d'expiration du certificat TLS (lecture passive du handshake)."""
    ctx = ssl.create_default_context()
    try:
        with socket.create_connection((host, 443), timeout=timeout) as sock:
            with ctx.wrap_socket(sock, server_hostname=host) as ssock:
                cert = ssock.getpeercert()
        not_after = cert.get("notAfter")
        if not_after:
            exp = dt.datetime.strptime(not_after, "%b %d %H:%M:%S %Y %Z").replace(tzinfo=dt.timezone.utc)
            return exp, None
        return None, "no notAfter"
    except ssl.SSLCertVerificationError as e:
        return None, f"cert_invalid: {e.verify_message or e}"
    except Exception as e:  # noqa: BLE001
        return None, f"{type(e).__name__}: {e}"


def fetch_homepage(cfg: dict, url: str) -> FetchResult:
    net = cfg["network"]
    ua = net["user_agent"]
    timeout = float(net["timeout_s"])
    max_bytes = int(net["max_html_bytes"])
    parsed = urlparse(url)
    host = parsed.netloc
    res = FetchResult(url=url)

    if net.get("respect_robots", True):
        if not _robots_allows(f"{parsed.scheme}://{host}", "/", ua, timeout):
            res.blocked_by_robots = True
            res.error = "blocked_by_robots"
            log.info("robots.txt interdit %s", url)
            return res

    _respect_rate_limit(host, float(net["rate_limit_per_domain_s"]))

    # TLS (sur le host, en https)
    res.tls_not_after, res.tls_error = tls_cert_expiry(host.split(":")[0], timeout)
    res.https_ok = res.tls_error is None

    try:
        t0 = time.perf_counter()
        with httpx.Client(timeout=timeout, headers={"User-Agent": ua}, follow_redirects=True) as c:
            with c.stream("GET", url) as r:
                res.ttfb_ms = int((time.perf_counter() - t0) * 1000)
                res.status_code = r.status_code
                res.final_url = str(r.url)
                res.headers = {k.lower(): v for k, v in r.headers.items()}
                chunks, total = [], 0
                for chunk in r.iter_text():
                    chunks.append(chunk)
                    total += len(chunk)
                    if total >= max_bytes:
                        break
                res.html = "".join(chunks)[:max_bytes]
    except Exception as e:  # noqa: BLE001
        res.error = f"{type(e).__name__}: {e}"
        log.info("fetch échoué %s: %s", url, res.error)
    return res
