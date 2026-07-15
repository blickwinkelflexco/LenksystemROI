import { query, withTransaction, ensureSchema } from "./db";
import { writeCodeCells, appendHistory } from "./sheets";
import { locateSheetRow } from "./sync";
import {
  SHEET_STATUS,
  RESERVATION_TIMEOUT_MIN,
  KNOWN_CODE_TYPES,
} from "./config";

function todayStr(): string {
  // Lokales Datum im deutschen Format, z.B. 15.07.2026.
  return new Date().toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function nowIso(): string {
  return new Date().toLocaleString("de-DE");
}

// ---------------------------------------------------------------------------
// Lagerbestand
// ---------------------------------------------------------------------------

export interface InventoryItem {
  codeType: string;
  available: number;
  reserved: number;
  activated: number;
  defective: number;
}

export async function getInventory(): Promise<InventoryItem[]> {
  await ensureSchema();
  await releaseExpiredReservations();
  const res = await query<{
    code_type: string;
    available: string;
    reserved: string;
    activated: string;
    defective: string;
  }>(`
    SELECT code_type,
           COUNT(*) FILTER (WHERE status = 'available')  AS available,
           COUNT(*) FILTER (WHERE status = 'reserved')   AS reserved,
           COUNT(*) FILTER (WHERE status = 'activated')  AS activated,
           COUNT(*) FILTER (WHERE status = 'defective')  AS defective
      FROM codes
     GROUP BY code_type
  `);

  const byType = new Map(
    res.rows.map((r) => [
      r.code_type,
      {
        codeType: r.code_type,
        available: Number(r.available),
        reserved: Number(r.reserved),
        activated: Number(r.activated),
        defective: Number(r.defective),
      },
    ]),
  );

  // Bekannte Typen zuerst (feste Reihenfolge), dann unbekannte alphabetisch.
  const ordered: InventoryItem[] = [];
  for (const t of KNOWN_CODE_TYPES) {
    if (byType.has(t)) {
      ordered.push(byType.get(t)!);
      byType.delete(t);
    }
  }
  for (const item of Array.from(byType.values()).sort((a, b) =>
    a.codeType.localeCompare(b.codeType),
  )) {
    if (item.codeType) ordered.push(item);
  }
  return ordered;
}

async function releaseExpiredReservations(): Promise<void> {
  await query(
    `UPDATE codes
        SET status = 'available', reserved_by = NULL, reserved_at = NULL
      WHERE status = 'reserved'
        AND reserved_at < now() - ($1 || ' minutes')::interval`,
    [String(RESERVATION_TIMEOUT_MIN)],
  );
}

// ---------------------------------------------------------------------------
// Reservieren
// ---------------------------------------------------------------------------

export interface ReservedCode {
  id: number;
  code: string;
  codeType: string;
}

/**
 * Reserviert atomar den nächsten freien Code des Typs für den Mitarbeiter.
 * FOR UPDATE SKIP LOCKED verhindert, dass zwei Mitarbeiter denselben Code
 * bekommen.
 */
export async function reserveCode(
  codeType: string,
  employee: string,
): Promise<ReservedCode> {
  await ensureSchema();
  await releaseExpiredReservations();

  return withTransaction(async (client) => {
    const sel = await client.query(
      `SELECT id, code, code_type
         FROM codes
        WHERE code_type = $1 AND status = 'available'
        ORDER BY id
        LIMIT 1
        FOR UPDATE SKIP LOCKED`,
      [codeType],
    );
    if (sel.rowCount === 0) {
      throw new AppError("Kein verfügbarer Code für diesen Typ.", 409);
    }
    const row = sel.rows[0];
    await client.query(
      `UPDATE codes
          SET status = 'reserved', reserved_by = $2, reserved_at = now(), updated_at = now()
        WHERE id = $1`,
      [row.id, employee],
    );
    return { id: row.id, code: row.code, codeType: row.code_type };
  });
}

// ---------------------------------------------------------------------------
// Bestätigen (Code vergeben) -> Write-Back ins Sheet
// ---------------------------------------------------------------------------

export async function confirmCode(
  id: number,
  employee: string,
  customer: string,
): Promise<void> {
  await ensureSchema();
  if (!customer.trim()) throw new AppError("Kundenname fehlt.", 400);

  // Code prüfen & sperren.
  const codeRow = await withTransaction(async (client) => {
    const sel = await client.query(
      `SELECT id, code, code_type, status FROM codes WHERE id = $1 FOR UPDATE`,
      [id],
    );
    if (sel.rowCount === 0) throw new AppError("Code nicht gefunden.", 404);
    const r = sel.rows[0];
    if (r.status !== "reserved") {
      throw new AppError(
        "Dieser Code ist nicht mehr reserviert (evtl. abgelaufen). Bitte neu holen.",
        409,
      );
    }
    await client.query(
      `UPDATE codes
          SET status = 'activated', customer_name = $2, activated_by = $3,
              activated_at = now(), reserved_by = NULL, reserved_at = NULL, updated_at = now()
        WHERE id = $1`,
      [id, customer.trim(), employee],
    );
    return r;
  });

  // Write-Back ins Sheet (außerhalb der DB-Transaktion; Zeile live auflösen).
  const sheetRow = await locateSheetRow(codeRow.code, "available");
  if (sheetRow) {
    await writeCodeCells(sheetRow.row, {
      status: SHEET_STATUS.activated,
      customerName: customer.trim(),
      activatedDate: todayStr(),
    });
    await query(`UPDATE codes SET sheet_row = $2 WHERE id = $1`, [id, sheetRow.row]);
  }

  // History (Sheet-Tab + App-DB).
  await appendHistory({
    timestamp: nowIso(),
    employee,
    customer: customer.trim(),
    codeType: codeRow.code_type,
    code: codeRow.code,
    sheetRow: sheetRow?.row ?? null,
  });
  await query(
    `INSERT INTO history (employee, customer, code_type, code, sheet_row, action)
     VALUES ($1,$2,$3,$4,$5,'issued')`,
    [employee, customer.trim(), codeRow.code_type, codeRow.code, sheetRow?.row ?? null],
  );
}

// ---------------------------------------------------------------------------
// Freigeben (Abbrechen)
// ---------------------------------------------------------------------------

export async function releaseCode(id: number): Promise<void> {
  await ensureSchema();
  await query(
    `UPDATE codes
        SET status = 'available', reserved_by = NULL, reserved_at = NULL, updated_at = now()
      WHERE id = $1 AND status = 'reserved'`,
    [id],
  );
}

// ---------------------------------------------------------------------------
// History lesen / bearbeiten / reaktivieren
// ---------------------------------------------------------------------------

export interface HistoryEntry {
  id: number;
  createdAt: string;
  employee: string;
  customer: string;
  codeType: string;
  code: string;
  sheetRow: number | null;
  action: string;
  active: boolean;
}

export async function getHistory(limit = 200): Promise<HistoryEntry[]> {
  await ensureSchema();
  const res = await query<any>(
    `SELECT id, created_at, employee, customer, code_type, code, sheet_row, action, active
       FROM history
      ORDER BY created_at DESC
      LIMIT $1`,
    [limit],
  );
  return res.rows.map((r) => ({
    id: r.id,
    createdAt: r.created_at,
    employee: r.employee,
    customer: r.customer,
    codeType: r.code_type,
    code: r.code,
    sheetRow: r.sheet_row,
    action: r.action,
    active: r.active,
  }));
}

/** Ändert den Kundennamen eines History-Eintrags und schreibt ihn ins Sheet zurück. */
export async function updateHistoryCustomer(
  id: number,
  customer: string,
): Promise<void> {
  await ensureSchema();
  if (!customer.trim()) throw new AppError("Kundenname fehlt.", 400);

  const res = await query<{ code: string }>(
    `SELECT code FROM history WHERE id = $1`,
    [id],
  );
  if (res.rowCount === 0) throw new AppError("Eintrag nicht gefunden.", 404);
  const code = res.rows[0].code;

  await query(`UPDATE history SET customer = $2 WHERE id = $1`, [id, customer.trim()]);
  await query(`UPDATE codes SET customer_name = $2 WHERE code = $1`, [
    code,
    customer.trim(),
  ]);

  const sheetRow = await locateSheetRow(code, "activated");
  if (sheetRow) {
    await writeCodeCells(sheetRow.row, { customerName: customer.trim() });
  }
}

/**
 * Reaktiviert einen ausgegebenen Code: Status zurück auf "Zu aktivierend",
 * Name/Datum im Sheet geleert, Code kehrt in den Lagerbestand zurück.
 */
export async function reactivateHistory(id: number): Promise<void> {
  await ensureSchema();
  const res = await query<{ code: string; active: boolean }>(
    `SELECT code, active FROM history WHERE id = $1`,
    [id],
  );
  if (res.rowCount === 0) throw new AppError("Eintrag nicht gefunden.", 404);
  if (!res.rows[0].active)
    throw new AppError("Dieser Eintrag wurde bereits reaktiviert.", 409);
  const code = res.rows[0].code;

  // Sheet zurücksetzen.
  const sheetRow = await locateSheetRow(code, "activated");
  if (sheetRow) {
    await writeCodeCells(sheetRow.row, {
      status: SHEET_STATUS.available,
      customerName: "",
      activatedDate: "",
    });
  }

  // App-DB: Code zurück in den Bestand.
  await query(
    `UPDATE codes
        SET status = 'available', customer_name = NULL, email = NULL,
            activated_by = NULL, activated_at = NULL, updated_at = now()
      WHERE code = $1`,
    [code],
  );

  // History-Eintrag als reaktiviert markieren.
  await query(
    `UPDATE history SET active = false, action = 'reactivated' WHERE id = $1`,
    [id],
  );
}

// ---------------------------------------------------------------------------
// Fehler mit HTTP-Status
// ---------------------------------------------------------------------------

export class AppError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}
