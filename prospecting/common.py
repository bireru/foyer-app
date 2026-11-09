"""Utilitaires partagés : config, logging, normalisation de domaine."""
from __future__ import annotations

import logging
import os
import re
from pathlib import Path
from urllib.parse import urlparse

import yaml

ROOT = Path(__file__).resolve().parent


def load_config(path: str | None = None) -> dict:
    cfg_path = Path(path) if path else ROOT / "config.yaml"
    with open(cfg_path, "r", encoding="utf-8") as fh:
        return yaml.safe_load(fh)


def get_logger(name: str = "prospecting") -> logging.Logger:
    logger = logging.getLogger(name)
    if not logger.handlers:
        h = logging.StreamHandler()
        h.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(name)s: %(message)s"))
        logger.addHandler(h)
        logger.setLevel(os.environ.get("LOG_LEVEL", "INFO"))
    return logger


def normalize_url(url: str | None) -> str | None:
    """Normalise une URL de site en http(s)://domaine (sans path)."""
    if not url:
        return None
    url = url.strip()
    if not url:
        return None
    if not re.match(r"^https?://", url, re.I):
        url = "http://" + url
    try:
        p = urlparse(url)
    except ValueError:
        return None
    host = (p.netloc or "").lower()
    if not host or "." not in host:
        return None
    scheme = p.scheme.lower() if p.scheme in ("http", "https") else "http"
    return f"{scheme}://{host}"


def domain_of(url: str | None) -> str | None:
    """Extrait le domaine canonique (sans www) depuis une URL."""
    if not url:
        return None
    if not re.match(r"^https?://", url, re.I):
        url = "http://" + url
    host = urlparse(url).netloc.lower()
    host = host.split(":")[0]
    if host.startswith("www."):
        host = host[4:]
    return host or None
