#!/usr/bin/env python3
"""Ordnet Odoo-Buchungen (exports/odoo-abgleich.csv) Belegen zu.

Belegquellen:
  - data/beleg_index.json  – OneDrive-Dateinamen-Index (Zeilen "Ordner|Datei"),
    Dateinamen tragen Betrag/Datum laut Namenskonvention.
  - data/ledger.json       – E-Mail-Belege (Gmail/Outlook-Links).

Ergebnis: data/buchungen.json – jede Buchung mit beleg{typ, ref} oder beleg=null.
"""
import csv
import json
import re
from datetime import datetime, timedelta
from pathlib import Path

BASE = Path(__file__).resolve().parent.parent
ONEDRIVE_ROOT = r"C:\Users\omen\OneDrive - Blickwinkel.pro\3 BUCHHALTUNG BLICKWINKEL\Buchhaltung"

AMOUNT_PATTERNS = [
    re.compile(r"_(\d+(?:\.\d{1,2}))_EUR", re.I),          # Neu: _42.00_EUR
    re.compile(r"[-_ ](\d+(?:[.,]\d{1,2}))(?:\s*EUR)?\.(?:pdf|jpg)$", re.I),  # Alt: " - 432.0.pdf"
    re.compile(r"(\d+,\d{2})\s"),                            # "81,97 18.02.2026"
]
DATE_PATTERNS = [
    (re.compile(r"(\d{4}-\d{2}-\d{2})"), "%Y-%m-%d"),
    (re.compile(r"(\d{2}\.\d{2}\.\d{4})"), "%d.%m.%Y"),
]


def parse_datei(ordner, datei):
    betrag = None
    for pat in AMOUNT_PATTERNS:
        m = pat.search(datei)
        if m:
            try:
                betrag = round(float(m.group(1).replace(",", ".")), 2)
                break
            except ValueError:
                pass
    datum = None
    for pat, fmt in DATE_PATTERNS:
        m = pat.search(datei)
        if m:
            try:
                datum = datetime.strptime(m.group(1), fmt).date()
                break
            except ValueError:
                pass
    return {"ordner": ordner, "datei": datei, "betrag": betrag, "datum": datum}


def lade_index():
    p = BASE / "data" / "beleg_index.json"
    if not p.exists():
        return []
    eintraege = []
    for zeile in json.loads(p.read_text(encoding="utf-8")):
        if "|" not in zeile or zeile.startswith("FEHLER|"):
            continue
        ordner, datei = zeile.split("|", 1)
        eintraege.append(parse_datei(ordner.strip(), datei.strip()))
    return eintraege


def lade_buchungen():
    p = BASE / "exports" / "odoo-abgleich.csv"
    if not p.exists():
        return []
    rows = []
    with open(p, encoding="utf-8-sig") as f:
        for r in csv.DictReader(f, delimiter=";"):
            if r["Abschnitt"] not in ("MATCH", "NUR_ODOO"):
                continue
            rows.append({
                "datum": r["Datum"],
                "partner": r["Partner/Lieferant"],
                "text": r["Text"],
                "betrag": round(float(r["Betrag"]), 2),
                "ledger_id": r["Beleg-ID"] or None,
                "odoo": r["Odoo-Buchung"],
            })
    # Dedupe: Verbindlichkeits- und Bankzeile derselben Zahlung (gleicher Tag,
    # gleicher Betrag) nur einmal zählen; Zeile mit Ledger-Match bevorzugen.
    rows.sort(key=lambda r: (r["datum"], abs(r["betrag"]), r["ledger_id"] is None))
    gesehen, dedupe = set(), []
    for r in rows:
        k = (r["datum"], abs(r["betrag"]))
        if k in gesehen:
            continue
        gesehen.add(k)
        dedupe.append(r)
    return dedupe


def main():
    index = lade_index()
    buchungen = lade_buchungen()
    ledger = json.loads((BASE / "data" / "ledger.json").read_text(encoding="utf-8"))
    ledger_by_id = {b["id"]: b for b in ledger["belege"]}

    zugeordnet = 0
    for b in buchungen:
        b["beleg"] = None
        # 1) Ledger-Match aus dem Odoo-Abgleich (E-Mail-Beleg)
        if b["ledger_id"] and b["ledger_id"] in ledger_by_id:
            lb = ledger_by_id[b["ledger_id"]]
            link = lb.get("link") or (
                f"https://mail.google.com/mail/u/0/#all/{lb['gmail_thread']}"
                if lb.get("gmail_thread") else None)
            b["beleg"] = {"typ": "email", "ref": link, "label": lb["lieferant"]}
            zugeordnet += 1
            continue
        # 2) OneDrive-Dateiname: Betrag exakt, Datum ±14 Tage (falls im Namen)
        b_datum = datetime.strptime(b["datum"], "%Y-%m-%d").date()
        kandidaten = [e for e in index if e["betrag"] is not None
                      and 0.01 < e["betrag"] <= 50000
                      and abs(e["betrag"] - abs(b["betrag"])) <= 0.01]
        passend = [e for e in kandidaten if e["datum"] is None
                   or abs((e["datum"] - b_datum).days) <= 14]
        if passend:
            # Saubere Monatsordner vor _Manuelle_Pruefung, dann Datumsnähe
            e = sorted(passend, key=lambda x: ("_Manuelle_Pruefung" in x["ordner"],
                       x["datum"] is None,
                       abs((x["datum"] - b_datum).days) if x["datum"] else 99))[0]
            b["beleg"] = {"typ": "onedrive",
                          "ref": f"{ONEDRIVE_ROOT}\\{e['ordner']}\\{e['datei']}".replace("/", "\\"),
                          "label": e["datei"]}
            zugeordnet += 1

    out = {"stand": ledger["stand"], "buchungen": buchungen,
           "index_dateien": len(index), "zugeordnet": zugeordnet}
    (BASE / "data" / "buchungen.json").write_text(
        json.dumps(out, ensure_ascii=False, default=str), encoding="utf-8")
    print(f"{zugeordnet} von {len(buchungen)} Buchungen mit Beleg verknüpft "
          f"(Index: {len(index)} Dateien) -> data/buchungen.json")


if __name__ == "__main__":
    main()
