# Setup in ~10 Minuten (nur diese Schritte brauchen dich)

Die App ist fertig programmiert. Für den Live-Betrieb sind nur noch die
folgenden Schritte nötig – alles andere (Code, Build, Tabellen-Anlage,
24h-Sync) läuft automatisch. Die Geheimnisse (Passwort, Schlüssel) hast du
separat im Chat bekommen.

---

## Schritt 1 — Auf Vercel importieren (2 Min)

1. [vercel.com/new](https://vercel.com/new) öffnen → **GitHub-Repo
   `blickwinkelflexco/LenksystemROI`** importieren.
2. Branch: `claude/code-distribution-app-cxj2vi` (oder nach dem Merge `main`).
3. Framework wird automatisch als **Next.js** erkannt → noch **nicht**
   deployen, erst die Umgebungsvariablen (Schritt 3) eintragen.

## Schritt 2 — Datenbank anklicken (2 Min)

1. Im Vercel-Projekt → **Storage → Create Database → Neon (Postgres)**
   (kostenloser Tarif genügt).
2. Vercel verbindet sie automatisch und setzt `POSTGRES_URL` – nichts kopieren.

## Schritt 3 — Google-Zugang (5 Min, einmalig)

Das ist der einzige etwas längere Schritt, weil es **deine** privaten
Google-Zugangsdaten sind, die niemand außer dir erzeugen kann.

1. [console.cloud.google.com](https://console.cloud.google.com/) → neues
   Projekt anlegen.
2. **APIs & Dienste → Bibliothek → „Google Sheets API"** aktivieren.
3. **Anmeldedaten → Anmeldedaten erstellen → Dienstkonto** anlegen.
4. Beim Dienstkonto → **Schlüssel → Hinzufügen → JSON** herunterladen.
5. Die `client_email` aus der JSON kopieren → **das Google Sheet öffnen →
   Teilen → diese E-Mail als Bearbeiter** hinzufügen.

## Schritt 4 — Variablen eintragen & deployen (2 Min)

Im Vercel-Projekt → **Settings → Environment Variables** eintragen
(Werte für die Geheimnisse aus dem Chat):

| Variable | Wert |
|---|---|
| `APP_PASSWORD` | (aus dem Chat) |
| `SESSION_SECRET` | (aus dem Chat) |
| `CRON_SECRET` | (aus dem Chat) |
| `EMPLOYEES` | Die 4 echten Namen, kommagetrennt |
| `GOOGLE_SHEET_ID` | `1NtKoTGyMI77qyID2GBDCCuvpcsBGIjWx30eQ5ARtbOQ` |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | Gesamter Inhalt der JSON-Datei aus Schritt 3 |
| `POSTGRES_URL` | (von Neon automatisch gesetzt) |

Dann **Deploy** klicken. Fertig – App öffnen, anmelden, im Lager-Tab einmal
**Synchronisieren**, und alle Codes sind da.

---

### Warum ich diese 4 Schritte nicht selbst machen kann

- **Google-Zugang**: erfordert einen Login in *dein* Google-Konto und deine
  Zustimmung – aus Sicherheitsgründen kann kein Automat das für dich tun.
- **Vercel-Deploy/DB**: geht in *dein* Hosting-Konto; ein Live-Deploy wird ohne
  deine ausdrückliche Freigabe blockiert (gut so).

Alles Übrige – die komplette App, der Build, die Logik, die Anleitung – ist
bereits erledigt.
