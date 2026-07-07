#!/usr/bin/env python3
"""Generiert aus data/ledger.json alle Buchhaltungs-Exporte und das Dashboard.

Aufruf:  python3 buchhaltung/scripts/generate.py

Erzeugt:
  exports/belegliste-<jahr>.csv        Belegliste für den Buchhalter (Excel, ;-getrennt)
  exports/offene-posten.csv            Offene Positionen + Klärfälle
  exports/raiffeisen-ueberweisungen.csv  Überweisungsliste (CSV-Fallback)
  exports/sepa-pain001.xml             SEPA-Überweisungsdatei für Raiffeisen INFINITY
  dashboard/index.html                 Dashboard (aus dashboard/template.html)
"""
import json
import html
from datetime import date, timedelta
from pathlib import Path

BASE = Path(__file__).resolve().parent.parent
DATA = BASE / "data" / "ledger.json"
CONFIG = BASE / "config.json"
EXPORTS = BASE / "exports"
DASHBOARD = BASE / "dashboard"

STATUS_TEXT = {
    "bezahlt": "bezahlt",
    "offen": "offen",
    "klaeren": "klären",
    "beleg_fehlt": "Beleg fehlt",
}


def de_num(value):
    """1234.5 -> '1.234,50' (deutsches Zahlenformat)."""
    if value is None:
        return ""
    return f"{value:,.2f}".replace(",", "@").replace(".", ",").replace("@", ".")


def de_date(iso):
    """'2026-07-05' -> '05.07.2026'."""
    if not iso:
        return ""
    y, m, d = iso[:10].split("-")
    return f"{d}.{m}.{y}"


def gmail_link(thread_id):
    return f"https://mail.google.com/mail/u/0/#all/{thread_id}" if thread_id else ""


def load():
    ledger = json.loads(DATA.read_text(encoding="utf-8"))
    config = json.loads(CONFIG.read_text(encoding="utf-8"))
    return ledger, config


def write_csv(path, header, rows):
    lines = [";".join(header)]
    for row in rows:
        cells = []
        for cell in row:
            cell = "" if cell is None else str(cell)
            if any(c in cell for c in ';"\n'):
                cell = '"' + cell.replace('"', '""') + '"'
            cells.append(cell)
        lines.append(";".join(cells))
    path.write_text("﻿" + "\r\n".join(lines) + "\r\n", encoding="utf-8")
    print(f"  {path.relative_to(BASE)}  ({len(rows)} Zeilen)")


def belegliste(ledger, config):
    header = [
        "Mandant", "Belegdatum", "Lieferant", "Belegnummer", "Beschreibung",
        "Netto", "USt-Satz", "USt", "Brutto", "Währung",
        "Zahlart", "Status", "Hinweis", "Beleg (PDF)", "E-Mail-Link",
    ]
    rows = []
    for b in sorted(ledger["belege"], key=lambda x: x["belegdatum"]):
        rows.append([
            b.get("mandant", "Blickwinkel FlexCo"),
            de_date(b["belegdatum"]), b["lieferant"], b.get("belegnr", ""),
            b.get("beschreibung", ""), de_num(b.get("netto")),
            f"{b['ust_satz']} %" if b.get("ust_satz") is not None else "",
            de_num(b.get("ust")), de_num(b.get("brutto")), b.get("waehrung", "EUR"),
            b.get("zahlart", ""), STATUS_TEXT.get(b["status"], b["status"]),
            b.get("hinweis", ""), ", ".join(b.get("anhang", [])),
            gmail_link(b.get("gmail_thread")),
        ])
    write_csv(EXPORTS / f"belegliste-{config['jahr']}.csv", header, rows)


def offene_posten(ledger):
    offen = [b for b in ledger["belege"] if b["status"] in ("offen", "klaeren", "beleg_fehlt")]
    header = ["Fällig", "Belegdatum", "Lieferant", "Belegnummer", "Beschreibung",
              "Brutto", "Währung", "Status", "Was ist zu tun", "E-Mail-Link"]
    rows = []
    for b in sorted(offen, key=lambda x: x.get("zahlung", {}).get("faellig") or x["belegdatum"]):
        z = b.get("zahlung") or {}
        rows.append([
            de_date(z.get("faellig")), de_date(b["belegdatum"]), b["lieferant"],
            b.get("belegnr", ""), b.get("beschreibung", ""), de_num(b.get("brutto")),
            b.get("waehrung", "EUR"), STATUS_TEXT.get(b["status"], b["status"]),
            b.get("hinweis", ""), gmail_link(b.get("gmail_thread")),
        ])
    write_csv(EXPORTS / "offene-posten.csv", header, rows)
    return offen


def zahlbare_posten(ledger):
    """Offene Posten mit Bankverbindung -> per Überweisung zahlbar."""
    return [
        b for b in ledger["belege"]
        if b["status"] == "offen" and b.get("brutto")
        and (b.get("zahlung") or {}).get("iban")
    ]


def raiffeisen_csv(posten, config):
    """Offizielles Raiffeisen-INFINITY-Importformat für Überweisungen
    (13 Spalten laut CSV-Mustervorlage; Semikolon, DD.MM.YYYY, Betrag mit Komma)."""
    header = ["Durchführungsdatum", "Empfänger Name", "Empfänger Adresse", "Empfänger Ort",
              "Empfänger IBAN", "Empfänger BIC", "Betrag in EUR",
              "Zahlungsreferenz/Verwendungszweck", "Auftraggeberinformation",
              "Geschäftsvorfallcode", "Dringlichkeit", "Auftraggeber IBAN",
              "Abweichender Auftraggeber"]
    exec_date = de_date((date.today() + timedelta(days=1)).isoformat())
    rows = []
    for b in posten:
        z = b["zahlung"]
        zweck = (z.get("referenz") or f"{b['lieferant']} {b.get('belegnr', '')}".strip())[:140]
        rows.append([
            exec_date, z.get("empfaenger", b["lieferant"])[:70],
            z.get("adresse", "")[:35], z.get("ort", "")[:35],
            z["iban"].replace(" ", ""), z.get("bic", ""),
            f"{b['brutto']:.2f}".replace(".", ","), zweck,
            "", "", "", config.get("auftraggeber_iban", ""), "",
        ])
    write_csv(EXPORTS / "Raiffeisen_Infinity_Ueberweisungen.csv", header, rows)


def x(s):
    return html.escape(str(s), quote=True)


def sepa_xml(posten, config):
    """pain.001.001.03 – von Raiffeisen INFINITY direkt importierbar."""
    path = EXPORTS / "sepa-pain001.xml"
    iban = (config.get("auftraggeber_iban") or "").replace(" ", "")
    name = config.get("auftraggeber_name", "")
    if not iban or not posten:
        if path.exists():
            path.unlink()
        reason = "keine Auftraggeber-IBAN in config.json" if not iban else "keine zahlbaren offenen Posten"
        print(f"  sepa-pain001.xml übersprungen ({reason})")
        return
    today = date.today()
    exec_date = (today + timedelta(days=1)).isoformat()
    msg_id = f"BLICKWINKEL-{today.isoformat()}"
    total = sum(b["brutto"] for b in posten)
    txs = []
    for i, b in enumerate(posten, 1):
        z = b["zahlung"]
        zweck = z.get("referenz") or f"{b['lieferant']} {b.get('belegnr', '')}".strip()
        bic = f"<BIC>{x(z['bic'])}</BIC>" if z.get("bic") else ""
        agent = f"<CdtrAgt><FinInstnId>{bic}</FinInstnId></CdtrAgt>" if bic else ""
        txs.append(
            f"<CdtTrfTxInf><PmtId><EndToEndId>{x(b.get('belegnr') or f'OP-{i}')}</EndToEndId></PmtId>"
            f"<Amt><InstdAmt Ccy=\"{x(b.get('waehrung', 'EUR'))}\">{b['brutto']:.2f}</InstdAmt></Amt>"
            f"{agent}<Cdtr><Nm>{x(z.get('empfaenger', b['lieferant']))}</Nm></Cdtr>"
            f"<CdtrAcct><Id><IBAN>{x(z['iban'].replace(' ', ''))}</IBAN></Id></CdtrAcct>"
            f"<RmtInf><Ustrd>{x(zweck[:140])}</Ustrd></RmtInf></CdtTrfTxInf>"
        )
    xml = (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pain.001.001.03" '
        'xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">'
        f"<CstmrCdtTrfInitn><GrpHdr><MsgId>{x(msg_id)}</MsgId>"
        f"<CreDtTm>{today.isoformat()}T08:00:00</CreDtTm>"
        f"<NbOfTxs>{len(posten)}</NbOfTxs><CtrlSum>{total:.2f}</CtrlSum>"
        f"<InitgPty><Nm>{x(name)}</Nm></InitgPty></GrpHdr>"
        f"<PmtInf><PmtInfId>{x(msg_id)}-1</PmtInfId><PmtMtd>TRF</PmtMtd>"
        f"<NbOfTxs>{len(posten)}</NbOfTxs><CtrlSum>{total:.2f}</CtrlSum>"
        "<PmtTpInf><SvcLvl><Cd>SEPA</Cd></SvcLvl></PmtTpInf>"
        f"<ReqdExctnDt>{exec_date}</ReqdExctnDt>"
        f"<Dbtr><Nm>{x(name)}</Nm></Dbtr>"
        f"<DbtrAcct><Id><IBAN>{x(iban)}</IBAN></Id></DbtrAcct>"
        "<DbtrAgt><FinInstnId/></DbtrAgt><ChrgBr>SLEV</ChrgBr>"
        + "".join(txs) + "</PmtInf></CstmrCdtTrfInitn></Document>"
    )
    path.write_text(xml, encoding="utf-8")
    print(f"  {path.relative_to(BASE)}  ({len(posten)} Überweisungen, {total:.2f})")


def dashboard(ledger, config):
    template = (DASHBOARD / "template.html").read_text(encoding="utf-8")
    payload = {"ledger": ledger, "config": {
        "auftraggeber_iban": config.get("auftraggeber_iban", ""),
        "auftraggeber_name": config.get("auftraggeber_name", ""),
        "jahr": config["jahr"],
    }}
    out = template.replace("/*__DATA__*/null", json.dumps(payload, ensure_ascii=False))
    (DASHBOARD / "index.html").write_text(out, encoding="utf-8")
    print(f"  dashboard/index.html  ({len(ledger['belege'])} Belege)")


def main():
    ledger, config = load()
    EXPORTS.mkdir(exist_ok=True)
    print("Erzeuge Exporte:")
    belegliste(ledger, config)
    offene_posten(ledger)
    posten = zahlbare_posten(ledger)
    raiffeisen_csv(posten, config)
    sepa_xml(posten, config)
    dashboard(ledger, config)


if __name__ == "__main__":
    main()
