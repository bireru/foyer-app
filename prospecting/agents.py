"""Agents LLM (API Anthropic) appliqués au top N par priorité uniquement.

Économie de tokens :
- JSON compact en entrée ET en sortie (pas de prose superflue).
- Cache SQLite : clé = role:domaine:html_hash → jamais retraité.
- Plafond de dépense (config.llm.spend_cap_eur) avec ARRÊT automatique.
- Journalisation tokens + coût estimé par étape (table spend_log).
- Le HTML complet n'entre jamais dans le contexte : l'auditor/outreach
  reçoivent le JSON de résultats ; le classifier reçoit un extrait < 2000 car.

Sans ANTHROPIC_API_KEY : mode dry-run (aucun appel, estimation seulement).
"""
from __future__ import annotations

import json
import os
import re
import uuid

import httpx

from common import get_logger

log = get_logger("agents")
API_URL = "https://api.anthropic.com/v1/messages"
API_VERSION = "2023-06-01"

# Prompts système courts (< 150 mots), alignés avec .claude/agents/*.md.
SYS = {
    "classifier": (
        "Tu détermines si un site web est CRITIQUE pour l'activité d'un commerce "
        "(réservation, paiement, e-commerce, prise de RDV en ligne). "
        "Entrée : extrait HTML. Réponds UNIQUEMENT en JSON strict : "
        '{"critical": true|false, "confidence": 0.0-1.0, "reason": "<12 mots"}. '
        "Aucune autre sortie."
    ),
    "auditor": (
        "Tu es auditeur sécurité web. À partir d'un JSON de résultats de vérifications "
        "passives (jamais de HTML brut), rédige un mini-audit d'1 page en français : "
        "1) Constats, 2) Risque business concret, 3) Correctifs priorisés (haute/moyenne). "
        "Ton factuel, orienté dirigeant de TPE/PME, pas de jargon inutile. Markdown court."
    ),
    "outreach": (
        "À partir d'un audit, rédige un message d'approche B2B de 5 lignes maximum, "
        "en français, personnalisé, poli, sans alarmisme. Mentionne un point concret de "
        "l'audit et propose un échange. Termine par une mention de désinscription. "
        "Sortie : le message seul, 5 lignes max."
    ),
    "reviewer": (
        "Tu relis un audit sensible. Vérifie exactitude technique, ton, et absence "
        "d'affirmation non étayée par les données. Renvoie l'audit corrigé en français."
    ),
}


def compact_record(row) -> dict:
    """Construit le JSON compact pour l'auditor/outreach (pas de HTML)."""
    widgets = json.loads(row["widgets"] or "[]") if row["widgets"] else []
    notes = json.loads(row["notes"] or "{}") if row["notes"] else {}
    reasons = json.loads(row["reasons"] or "{}") if row["reasons"] else {}
    return {
        "nom": row["name"],
        "cat": row["category"],
        "arr": row["arrondissement"],
        "cms": row["cms"],
        "cms_v": row["cms_version"],
        "widgets": widgets,
        "dep": row["dependency_score"],
        "frag": row["fragility_score"],
        "prio": row["priority"],
        "faiblesses": reasons.get("fragility", []),
        "notes": {k: v for k, v in notes.items() if v},
    }


def _price(cfg, model, in_tok, out_tok) -> float:
    p = cfg["llm"]["pricing_usd_per_mtok"].get(model)
    if not p:
        return 0.0
    usd = (in_tok / 1e6) * p["input"] + (out_tok / 1e6) * p["output"]
    return usd * cfg["llm"]["usd_to_eur"]


def _call_api(model, system, user, max_tokens, api_key) -> tuple[str, int, int]:
    payload = {
        "model": model, "max_tokens": max_tokens, "system": system,
        "messages": [{"role": "user", "content": user}],
    }
    headers = {"x-api-key": api_key, "anthropic-version": API_VERSION,
               "content-type": "application/json"}
    with httpx.Client(timeout=60) as c:
        r = c.post(API_URL, headers=headers, json=payload)
        r.raise_for_status()
        data = r.json()
    text = "".join(b.get("text", "") for b in data.get("content", []))
    u = data.get("usage", {})
    return text, u.get("input_tokens", 0), u.get("output_tokens", 0)


def run_agent(db, cfg, run_id, role: str, domain: str, html_hash: str,
              user_payload: str, max_tokens: int, api_key: str | None) -> dict:
    """Exécute un agent avec cache + plafond. Renvoie {result, cached, skipped}."""
    model = cfg["llm"][f"{role}_model"]
    cache_key = f"{role}:{domain}:{html_hash}"
    cached = db.get_llm_cache(cache_key)
    if cached is not None:
        return {"result": cached, "cached": True, "skipped": False}

    cap = float(cfg["llm"]["spend_cap_eur"])
    if db.total_spend(run_id) >= cap:
        log.warning("Plafond %.2f€ atteint → arrêt (%s/%s)", cap, role, domain)
        return {"result": None, "cached": False, "skipped": "spend_cap"}

    if not api_key:
        return {"result": None, "cached": False, "skipped": "no_api_key"}

    text, in_tok, out_tok = _call_api(model, SYS[role], user_payload, max_tokens, api_key)
    cost = _price(cfg, model, in_tok, out_tok)
    db.log_spend(run_id, role, model, in_tok, out_tok, cost)
    db.save_llm_cache(cache_key, role, domain, html_hash, text)
    log.info("%s %s: %d→%d tok, %.4f€ (cumul %.4f€)", role, domain, in_tok, out_tok,
             cost, db.total_spend(run_id))
    return {"result": text, "cached": False, "skipped": False}


def run_classifier(db, cfg, run_id, domain, html_hash, html_excerpt, api_key):
    excerpt = (html_excerpt or "")[:2000]  # < 2000 caractères
    payload = json.dumps({"html": excerpt}, ensure_ascii=False)
    out = run_agent(db, cfg, run_id, "classifier", domain, html_hash, payload, 150, api_key)
    if out["result"]:
        m = re.search(r"\{.*\}", out["result"], re.S)
        try:
            out["parsed"] = json.loads(m.group(0)) if m else None
        except json.JSONDecodeError:
            out["parsed"] = None
    return out


def run_auditor(db, cfg, run_id, domain, html_hash, record: dict, api_key):
    payload = json.dumps(record, ensure_ascii=False, separators=(",", ":"))
    return run_agent(db, cfg, run_id, "auditor", domain, html_hash, payload, 900, api_key)


def run_outreach(db, cfg, run_id, domain, html_hash, audit_text: str, api_key):
    return run_agent(db, cfg, run_id, "outreach", domain, html_hash, audit_text, 250, api_key)


def run_reviewer(db, cfg, run_id, domain, html_hash, audit_text: str, api_key):
    return run_agent(db, cfg, run_id, "reviewer", domain, html_hash, audit_text, 900, api_key)


def new_run_id() -> str:
    return uuid.uuid4().hex[:12]


def get_api_key() -> str | None:
    return os.environ.get("ANTHROPIC_API_KEY")
