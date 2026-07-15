"use client";

import { useState } from "react";
import { apiPost } from "@/lib/client";

export default function Login({
  employees,
  onLoggedIn,
}: {
  employees: string[];
  onLoggedIn: (name: string) => void;
}) {
  const [employee, setEmployee] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!employee) {
      setError("Bitte Namen auswählen.");
      return;
    }
    setBusy(true);
    try {
      const res = await apiPost<{ employee: string }>("/api/auth/login", {
        employee,
        password,
      });
      onLoggedIn(res.employee);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="center">
      <div style={{ width: "100%", maxWidth: 380 }}>
        <div className="brand-logo">
          <div className="mark">🛞</div>
          <div className="name">BLICKWINKEL Codes</div>
          <div className="tag">Anmeldung für Mitarbeiter</div>
        </div>
        <form className="card" onSubmit={submit}>
          <div className="field">
            <label>Mitarbeiter</label>
            <select
              value={employee}
              onChange={(e) => setEmployee(e.target.value)}
            >
              <option value="">– bitte wählen –</option>
              {employees.map((e) => (
                <option key={e} value={e}>
                  {e}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Passwort</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Gemeinsames Passwort"
              autoComplete="current-password"
            />
          </div>
          {error && <div className="error" style={{ marginBottom: 12 }}>{error}</div>}
          <button className="btn" disabled={busy}>
            {busy ? "Anmelden…" : "Anmelden"}
          </button>
        </form>
      </div>
    </div>
  );
}
