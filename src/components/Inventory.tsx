"use client";

import { useCallback, useEffect, useState } from "react";
import { apiGet, apiPost } from "@/lib/client";

interface Item {
  codeType: string;
  available: number;
  reserved: number;
  activated: number;
  defective: number;
}

export default function Inventory({
  showToast,
}: {
  showToast: (m: string) => void;
}) {
  const [items, setItems] = useState<Item[]>([]);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [threshold, setThreshold] = useState(3);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await apiGet<{
        inventory: Item[];
        sync: { lastSyncAt: string | null };
        lowStockThreshold: number;
      }>("/api/inventory");
      setItems(data.inventory);
      setLastSync(data.sync.lastSyncAt);
      setThreshold(data.lowStockThreshold);
      setError(null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function sync() {
    setSyncing(true);
    setError(null);
    try {
      const res = await apiPost<{ result: { added: number; removed: number } }>(
        "/api/sync",
      );
      showToast(
        `Synchronisiert: +${res.result.added} neu, -${res.result.removed} entfernt`,
      );
      await load();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSyncing(false);
    }
  }

  function fmt(iso: string | null) {
    if (!iso) return "noch nie";
    try {
      return new Date(iso).toLocaleString("de-DE");
    } catch {
      return iso;
    }
  }

  const totalAvailable = items.reduce((s, i) => s + i.available, 0);

  return (
    <>
      <div className="card">
        <h2>Lagerbestand</h2>
        <p className="sub">
          {totalAvailable} Codes verfügbar · Letzter Sync: {fmt(lastSync)}
        </p>

        {loading ? (
          <div className="spinner" />
        ) : items.length === 0 ? (
          <p className="muted">
            Noch keine Daten. Bitte synchronisieren, um Codes aus dem Sheet zu
            laden.
          </p>
        ) : (
          items.map((i) => {
            const cls =
              i.available === 0 ? "pill zero" : i.available <= threshold ? "pill low" : "pill";
            return (
              <div className="inv-item" key={i.codeType}>
                <div>
                  <div className="inv-name">{i.codeType}</div>
                  <div className="inv-meta">
                    {i.activated} vergeben · {i.reserved} reserviert · {i.defective} defekt
                  </div>
                </div>
                <div className={cls}>{i.available}</div>
              </div>
            );
          })
        )}

        {error && <div className="error" style={{ marginTop: 12 }}>{error}</div>}
      </div>

      <button className="btn secondary" onClick={sync} disabled={syncing}>
        {syncing ? "Synchronisiere…" : "🔄 Jetzt mit Google Sheet synchronisieren"}
      </button>
      <p className="muted" style={{ textAlign: "center" }}>
        Automatischer Sync alle 24 Stunden.
      </p>
    </>
  );
}
