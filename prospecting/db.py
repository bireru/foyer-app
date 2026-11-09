"""Schéma SQLite + accès. Dédoublonnage par domaine. Cache LLM par (domaine, hash HTML)."""
from __future__ import annotations

import json
import sqlite3
import time
from pathlib import Path
from typing import Any

SCHEMA = """
CREATE TABLE IF NOT EXISTS businesses (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT NOT NULL,
    category    TEXT,
    arrondissement TEXT,
    address     TEXT,
    website     TEXT,                 -- URL normalisée http(s)://domaine
    domain      TEXT UNIQUE,          -- clé de dédup
    source      TEXT,                 -- osm / google
    osm_id      TEXT,
    created_at  REAL
);

CREATE TABLE IF NOT EXISTS fingerprints (
    domain      TEXT PRIMARY KEY,
    html_hash   TEXT,
    cms         TEXT,
    cms_version TEXT,
    widgets     TEXT,                 -- JSON liste
    forms       TEXT,                 -- JSON liste
    updated_at  REAL
);

CREATE TABLE IF NOT EXISTS checks (
    domain          TEXT PRIMARY KEY,
    html_hash       TEXT,
    https_valid     INTEGER,
    tls_days_left   INTEGER,
    hsts            INTEGER,
    csp             INTEGER,
    x_frame_options INTEGER,
    referrer_policy INTEGER,
    cms_outdated    INTEGER,
    domain_days_left INTEGER,
    mixed_content   INTEGER,
    ttfb_ms         INTEGER,
    status_code     INTEGER,
    notes           TEXT,             -- JSON détails
    updated_at      REAL
);

CREATE TABLE IF NOT EXISTS scores (
    domain           TEXT PRIMARY KEY,
    dependency_score INTEGER,
    fragility_score  INTEGER,
    priority         INTEGER,
    reasons          TEXT,            -- JSON
    updated_at       REAL
);

CREATE TABLE IF NOT EXISTS llm_cache (
    cache_key   TEXT PRIMARY KEY,     -- role:domain:html_hash
    role        TEXT,
    domain      TEXT,
    html_hash   TEXT,
    result      TEXT,                 -- JSON ou texte
    updated_at  REAL
);

CREATE TABLE IF NOT EXISTS spend_log (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id      TEXT,
    step        TEXT,
    model       TEXT,
    in_tokens   INTEGER,
    out_tokens  INTEGER,
    cost_eur    REAL,
    created_at  REAL
);
"""


class DB:
    def __init__(self, path: str):
        self.path = path
        self.conn = sqlite3.connect(path)
        self.conn.row_factory = sqlite3.Row
        self.conn.executescript(SCHEMA)
        self.conn.commit()

    # ---------- businesses ----------
    def upsert_business(self, b: dict) -> bool:
        """Insère si le domaine est nouveau. Renvoie True si inséré (dédup sinon)."""
        try:
            self.conn.execute(
                """INSERT INTO businesses
                   (name, category, arrondissement, address, website, domain, source, osm_id, created_at)
                   VALUES (?,?,?,?,?,?,?,?,?)""",
                (b.get("name"), b.get("category"), b.get("arrondissement"), b.get("address"),
                 b.get("website"), b.get("domain"), b.get("source"), b.get("osm_id"), time.time()),
            )
            self.conn.commit()
            return True
        except sqlite3.IntegrityError:
            return False  # domaine déjà présent

    def businesses_with_site(self, limit: int | None = None) -> list[sqlite3.Row]:
        q = "SELECT * FROM businesses WHERE domain IS NOT NULL ORDER BY id"
        if limit:
            q += f" LIMIT {int(limit)}"
        return self.conn.execute(q).fetchall()

    # ---------- generic cache helpers ----------
    def get_fingerprint(self, domain: str) -> sqlite3.Row | None:
        return self.conn.execute("SELECT * FROM fingerprints WHERE domain=?", (domain,)).fetchone()

    def save_fingerprint(self, domain: str, html_hash: str, cms, cms_version, widgets, forms):
        self.conn.execute(
            """INSERT INTO fingerprints(domain, html_hash, cms, cms_version, widgets, forms, updated_at)
               VALUES(?,?,?,?,?,?,?)
               ON CONFLICT(domain) DO UPDATE SET
                 html_hash=excluded.html_hash, cms=excluded.cms, cms_version=excluded.cms_version,
                 widgets=excluded.widgets, forms=excluded.forms, updated_at=excluded.updated_at""",
            (domain, html_hash, cms, cms_version, json.dumps(widgets, ensure_ascii=False),
             json.dumps(forms, ensure_ascii=False), time.time()),
        )
        self.conn.commit()

    def get_check(self, domain: str) -> sqlite3.Row | None:
        return self.conn.execute("SELECT * FROM checks WHERE domain=?", (domain,)).fetchone()

    def save_check(self, domain: str, data: dict):
        cols = ["html_hash", "https_valid", "tls_days_left", "hsts", "csp", "x_frame_options",
                "referrer_policy", "cms_outdated", "domain_days_left", "mixed_content",
                "ttfb_ms", "status_code", "notes"]
        vals = [data.get(c) for c in cols]
        vals_json = json.dumps(data.get("notes") or {}, ensure_ascii=False)
        self.conn.execute(
            f"""INSERT INTO checks(domain, {','.join(cols)}, updated_at)
                VALUES({','.join('?' for _ in range(len(cols)+2))})
                ON CONFLICT(domain) DO UPDATE SET
                {','.join(f'{c}=excluded.{c}' for c in cols)}, updated_at=excluded.updated_at""",
            (domain, *vals[:-1], vals_json, time.time()),
        )
        self.conn.commit()

    def save_score(self, domain: str, dependency: int, fragility: int, priority: int, reasons: dict):
        self.conn.execute(
            """INSERT INTO scores(domain, dependency_score, fragility_score, priority, reasons, updated_at)
               VALUES(?,?,?,?,?,?)
               ON CONFLICT(domain) DO UPDATE SET
                 dependency_score=excluded.dependency_score, fragility_score=excluded.fragility_score,
                 priority=excluded.priority, reasons=excluded.reasons, updated_at=excluded.updated_at""",
            (domain, dependency, fragility, priority, json.dumps(reasons, ensure_ascii=False), time.time()),
        )
        self.conn.commit()

    # ---------- LLM cache ----------
    def get_llm_cache(self, cache_key: str) -> str | None:
        row = self.conn.execute("SELECT result FROM llm_cache WHERE cache_key=?", (cache_key,)).fetchone()
        return row["result"] if row else None

    def save_llm_cache(self, cache_key: str, role: str, domain: str, html_hash: str, result: str):
        self.conn.execute(
            """INSERT INTO llm_cache(cache_key, role, domain, html_hash, result, updated_at)
               VALUES(?,?,?,?,?,?)
               ON CONFLICT(cache_key) DO UPDATE SET result=excluded.result, updated_at=excluded.updated_at""",
            (cache_key, role, domain, html_hash, result, time.time()),
        )
        self.conn.commit()

    # ---------- spend ----------
    def log_spend(self, run_id, step, model, in_tok, out_tok, cost_eur):
        self.conn.execute(
            """INSERT INTO spend_log(run_id, step, model, in_tokens, out_tokens, cost_eur, created_at)
               VALUES(?,?,?,?,?,?,?)""",
            (run_id, step, model, in_tok, out_tok, cost_eur, time.time()),
        )
        self.conn.commit()

    def total_spend(self, run_id: str) -> float:
        row = self.conn.execute("SELECT COALESCE(SUM(cost_eur),0) s FROM spend_log WHERE run_id=?", (run_id,)).fetchone()
        return float(row["s"])

    # ---------- ranking ----------
    def ranking(self) -> list[sqlite3.Row]:
        return self.conn.execute(
            """SELECT b.name, b.category, b.arrondissement, b.address, b.website, b.domain,
                      s.dependency_score, s.fragility_score, s.priority, s.reasons,
                      f.cms, f.cms_version, f.widgets, c.notes
               FROM scores s
               JOIN businesses b ON b.domain = s.domain
               LEFT JOIN fingerprints f ON f.domain = s.domain
               LEFT JOIN checks c ON c.domain = s.domain
               ORDER BY s.priority DESC"""
        ).fetchall()

    def close(self):
        self.conn.close()
