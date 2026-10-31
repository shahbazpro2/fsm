"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { TokenDTO } from "@/lib/serialize";
import { looksLikeTokenSms, parseTokenSms, type ParsedToken } from "@/lib/parseSms";
import { COOLDOWN_DAYS } from "@/lib/status";

type Filter = "all" | "available" | "used" | "expired";

const TZ = "Asia/Karachi";
const fmt = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString("en-GB", {
        timeZone: TZ, day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: true,
      })
    : "—";

function timeLeft(iso: string | null) {
  if (!iso) return "";
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return "now";
  const d = Math.floor(ms / 86400000);
  const h = Math.floor((ms % 86400000) / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return d > 0 ? `${d}d ${h}h` : h > 0 ? `${h}h ${m}m` : `${m}m`;
}

/** Convert ISO → value for <input type="datetime-local"> in Pakistan time */
function toLocalInput(iso: string | null) {
  if (!iso) return "";
  const d = new Date(new Date(iso).getTime() + 5 * 3600000);
  return d.toISOString().slice(0, 16);
}
function fromLocalInput(v: string) {
  return v ? new Date(v + ":00+05:00").toISOString() : null;
}

const STATUS_STYLE: Record<TokenDTO["status"], string> = {
  available: "bg-emerald-100 text-emerald-800 ring-emerald-300",
  used: "bg-amber-100 text-amber-800 ring-amber-300",
  expired: "bg-rose-100 text-rose-800 ring-rose-300",
};
const STATUS_LABEL: Record<TokenDTO["status"], string> = {
  available: "Available",
  used: "Used (cooldown)",
  expired: "Expired",
};

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { "Content-Type": "application/json", ...init?.headers } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
  return data as T;
}

export default function Dashboard({ sharedText }: { sharedText?: string }) {
  const [tokens, setTokens] = useState<TokenDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("");
  const [toast, setToast] = useState<{ msg: string; err?: boolean } | null>(null);
  const [importText, setImportText] = useState<string | null>(sharedText || null);
  const [clipboardHint, setClipboardHint] = useState<string | null>(null);
  const [editing, setEditing] = useState<Partial<TokenDTO> | null>(null);
  const [historyFor, setHistoryFor] = useState<TokenDTO | null>(null);
  const [, setTick] = useState(0);
  const lastClip = useRef<string>("");

  const notify = useCallback((msg: string, err = false) => {
    setToast({ msg, err });
    setTimeout(() => setToast(null), 3500);
  }, []);

  const load = useCallback(async () => {
    try {
      setTokens(await api<TokenDTO[]>("/api/tokens"));
    } catch (e) {
      notify((e as Error).message, true);
    } finally {
      setLoading(false);
    }
  }, [notify]);

  useEffect(() => {
    load();
    const i = setInterval(() => setTick((t) => t + 1), 60000);
    return () => clearInterval(i);
  }, [load]);

  // Clean ?text= from URL after share-target import opens
  useEffect(() => {
    if (sharedText) window.history.replaceState(null, "", "/");
  }, [sharedText]);

  // Paste anywhere on the page (Ctrl/Cmd+V or long-press → Paste) opens importer
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest("input, textarea")) return;
      const text = e.clipboardData?.getData("text") ?? "";
      if (looksLikeTokenSms(text)) {
        e.preventDefault();
        setImportText(text);
      }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, []);

  // When returning to the app, silently check clipboard if permission was already granted
  useEffect(() => {
    const check = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const perm = await navigator.permissions?.query({ name: "clipboard-read" as PermissionName });
        if (perm?.state !== "granted") return;
        const text = await navigator.clipboard.readText();
        if (text && text !== lastClip.current && looksLikeTokenSms(text)) {
          lastClip.current = text;
          setClipboardHint(text);
        }
      } catch {
        /* not supported – user can tap the Paste button */
      }
    };
    check();
    window.addEventListener("focus", check);
    document.addEventListener("visibilitychange", check);
    return () => {
      window.removeEventListener("focus", check);
      document.removeEventListener("visibilitychange", check);
    };
  }, []);

  const pasteFromClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      lastClip.current = text;
      if (!text.trim()) return notify("Clipboard is empty", true);
      setImportText(text);
    } catch {
      setImportText(""); // open manual box – user can long-press → Paste
    }
  };

  const counts = useMemo(() => {
    const c = { all: tokens.length, available: 0, used: 0, expired: 0 };
    tokens.forEach((t) => c[t.status]++);
    return c;
  }, [tokens]);

  const visible = useMemo(() => {
    const s = q.trim().toLowerCase().replace(/[\s-]/g, "");
    return tokens.filter((t) => {
      if (filter !== "all" && t.status !== filter) return false;
      if (!s) return true;
      return [t.tokenNumber, t.vehicleNumber, t.phoneNumber, t.ownerName]
        .join(" ")
        .toLowerCase()
        .replace(/[\s-]/g, "")
        .includes(s);
    });
  }, [tokens, filter, q]);

  const replace = (t: TokenDTO) => setTokens((prev) => prev.map((x) => (x._id === t._id ? t : x)));

  const markUsed = async (t: TokenDTO, force = false) => {
    try {
      replace(await api<TokenDTO>(`/api/tokens/${t._id}/use`, { method: "POST", body: JSON.stringify({ force }) }));
      notify(`Token ${t.tokenNumber} marked as used`);
    } catch (e) {
      if (!force && confirm(`${(e as Error).message}\n\nMark as used anyway?`)) return markUsed(t, true);
      if (force) notify((e as Error).message, true);
    }
  };

  const undoUse = async (t: TokenDTO) => {
    if (!confirm(`Undo last usage of ${t.tokenNumber}?`)) return;
    replace(await api<TokenDTO>(`/api/tokens/${t._id}/use`, { method: "DELETE" }));
    notify("Last usage removed");
  };

  const remove = async (t: TokenDTO) => {
    if (!confirm(`Delete token ${t.tokenNumber}? This cannot be undone.`)) return;
    await api(`/api/tokens/${t._id}`, { method: "DELETE" });
    setTokens((prev) => prev.filter((x) => x._id !== t._id));
    notify("Token deleted");
  };

  const copy = async (text: string) => {
    await navigator.clipboard.writeText(text).catch(() => {});
    notify(`Copied ${text}`);
  };

  return (
    <div className="mx-auto max-w-5xl px-4 pb-32 pt-6">
      <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">⛽ Fuel Token Manager</h1>
          <p className="text-sm text-slate-500">
            Tokens become valid again {COOLDOWN_DAYS} days after use
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setEditing({})} className="btn-secondary">+ Add manually</button>
          <button onClick={pasteFromClipboard} className="btn-primary">📋 Paste SMS</button>
        </div>
      </header>

      {clipboardHint && (
        <div className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-indigo-200 bg-indigo-50 p-3">
          <div className="min-w-0 text-sm">
            <p className="font-semibold text-indigo-900">Token SMS found in clipboard</p>
            <p dir="rtl" className="truncate text-indigo-700">{clipboardHint}</p>
          </div>
          <div className="flex shrink-0 gap-2">
            <button className="btn-primary" onClick={() => { setImportText(clipboardHint); setClipboardHint(null); }}>
              Import
            </button>
            <button className="btn-ghost" onClick={() => setClipboardHint(null)}>✕</button>
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {(["all", "available", "used", "expired"] as Filter[]).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded-xl border p-3 text-left transition ${
              filter === f ? "border-indigo-500 bg-white shadow ring-2 ring-indigo-200" : "border-slate-200 bg-white hover:border-slate-300"
            }`}
          >
            <div className="text-xs uppercase tracking-wide text-slate-500">
              {f === "all" ? "Total" : f === "used" ? "Used / Cooldown" : f}
            </div>
            <div className={`text-2xl font-bold ${
              f === "available" ? "text-emerald-600" : f === "used" ? "text-amber-600" : f === "expired" ? "text-rose-600" : "text-slate-900"
            }`}>
              {counts[f]}
            </div>
          </button>
        ))}
      </div>

      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search token, vehicle number, phone…"
        className="input mb-4"
      />

      {loading ? (
        <p className="py-10 text-center text-slate-500">Loading…</p>
      ) : visible.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-slate-300 bg-white p-10 text-center text-slate-500">
          {tokens.length === 0 ? (
            <>
              <p className="mb-2 text-lg">No tokens yet</p>
              <p className="text-sm">Copy a token SMS and tap <b>Paste SMS</b>, or press Ctrl/⌘+V anywhere here.</p>
            </>
          ) : (
            "No tokens match this filter"
          )}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {visible.map((t) => (
            <div key={t._id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="mb-2 flex items-start justify-between gap-2">
                <button onClick={() => copy(t.tokenNumber)} title="Copy token number"
                  className="font-mono text-lg font-bold tracking-wider text-slate-900 hover:text-indigo-600">
                  {t.tokenNumber}
                </button>
                <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ${STATUS_STYLE[t.status]}`}>
                  {STATUS_LABEL[t.status]}
                </span>
              </div>

              <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
                <dt className="text-slate-500">Vehicle</dt>
                <dd className="font-semibold text-slate-800">{t.vehicleNumber}</dd>
                <dt className="text-slate-500">Phone</dt>
                <dd className="text-slate-800">
                  {t.phoneNumber ? <a href={`tel:${t.phoneNumber}`} className="hover:underline">{t.phoneNumber}</a> : "—"}
                  {t.ownerName && <span className="text-slate-500"> · {t.ownerName}</span>}
                </dd>
                <dt className="text-slate-500">Amount</dt>
                <dd className="text-slate-800">{t.amount != null ? `Rs ${t.amount}` : "—"}</dd>
                <dt className="text-slate-500">Valid until</dt>
                <dd className="text-slate-800">{fmt(t.validUntil)}</dd>
                <dt className="text-slate-500">Last used</dt>
                <dd className="text-slate-800">{fmt(t.lastUsedAt)}</dd>
                {t.status === "used" && (
                  <>
                    <dt className="text-slate-500">Valid again</dt>
                    <dd className="font-semibold text-amber-700">
                      {fmt(t.nextAvailableAt)} <span className="font-normal">({timeLeft(t.nextAvailableAt)})</span>
                    </dd>
                  </>
                )}
                {t.status === "available" && t.validUntil && new Date(t.validUntil).getTime() > Date.now() && (
                  <>
                    <dt className="text-slate-500">Expires in</dt>
                    <dd className="font-semibold text-emerald-700">{timeLeft(t.validUntil)}</dd>
                  </>
                )}
              </dl>

              <div className="mt-3 flex flex-wrap gap-2 border-t border-slate-100 pt-3">
                {t.status !== "used" ? (
                  <button className="btn-success" onClick={() => markUsed(t)}>✓ Mark used</button>
                ) : (
                  <button className="btn-secondary" onClick={() => undoUse(t)}>↶ Undo use</button>
                )}
                <button className="btn-ghost" onClick={() => setHistoryFor(t)}>
                  History ({t.usageHistory.length})
                </button>
                <button className="btn-ghost" onClick={() => setEditing(t)}>Edit</button>
                <button className="btn-ghost text-rose-600" onClick={() => remove(t)}>Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Floating paste button for mobile */}
      <button
        onClick={pasteFromClipboard}
        className="fixed bottom-6 right-6 z-30 flex items-center gap-2 rounded-full bg-indigo-600 px-5 py-4 font-semibold text-white shadow-lg hover:bg-indigo-700 sm:hidden"
      >
        📋 Paste SMS
      </button>

      {importText !== null && (
        <ImportModal
          initial={importText}
          onClose={() => setImportText(null)}
          onDone={(msg) => { setImportText(null); notify(msg); load(); }}
          onError={(m) => notify(m, true)}
        />
      )}

      {editing && (
        <EditModal
          token={editing}
          onClose={() => setEditing(null)}
          onSaved={(t, isNew) => {
            setEditing(null);
            if (isNew) setTokens((p) => [...p, t]); else replace(t);
            notify(isNew ? "Token added" : "Token updated");
          }}
          onError={(m) => notify(m, true)}
        />
      )}

      {historyFor && <HistoryModal token={historyFor} onClose={() => setHistoryFor(null)} />}

      {toast && (
        <div className={`fixed bottom-24 left-1/2 z-50 -translate-x-1/2 rounded-lg px-4 py-2 text-sm text-white shadow-lg sm:bottom-6 ${
          toast.err ? "bg-rose-600" : "bg-slate-900"
        }`}>
          {toast.msg}
        </div>
      )}
    </div>
  );
}

/* ---------------- Modals ---------------- */

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 sm:items-center" onClick={onClose}>
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold">{title}</h2>
          <button onClick={onClose} className="btn-ghost">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function ImportModal({ initial, onClose, onDone, onError }: {
  initial: string; onClose: () => void; onDone: (msg: string) => void; onError: (m: string) => void;
}) {
  const [text, setText] = useState(initial);
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const parsed: ParsedToken[] = useMemo(() => parseTokenSms(text), [text]);

  const submit = async () => {
    setBusy(true);
    try {
      const { results } = await api<{ results: { action: string }[] }>("/api/tokens/import", {
        method: "POST",
        body: JSON.stringify({ text, phoneNumber: phone }),
      });
      const c = results.filter((r) => r.action === "created").length;
      const u = results.length - c;
      onDone(`${c} new token(s) added, ${u} updated`);
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="Import token SMS" onClose={onClose}>
      <textarea
        dir="rtl"
        autoFocus={!initial}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="یہاں ٹوکن میسج پیسٹ کریں — long-press and Paste the SMS here (multiple messages OK)"
        className="input h-32 font-[inherit] leading-relaxed"
      />
      <label className="mt-3 block text-sm font-medium text-slate-700">
        Phone number <span className="font-normal text-slate-400">(optional – auto-filled from same vehicle)</span>
      </label>
      <input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" placeholder="03XXXXXXXXX" className="input mt-1" />

      <div className="mt-4">
        <p className="mb-2 text-sm font-medium text-slate-700">Detected ({parsed.length})</p>
        {parsed.length === 0 ? (
          <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-500">No token detected yet.</p>
        ) : (
          <ul className="space-y-2">
            {parsed.map((p) => (
              <li key={p.tokenNumber} className="grid grid-cols-2 gap-1 rounded-lg bg-emerald-50 p-3 text-sm">
                <span className="text-slate-500">Token</span><span className="font-mono font-bold">{p.tokenNumber}</span>
                <span className="text-slate-500">Vehicle</span><span className="font-semibold">{p.vehicleNumber || "—"}</span>
                <span className="text-slate-500">Amount</span><span>{p.amount != null ? `Rs ${p.amount}` : "—"}</span>
                <span className="text-slate-500">Valid until</span><span>{fmt(p.validUntil)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="mt-5 flex justify-end gap-2">
        <button className="btn-secondary" onClick={onClose}>Cancel</button>
        <button className="btn-primary" disabled={!parsed.length || busy} onClick={submit}>
          {busy ? "Saving…" : `Save ${parsed.length || ""} token(s)`}
        </button>
      </div>
    </Modal>
  );
}

function EditModal({ token, onClose, onSaved, onError }: {
  token: Partial<TokenDTO>; onClose: () => void; onSaved: (t: TokenDTO, isNew: boolean) => void; onError: (m: string) => void;
}) {
  const isNew = !token._id;
  const [f, setF] = useState({
    tokenNumber: token.tokenNumber ?? "",
    vehicleNumber: token.vehicleNumber ?? "",
    phoneNumber: token.phoneNumber ?? "",
    ownerName: token.ownerName ?? "",
    amount: token.amount?.toString() ?? "",
    validUntil: toLocalInput(token.validUntil ?? null),
    notes: token.notes ?? "",
  });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setF({ ...f, [k]: e.target.value });

  const save = async () => {
    try {
      const body = JSON.stringify({ ...f, validUntil: fromLocalInput(f.validUntil) });
      const t = isNew
        ? await api<TokenDTO>("/api/tokens", { method: "POST", body })
        : await api<TokenDTO>(`/api/tokens/${token._id}`, { method: "PATCH", body });
      onSaved(t, isNew);
    } catch (e) {
      onError((e as Error).message);
    }
  };

  const field = (label: string, k: keyof typeof f, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <label className="block text-sm font-medium text-slate-700">
      {label}
      <input value={f[k]} onChange={set(k)} className="input mt-1" {...props} />
    </label>
  );

  return (
    <Modal title={isNew ? "Add token" : "Edit token"} onClose={onClose}>
      <div className="grid gap-3">
        {field("Token number *", "tokenNumber", { inputMode: "numeric" })}
        {field("Vehicle number *", "vehicleNumber", { placeholder: "ABC-12-3456" })}
        {field("Phone number", "phoneNumber", { inputMode: "tel" })}
        {field("Owner name", "ownerName")}
        {field("Amount (Rs)", "amount", { inputMode: "numeric" })}
        {field("Valid until (PKT)", "validUntil", { type: "datetime-local" })}
        <label className="block text-sm font-medium text-slate-700">
          Notes
          <textarea value={f.notes} onChange={set("notes")} className="input mt-1 h-20" />
        </label>
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <button className="btn-secondary" onClick={onClose}>Cancel</button>
        <button className="btn-primary" onClick={save}>Save</button>
      </div>
    </Modal>
  );
}

function HistoryModal({ token, onClose }: { token: TokenDTO; onClose: () => void }) {
  const list = [...token.usageHistory].sort((a, b) => +new Date(b.usedAt) - +new Date(a.usedAt));
  return (
    <Modal title={`History · ${token.tokenNumber}`} onClose={onClose}>
      {list.length === 0 ? (
        <p className="text-sm text-slate-500">Never used.</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {list.map((u) => (
            <li key={u._id} className="flex justify-between py-2 text-sm">
              <span>{fmt(u.usedAt)}</span>
              <span className="text-slate-600">{u.amount != null ? `Rs ${u.amount}` : ""}</span>
            </li>
          ))}
        </ul>
      )}
      {token.lastSms && (
        <div className="mt-4">
          <p className="mb-1 text-sm font-medium text-slate-700">Last SMS</p>
          <p dir="rtl" className="rounded-lg bg-slate-50 p-3 text-sm leading-relaxed">{token.lastSms}</p>
        </div>
      )}
    </Modal>
  );
}
