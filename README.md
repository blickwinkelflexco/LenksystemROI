# BLICKWINKEL Code-App

Eine installierbare, mobile Web-App (PWA), mit der die Mitarbeiter schnell
Aktivierungs-Codes aus dem zentralen Google Sheet an Kunden ausgeben können –
inklusive automatischer Statusänderung im Sheet, Lagerbestand, History und
24-Stunden-Synchronisierung.

> Hinweis: Die frühere README (ROI-Rechner) liegt jetzt unter
> [`docs/ROI-Rechner-README.md`](./docs/ROI-Rechner-README.md).

---

## Was die App kann

- **Code holen** – Mitarbeiter wählt den Code-Typ, gibt den Kundennamen ein,
  bekommt den Code groß angezeigt und **sofort in die Zwischenablage kopiert**
  (plus „Per WhatsApp senden"-Button). Erst nach der Bestätigung wird der Code
  im Sheet auf **„Aktiviert"** gesetzt und mit dem Kundennamen versehen.
- **Keine Doppelvergabe** – ein geholter Code wird sofort reserviert, sodass
  vier Mitarbeiter gleichzeitig arbeiten können, ohne denselben Code zu bekommen.
  Nicht bestätigte Reservierungen verfallen automatisch (Standard: 15 Minuten).
- **Lagerbestand** – zeigt pro Code-Typ, wie viele Codes verfügbar sind
  (inkl. Warnung bei niedrigem Bestand), plus einen **manuellen Sync-Button**.
- **History** – wer hat wann welchen Code für welchen Kunden entnommen.
  Einträge sind **bearbeitbar** (Kundenname) und **reaktivierbar** – beides wird
  ins Sheet zurückgeschrieben (reaktivierter Code landet wieder im Lager).
- **Automatischer Sync alle 24 h** – holt neue Codes des Lieferanten aus dem
  Sheet. Eigene Vergaben werden dagegen **sofort** ins Sheet zurückgeschrieben.

---

## Wie es funktioniert (Architektur)

```
   ┌─────────────┐    24h-Sync + Button      ┌──────────────┐
   │ Google Sheet│  ───────────────────────▶ │  App-Cache   │
   │ "All Codes  │                            │  (Postgres)  │
   │  Sheet"     │  ◀─────────────────────    │              │
   └─────────────┘   sofortiger Write-Back    └──────────────┘
        ▲  (Status, Name, Datum, History)          │
        │                                           ▼
   Lieferant füllt                            Mobile PWA (4 Mitarbeiter)
   Codes nach
```

- Das **Google Sheet bleibt die gemeinsame Datenquelle** mit dem Lieferanten.
- Die App nutzt eine kleine **Postgres-Datenbank als schnellen Zwischenspeicher**
  (für Tempo und die Sperrung gegen Doppelvergabe).
- **App → Sheet:** jede Vergabe/Reaktivierung wird sofort zeilengenau zurück-
  geschrieben.
- **Sheet → App:** der Sync (24 h + Button) zieht neue/geänderte Codes.
- Da im Sheet neue Codes **oben** eingefügt werden (Zeilennummern verschieben
  sich), ist der stabile Schlüssel der **Code-String selbst** – die Zielzeile
  wird beim Zurückschreiben jeweils frisch aufgelöst. Kommt ein Code mehrfach
  vor, gilt defensiv: defekt > aktiviert > verfügbar.

---

## Einrichtung (einmalig)

> Reihenfolge einhalten. Geschätzte Dauer: 20–30 Minuten.

### 1. Google Service-Account anlegen

1. [Google Cloud Console](https://console.cloud.google.com/) öffnen → neues
   Projekt anlegen (z.B. „blickwinkel-code-app").
2. Unter **APIs & Dienste → Bibliothek** die **Google Sheets API** aktivieren.
3. Unter **APIs & Dienste → Anmeldedaten → Anmeldedaten erstellen →
   Dienstkonto** ein Service-Konto erstellen (Name z.B. „code-app").
4. Beim erstellten Dienstkonto → Reiter **Schlüssel → Schlüssel hinzufügen →
   Neuen Schlüssel erstellen → JSON**. Die heruntergeladene JSON-Datei enthält
   `client_email` und `private_key` – die brauchen wir gleich.

### 2. Sheet mit dem Service-Account teilen

1. Die `client_email` aus der JSON kopieren (endet auf
   `...iam.gserviceaccount.com`).
2. Das Google Sheet öffnen → **Teilen** → diese E-Mail als **Bearbeiter**
   hinzufügen. (Ohne diesen Schritt kann die App weder lesen noch schreiben.)

### 3. Datenbank anlegen (Vercel Postgres / Neon)

1. Im Vercel-Projekt → **Storage → Create Database → Postgres** (oder
   [Neon](https://neon.tech) separat). Vercel setzt `POSTGRES_URL` automatisch
   als Umgebungsvariable.
2. Die Tabellen legt die App beim ersten Zugriff selbst an – nichts weiter nötig.

### 4. Umgebungsvariablen setzen

In den **Vercel-Projekteinstellungen → Environment Variables** eintragen
(Vorlage siehe [`.env.example`](./.env.example)):

| Variable | Bedeutung |
|---|---|
| `APP_PASSWORD` | Gemeinsames Passwort für die Mitarbeiter |
| `SESSION_SECRET` | Langer Zufallsstring (`openssl rand -base64 32`) |
| `EMPLOYEES` | Die 4 Namen, kommagetrennt |
| `POSTGRES_URL` | Von Vercel/Neon (oft automatisch gesetzt) |
| `GOOGLE_SHEET_ID` | ID aus der Sheet-URL |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | Inhalt der JSON-Datei (einzeilig) |
| `CRON_SECRET` | Beliebiges Geheimnis für den 24h-Cron |

### 5. Deployen

Bei einem Deploy auf **Vercel** wird der 24-Stunden-Sync über
[`vercel.json`](./vercel.json) automatisch als Cron eingerichtet
(täglich 03:00 UTC → `/api/sync`).

---

## Lokal entwickeln

```bash
npm install
cp .env.example .env.local   # Werte eintragen
npm run dev                  # http://localhost:3000
```

Der erste Aufruf des Lagerbestands ist leer – einmal **synchronisieren**
(Button im Lager-Tab), dann sind alle Codes aus dem Sheet geladen.

---

## Bedienung durch die Mitarbeiter

1. App-Link öffnen → **„Zum Startbildschirm hinzufügen"** (dann startet sie wie
   eine echte App, Vollbild).
2. Namen wählen + gemeinsames Passwort → **Anmelden**.
3. **Code holen** → Typ wählen → Kundenname → *Code holen*. Der Code ist sofort
   in der Zwischenablage → in WhatsApp einfügen und an den Kunden senden.
4. **Bestätigen – Code vergeben** → der Status im Sheet wird auf „Aktiviert"
   gesetzt und der Kunde eingetragen.

---

## Technischer Überblick

| Bereich | Technik |
|---|---|
| Frontend / Backend | Next.js 14 (App Router), PWA |
| Datenbank | Postgres (`pg`) |
| Sheet-Zugriff | `googleapis` mit Service-Account (JWT) |
| Login | Gemeinsames Passwort + Namensauswahl, signiertes Cookie (`jose`) |
| Auto-Sync | Vercel Cron → `/api/sync` |

Wichtige Dateien:

- `src/lib/config.ts` – Spalten-Mapping, Status-Werte, Code-Typen, Mitarbeiter
- `src/lib/sheets.ts` – Lesen/Schreiben im Google Sheet
- `src/lib/sync.ts` – Abgleich Sheet → App (robust gegen verschobene Zeilen)
- `src/lib/codes.ts` – Reservieren, Bestätigen, Freigeben, Reaktivieren
- `src/app/api/*` – API-Endpunkte
- `src/components/*` – die mobilen Screens

Die Spalten-Zuordnung im „All Codes Sheet" (aktueller Stand):
`A` Order Date · `B` Order PI/Notiz · `C` Code-Typ · `D` Code · `E` Status ·
`F` Kundenname · `H` E-Mail · `I` Aktivierungs-Datum. Anpassbar in `config.ts`
bzw. per Umgebungsvariablen.
