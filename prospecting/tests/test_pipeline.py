"""Test end-to-end OFFLINE : 5 commerces, fixtures HTML locales, sans réseau.

Monkeypatch fetch_homepage pour servir les fixtures, désactive RDAP et LLM live.
Vérifie : dédup, fingerprint, checks, score, cache (2e passe), export CSV.
"""
import csv
import pathlib
import sys
import tempfile

HERE = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))

import agents  # noqa: E402
import run as runmod  # noqa: E402
from common import load_config  # noqa: E402
from db import DB  # noqa: E402
from fetch import FetchResult  # noqa: E402

FIX = HERE / "fixtures"

# 5 commerces du "11e" (simulés) -> (nom, categorie, domaine, fixture, headers)
SAMPLE = [
    ("Salon Chez Marie", "coiffeur", "chez-marie.fr", "coiffeur_planity.html", {}),
    ("Le Bistrot d'Oberkampf", "restaurant", "bistrot-oberkampf.fr", "resto_thefork.html", {}),
    ("Boutique Bastille", "ecommerce", "boutique-bastille.fr", "shop_woo.html",
     {"strict-transport-security": "max-age=31536000", "content-security-policy": "default-src 'self'"}),
    ("Garage Dupont", "garage", "garage-dupont.fr", "plain.html",
     {"x-frame-options": "DENY", "referrer-policy": "no-referrer"}),
    ("Salon Chez Marie (doublon)", "coiffeur", "chez-marie.fr", "coiffeur_planity.html", {}),
]


def make_fake_fetch():
    by_domain = {}
    for _, _, dom, fix, hdr in SAMPLE:
        by_domain[dom] = (FIX / fix).read_text(encoding="utf-8"), hdr

    def fake(cfg, website):
        from common import domain_of
        dom = domain_of(website)
        html, hdr = by_domain.get(dom, ("", {}))
        return FetchResult(url=website, final_url=f"https://{dom}/", status_code=200,
                           headers=hdr, html=html, ttfb_ms=250, https_ok=True)
    return fake


def main():
    cfg = load_config()
    tmp = tempfile.mkdtemp()
    db = DB(str(pathlib.Path(tmp) / "test.db"))

    # Seed + dédup
    inserted = 0
    for name, cat, dom, _, _ in SAMPLE:
        if db.upsert_business({"name": name, "category": cat, "arrondissement": "11",
                               "address": "Paris 75011", "website": f"https://{dom}",
                               "domain": dom, "source": "osm", "osm_id": None}):
            inserted += 1
    rows = db.businesses_with_site()
    assert inserted == 4, f"dédup KO: {inserted}"          # 5 - 1 doublon
    assert len(rows) == 4, f"attendu 4, obtenu {len(rows)}"
    print(f"[OK] dédup: {inserted} insérés sur 5 (1 doublon ignoré)")

    # Pipeline analyse (fetch monkeypatché, sans RDAP)
    # analyze_one utilise le nom module-global fetch_homepage : on le patche.
    runmod.fetch_homepage = make_fake_fetch()
    for row in rows:
        s = runmod.analyze_one(db, cfg, row, do_rdap=False)
        assert s is not None

    ranking = db.ranking()
    print("[OK] classement par priorité :")
    for r in ranking:
        print(f"     prio={r['priority']:>3}  dep={r['dependency_score']:>3} "
              f"frag={r['fragility_score']:>3}  {r['name']}  ({r['cms']} {r['cms_version']})")

    # Vérifs attendues
    top = ranking[0]
    assert top["priority"] > 0
    assert ranking[-1]["name"] == "Garage Dupont"  # vitrine sans faiblesse -> prio la plus basse
    coiffeur = next(r for r in ranking if r["name"] == "Salon Chez Marie")
    assert coiffeur["cms"] == "WordPress" and coiffeur["cms_version"] == "5.4.2"
    print("[OK] fingerprint + scoring cohérents")

    # Cache fingerprint : 2e passe doit être 'cached'
    import fingerprint as fpmod
    html = (FIX / "coiffeur_planity.html").read_text()
    fp2 = fpmod.fingerprint_business(db, cfg, "chez-marie.fr", html, {})
    assert fp2["cached"] is True
    print("[OK] cache fingerprint (2e passe = cached)")

    # LLM dry-run (pas de clé) : aucun appel, aucune dépense
    run_id = agents.new_run_id()
    out = agents.run_auditor(db, cfg, run_id, "chez-marie.fr", fp2["html_hash"],
                             agents.compact_record(coiffeur), api_key=None)
    assert out["skipped"] == "no_api_key" and db.total_spend(run_id) == 0.0
    print("[OK] agents LLM en dry-run sans clé (0€)")

    # Export CSV
    out_csv = str(pathlib.Path(tmp) / "classement.csv")
    runmod.export_csv(db, out_csv)
    with open(out_csv, encoding="utf-8") as fh:
        rowsc = list(csv.DictReader(fh))
    assert len(rowsc) == 4
    assert int(rowsc[0]["priorite"]) >= int(rowsc[-1]["priorite"])  # trié desc
    print(f"[OK] export CSV : {len(rowsc)} lignes, trié par priorité")
    print("\nTOUS LES TESTS PASSENT ✅")


if __name__ == "__main__":
    main()
