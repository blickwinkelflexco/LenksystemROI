# BLICKWINKEL Buchhaltungs-System – Betriebsanleitung

Dieses Dokument ist die Arbeitsanweisung für den automatischen Lauf (Claude-Routine)
und die Referenz dafür, wie das System funktioniert. Es wird bei jedem Lauf befolgt.

## Zweck

1. Keine Rechnung im Posteingang `blickwinkel.pro@gmail.com` (Eingang für
   `info@blickwinkel.pro`) übersehen.
2. Belege so aufbereiten, dass der Buchhalter sie buchen kann (Belegliste-CSV).
3. Offene Positionen als fertige Zahlungsdatei für Raiffeisen INFINITY bereitstellen
   (SEPA pain.001-XML; CSV als Kontrollliste).
4. Fehlende Belege sichtbar machen, BEVOR der Buchhalter am 15. eine Liste schickt.

## Datenmodell

- `config.json` – Firmendaten, Auftraggeber-IBAN (für SEPA-Export), Buchhalter-E-Mail.
- `data/ledger.json` – die einzige Datenquelle ("Ledger"):
  - `belege[]`: ein Eintrag pro Rechnung/Beleg.
    - `status`: `bezahlt` | `offen` (Überweisung nötig) | `klaeren` (Zahlung unklar).
    - `beleg_da`: `ja` (PDF in Gmail vorhanden) | `nein` (PDF fehlt → Buchhalter-Lücke)
      | `pruefen` (PDF vermutlich per Link abrufbar).
    - `zahlung`: optional `{empfaenger, iban, bic, referenz, faellig}` – nur bei
      Rechnungen, die per Überweisung zu zahlen sind. Nur solche Einträge landen
      im SEPA-/Überweisungs-Export.
  - `zahlungen[]`: erkannte Zahlungsbestätigungen (für Abgleich).
  - `ereignisse[]`: z. B. `zahlung_abgelehnt` (Kartenablehnungen).

## Mandanten (strikt getrennt)

- **Blickwinkel_FlexCo** (Standard): Quellen sind blickwinkel.pro@gmail.com,
  blickwinkelpro@gmail.com und info@blickwinkel.pro (Outlook/Microsoft 365).
- **Weissauer_Gut** (Landwirtschaft): eigener Mandant, niemals mit FlexCo
  mischen. Quelle weissauergut@outlook.com ist noch nicht angebunden –
  empfohlene Brücke: Weiterleitung buchhaltungsrelevanter Mails an
  info@blickwinkel.pro mit Betreff-Präfix "[WG]" oder separate Anbindung.
  Belege dieses Mandanten erhalten im Ledger `"mandant": "Weissauer_Gut"`
  und laufen in eigene Auswertungszeilen; Zahlungsexporte nie mandantenübergreifend
  mischen (eigene Datei je Mandant, sobald Weissauer-Posten existieren).

## Automatischer Lauf (täglich)

1. **Posteingänge scannen** (Zeitraum seit letztem `stand`):
   a) **Gmail** wie unten beschrieben;
   b) **Outlook (info@blickwinkel.pro)** über den Microsoft-365-Connector
      (`outlook_email_search`) mit denselben Suchbegriffen – sofern der
      Connector in der Session verbunden ist; andernfalls im Lauf vermerken.
   - Suchquery: `in:inbox newer_than:3d {subject:Rechnung subject:Invoice subject:Zahlung subject:Mahnung subject:fällig subject:Beleg subject:receipt filename:pdf}`
   - Zweite Query ohne Betreff-Filter für bekannte Absender (paddle, stripe,
     payments-noreply@google.com, digistore24, autodoc, hostinger, openai …).
2. **Klassifizieren** je Fund:
   - Rechnung/Beleg → neuer `belege[]`-Eintrag (Belegdatum, Lieferant, Belegnummer,
     Netto/USt/Brutto soweit im Text, Anhang-Dateinamen, Gmail-Thread-ID).
   - Zahlungsbestätigung → `zahlungen[]`; zugehörigen Beleg ggf. auf `bezahlt` setzen.
   - Ablehnung/Mahnung/Zahlungserinnerung → `ereignisse[]`; zugehörigen Beleg auf
     `klaeren` bzw. `offen` setzen und `hinweis` schreiben.
   - Rechnung mit Bankverbindung im Text (IBAN/Verwendungszweck/Zahlungsziel) →
     `status: offen` + `zahlung{}` befüllen → landet automatisch im SEPA-Export.
3. **Beleg-Vollständigkeit**: `beleg_da` setzen. PDF fehlt → `nein` + `hinweis`,
   wo es zu holen ist (Google-Ads-Portal, OpenAI-Portal, Hostinger-Kundenbereich …).
4. **Gmail-Labels setzen** (sobald Gmail-Schreibzugriff wieder autorisiert ist):
   - `Buchhaltung/Beleg` auf jeden erfassten Thread,
   - `Buchhaltung/Offen`, `Buchhaltung/Klären`, `Buchhaltung/Beleg-fehlt` je Status;
   - Labels bei Statuswechsel aktualisieren. Labels ggf. mit `create_label` anlegen.
5. **Odoo-Abgleich** (nur wenn Umgebungsvariable `ODOO_KEY` gesetzt ist):
   `ODOO_URL/DB/LOGIN` aus config.json → Env exportieren, dann
   `python3 buchhaltung/scripts/odoo_abgleich.py` (Standard: letzte 90 Tage).
   Odoo (blickwinkel.odoo.com) enthält die synchronisierten Bankbewegungen
   (Raiffeisen-Konto) und ist die Wahrheit für "wurde bezahlt". NUR_ODOO-Zeilen
   mit relevantem Betrag (> 50 €) auf fehlende Belege prüfen und ggf. als neue
   Ledger-Einträge/Klärfälle aufnehmen; NUR_LEDGER heißt: noch nicht gebucht.
6. **Generieren**: `python3 buchhaltung/scripts/generate.py`
   (baut Belegliste-CSV, offene-posten.csv, Raiffeisen-CSV, SEPA-XML, Dashboard).
7. **Dashboard veröffentlichen**: `buchhaltung/dashboard/index.html` als Artifact
   auf dieselbe URL redeployen (gleicher Dateipfad, gleiches Favicon 📥).
8. **Committen & pushen** auf `claude/invoice-extraction-accounting-si7mr9`
   (Message: `Buchhaltung: Lauf YYYY-MM-DD – n neue Belege`).
9. **Nur bei Handlungsbedarf melden** (neue offene Posten, neue Klärfälle, neue
   fehlende Belege). Sonst still bleiben.

## Übergabe an Buchhalter Gündüz (kein automatischer Versand!)

Michael hat entschieden: **keine automatische Übergabe**. Stattdessen:

- Die operative Excel-Liste `_Auswertungen/Buchhaltungsuebersicht_Mandanten.xlsx`
  im OneDrive (gepflegt vom lokalen System) ist das Übergabedokument. Unsere
  `exports/belegliste-<jahr>.csv` liefert dieselben Zeilen als Zubringer und
  enthält je Beleg einen Link.
- Gündüz lädt fehlende Belege selbst per Link aus der Liste herunter.
  Voraussetzung (einmalig durch Michael): den OneDrive-Ordner
  `Buchhaltung/Blickwinkel_FlexCo` für Gündüz freigeben, damit die Beleglinks
  der Excel-Liste für ihn funktionieren. Gmail-Links in unserer CSV sind nur
  für Michael nutzbar – bei Belegen, die nur als E-Mail-Anhang existieren,
  gehört das PDF daher in die OneDrive-Ablage (lokaler Eingangslauf).
- KEINE Mail-Entwürfe an den Buchhalter erstellen, solange
  `uebergabe_modus` = `xls_mit_links` ist.

## Offene Klärfälle (nicht vergessen)

- Josephinum Research AR 633: 12.205 € laut Michael bezahlt; Differenz 295 €
  zur LBG-OP-Liste (12.500 €) für Gündüz zur Zuordnung dokumentiert
  (siehe ledger.json → ereignisse).

## Bekannte Quellen (Stand Juli 2026)

| Absender | Typ | Besonderheit |
|---|---|---|
| payments-noreply@google.com | Google Ads + Google Cloud | Ads-PDF nur im Portal; GCP-PDF angehängt; Kartenablehnungen beachten |
| help@paddle.com | „Cloud Starter“-Abo 28,80 €/M | Beleg-PDF hinter Link |
| invoice+statements…@stripe.com | Anthropic (Claude) | PDFs angehängt |
| invoice+statements@openrouter.ai | OpenRouter (USD) | PDFs angehängt |
| noreply@tm.openai.com | ChatGPT Business Jahresabo | Rechnung nur im OpenAI-Portal |
| noreply@auto-doc.at / marketplace.autodoc.eu | AUTODOC (SE + Marketplace-Händler) | Marketplace-Rechnungen kommen teils nie – nachfassen |
| support@digistore24.com | Digistore24 (Reseller) | „keine Zahlungsbestätigung“-Mails mit der Erfolgs-Mail abgleichen |
| info@copteruni.com / notify.thinkific.com | Copteruni Kurse | Reverse Charge (UID ATU82873525) |
| team@info.hostinger.com | Hostinger | Rechnung nur im Kundenbereich |

## Kontext: OneDrive-Ablage und Steuerberater (Stand Juli 2026)

Die maßgebliche Belegablage liegt in OneDrive for Business:
`3 BUCHHALTUNG BLICKWINKEL/Buchhaltung/` mit zwei Mandanten
(`Blickwinkel_FlexCo/`, `Weissauer_Gut/`), Jahres-/Monatsordnern,
`_Eingang/`, `_Manuelle_Pruefung/` und `_Auswertungen/`. Dort existiert ein
lokales Windows-System (`_System/`, Prozess in `BUCHHALTUNG_PROZESS.md`) mit
täglichen Läufen (Gmail 07:05, Outlook 07:15, Eingang 07:30/07:45,
Monatsbericht am 1.). Steuerberater ist die LBG (OP-Listen/Evidenzkonto);
sevDesk dient als zusätzliches Belegarchiv (Ein-/Ausgangsrechnungen).

Namenskonvention der Ablage (auch für unsere Hinweise übernehmen):
`Lieferant_JJJJ-MM-TT_Betrag_Währung_Rechnungsnummer_Kategorie.pdf`

**Raiffeisen INFINITY importiert Überweisungen auch als CSV** – offizielles
Format laut Mustervorlage (13 Spalten, Semikolon, `DD.MM.YYYY`, Betrag mit
Komma, Pflicht: Durchführungsdatum, Empfänger Name, Empfänger IBAN, Betrag,
Verwendungszweck, Auftraggeber IBAN). Unsere Exporte
(`exports/Raiffeisen_Infinity_Ueberweisungen.csv` und der Dashboard-Download)
folgen exakt diesem Format; SEPA-XML (pain.001) bleibt als Alternative.
Referenz im OneDrive: `Buchhaltung/_System/raiffeisen_infinity_format.json`.

Arbeitsteilung: Dieses Cloud-System ist die Wache über den Gmail-Posteingang
(erkennen, labeln, Ledger, Dashboard, Zahlungsdateien). Die lokale Automation
verarbeitet PDFs/Scans in die OneDrive-Ablage. Fehlende Belege, die hier
auffallen, werden mit Hinweis auf den Zielordner in der OneDrive-Struktur
gemeldet.

## Wiederherstellung / Handbetrieb

- Alles neu generieren: `python3 buchhaltung/scripts/generate.py`
- Beleg manuell nachtragen: Eintrag in `data/ledger.json` ergänzen, Generator laufen
  lassen, committen.
- Gmail-Zugriff prüfen: Der Gmail-Connector in den claude.ai-Einstellungen muss
  autorisiert sein; ohne ihn kann der Lauf weder scannen noch labeln.
