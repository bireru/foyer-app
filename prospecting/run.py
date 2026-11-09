#!/usr/bin/env python3
"""CLI du pipeline de prospection (audit sécurité web TPE/PME Paris).

Pipeline : discover → fingerprint → passive_checks → score → agents LLM (top N)
→ export CSV du classement final.

Exemples :
  python run.py --arrondissement 11 --categorie coiffeur --limit 100
  python run.py --arrondissement 11 --categorie restaurant --limit 50 --no-llm
  python run.py --export-only --out classement.csv
"""
from __future__ import annotations

import argparse
import csv
import json
import sys

import agents
import discover as discover_mod
import fingerprint as fpmod
import passive_checks as pc
import score as scoremod
from common import get_logger, load_config
from db import DB
from fetch import fetch_homepage

log = get_logger("run")


def analyze_one(db, cfg, row, do_rdap: bool) -> dict | None:
    """Fetch passif + fingerprint + checks + score pour un commerce."""
    domain, website = row["domain"], row["website"]
    fr = fetch_homepage(cfg, website)
    if fr.error and not fr.html:
        log.info("Ignoré %s: %s", domain, fr.error)
        # on enregistre quand même un check minimal (site down = signal)
    fp = fpmod.fingerprint_business(db, cfg, domain, fr.html, fr.headers)
    chk = pc.run_checks(fr, fp, domain, cfg, do_rdap=do_rdap)
    db.save_check(domain, chk)
    s = scoremod.compute(row["category"], fp, chk, cfg)
    db.save_score(domain, s["dependency_score"], s["fragility_score"], s["priority"], s["reasons"])
    return s


def run_llm(db, cfg, review: bool):
    if not cfg["llm"].get("enabled", True):
        log.info("LLM désactivé en config.")
        return
    api_key = agents.get_api_key()
    run_id = agents.new_run_id()
    top_n = cfg["llm"]["top_n"]
    rows = db.ranking()[:top_n]
    if not api_key:
        log.warning("ANTHROPIC_API_KEY absente → agents en dry-run (aucun appel). "
                    "Top %d sélectionné.", len(rows))
    for row in rows:
        if db.total_spend(run_id) >= float(cfg["llm"]["spend_cap_eur"]):
            log.warning("Plafond atteint, arrêt des agents.")
            break
        domain = row["domain"]
        fp = db.get_fingerprint(domain)
        html_hash = fp["html_hash"] if fp else "nohash"
        record = agents.compact_record(row)
        audit = agents.run_auditor(db, cfg, run_id, domain, html_hash, record, api_key)
        if audit.get("result"):
            agents.run_outreach(db, cfg, run_id, domain, html_hash, audit["result"], api_key)
            if review:
                agents.run_reviewer(db, cfg, run_id, domain, html_hash, audit["result"], api_key)
    log.info("Coût total run %s : %.4f€", run_id, db.total_spend(run_id))


def export_csv(db, path: str):
    rows = db.ranking()
    with open(path, "w", newline="", encoding="utf-8") as fh:
        w = csv.writer(fh)
        w.writerow(["priorite", "dependance", "fragilite", "nom", "categorie",
                    "arrondissement", "site", "cms", "cms_version", "widgets",
                    "faiblesses", "adresse"])
        for r in rows:
            reasons = json.loads(r["reasons"] or "{}")
            widgets = json.loads(r["widgets"] or "[]") if r["widgets"] else []
            w.writerow([
                r["priority"], r["dependency_score"], r["fragility_score"], r["name"],
                r["category"], r["arrondissement"], r["website"], r["cms"] or "",
                r["cms_version"] or "", ";".join(widgets),
                " | ".join(reasons.get("fragility", [])), r["address"] or "",
            ])
    log.info("Export CSV : %s (%d lignes)", path, len(rows))


def main(argv=None):
    ap = argparse.ArgumentParser(description="Prospection audit sécurité web Paris")
    ap.add_argument("--arrondissement", "-a", help="Numéro d'arrondissement (1-20)")
    ap.add_argument("--categorie", "-c", help="Catégorie (coiffeur, restaurant, ...)")
    ap.add_argument("--limit", "-l", type=int, default=100)
    ap.add_argument("--config", default=None)
    ap.add_argument("--db", default=None, help="Chemin SQLite (sinon config.db_path)")
    ap.add_argument("--out", default="classement.csv")
    ap.add_argument("--no-rdap", action="store_true", help="Sauter le lookup RDAP")
    ap.add_argument("--no-llm", action="store_true", help="Sauter les agents LLM")
    ap.add_argument("--review", action="store_true", help="Activer le reviewer (Opus) sur l'audit")
    ap.add_argument("--export-only", action="store_true", help="Exporter le CSV depuis la base existante")
    args = ap.parse_args(argv)

    cfg = load_config(args.config)
    db = DB(args.db or cfg["db_path"])

    if args.export_only:
        export_csv(db, args.out)
        return 0

    # 1) Découverte
    if args.arrondissement and args.categorie:
        n = discover_mod.discover(db, cfg, args.arrondissement, args.categorie, args.limit)
        log.info("Découverte : %d commerces avec site.", n)
    else:
        log.info("Pas de --arrondissement/--categorie : on analyse la base existante.")

    # 2-4) Analyse + score
    todo = db.businesses_with_site(limit=None)
    log.info("Analyse de %d sites...", len(todo))
    for i, row in enumerate(todo, 1):
        analyze_one(db, cfg, row, do_rdap=not args.no_rdap)
        if i % 10 == 0:
            log.info("  ...%d/%d", i, len(todo))

    # 5) Agents LLM sur le top N
    if not args.no_llm:
        run_llm(db, cfg, review=args.review)

    # Export
    export_csv(db, args.out)
    return 0


if __name__ == "__main__":
    sys.exit(main())
