#!/usr/bin/env python3
"""Gleicht Odoo-Buchungszeilen mit data/ledger.json ab.

Zugang über Umgebungsvariablen (Zugangsdaten NIEMALS ins Repo committen):
  ODOO_URL   z. B. https://blickwinkel.odoo.com
  ODOO_DB    Datenbankname
  ODOO_LOGIN Benutzer-E-Mail
  ODOO_KEY   API-Schlüssel

Aufruf:  python3 buchhaltung/scripts/odoo_abgleich.py [--seit JJJJ-MM-TT]

Ergebnis: exports/odoo-abgleich.csv mit drei Abschnitten:
  MATCH     – Odoo-Zeile passt zu einem Ledger-Beleg (Betrag ±0,01, Datum ±7 Tage)
  NUR_ODOO  – Buchung in Odoo ohne Beleg im Ledger (= Beleg fehlt / übersehen)
  NUR_LEDGER– Beleg im Ledger ohne Odoo-Buchung (= noch nicht gebucht)
"""
import http.client
import json
import os
import ssl
import sys
import urllib.parse
import xmlrpc.client
from datetime import date, datetime, timedelta
from pathlib import Path

BASE = Path(__file__).resolve().parent.parent


class _ProxyTransport(xmlrpc.client.SafeTransport):
    """HTTPS über einen HTTP-Proxy (CONNECT-Tunnel), da xmlrpc.client
    die Umgebungsvariablen HTTPS_PROXY/https_proxy nicht auswertet."""

    def __init__(self, proxy_host, proxy_port, **kw):
        super().__init__(**kw)
        self._proxy = (proxy_host, proxy_port)

    def make_connection(self, host):
        if self._connection and host == self._connection[0]:
            return self._connection[1]
        chost, self._extra_headers, _ = self.get_host_info(host)
        ctx = self.context or ssl.create_default_context()
        conn = http.client.HTTPSConnection(*self._proxy, context=ctx)
        conn.set_tunnel(chost, 443)
        self._connection = host, conn
        return conn


def _server_proxy(endpoint):
    proxy = os.environ.get("HTTPS_PROXY") or os.environ.get("https_proxy")
    if proxy:
        p = urllib.parse.urlparse(proxy)
        return xmlrpc.client.ServerProxy(
            endpoint, transport=_ProxyTransport(p.hostname, p.port))
    return xmlrpc.client.ServerProxy(endpoint)


def verbinden():
    url = os.environ.get("ODOO_URL", "").rstrip("/")
    db = os.environ.get("ODOO_DB", "")
    login = os.environ.get("ODOO_LOGIN", "")
    key = os.environ.get("ODOO_KEY", "")
    if not all([url, db, login, key]):
        sys.exit("Fehlende Zugangsdaten: ODOO_URL, ODOO_DB, ODOO_LOGIN, ODOO_KEY setzen.")
    common = _server_proxy(f"{url}/xmlrpc/2/common")
    uid = common.authenticate(db, login, key, {})
    if not uid:
        sys.exit("Odoo-Anmeldung fehlgeschlagen (Login/Key prüfen).")
    models = _server_proxy(f"{url}/xmlrpc/2/object")
    print(f"Verbunden mit {url} (db={db}, uid={uid})")
    return db, uid, key, models


def odoo_zeilen(db, uid, key, models, seit):
    """Buchungszeilen auf Aufwands-/Bankkonten seit Stichtag."""
    domain = [
        ["date", ">=", seit],
        ["parent_state", "=", "posted"],
        ["account_id.account_type", "in",
         ["expense", "expense_depreciation", "expense_direct_cost",
          "asset_current", "liability_payable"]],
    ]
    felder = ["date", "name", "ref", "partner_id", "debit", "credit",
              "account_id", "journal_id", "move_name"]
    zeilen = models.execute_kw(db, uid, key, "account.move.line", "search_read",
                               [domain], {"fields": felder, "limit": 2000})
    print(f"{len(zeilen)} Buchungszeilen seit {seit} geladen.")
    return zeilen


def konten_uebersicht(db, uid, key, models):
    journale = models.execute_kw(db, uid, key, "account.journal", "search_read",
                                 [[["type", "in", ["bank", "cash", "credit"]]]],
                                 {"fields": ["name", "type"]})
    print("Konten/Journale:", ", ".join(f"{j['name']} ({j['type']})" for j in journale))
    return journale


def abgleich(zeilen, belege):
    offen_ledger = {b["id"]: b for b in belege}
    matches, nur_odoo = [], []
    for z in zeilen:
        betrag = z["debit"] or z["credit"]
        z_datum = datetime.strptime(z["date"], "%Y-%m-%d").date()
        partner = (z["partner_id"] or [None, ""])[1]
        treffer = None
        for b in offen_ledger.values():
            if b.get("brutto") is None or b.get("waehrung") != "EUR":
                continue
            b_datum = datetime.strptime(b["belegdatum"], "%Y-%m-%d").date()
            if abs(b["brutto"] - betrag) <= 0.01 and abs((b_datum - z_datum).days) <= 7:
                treffer = b
                break
            # Namens-Match als zweite Chance bei Datumsnähe
            name_hit = b["lieferant"].split()[0].lower() in (partner + " " + (z["name"] or "")).lower()
            if name_hit and abs(b["brutto"] - betrag) <= 0.01:
                treffer = b
                break
        if treffer:
            matches.append((z, treffer))
            offen_ledger.pop(treffer["id"], None)
        else:
            nur_odoo.append(z)
    return matches, nur_odoo, list(offen_ledger.values())


def main():
    seit = sys.argv[sys.argv.index("--seit") + 1] if "--seit" in sys.argv else \
        (date.today() - timedelta(days=90)).isoformat()
    ledger = json.loads((BASE / "data" / "ledger.json").read_text(encoding="utf-8"))
    db, uid, key, models = verbinden()
    konten_uebersicht(db, uid, key, models)
    zeilen = odoo_zeilen(db, uid, key, models, seit)
    matches, nur_odoo, nur_ledger = abgleich(zeilen, ledger["belege"])

    out = BASE / "exports" / "odoo-abgleich.csv"
    lines = ["Abschnitt;Datum;Partner/Lieferant;Text;Betrag;Beleg-ID;Odoo-Buchung"]
    for z, b in matches:
        lines.append(f"MATCH;{z['date']};{(z['partner_id'] or ['',''])[1]};{z['name'] or ''};"
                     f"{(z['debit'] or z['credit']):.2f};{b['id']};{z['move_name']}")
    for z in nur_odoo:
        lines.append(f"NUR_ODOO;{z['date']};{(z['partner_id'] or ['',''])[1]};{z['name'] or ''};"
                     f"{(z['debit'] or z['credit']):.2f};;{z['move_name']}")
    for b in nur_ledger:
        if b.get("brutto") is not None:
            lines.append(f"NUR_LEDGER;{b['belegdatum']};{b['lieferant']};{b.get('beschreibung','')};"
                         f"{b['brutto']:.2f};{b['id']};")
    out.write_text("﻿" + "\r\n".join(lines) + "\r\n", encoding="utf-8")
    print(f"\nErgebnis: {len(matches)} Matches, {len(nur_odoo)} nur in Odoo, "
          f"{len(nur_ledger)} nur im Ledger -> {out.relative_to(BASE)}")


if __name__ == "__main__":
    main()
