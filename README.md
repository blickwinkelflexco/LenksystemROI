# BLICKWINKEL Werkzeuge

## 📥 Buchhaltungs-System (`buchhaltung/`)

Automatische Rechnungs-Erfassung aus dem Posteingang `blickwinkel.pro@gmail.com`:
Beleg-Ledger für den Buchhalter, Dashboard mit offenen Positionen und Export für
Raiffeisen INFINITY (SEPA pain.001-XML + CSV). Betrieb und Datenmodell sind in
[`buchhaltung/SYSTEM.md`](buchhaltung/SYSTEM.md) beschrieben; alle Exporte werden
mit `python3 buchhaltung/scripts/generate.py` aus `buchhaltung/data/ledger.json`
erzeugt.

---

# 🚜 ROI-Rechner BLICKWINKEL | Digital Farming Efficiency Analyzer

![Version](https://img.shields.io/badge/Version-14.0-emerald)
![Tech Stack](https://img.shields.io/badge/Stack-React%20%7C%20Tailwind%20%7C%20TypeScript-blue)
![UX](https://img.shields.io/badge/Design-Premium%20Glassmorphism-black)

**BLICKWINKEL ROI-Rechner** ist ein hocheffizientes Analyse-Tool für moderne Landwirtschaftsbetriebe. Es ermöglicht Landwirten, das wirtschaftliche Potential von RTK-Lenksystemen (wie dem Sveaverken F100) präzise zu kalkulieren und zu visualisieren.

---

## 🎯 Kern-Nutzen
In der modernen Landwirtschaft ist Präzision kein Luxus, sondern eine Rendite-Entscheidung. Dieses Tool berechnet basierend auf individuellen Schlagstrukturen, Kulturen und Arbeitsschritten den exakten **Return on Investment (ROI)**.

### 💎 Hauptfeatures
- **Präzisions-Modellierung:** Vergleich zwischen EGNOS (+/- 20cm) und RTK (+/- 2.5cm) Genauigkeit.
- **Multidimensionale Ersparnis:** 
    - **Betriebsmittel:** Reduktion von Überlappungen bei Saatgut, Dünger und Pflanzenschutz.
    - **Energie:** Diesel-Einsparung durch effizientere Spurplanung und RTK-Spurtreue.
    - **Arbeitszeit:** Kalkulation des Zeitgewinns inklusive 35% Wendevorteil durch Skip-Line-Strategien.
- **Boden- & Umweltschutz:** Visualisierung der CO2-Kompensation (Buchen-Äquivalent) und der geschützten Bodenfläche vor Zweit-Verdichtung.
- **Gesundheits-Metrik:** Einzigartige Berechnung der kognitiven Entlastung (Herzschläge-Ersparnis p.a.) basierend auf HRV-Studien.

---

## 📊 Analyse Cockpit & Logik
Das Tool bietet ein interaktives Dashboard mit tiefen Einblicken:
- **Breakeven-Visualisierung:** Dynamische Fortschrittsanzeige bis zur Amortisation der Hardware.
- **Transparente Berechnungslogik:** Jede Ergebniskachel enthält einen direkten Hinweis auf die zugrundeliegende mathematische/wissenschaftliche Logik (z.B. UBA/IPCC Faktoren, DLG-Richtwerte).
- **Performance Summary:** Ein kompakter High-Level-Überblick über die Rentabilität der Investition.

---

## 🛠 Technischer Stack
- **Frontend:** React 19 (Modern Hooks, useMemo für Echtzeit-Kalkulationen)
- **Styling:** Tailwind CSS mit Custom Glassmorphism-Theming
- **Typografie:** Inter (Variable Font) für maximale Lesbarkeit
- **Architektur:** Komponentenbasierte Struktur (ComparisonChart, InterpretationText, etc.)
- **Responsivität:** Volloptimiert für Desktop, Tablet und mobile Endgeräte (Feldeinsatz-bereit).

---

## 🚀 Installation & Entwicklung

1. **Repository klonen:**
   ```bash
   git clone https://github.com/dein-username/roi-rechner-blickwinkel.git
