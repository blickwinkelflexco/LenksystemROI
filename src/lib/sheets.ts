import { google, sheets_v4 } from "googleapis";
import {
  SHEET_ID,
  CODES_TAB,
  HISTORY_TAB,
  CODES_FIRST_DATA_ROW,
  CODES_COLUMNS,
} from "./config";

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

function loadCredentials(): { client_email: string; private_key: string } {
  const json = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (json) {
    const parsed = JSON.parse(json);
    return {
      client_email: parsed.client_email,
      private_key: String(parsed.private_key).replace(/\\n/g, "\n"),
    };
  }
  const client_email = process.env.GOOGLE_CLIENT_EMAIL;
  const private_key = process.env.GOOGLE_PRIVATE_KEY;
  if (client_email && private_key) {
    return { client_email, private_key: private_key.replace(/\\n/g, "\n") };
  }
  throw new Error(
    "Google Service-Account nicht konfiguriert. Bitte GOOGLE_SERVICE_ACCOUNT_JSON " +
      "(oder GOOGLE_CLIENT_EMAIL + GOOGLE_PRIVATE_KEY) setzen.",
  );
}

let cachedClient: sheets_v4.Sheets | null = null;

export function sheetsClient(): sheets_v4.Sheets {
  if (cachedClient) return cachedClient;
  const creds = loadCredentials();
  const auth = new google.auth.JWT({
    email: creds.client_email,
    key: creds.private_key,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  cachedClient = google.sheets({ version: "v4", auth });
  return cachedClient;
}

// ---------------------------------------------------------------------------
// Helfer
// ---------------------------------------------------------------------------

/** Spaltennummer (1-basiert) -> A1-Buchstabe (1 -> A, 27 -> AA). */
export function colLetter(n: number): string {
  let s = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function q(tab: string): string {
  // Tab-Namen mit Leerzeichen/Sonderzeichen müssen in einfache Anführungszeichen.
  return `'${tab.replace(/'/g, "''")}'`;
}

// ---------------------------------------------------------------------------
// Lesen
// ---------------------------------------------------------------------------

export interface SheetCodeRow {
  row: number; // 1-basierte Sheet-Zeile
  orderDate: string;
  note: string;
  codeType: string;
  code: string;
  status: string;
  customerName: string;
  email: string;
}

function cell(row: any[], col1Based: number): string {
  const v = row[col1Based - 1];
  if (v === undefined || v === null) return "";
  return String(v).trim();
}

/** Liest alle Code-Zeilen aus dem Codes-Tab. */
export async function readCodes(): Promise<SheetCodeRow[]> {
  const sheets = sheetsClient();
  const lastCol = colLetter(Math.max(...Object.values(CODES_COLUMNS)));
  const range = `${q(CODES_TAB)}!A${CODES_FIRST_DATA_ROW}:${lastCol}`;
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range,
    valueRenderOption: "FORMATTED_VALUE",
    dateTimeRenderOption: "FORMATTED_STRING",
  });

  const values = res.data.values || [];
  const out: SheetCodeRow[] = [];
  values.forEach((raw, i) => {
    const row = CODES_FIRST_DATA_ROW + i;
    const code = cell(raw, CODES_COLUMNS.code);
    const codeType = cell(raw, CODES_COLUMNS.codeType);
    // Zeilen ohne Code und ohne Typ überspringen (Leerzeilen / Abschnitte).
    if (!code && !codeType) return;
    out.push({
      row,
      orderDate: cell(raw, CODES_COLUMNS.orderDate),
      note: cell(raw, CODES_COLUMNS.orderPi),
      codeType,
      code,
      status: cell(raw, CODES_COLUMNS.status),
      customerName: cell(raw, CODES_COLUMNS.customerName),
      email: cell(raw, CODES_COLUMNS.email),
    });
  });
  return out;
}

// ---------------------------------------------------------------------------
// Schreiben (zeilen-genauer Write-Back)
// ---------------------------------------------------------------------------

export interface CellUpdate {
  status?: string;
  customerName?: string;
  email?: string;
  activatedDate?: string;
}

/**
 * Schreibt gezielt einzelne Zellen einer bestehenden Code-Zeile zurück.
 * Nur übergebene Felder werden angefasst — der Rest der Zeile bleibt unberührt.
 */
export async function writeCodeCells(
  row: number,
  update: CellUpdate,
): Promise<void> {
  const data: sheets_v4.Schema$ValueRange[] = [];
  const push = (col: number, value: string) => {
    data.push({
      range: `${q(CODES_TAB)}!${colLetter(col)}${row}`,
      values: [[value]],
    });
  };

  if (update.status !== undefined) push(CODES_COLUMNS.status, update.status);
  if (update.customerName !== undefined)
    push(CODES_COLUMNS.customerName, update.customerName);
  if (update.email !== undefined) push(CODES_COLUMNS.email, update.email);
  if (update.activatedDate !== undefined)
    push(CODES_COLUMNS.activatedDate, update.activatedDate);

  if (data.length === 0) return;

  await sheetsClient().spreadsheets.values.batchUpdate({
    spreadsheetId: SHEET_ID,
    requestBody: { valueInputOption: "USER_ENTERED", data },
  });
}

// ---------------------------------------------------------------------------
// History-Tab
// ---------------------------------------------------------------------------

export interface HistoryRow {
  timestamp: string;
  employee: string;
  customer: string;
  codeType: string;
  code: string;
  sheetRow: number | null;
}

/** Hängt einen Eintrag an den "Code App History"-Tab an. */
export async function appendHistory(entry: HistoryRow): Promise<void> {
  await sheetsClient().spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range: `${q(HISTORY_TAB)}!A:F`,
    valueInputOption: "USER_ENTERED",
    insertDataOption: "INSERT_ROWS",
    requestBody: {
      values: [
        [
          entry.timestamp,
          entry.employee,
          entry.customer,
          entry.codeType,
          entry.code,
          entry.sheetRow ?? "",
        ],
      ],
    },
  });
}
