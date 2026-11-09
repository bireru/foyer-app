"""Empreinte technologique par REGEX (aucun LLM) à partir du HTML + en-têtes.

Détecte : CMS et version, widgets de réservation/paiement/e-commerce,
formulaires critiques. Résultat mis en cache (clé = domaine + hash HTML).
"""
from __future__ import annotations

import hashlib
import re

# --- CMS : (nom, regex nom, regex version optionnelle) ---
CMS_PATTERNS = [
    ("WordPress", re.compile(r"/wp-(content|includes)/|wp-json|WordPress", re.I),
     re.compile(r'content=["\']WordPress\s*([0-9]+\.[0-9]+(?:\.[0-9]+)?)', re.I)),
    ("Joomla", re.compile(r"/media/jui/|Joomla!", re.I),
     re.compile(r'content=["\']Joomla!?\s*-?\s*([0-9]+\.[0-9]+(?:\.[0-9]+)?)', re.I)),
    ("Drupal", re.compile(r"Drupal\.settings|/sites/default/files|/core/misc/drupal", re.I),
     re.compile(r'content=["\']Drupal\s*([0-9]+(?:\.[0-9]+)?)', re.I)),
    ("PrestaShop", re.compile(r"PrestaShop|/modules/ps_|prestashop", re.I),
     re.compile(r'PrestaShop\s*([0-9]+\.[0-9]+(?:\.[0-9]+)?)', re.I)),
    ("Magento", re.compile(r"Mage\.|/static/version|magento", re.I), None),
    ("Shopify", re.compile(r"cdn\.shopify\.com|Shopify\.theme|myshopify\.com", re.I), None),
    ("Wix", re.compile(r"static\.wixstatic\.com|X-Wix-", re.I), None),
    ("Squarespace", re.compile(r"squarespace\.com|static1\.squarespace", re.I), None),
    ("Webflow", re.compile(r"assets\.website-files\.com|webflow", re.I), None),
]

# --- Widgets : nom -> regex ---
WIDGETS = {
    "Planity":   re.compile(r"planity\.com|planity", re.I),
    "Calendly":  re.compile(r"calendly\.com", re.I),
    "Doctolib":  re.compile(r"doctolib\.(fr|com)", re.I),
    "TheFork":   re.compile(r"thefork|lafourchette", re.I),
    "Zenchef":   re.compile(r"zenchef", re.I),
    "Shopify":   re.compile(r"shopify", re.I),
    "WooCommerce": re.compile(r"woocommerce|/wp-content/plugins/woocommerce", re.I),
    "Stripe":    re.compile(r"js\.stripe\.com|stripe\.com/v3", re.I),
    "PayPal":    re.compile(r"paypal\.com/sdk|paypalobjects", re.I),
    "Mindbody":  re.compile(r"mindbody", re.I),
}


def html_hash(html: str) -> str:
    return hashlib.sha256(html.encode("utf-8", "ignore")).hexdigest()[:16]


def detect_cms(html: str, headers: dict) -> tuple[str | None, str | None]:
    hay = html + " " + " ".join(f"{k}:{v}" for k, v in (headers or {}).items())
    # En-tête X-Powered-By / Server utile
    for name, name_re, ver_re in CMS_PATTERNS:
        if name_re.search(hay):
            version = None
            if ver_re:
                m = ver_re.search(hay)
                version = m.group(1) if m else None
            if not version:
                gm = re.search(rf"{re.escape(name)}[/ ]([0-9]+\.[0-9]+(?:\.[0-9]+)?)", hay, re.I)
                version = gm.group(1) if gm else None
            return name, version
    powered = (headers or {}).get("x-powered-by", "")
    if powered:
        return powered.split("/")[0].strip() or None, None
    return None, None


def detect_widgets(html: str) -> list[str]:
    found = [name for name, rgx in WIDGETS.items() if rgx.search(html)]
    return sorted(set(found))


def detect_forms(html: str) -> list[str]:
    forms = []
    if re.search(r"<input[^>]+type=[\"']?password", html, re.I):
        forms.append("login")
    if re.search(r"<input[^>]+type=[\"']?(email|tel)", html, re.I) or re.search(r"<textarea", html, re.I):
        forms.append("contact")
    if re.search(r"(panier|checkout|add[-_ ]?to[-_ ]?cart|ajouter au panier)", html, re.I):
        forms.append("checkout")
    if re.search(r"(réserver|reservation|réserver|prendre rendez-vous|book now)", html, re.I):
        forms.append("reservation")
    return sorted(set(forms))


def fingerprint_html(html: str, headers: dict) -> dict:
    cms, version = detect_cms(html, headers)
    return {
        "html_hash": html_hash(html),
        "cms": cms,
        "cms_version": version,
        "widgets": detect_widgets(html),
        "forms": detect_forms(html),
    }


def fingerprint_business(db, cfg, domain: str, html: str, headers: dict) -> dict:
    h = html_hash(html)
    cached = db.get_fingerprint(domain)
    if cached and cached["html_hash"] == h:
        import json
        return {
            "html_hash": h, "cms": cached["cms"], "cms_version": cached["cms_version"],
            "widgets": json.loads(cached["widgets"] or "[]"),
            "forms": json.loads(cached["forms"] or "[]"), "cached": True,
        }
    fp = fingerprint_html(html, headers)
    db.save_fingerprint(domain, fp["html_hash"], fp["cms"], fp["cms_version"], fp["widgets"], fp["forms"])
    fp["cached"] = False
    return fp
