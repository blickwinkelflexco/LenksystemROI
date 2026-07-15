"use client";

import { useCallback, useEffect, useState } from "react";
import { apiGet, apiPatch, copyToClipboard } from "@/lib/client";

interface Entry {
  id: number;
  createdAt: string;
  employee: string;
  customer: string;
  codeType: string;
  code: string;
  action: string;
  active: boolean;
}

export default function History({
  showToast,
}: {
  showToast: (m: string) => void;
}) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<number | null>(null);
  const [editValue, setEditValue] = useState("");
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await apiGet<{ history: Entry[] }>("/api/history");
      setEntries(data.history);
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

  async function saveName(id: number) {
    if (!editValue.trim()) return;
    setBusyId(id);
    try {
      await apiPatch(`/api/history/${id}`, { customer: editValue.trim() });
      setEditing(null);
      showToast("Name aktualisiert");
      await load();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  }

  async function reactivate(id: number) {
    if (!confirm("Code wirklich reaktivieren? Er wird im Sheet wieder auf 'Zu aktivierend' gesetzt und kehrt ins Lager zurueck.")) {
      return;
    }
    setBusyId(id);
    try {
      await apiPatch(`/api/history/${id}`, { action: "reactivate" });
      showToast("Code reaktiviert – zurück im Lager");
      await load();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  }

  async function copyCode(code: string) {
    const ok = await copyToClipboard(code);
    if (ok) showToast("Code kopiert");
  }

  function fmt(iso: string) {
    try {
      return new Date(iso).toLocaleString("de-DE", {
        day: "2-digit",
        month: "2-digit",
        year: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return iso;
    }
  }

  return (
    <div className="card">
      <h2>History</h2>
      <p className="sub">Alle ausgegebenen Codes. Antippen zum Kopieren.</p>

      {loading ? (
        <div className="spinner" />
      ) : entries.length === 0 ? (
        <p className="muted">Noch keine Codes ausgegeben.</p>
      ) : (
        entries.map((e) => (
          <div className="hist-item" key={e.id}>
            <div className="hist-top">
              {editing === e.id ? (
                <input
                  type="text"
                  value={editValue}
                  onChange={(ev) => setEditValue(ev.target.value)}
                  style={{ marginRight: 8 }}
                  autoFocus
                />
              ) : (
                <span className="hist-customer">{e.customer || "—"}</span>
              )}
              <span className={"badge" + (e.active ? "" : " inactive")}>
                {e.active ? e.codeType : "reaktiviert"}
              </span>
            </div>

            <div
              className="hist-code"
              onClick={() => copyCode(e.code)}
              title="Antippen zum Kopieren"
            >
              {e.code}
            </div>
            <div className="hist-meta">
              {fmt(e.createdAt)} · {e.employee}
            </div>

            <div className="hist-actions">
              {editing === e.id ? (
                <>
                  <button
                    className="btn small"
                    onClick={() => saveName(e.id)}
                    disabled={busyId === e.id}
                  >
                    Speichern
                  </button>
                  <button
                    className="btn small ghost"
                    onClick={() => setEditing(null)}
                  >
                    Abbrechen
                  </button>
                </>
              ) : (
                <>
                  <button
                    className="btn small secondary"
                    onClick={() => {
                      setEditing(e.id);
                      setEditValue(e.customer);
                    }}
                  >
                    Name ändern
                  </button>
                  {e.active && (
                    <button
                      className="btn small danger"
                      onClick={() => reactivate(e.id)}
                      disabled={busyId === e.id}
                    >
                      Reaktivieren
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        ))
      )}

      {error && <div className="error" style={{ marginTop: 12 }}>{error}</div>}
    </div>
  );
}
