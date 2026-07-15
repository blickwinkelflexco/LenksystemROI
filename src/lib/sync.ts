import { query, ensureSchema } from "./db";
import { readCodes, SheetCodeRow } from "./sheets";
import { sheetStatusToInternal, CodeStatus } from "./config";

/**
 * Synchronisiert die App-Datenbank aus dem Google Sheet (Sheet -> App).
 *
 * Besonderheit dieses Sheets: neue Codes werden OBEN eingefügt, wodurch sich
 * die Zeilennummern verschieben. Deshalb ist der stabile Schlüssel der
 * Code-String selbst (Spalte D), nicht die Zeilennummer. Die Zeilennummer wird
 * nur als Hinweis gespeichert; beim Zurückschreiben wird die Zeile jeweils
 * frisch anhand des Codes aufgelöst.
 *
 * Kommt ein Code im Sheet mehrfach mit unterschiedlichem Status vor, gilt die
 * defensive Rangfolge:  defekt > aktiviert > verfügbar
 * (ein irgendwo als defekt markierter Code wird nie ausgegeben).
 */

const STATUS_RANK: Record<CodeStatus, number> = {
  defective: 3,
  activated: 2,
  available: 1,
  reserved: 0, // nur App-intern, kommt aus dem Sheet nie
};

interface Aggregated {
  code: string;
  codeType: string;
  status: CodeStatus; // aus dem Sheet abgeleitet
  sheetRow: number; // bevorzugt die "verfügbare" Zeile
  customerName: string;
  email: string;
  orderDate: string;
  note: string;
}

function aggregate(rows: SheetCodeRow[]): Map<string, Aggregated> {
  const map = new Map<string, Aggregated>();
  for (const r of rows) {
    if (!r.code) continue;
    const internal = sheetStatusToInternal(r.status);
    const existing = map.get(r.code);
    if (!existing) {
      map.set(r.code, {
        code: r.code,
        codeType: r.codeType,
        status: internal,
        sheetRow: r.row,
        customerName: r.customerName,
        email: r.email,
        orderDate: r.orderDate,
        note: r.note,
      });
      continue;
    }
    // Höheren Rang (defekt>aktiviert>verfügbar) übernehmen.
    if (STATUS_RANK[internal] > STATUS_RANK[existing.status]) {
      existing.status = internal;
    }
    // Zeilen-Hinweis bevorzugt auf eine verfügbare Zeile setzen.
    if (internal === "available") existing.sheetRow = r.row;
    if (r.codeType && !existing.codeType) existing.codeType = r.codeType;
    if (r.customerName && !existing.customerName)
      existing.customerName = r.customerName;
    if (r.email && !existing.email) existing.email = r.email;
  }
  return map;
}

export interface SyncResult {
  added: number;
  updated: number;
  removed: number;
  total: number;
  reservedKept: number;
}

export async function runSync(): Promise<SyncResult> {
  await ensureSchema();
  const sheetRows = await readCodes();
  const agg = aggregate(sheetRows);

  // Bestehende App-Zustände laden, um Reservierungen/Aktivierungen zu schützen.
  const existing = await query<{
    code: string;
    status: string;
    reserved_by: string | null;
  }>(`SELECT code, status, reserved_by FROM codes`);
  const existingByCode = new Map(existing.rows.map((r) => [r.code, r]));

  let added = 0;
  let updated = 0;
  let reservedKept = 0;

  for (const a of agg.values()) {
    const prev = existingByCode.get(a.code);
    let status: CodeStatus = a.status;

    if (prev) {
      // Aktive Reservierung schützen, solange das Sheet den Code noch als
      // "verfügbar" führt (Reservierung steht nicht im Sheet).
      if (prev.status === "reserved" && a.status === "available") {
        status = "reserved";
        reservedKept++;
      }
    }

    if (prev) {
      await query(
        `UPDATE codes
           SET code_type = $2,
               status = $3,
               sheet_row = $4,
               order_date = $5,
               note = $6,
               customer_name = CASE WHEN $3 = 'available' THEN customer_name ELSE $7 END,
               email = CASE WHEN $3 = 'available' THEN email ELSE $8 END,
               updated_at = now()
         WHERE code = $1`,
        [
          a.code,
          a.codeType,
          status,
          a.sheetRow,
          a.orderDate,
          a.note,
          a.customerName,
          a.email,
        ],
      );
      updated++;
    } else {
      await query(
        `INSERT INTO codes (sheet_row, code_type, code, status, customer_name, email, order_date, note)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         ON CONFLICT (code) DO NOTHING`,
        [
          a.sheetRow,
          a.codeType,
          a.code,
          status,
          a.customerName,
          a.email,
          a.orderDate,
          a.note,
        ],
      );
      added++;
    }
  }

  // Codes, die im Sheet nicht mehr existieren: nur entfernen, wenn sie nicht
  // reserviert sind (verwaiste, gelöschte Zeilen).
  const sheetCodes = Array.from(agg.keys());
  let removed = 0;
  if (sheetCodes.length > 0) {
    const res = await query(
      `DELETE FROM codes
        WHERE status <> 'reserved'
          AND NOT (code = ANY($1::text[]))`,
      [sheetCodes],
    );
    removed = res.rowCount;
  }

  const total = agg.size;
  await query(
    `UPDATE sync_state
        SET last_sync_at = now(),
            last_result = $1
      WHERE id = 1`,
    [`+${added} / ~${updated} / -${removed}`],
  );

  return { added, updated, removed, total, reservedKept };
}

export async function getLastSync(): Promise<{
  lastSyncAt: string | null;
  lastResult: string | null;
}> {
  await ensureSchema();
  const res = await query<{ last_sync_at: string | null; last_result: string | null }>(
    `SELECT last_sync_at, last_result FROM sync_state WHERE id = 1`,
  );
  const row = res.rows[0];
  return {
    lastSyncAt: row?.last_sync_at ?? null,
    lastResult: row?.last_result ?? null,
  };
}

/**
 * Fügt für den Code die passende Sheet-Zeile frisch auf (robust gegen
 * verschobene Zeilennummern). Optional wird ein bestimmter Sheet-Status
 * bevorzugt (z.B. eine noch verfügbare Zeile beim Aktivieren).
 */
export async function locateSheetRow(
  code: string,
  prefer?: CodeStatus,
): Promise<SheetCodeRow | null> {
  const rows = await readCodes();
  const matches = rows.filter((r) => r.code === code);
  if (matches.length === 0) return null;
  if (prefer) {
    const preferred = matches.find(
      (r) => sheetStatusToInternal(r.status) === prefer,
    );
    if (preferred) return preferred;
  }
  return matches[0];
}
