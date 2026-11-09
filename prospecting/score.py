"""Scoring déterministe (0-100), formule simple et documentée.

dependency_score : à quel point l'activité dépend du site.
  base = poids de la catégorie (config.score.dependency_by_category)
  + bonus selon les widgets/formulaires détectés (réservation, paiement, e-commerce)
  plafonné à 100.

fragility_score : faiblesses techniques visibles (checks passifs).
  somme de pénalités pondérées, plafonnée à 100.

priority = dependency_score * fragility_score / 100   (0-100)
  -> on cible les sites à la fois critiques ET fragiles.
"""
from __future__ import annotations

# Bonus de dépendance (points) par signal détecté.
DEP_BONUS = {
    "widget_reservation": 20,   # Planity, Doctolib, TheFork, Calendly, Zenchef, Mindbody
    "widget_paiement": 20,      # Stripe, PayPal
    "widget_ecommerce": 25,     # Shopify, WooCommerce
    "form_checkout": 10,
    "form_reservation": 10,
}
RESA_WIDGETS = {"Planity", "Doctolib", "TheFork", "Calendly", "Zenchef", "Mindbody"}
PAY_WIDGETS = {"Stripe", "PayPal"}
ECOM_WIDGETS = {"Shopify", "WooCommerce"}

# Pénalités de fragilité (points).
FRAG_WEIGHTS = {
    "no_https": 35,
    "tls_expired": 30,
    "tls_expiring_30d": 15,
    "no_hsts": 8,
    "no_csp": 12,
    "no_x_frame_options": 8,
    "no_referrer_policy": 5,
    "cms_outdated": 20,
    "domain_expiring_60d": 15,
    "mixed_content": 15,
    "slow_ttfb": 10,
    "server_error": 10,
}


def _clamp(v: int) -> int:
    return max(0, min(100, int(round(v))))


def dependency_score(category: str, fingerprint: dict, cfg: dict) -> tuple[int, list[str]]:
    table = cfg["score"]["dependency_by_category"]
    base = table.get(category, table.get("default", 40))
    reasons = [f"base categorie {category}={base}"]
    score = base
    widgets = set(fingerprint.get("widgets") or [])
    forms = set(fingerprint.get("forms") or [])

    if widgets & RESA_WIDGETS:
        score += DEP_BONUS["widget_reservation"]
        reasons.append(f"+{DEP_BONUS['widget_reservation']} widget réservation")
    if widgets & PAY_WIDGETS:
        score += DEP_BONUS["widget_paiement"]
        reasons.append(f"+{DEP_BONUS['widget_paiement']} widget paiement")
    if widgets & ECOM_WIDGETS:
        score += DEP_BONUS["widget_ecommerce"]
        reasons.append(f"+{DEP_BONUS['widget_ecommerce']} e-commerce")
    if "checkout" in forms:
        score += DEP_BONUS["form_checkout"]
        reasons.append(f"+{DEP_BONUS['form_checkout']} formulaire checkout")
    if "reservation" in forms:
        score += DEP_BONUS["form_reservation"]
        reasons.append(f"+{DEP_BONUS['form_reservation']} formulaire réservation")

    return _clamp(score), reasons


def fragility_score(check: dict) -> tuple[int, list[str]]:
    score = 0
    reasons = []

    def add(key):
        nonlocal score
        score += FRAG_WEIGHTS[key]
        reasons.append(f"+{FRAG_WEIGHTS[key]} {key}")

    if not check.get("https_valid"):
        add("no_https")
    tls = check.get("tls_days_left")
    if tls is not None:
        if tls < 0:
            add("tls_expired")
        elif tls < 30:
            add("tls_expiring_30d")
    if not check.get("hsts"):
        add("no_hsts")
    if not check.get("csp"):
        add("no_csp")
    if not check.get("x_frame_options"):
        add("no_x_frame_options")
    if not check.get("referrer_policy"):
        add("no_referrer_policy")
    if check.get("cms_outdated"):
        add("cms_outdated")
    dom = check.get("domain_days_left")
    if dom is not None and dom < 60:
        add("domain_expiring_60d")
    if check.get("mixed_content"):
        add("mixed_content")
    notes = check.get("notes") or {}
    if notes.get("slow"):
        add("slow_ttfb")
    sc = check.get("status_code")
    if sc and sc >= 500:
        add("server_error")

    return _clamp(score), reasons


def compute(category: str, fingerprint: dict, check: dict, cfg: dict) -> dict:
    dep, dep_r = dependency_score(category, fingerprint, cfg)
    frag, frag_r = fragility_score(check)
    priority = _clamp(dep * frag / 100)
    return {
        "dependency_score": dep,
        "fragility_score": frag,
        "priority": priority,
        "reasons": {"dependency": dep_r, "fragility": frag_r},
    }
