"use client";

import { useCallback, useEffect, useState } from "react";
import { Bot, KeyRound, Plus, RefreshCcw, Trash2, Power } from "lucide-react";

interface AgentRow {
  id: string;
  name: string;
  modelProvider: string;
  active: boolean;
  createdAt: string;
  _count: { media: number; reviews: number };
}

export default function AdminAgentsPage() {
  const [agents, setAgents] = useState<AgentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState("");
  const [newProvider, setNewProvider] = useState("");
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/admin/agents");
    if (res.ok) setAgents(await res.json());
    setLoading(false);
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/admin/agents")
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => {
        if (!cancelled) {
          setAgents(data);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function createAgent(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    setBusy(true);
    setError(null);
    const res = await fetch("/api/admin/agents", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: newName.trim(), provider: newProvider.trim() || "unknown" }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      setApiKey(data.apiKey);
      setNewName("");
      setNewProvider("");
      await load();
    } else {
      setError(data.error ?? "Gagal membuat agent");
    }
    setBusy(false);
  }

  async function regenerate(id: string, name: string) {
    if (!confirm(`Buat API key baru untuk "${name}"? Key lama akan hangus.`)) return;
    setBusy(true);
    const res = await fetch(`/api/admin/agents/${id}/regenerate`, { method: "POST" });
    const data = await res.json().catch(() => ({}));
    if (res.ok) setApiKey(data.apiKey);
    setBusy(false);
  }

  async function toggle(id: string, active: boolean) {
    setBusy(true);
    await fetch(`/api/admin/agents/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ active: !active }),
    });
    await load();
    setBusy(false);
  }

  async function remove(id: string, name: string) {
    if (!confirm(`Hapus agent "${name}"? Media yang diunggah tetap tersimpan.`)) return;
    setBusy(true);
    await fetch(`/api/admin/agents/${id}`, { method: "DELETE" });
    await load();
    setBusy(false);
  }

  return (
    <div>
      <h1 className="text-xl font-bold">AI Agents</h1>
      <p className="mt-1 text-sm text-zinc-500">
        Registry agent + API key untuk autentikasi MCP & REST upload
      </p>

      {/* API key reveal */}
      {apiKey && (
        <div className="mt-4 rounded-xl border border-violet-700/50 bg-violet-950/30 p-4">
          <p className="flex items-center gap-2 text-sm font-semibold text-violet-300">
            <KeyRound className="size-4" /> API Key baru — hanya ditampilkan sekali!
          </p>
          <div className="mt-2 flex items-center gap-2">
            <code className="flex-1 overflow-x-auto rounded-lg bg-zinc-950 px-3 py-2 font-mono text-xs text-violet-200">
              {apiKey}
            </code>
            <button
              onClick={() => navigator.clipboard.writeText(apiKey)}
              className="shrink-0 rounded-lg bg-violet-600 px-3 py-2 text-xs font-medium text-white hover:bg-violet-500"
            >
              Salin
            </button>
            <button
              onClick={() => setApiKey(null)}
              className="shrink-0 rounded-lg bg-zinc-800 px-3 py-2 text-xs text-zinc-300 hover:bg-zinc-700"
            >
              Tutup
            </button>
          </div>
          <p className="mt-2 text-xs text-zinc-500">
            Gunakan header: <code>Authorization: Bearer {"{API_KEY}"}</code>
          </p>
        </div>
      )}

      {/* Create form */}
      <form onSubmit={createAgent} className="mt-4 flex flex-wrap gap-2">
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="Nama agent (mis. Runway Video Bot)"
          className="min-w-56 flex-1 rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm placeholder:text-zinc-600 focus:border-violet-500 focus:outline-none"
        />
        <input
          value={newProvider}
          onChange={(e) => setNewProvider(e.target.value)}
          placeholder="Provider (mis. replicate)"
          className="w-48 rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm placeholder:text-zinc-600 focus:border-violet-500 focus:outline-none"
        />
        <button
          type="submit"
          disabled={busy || !newName.trim()}
          className="flex items-center gap-1.5 rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-500 disabled:opacity-50"
        >
          <Plus className="size-4" /> Buat Agent
        </button>
      </form>
      {error && <p className="mt-2 text-sm text-red-400">{error}</p>}

      {/* Agents table */}
      <div className="mt-4 overflow-x-auto rounded-xl border border-zinc-800">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-zinc-900 text-left text-xs uppercase tracking-wider text-zinc-500">
            <tr>
              <th className="px-4 py-3">Agent</th>
              <th className="px-4 py-3">Media</th>
              <th className="px-4 py-3">Review</th>
              <th className="px-4 py-3">Dibuat</th>
              <th className="px-4 py-3 text-right">Aksi</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800 bg-zinc-950">
            {loading && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-zinc-600">
                  Memuat…
                </td>
              </tr>
            )}
            {!loading && agents.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-zinc-600">
                  Belum ada agent terdaftar.
                </td>
              </tr>
            )}
            {agents.map((a) => (
              <tr key={a.id} className="hover:bg-zinc-900/50">
                <td className="px-4 py-2.5">
                  <p className="font-medium text-zinc-200">
                    {a.name}
                    {!a.active && (
                      <span className="ml-2 rounded bg-red-500/10 px-2 py-0.5 text-xs text-red-400">
                        nonaktif
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-zinc-600">{a.modelProvider}</p>
                </td>
                <td className="px-4 py-2.5">
                  <span className="rounded-full bg-violet-600/15 px-2.5 py-1 text-xs font-semibold text-violet-300">
                    {a._count.media}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-zinc-400">{a._count.reviews}</td>
                <td className="px-4 py-2.5 text-zinc-500">
                  {new Date(a.createdAt).toLocaleDateString("id-ID")}
                </td>
                <td className="px-4 py-2.5">
                  <div className="flex items-center justify-end gap-1">
                    <button
                      title={a.active ? "Nonaktifkan" : "Aktifkan"}
                      disabled={busy}
                      onClick={() => toggle(a.id, a.active)}
                      className={`rounded p-1.5 transition-colors disabled:opacity-40 ${
                        a.active
                          ? "text-zinc-500 hover:bg-amber-500/10 hover:text-amber-400"
                          : "text-amber-400 hover:bg-emerald-500/10 hover:text-emerald-400"
                      }`}
                    >
                      <Power className="size-4" />
                    </button>
                    <button
                      title="Regenerate API key"
                      disabled={busy}
                      onClick={() => regenerate(a.id, a.name)}
                      className="rounded p-1.5 text-zinc-500 transition-colors hover:bg-violet-500/10 hover:text-violet-400 disabled:opacity-40"
                    >
                      <RefreshCcw className="size-4" />
                    </button>
                    <button
                      title="Hapus agent"
                      disabled={busy}
                      onClick={() => remove(a.id, a.name)}
                      className="rounded p-1.5 text-zinc-500 transition-colors hover:bg-red-500/10 hover:text-red-400 disabled:opacity-40"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-3 flex items-center gap-1.5 text-xs text-zinc-600">
        <Bot className="size-3.5" /> Agent nonaktif tidak bisa upload via API key-nya, tapi
        tetap tercatat di riwayat media.
      </p>
    </div>
  );
}
