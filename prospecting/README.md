# Prospection — audit sécurité web TPE/PME (Paris)

Outil de prospection B2B : repère les commerces parisiens qui **dépendent fortement
de leur site** (réservation, paiement, e-commerce, prise de RDV) **et** présentent des
**faiblesses techniques visibles**, puis produit un mini-audit pour les contacter.

> ⚠️ **Vérifications passives uniquement.** Un seul `GET` sur la page d'accueil,
> en-têtes HTTP, certificat TLS, RDAP, HTML public. **Aucun** scan de ports, fuzzing,
> test de login ou tentative d'exploitation. Tout test actif exige un accord écrit.
> robots.txt respecté, 1 requête/s par domaine, User-Agent identifiable.

## Installation

```bash
cd prospecting
pip install -r requirements.txt
# (optionnel) agents LLM :
export ANTHROPIC_API_KEY=sk-...
# (optionnel) complément Google Places :
export GOOGLE_PLACES_API_KEY=...   # + use_google_places: true dans config.yaml
```

## Utilisation

```bash
# Pipeline complet (découverte → fingerprint → checks → score → audit → CSV)
python run.py --arrondissement 11 --categorie coiffeur --limit 100

# Sans agents LLM ni RDAP (rapide, 100% déterministe)
python run.py -a 11 -c restaurant -l 50 --no-llm --no-rdap

# Reviewer (Opus) sur les audits sensibles — sur demande explicite
python run.py -a 11 -c coiffeur --review

# Réexporter le classement depuis la base existante
python run.py --export-only --out classement.csv
```

Catégories : `restaurant`, `coiffeur`, `garage`, `clinique`, `salle_de_sport`,
`auto_ecole`, `traiteur`, `ecommerce`.

## Pipeline

| Étape | Fichier | Rôle |
|---|---|---|
| 1 | `discover.py` | Liste les commerces via Overpass/OpenStreetMap (Google Places en option). Dédoublonnage par domaine. |
| 2 | `fingerprint.py` | Détecte par **regex** (sans LLM) CMS + version, widgets (Planity, Doctolib, TheFork, Zenchef, Shopify, WooCommerce, Stripe, PayPal…), formulaires critiques. |
| 3 | `passive_checks.py` | HTTPS valide, expiration TLS, en-têtes (HSTS, CSP, X-Frame-Options, Referrer-Policy), CMS obsolète, expiration domaine (RDAP), mixed content, TTFB. |
| 4 | `score.py` | `dependency_score` & `fragility_score` (0-100). |
| 5 | `agents.py` | Agents LLM sur le **top N** uniquement. |

Le fetch passif (`fetch.py`) applique robots.txt, le rate-limit et le plafond de taille HTML.

## Scoring (formule)

- **dependency_score** = poids de la catégorie (ex. e-commerce 95, restaurant 70,
  coiffeur 65…) **+** bonus selon les signaux détectés (widget réservation +20,
  paiement +20, e-commerce +25, formulaire checkout/réservation +10). Plafond 100.
- **fragility_score** = somme de pénalités : pas de HTTPS +35, TLS expiré +30 /
  <30 j +15, CSP absente +12, HSTS/X-Frame absents +8, Referrer-Policy +5,
  CMS obsolète +20, domaine <60 j +15, mixed content +15, TTFB lent +10,
  erreur serveur +10. Plafond 100.
- **priority** = `dependency_score × fragility_score / 100` → on cible ce qui est
  à la fois **critique** et **fragile**. Tout est documenté dans `score.py`.

## Agents LLM (économie de tokens)

N'agissent **que sur le top N** par priorité (`config.yaml → llm.top_n`).

- **classifier** (Haiku) — confirme si le site est critique (cas ambigus). Entrée :
  extrait HTML < 2000 caractères. Sortie : JSON strict.
- **auditor** (Sonnet) — mini-audit d'1 page en français depuis le **JSON de
  résultats** (jamais le HTML brut).
- **outreach** (Haiku) — message d'approche de 5 lignes + option de désinscription.
- **reviewer** (Opus) — uniquement avec `--review`.

Mesures d'économie :
- JSON **compact** en entrée et en sortie.
- **Cache SQLite** : clé = `role:domaine:hash(HTML)` → un domaine déjà analysé
  n'est jamais retraité.
- **Plafond de dépense** configurable (`llm.spend_cap_eur`, ex. 2 €) avec **arrêt
  automatique**.
- **Journalisation** des tokens et du coût estimé par étape (table `spend_log`).
- Le HTML complet n'entre **jamais** dans le contexte principal.

Les mêmes rôles existent aussi comme **sous-agents Claude Code** dans
`.claude/agents/` (`classifier.md`, `auditor.md`, `outreach.md`), avec `model:`,
l'outil `Read` seul et un prompt court.

## Base de données (`prospecting.db`)

Tables : `businesses`, `fingerprints`, `checks`, `scores`, `llm_cache`, `spend_log`.

## Cadre légal & déontologie

Prospection **B2B** sur coordonnées professionnelles publiques, avec **option de
désinscription** dans chaque message. Vérifications strictement passives et non
intrusives. Voir `../CAHIER_DES_CHARGES.md`.

## Tests

```bash
python tests/test_pipeline.py   # end-to-end hors ligne sur fixtures HTML locales
```
