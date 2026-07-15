"use client";

import { useCallback, useEffect, useState } from "react";
import { apiGet, apiPost } from "@/lib/client";
import Login from "./Login";
import GetCode from "./GetCode";
import Inventory from "./Inventory";
import History from "./History";
import Toast from "./Toast";

type Tab = "get" | "inventory" | "history";

export default function AppRoot() {
  const [loading, setLoading] = useState(true);
  const [employee, setEmployee] = useState<string | null>(null);
  const [employees, setEmployees] = useState<string[]>([]);
  const [tab, setTab] = useState<Tab>("get");
  const [toast, setToast] = useState<string | null>(null);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 2200);
  }, []);

  const loadSession = useCallback(async () => {
    try {
      const data = await apiGet<{ employee: string | null; employees: string[] }>(
        "/api/session",
      );
      setEmployee(data.employee);
      setEmployees(data.employees || []);
    } catch {
      setEmployee(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSession();
  }, [loadSession]);

  async function logout() {
    await apiPost("/api/auth/logout");
    setEmployee(null);
  }

  if (loading) {
    return (
      <div className="center">
        <div className="spinner" />
      </div>
    );
  }

  if (!employee) {
    return (
      <Login
        employees={employees}
        onLoggedIn={(name) => {
          setEmployee(name);
          setTab("get");
        }}
      />
    );
  }

  return (
    <div className="app">
      <div className="topbar">
        <div>
          <div className="brand">BLICKWINKEL · Codes</div>
          <div className="who">Angemeldet: {employee}</div>
        </div>
        <button className="logout" onClick={logout}>
          Abmelden
        </button>
      </div>

      <div className="content">
        {tab === "get" && <GetCode showToast={showToast} />}
        {tab === "inventory" && <Inventory showToast={showToast} />}
        {tab === "history" && <History showToast={showToast} />}
      </div>

      <nav className="tabbar">
        <button
          className={tab === "get" ? "active" : ""}
          onClick={() => setTab("get")}
        >
          <span className="ico">🎫</span>
          Code holen
        </button>
        <button
          className={tab === "inventory" ? "active" : ""}
          onClick={() => setTab("inventory")}
        >
          <span className="ico">📦</span>
          Lager
        </button>
        <button
          className={tab === "history" ? "active" : ""}
          onClick={() => setTab("history")}
        >
          <span className="ico">🕑</span>
          History
        </button>
      </nav>

      {toast && <Toast message={toast} />}
    </div>
  );
}
