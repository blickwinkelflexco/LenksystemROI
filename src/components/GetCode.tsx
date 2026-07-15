"use client";

import { useCallback, useEffect, useState } from "react";
import { apiGet, apiPost, copyToClipboard } from "@/lib/client";

interface InventoryItem {
  codeType: string;
  available: number;
}
interface Reserved {
  id: number;
  code: string;
  codeType: string;
}

export default function GetCode({
  showToast,
}: {
  showToast: (m: string) => void;
}) {
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [codeType, setCodeType] = useState("");
  const [customer, setCustomer] = useState("");
  const [reserved, setReserved] = useState<Reserved | null>(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadInventory = useCallback(async () => {
    try {
      const data = await apiGet<{ inventory: InventoryItem[] }>("/api/inventory");
      setInventory(data.inventory);
      setCodeType((prev) => prev || data.inventory.find((i) => i.available > 0)?.codeType || "");
    } catch (err: any) {
      setError(err.message);
    }
  }, []);

  useEffect(() => {
    loadInventory();
  }, [loadInventory]);

  const availableFor = (t: string) =>
    inventory.find((i) => i.codeType === t)?.available ?? 0;

  async function holen() {
    setError(null);
    if (!codeType) return setError("Bitte Code-Typ wählen.");
    if (!customer.trim()) return setError("Bitte Kundennamen eingeben.");
    setBusy(true);
    try {
      const r = await apiPost<Reserved>("/api/codes/reserve", { codeType });
      setReserved(r);
      // Sofort in die Zwischenablage kopieren (im selben Nutzer-Tap).
      const ok = await copyToClipboard(r.code);
      setCopied(ok);
      if (ok) showToast("Code in Zwischenablage kopiert");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function copyAgain() {
    if (!reserved) return;
    const ok = await copyToClipboard(reserved.code);
    setCopied(ok);
    if (ok) showToast("Code kopiert");
  }

  function whatsapp() {
    if (!reserved) return;
    const text = encodeURIComponent(reserved.code);
    window.open(`https://wa.me/?text=${text}`, "_blank");
  }

  async function bestaetigen() {
    if (!reserved) return;
    setBusy(true);
    setError(null);
    try {
      await apiPost("/api/codes/confirm", {
        id: reserved.id,
        customer: customer.trim(),
      });
      showToast("Code vergeben ✓");
      reset();
      loadInventory();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function abbrechen() {
    if (!reserved) return;
    setBusy(true);
    try {
      await apiPost("/api/codes/release", { id: reserved.id });
    } catch {
      /* egal */
    } finally {
      reset();
      loadInventory();
      setBusy(false);
    }
  }

  function reset() {
    setReserved(null);
    setCopied(false);
    setCustomer("");
  }

  // Ansicht 2: Code wurde geholt
  if (reserved) {
    return (
      <div className="card">
        <h2>Code für {customer}</h2>
        <p className="sub">{reserved.codeType}</p>

        <div className="code-box">
          <div className="label">Aktivierungs-Code</div>
          <div className="code">{reserved.code}</div>
        </div>
        {copied ? (
          <div className="copied-hint">✓ In Zwischenablage kopiert</div>
        ) : (
          <button className="btn secondary" style={{ marginTop: 10 }} onClick={copyAgain}>
            📋 Code kopieren
          </button>
        )}

        <div style={{ height: 14 }} />
        <button className="btn" onClick={whatsapp} style={{ background: "#25D366" }}>
          Per WhatsApp senden
        </button>

        {error && <div className="error" style={{ margin: "14px 0" }}>{error}</div>}

        <div style={{ height: 18 }} />
        <p className="muted" style={{ marginBottom: 10 }}>
          Wenn der Code an den Kunden gesendet wurde, bitte bestätigen. Erst dann
          wird er im Sheet auf „Aktiviert" gesetzt.
        </p>
        <button className="btn" onClick={bestaetigen} disabled={busy}>
          {busy ? "…" : "Bestätigen – Code vergeben"}
        </button>
        <button className="btn ghost" onClick={abbrechen} disabled={busy}>
          Abbrechen (Code zurücklegen)
        </button>
      </div>
    );
  }

  // Ansicht 1: Auswahl
  const totalAvailable = inventory.reduce((s, i) => s + i.available, 0);
  return (
    <div className="card">
      <h2>Code holen</h2>
      <p className="sub">
        Typ wählen, Kundennamen eingeben – der Code wird angezeigt und sofort
        kopiert.
      </p>

      <div className="field">
        <label>Code-Typ</label>
        <select value={codeType} onChange={(e) => setCodeType(e.target.value)}>
          {inventory.map((i) => (
            <option key={i.codeType} value={i.codeType} disabled={i.available === 0}>
              {i.codeType} — {i.available} verfügbar
            </option>
          ))}
        </select>
      </div>

      <div className="field">
        <label>Kundenname</label>
        <input
          type="text"
          value={customer}
          onChange={(e) => setCustomer(e.target.value)}
          placeholder="z.B. Kreinecker"
          autoComplete="off"
        />
      </div>

      {codeType && availableFor(codeType) === 0 && (
        <div className="notice" style={{ marginBottom: 12 }}>
          Für diesen Typ sind aktuell keine Codes verfügbar.
        </div>
      )}
      {error && <div className="error" style={{ marginBottom: 12 }}>{error}</div>}

      <button
        className="btn"
        onClick={holen}
        disabled={busy || !codeType || availableFor(codeType) === 0}
      >
        {busy ? "…" : "Code holen"}
      </button>

      <p className="muted" style={{ textAlign: "center", marginTop: 14 }}>
        Insgesamt {totalAvailable} Codes verfügbar
      </p>
    </div>
  );
}
