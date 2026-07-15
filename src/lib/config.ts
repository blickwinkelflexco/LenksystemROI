/**
 * Zentrale Konfiguration der App.
 *
 * Fast alles hier ist über Umgebungsvariablen überschreibbar, damit nach dem
 * Deploy nichts im Code angefasst werden muss. Die Standardwerte spiegeln den
 * aktuellen Aufbau des Google Sheets "All Codes Sheet" wider.
 */

// ---------------------------------------------------------------------------
// Google Sheet
// ---------------------------------------------------------------------------

/** ID des Google Sheets (aus der URL). */
export const SHEET_ID =
  process.env.GOOGLE_SHEET_ID || "1NtKoTGyMI77qyID2GBDCCuvpcsBGIjWx30eQ5ARtbOQ";

/** Name des Tabs mit den Codes. */
export const CODES_TAB = process.env.GOOGLE_CODES_TAB || "All Codes Sheet";

/** Name des Tabs für die Entnahme-History. */
export const HISTORY_TAB = process.env.GOOGLE_HISTORY_TAB || "Code App History";

/** Erste Zeile (1-basiert), ab der echte Code-Daten stehen. Zeile 1 = Header. */
export const CODES_FIRST_DATA_ROW = Number(
  process.env.GOOGLE_CODES_FIRST_ROW || 3,
);

/**
 * Spalten-Mapping im Codes-Tab (1-basierte Spaltennummern -> A=1, B=2, ...).
 * Namen werden in der Praxis in Spalte F ("Activated SN") gepflegt.
 */
export const CODES_COLUMNS = {
  orderDate: 1, // A
  orderPi: 2, // B
  codeType: 3, // C
  code: 4, // D
  status: 5, // E
  customerName: 6, // F
  member: 7, // G
  email: 8, // H
  activatedDate: 9, // I
} as const;

// ---------------------------------------------------------------------------
// Status-Werte, exakt wie im Sheet
// ---------------------------------------------------------------------------

export const SHEET_STATUS = {
  available: "Zu aktivierend",
  activated: "Aktiviert",
  defective: "funktioniert nicht",
} as const;

/** Interne App-Status. "reserved" existiert nur in der DB, nie im Sheet. */
export type CodeStatus = "available" | "reserved" | "activated" | "defective";

/** Sheet-Status-Text -> interner Status. */
export function sheetStatusToInternal(raw: string | null | undefined): CodeStatus {
  const v = (raw || "").trim().toLowerCase();
  if (v === SHEET_STATUS.activated.toLowerCase()) return "activated";
  if (v === SHEET_STATUS.defective.toLowerCase()) return "defective";
  if (v === SHEET_STATUS.available.toLowerCase()) return "available";
  // Leere / unbekannte Status behandeln wir konservativ als "nicht verfügbar".
  return v === "" ? "defective" : "defective";
}

// ---------------------------------------------------------------------------
// Code-Typen (Anzeigereihenfolge in der App)
// ---------------------------------------------------------------------------

/** Bekannte Code-Typen. Unbekannte Typen aus dem Sheet werden dynamisch ergänzt. */
export const KNOWN_CODE_TYPES = [
  "Advanced Code",
  "Easy Switch Code",
  "CANBUS Code",
  "Hydraulik-Code",
  "AUX-N",
  "TC-SC",
  "TC-GEO",
  "FMS Advanced Code",
] as const;

// ---------------------------------------------------------------------------
// Mitarbeiter (Namensauswahl nach gemeinsamem Passwort)
// ---------------------------------------------------------------------------

/** Kommagetrennte Liste in EMPLOYEES überschreibt diese Standardwerte. */
export const EMPLOYEES: string[] = (
  process.env.EMPLOYEES || "Mitarbeiter 1,Mitarbeiter 2,Mitarbeiter 3,Mitarbeiter 4"
)
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

// ---------------------------------------------------------------------------
// Verhalten
// ---------------------------------------------------------------------------

/** Reservierung verfällt automatisch nach dieser Zeit (Minuten). */
export const RESERVATION_TIMEOUT_MIN = Number(
  process.env.RESERVATION_TIMEOUT_MIN || 15,
);

/** Warnschwelle für niedrigen Lagerbestand pro Typ. */
export const LOW_STOCK_THRESHOLD = Number(process.env.LOW_STOCK_THRESHOLD || 3);
