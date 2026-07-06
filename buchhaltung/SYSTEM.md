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

## Automatischer Lauf (täglich)

1. **Posteingang scannen** (Gmail, nur Zeitraum seit letztem `stand`):
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
5. **Generieren**: `python3 buchhaltung/scripts/generate.py`
   (baut Belegliste-CSV, offene-posten.csv, Raiffeisen-CSV, SEPA-XML, Dashboard).
6. **Dashboard veröffentlichen**: `buchhaltung/dashboard/index.html` als Artifact
   auf dieselbe URL redeployen (gleicher Dateipfad, gleiches Favicon 📥).
7. **Committen & pushen** auf `claude/invoice-extraction-accounting-si7mr9`
   (Message: `Buchhaltung: Lauf YYYY-MM-DD – n neue Belege`).
8. **Nur bei Handlungsbedarf melden** (neue offene Posten, neue Klärfälle, neue
   fehlende Belege). Sonst still bleiben.

## Monatsübergabe an den Buchhalter (am 1. des Monats)

- `exports/belegliste-<jahr>.csv` ist immer aktuell; zusätzlich einen Gmail-Entwurf
  an `buchhalter_email` (aus config.json, sobald eingetragen) erstellen mit der
  Monatsliste und den Hinweisen, welche PDFs wo liegen. Entwurf, nicht senden.

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

## Wiederherstellung / Handbetrieb

- Alles neu generieren: `python3 buchhaltung/scripts/generate.py`
- Beleg manuell nachtragen: Eintrag in `data/ledger.json` ergänzen, Generator laufen
  lassen, committen.
- Gmail-Zugriff prüfen: Der Gmail-Connector in den claude.ai-Einstellungen muss
  autorisiert sein; ohne ihn kann der Lauf weder scannen noch labeln.
