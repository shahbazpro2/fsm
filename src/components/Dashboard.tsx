"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { TokenDTO } from "@/lib/serialize";
import { looksLikeTokenSms, parseTokenSms, type ParsedToken } from "@/lib/parseSms";
import { COOLDOWN_DAYS } from "@/lib/status";
import {
  Fuel,
  Plus,
  Search,
  X,
  ClipboardPaste,
  ClipboardCheck,
  Copy,
  Phone,
  History,
  Undo2,
  Pencil,
  Trash2,
  Check,
  Car,
  Banknote,
  Clock,
  Hourglass,
  CalendarX2,
  Loader2,
  ChevronRight,
  type LucideIcon,
} from "lucide-react";

type Filter = "all" | "available" | "used" | "expired";

const TZ = "Asia/Karachi";
const fmt = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString("en-GB", {
        timeZone: TZ,
        day: "2-digit",
        month: "short",
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
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

function toLocalInput(iso: string | null) {
  if (!iso) return "";
  const d = new Date(new Date(iso).getTime() + 5 * 3600000);
  return d.toISOString().slice(0, 16);
}
function fromLocalInput(v: string) {
  return v ? new Date(v + ":00+05:00").toISOString() : null;
}

const vibrate = (ms = 12) => {
  try {
    navigator.vibrate?.(ms);
  } catch {
    /* ignore */
  }
};

const STATUS_CONFIG: Record<
  TokenDTO["status"],
  {
    label: string;
    badge: string;
    accent: string;
    icon: LucideIcon;
  }
> = {
  available: {
    label: "Available",
    badge: "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30",
    accent: "bg-emerald-500",
    icon: Check,
  },
  used: {
    label: "Cooldown",
    badge: "bg-amber-500/15 text-amber-400 border border-amber-500/30",
    accent: "bg-amber-500",
    icon: Hourglass,
  },
  expired: {
    label: "Expired",
    badge: "bg-rose-500/15 text-rose-400 border border-rose-500/30",
    accent: "bg-rose-500",
    icon: CalendarX2,
  },
};

const TABS: { key: Filter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "available", label: "Available" },
  { key: "used", label: "Cooldown" },
  { key: "expired", label: "Expired" },
];

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
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
  const [detailFor, setDetailFor] = useState<TokenDTO | null>(null);
  const [confirmState, setConfirmState] = useState<{
    title: string;
    message: string;
    action: string;
    danger?: boolean;
    onYes: () => void;
  } | null>(null);
  const [, setTick] = useState(0);
  const lastClip = useRef<string>("");
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const notify = useCallback((msg: string, err = false) => {
    setToast({ msg, err });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3000);
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

  useEffect(() => {
    if (sharedText) window.history.replaceState(null, "", "/");
  }, [sharedText]);

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

  useEffect(() => {
    const checkClipboard = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        // Try reading clipboard directly (works seamlessly on HTTPS / installed PWA)
        const text = await navigator.clipboard?.readText?.();
        if (
          text &&
          text.trim() &&
          text !== lastClip.current &&
          looksLikeTokenSms(text)
        ) {
          lastClip.current = text;
          vibrate(20);
          // Auto-open the import popup immediately!
          setImportText(text);
          notify("Token detected from clipboard!");
        }
      } catch {
        // If browser prompts permission or blocks background read, user uses "Paste SMS" button
      }
    };

    checkClipboard();
    window.addEventListener("focus", checkClipboard);
    document.addEventListener("visibilitychange", checkClipboard);
    return () => {
      window.removeEventListener("focus", checkClipboard);
      document.removeEventListener("visibilitychange", checkClipboard);
    };
  }, [notify]);

  const pasteFromClipboard = async () => {
    vibrate();
    try {
      const text = await navigator.clipboard.readText();
      lastClip.current = text;
      setClipboardHint(null);
      setImportText(text.trim() ? text : "");
    } catch {
      setImportText("");
    }
  };

  const counts = useMemo(() => {
    const c = { all: tokens.length, available: 0, used: 0, expired: 0 };
    tokens.forEach((t) => c[t.status]++);
    return c;
  }, [tokens]);

  const visible = useMemo(() => {
    const s = q.trim().toLowerCase().replace(/[\s-]/g, "");
    const order = { available: 0, used: 1, expired: 2 };
    return tokens
      .filter((t) => {
        if (filter !== "all" && t.status !== filter) return false;
        if (!s) return true;
        return [t.tokenNumber, t.vehicleNumber, t.phoneNumber, t.ownerName]
          .join(" ")
          .toLowerCase()
          .replace(/[\s-]/g, "")
          .includes(s);
      })
      .sort((a, b) => order[a.status] - order[b.status] || a.vehicleNumber.localeCompare(b.vehicleNumber));
  }, [tokens, filter, q]);

  const replace = (t: TokenDTO) => {
    setTokens((prev) => prev.map((x) => (x._id === t._id ? t : x)));
    setDetailFor((curr) => (curr?._id === t._id ? t : curr));
  };

  const doUse = async (t: TokenDTO, force: boolean) => {
    try {
      replace(await api<TokenDTO>(`/api/tokens/${t._id}/use`, { method: "POST", body: JSON.stringify({ force }) }));
      vibrate(30);
      notify(`${t.vehicleNumber} marked as used`);
    } catch (e: unknown) {
      const err = e as Error;
      // If server reports cooldown (409 conflict), ask confirmation directly with clean popup
      if (err.message.includes("cooldown")) {
        setConfirmState({
          title: "Token in Cooldown",
          message: `${err.message}. Do you still want to mark it as used?`,
          action: "Mark Used Anyway",
          onYes: () => doUse(t, true),
        });
      } else {
        notify(err.message, true);
      }
    }
  };

  const markUsed = (t: TokenDTO) => {
    if (t.status === "used") {
      setConfirmState({
        title: "Token in cooldown",
        message: `Valid again on ${fmt(t.nextAvailableAt)}. Mark as used anyway?`,
        action: "Mark Used",
        onYes: () => doUse(t, true),
      });
    } else doUse(t, false);
  };

  const undoUse = (t: TokenDTO) =>
    setConfirmState({
      title: "Undo last use?",
      message: `Removes the latest usage record for ${t.vehicleNumber}.`,
      action: "Undo Use",
      onYes: async () => {
        replace(await api<TokenDTO>(`/api/tokens/${t._id}/use`, { method: "DELETE" }));
        notify("Last usage undone");
      },
    });

  const remove = (t: TokenDTO) =>
    setConfirmState({
      title: "Delete Token?",
      message: `Token for vehicle ${t.vehicleNumber} will be permanently removed.`,
      action: "Delete",
      danger: true,
      onYes: async () => {
        await api(`/api/tokens/${t._id}`, { method: "DELETE" });
        setTokens((prev) => prev.filter((x) => x._id !== t._id));
        setDetailFor((curr) => (curr?._id === t._id ? null : curr));
        notify("Token deleted");
      },
    });

  const copy = async (text: string) => {
    await navigator.clipboard.writeText(text).catch(() => {});
    vibrate();
    notify(`Copied: ${text}`);
  };

  return (
    <div className="relative min-h-dvh bg-[#090d16] text-slate-100">
      {/* Top Header */}
      <header className="pt-safe sticky top-0 z-20 border-b border-slate-800 bg-[#090d16]">
        <div className="mx-auto flex max-w-lg items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500 text-slate-950">
              <Fuel className="h-5 w-5" strokeWidth={2.2} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-sm font-bold text-white tracking-tight">Fuel Token Manager</h1>
                <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] font-semibold text-slate-400">
                  {COOLDOWN_DAYS}d Cooldown
                </span>
              </div>
              <p className="text-[11px] text-slate-400">Government Fuel Relief Tokens</p>
            </div>
          </div>

          <button
            onClick={() => setEditing({})}
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-700 bg-slate-800 text-slate-200 transition hover:bg-slate-700 hover:text-white active:scale-95"
            aria-label="Add manually"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>

        {/* Filter Tabs */}
        <div className="mx-auto max-w-lg px-4 pb-2.5">
          <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
            {TABS.map((tab) => {
              const active = filter === tab.key;
              const count = counts[tab.key];
              return (
                <button
                  key={tab.key}
                  onClick={() => {
                    setFilter(tab.key);
                    vibrate(8);
                  }}
                  className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                    active
                      ? "bg-white text-slate-950"
                      : "border border-slate-800 bg-slate-900 text-slate-400 hover:text-slate-200"
                  }`}
                >
                  <span>{tab.label}</span>
                  <span
                    className={`rounded px-1.5 py-0.2 text-[10px] font-mono ${
                      active ? "bg-slate-200 text-slate-950" : "bg-slate-800 text-slate-400"
                    }`}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="mx-auto max-w-lg px-4 pb-36 pt-3">
        {/* Search Bar */}
        <div className="relative mb-3">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search vehicle or phone..."
            inputMode="search"
            className="input pl-9 pr-9"
          />
          {q && (
            <button
              onClick={() => setQ("")}
              aria-label="Clear search"
              className="absolute right-3 top-1/2 -translate-y-1/2 flex h-5 w-5 items-center justify-center rounded-full bg-slate-800 text-slate-400 hover:text-white"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>

        {/* Clipboard Snippet Detection Banner */}
        {clipboardHint && (
          <div className="animate-fade mb-3 rounded-xl border border-slate-700 bg-slate-900 p-3">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-400">
              <ClipboardCheck className="h-4 w-4" />
              <span>Token detected in clipboard</span>
            </div>
            <p dir="rtl" className="mt-1 line-clamp-2 text-xs leading-relaxed text-slate-300">
              {clipboardHint}
            </p>
            <div className="mt-2.5 flex gap-2">
              <button
                className="flex-1 rounded-lg bg-emerald-500 py-1.5 text-xs font-bold text-slate-950 transition hover:bg-emerald-400 active:scale-98"
                onClick={() => {
                  setImportText(clipboardHint);
                  setClipboardHint(null);
                }}
              >
                Import Token
              </button>
              <button
                className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-400 hover:text-white"
                onClick={() => setClipboardHint(null)}
              >
                Dismiss
              </button>
            </div>
          </div>
        )}

        {/* Tokens List */}
        {loading ? (
          <div className="space-y-2">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="h-20 animate-pulse rounded-xl border border-slate-800 bg-slate-900"
              />
            ))}
          </div>
        ) : visible.length === 0 ? (
          <div className="mt-12 rounded-2xl border border-slate-800 bg-slate-900 p-8 text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-slate-800 text-slate-400">
              <Fuel className="h-6 w-6" />
            </div>
            <h3 className="text-sm font-semibold text-slate-200">
              {tokens.length === 0 ? "No tokens yet" : "No matching tokens"}
            </h3>
            <p className="mt-1 text-xs text-slate-400 max-w-xs mx-auto leading-relaxed">
              {tokens.length === 0
                ? "Copy a token SMS and tap Paste SMS below to auto-import."
                : "Try a different search or filter tab."}
            </p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {visible.map((t) => (
              <TokenListItem
                key={t._id}
                t={t}
                onSelect={() => setDetailFor(t)}
                onUse={() => markUsed(t)}
                onUndo={() => undoUse(t)}
              />
            ))}
          </div>
        )}
      </main>

      {/* Floating Bottom Action Bar */}
      <div className="pb-safe fixed inset-x-0 bottom-0 z-30 border-t border-slate-800 bg-[#090d16] p-3">
        <div className="mx-auto max-w-lg">
          <button
            onClick={pasteFromClipboard}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-white px-4 text-sm font-bold text-slate-950 transition-colors hover:bg-slate-100 active:scale-[0.98]"
          >
            <ClipboardPaste className="h-4 w-4 text-slate-900" />
            <span>Paste SMS from Clipboard</span>
          </button>
        </div>
      </div>

      {/* Full Detail Modal */}
      {detailFor && (
        <DetailModal
          token={detailFor}
          onClose={() => setDetailFor(null)}
          onUse={() => markUsed(detailFor)}
          onUndo={() => undoUse(detailFor)}
          onCopy={() => copy(detailFor.tokenNumber)}
          onEdit={() => {
            const t = detailFor;
            setDetailFor(null);
            setEditing(t);
          }}
          onDelete={() => {
            const t = detailFor;
            setDetailFor(null);
            remove(t);
          }}
          onHistory={() => {
            const t = detailFor;
            setDetailFor(null);
            setHistoryFor(t);
          }}
        />
      )}

      {/* SMS Import Modal */}
      {importText !== null && (
        <ImportModal
          initial={importText}
          onClose={() => setImportText(null)}
          onDone={(msg) => {
            setImportText(null);
            vibrate(30);
            notify(msg);
            load();
          }}
          onError={(m) => notify(m, true)}
        />
      )}

      {/* Edit / Add Modal */}
      {editing && (
        <EditModal
          token={editing}
          onClose={() => setEditing(null)}
          onSaved={(t, isNew) => {
            setEditing(null);
            if (isNew) setTokens((p) => [...p, t]);
            else replace(t);
            notify(isNew ? "Token created" : "Token updated");
          }}
          onError={(m) => notify(m, true)}
        />
      )}

      {/* History Modal */}
      {historyFor && <HistoryModal token={historyFor} onClose={() => setHistoryFor(null)} />}

      {/* Confirmation Modal */}
      {confirmState && (
        <ModalSheet title={confirmState.title} onClose={() => setConfirmState(null)}>
          <p className="mb-5 text-sm text-slate-300 leading-relaxed">{confirmState.message}</p>
          <div className="grid grid-cols-2 gap-2.5">
            <button
              className="h-11 rounded-xl border border-slate-700 bg-slate-800 text-sm font-semibold text-slate-300 hover:text-white active:bg-slate-700"
              onClick={() => setConfirmState(null)}
            >
              Cancel
            </button>
            <button
              className={`h-11 rounded-xl text-sm font-bold text-white transition active:scale-98 ${
                confirmState.danger
                  ? "bg-rose-600 hover:bg-rose-500 active:bg-rose-700"
                  : "bg-emerald-500 text-slate-950 hover:bg-emerald-400"
              }`}
              onClick={() => {
                confirmState.onYes();
                setConfirmState(null);
              }}
            >
              {confirmState.action}
            </button>
          </div>
        </ModalSheet>
      )}

      {/* Notification Toast */}
      {toast && (
        <div
          className={`animate-toast fixed left-1/2 top-[calc(env(safe-area-inset-top)+1rem)] z-[60] flex w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold shadow-xl ${
            toast.err
              ? "border border-rose-500/40 bg-rose-950 text-rose-200"
              : "border border-slate-700 bg-slate-900 text-white"
          }`}
        >
          {toast.err ? <X className="h-4 w-4 text-rose-400 shrink-0" /> : <Check className="h-4 w-4 text-emerald-400 shrink-0" />}
          <span>{toast.msg}</span>
        </div>
      )}
    </div>
  );
}

/* ---------------- List Item (Just Phone & Vehicle) ---------------- */

function TokenListItem({
  t,
  onSelect,
  onUse,
  onUndo,
}: {
  t: TokenDTO;
  onSelect: () => void;
  onUse: () => void;
  onUndo: () => void;
}) {
  const conf = STATUS_CONFIG[t.status];
  const StatusIcon = conf.icon;

  return (
    <div
      onClick={onSelect}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect();
        }
      }}
      className="group relative flex w-full flex-col gap-3 rounded-xl border border-slate-800 bg-slate-900/90 p-3.5 transition-colors hover:border-slate-700 hover:bg-slate-850 active:bg-slate-800 cursor-pointer sm:flex-row sm:items-center sm:justify-between"
    >
      {/* Left indicator bar */}
      <span
        className={`absolute inset-y-3 left-0 w-1 rounded-r ${conf.accent}`}
      />

      {/* Vehicle and Phone */}
      <div className="min-w-0 flex-1 pl-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="flex items-center gap-1.5 font-mono text-base font-bold tracking-wider text-white break-all">
            <Car className="h-4 w-4 text-slate-400 shrink-0" />
            <span>{t.vehicleNumber}</span>
          </span>
          <span
            className={`inline-flex shrink-0 items-center gap-1 rounded px-2 py-0.5 text-[10px] font-semibold ${conf.badge}`}
          >
            <StatusIcon className="h-3 w-3" />
            {conf.label}
          </span>
        </div>

        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-slate-400">
          <Phone className="h-3 w-3 text-slate-500 shrink-0" />
          {t.phoneNumber ? (
            <span className="font-mono text-slate-300 break-all">{t.phoneNumber}</span>
          ) : (
            <span className="italic text-slate-500">No phone assigned</span>
          )}
          {t.ownerName && <span className="text-slate-500">· {t.ownerName}</span>}
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex shrink-0 items-center justify-between gap-2 border-t border-slate-800/80 pt-2.5 pl-2 sm:border-0 sm:pt-0 sm:pl-0 sm:justify-end">
        {t.status === "used" ? (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onUndo();
            }}
            className="flex h-9 items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-3 text-xs font-semibold text-slate-200 transition hover:bg-slate-750 hover:text-white active:scale-95"
          >
            <Undo2 className="h-3.5 w-3.5" />
            <span>Undo</span>
          </button>
        ) : (
          /* High-contrast attractive solid Use button */
          <button
            onClick={(e) => {
              e.stopPropagation();
              onUse();
            }}
            className="flex h-9 items-center gap-1.5 rounded-lg bg-emerald-500 px-3.5 text-xs font-bold text-slate-950 shadow-sm transition hover:bg-emerald-400 active:scale-95"
          >
            <Check className="h-3.5 w-3.5" strokeWidth={3} />
            <span>Use</span>
          </button>
        )}

        <div className="flex h-8 items-center gap-0.5 text-xs font-medium text-slate-500 group-hover:text-slate-300 transition-colors">
          <span className="text-[11px]">Details</span>
          <ChevronRight className="h-3.5 w-3.5" />
        </div>
      </div>
    </div>
  );
}

/* ---------------- Modal Sheet Container (Sticky Header & Close) ---------------- */

function ModalSheet({
  title,
  subtitle,
  onClose,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  return (
    <div
      className="animate-fade fixed inset-0 z-50 flex items-end justify-center bg-black/80 sm:items-center p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="animate-sheet relative flex max-h-[92dvh] w-full max-w-lg flex-col rounded-t-2xl border border-slate-800 bg-[#0f172a] shadow-2xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drag pill for mobile */}
        <div className="flex justify-center pt-2.5 pb-1 sm:hidden">
          <span className="h-1 w-10 rounded-full bg-slate-700" />
        </div>

        {/* Sticky Header with Close button */}
        <div className="flex items-center justify-between border-b border-slate-800 px-5 py-3.5">
          <div className="min-w-0 pr-2">
            <h2 className="truncate text-base font-bold text-white tracking-tight">{title}</h2>
            {subtitle && <p className="truncate text-xs text-slate-400 mt-0.5">{subtitle}</p>}
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-700 bg-slate-800 text-slate-400 hover:text-white active:scale-95 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto overscroll-contain px-5 py-4 space-y-4 no-scrollbar">
          {children}
        </div>

        {/* Optional Sticky Footer */}
        {footer && (
          <div className="pb-safe border-t border-slate-800 bg-[#0f172a] px-5 pt-3">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------------- Detail Modal View ---------------- */

function DetailModal({
  token,
  onClose,
  onUse,
  onUndo,
  onCopy,
  onEdit,
  onDelete,
  onHistory,
}: {
  token: TokenDTO;
  onClose: () => void;
  onUse: () => void;
  onUndo: () => void;
  onCopy: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onHistory: () => void;
}) {
  const conf = STATUS_CONFIG[token.status];
  const StatusIcon = conf.icon;
  const validFuture = token.validUntil && new Date(token.validUntil).getTime() > Date.now();

  return (
    <ModalSheet
      title={token.vehicleNumber}
      subtitle={token.phoneNumber ? `Phone: ${token.phoneNumber}` : "Token Information"}
      onClose={onClose}
      footer={
        <div className="flex gap-2">
          {token.status === "used" ? (
            <button
              className="flex h-11 flex-1 items-center justify-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800 text-sm font-bold text-slate-200 transition hover:bg-slate-750 active:scale-98"
              onClick={onUndo}
            >
              <Undo2 className="h-4 w-4" />
              <span>Undo Last Use</span>
            </button>
          ) : (
            <button
              className="flex h-11 flex-1 items-center justify-center gap-1.5 rounded-xl bg-emerald-500 text-sm font-bold text-slate-950 transition hover:bg-emerald-400 active:scale-98"
              onClick={onUse}
            >
              <Check className="h-4 w-4" strokeWidth={2.5} />
              <span>Mark as Used</span>
            </button>
          )}

          <button
            className="flex h-11 items-center justify-center rounded-xl border border-slate-700 bg-slate-800 px-4 text-sm font-semibold text-slate-300 hover:text-white active:bg-slate-700 transition-colors"
            onClick={onClose}
          >
            Close
          </button>
        </div>
      }
    >
      {/* Token Number Card */}
      <div className="rounded-xl border border-slate-700 bg-slate-900 p-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Government Token Number
            </div>
            <div className="font-mono text-xl font-bold tracking-wider text-white mt-0.5">
              {token.tokenNumber}
            </div>
          </div>
          <button
            onClick={onCopy}
            className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:text-white active:scale-95 transition-colors"
          >
            <Copy className="h-3.5 w-3.5" />
            <span>Copy</span>
          </button>
        </div>
      </div>

      {/* Status & Subsidized Amount Cards */}
      <div className="grid grid-cols-2 gap-2.5">
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-3.5">
          <div className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
            <Banknote className="h-3.5 w-3.5 text-emerald-400" />
            <span>Relief Value</span>
          </div>
          <div className="mt-1 text-xl font-bold text-white">
            {token.amount != null ? `Rs ${token.amount}` : "—"}
          </div>
          <div className="mt-0.5 text-[11px] text-slate-400">Gov fuel subsidy</div>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900 p-3.5">
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
            Token Status
          </div>
          <div className="mt-1">
            <span
              className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-bold ${conf.badge}`}
            >
              <StatusIcon className="h-3 w-3" />
              {conf.label}
            </span>
          </div>
          <div className="mt-1 text-[11px] text-slate-400 truncate">
            {token.status === "used"
              ? `Renew: ${fmt(token.nextAvailableAt)}`
              : token.status === "available" && validFuture
              ? `Expires: ${fmt(token.validUntil)}`
              : "Ready to use"}
          </div>
        </div>
      </div>

      {/* Timing Details */}
      <div className="rounded-xl border border-slate-800 bg-slate-900 p-3.5 space-y-2 text-xs">
        {token.status === "used" && (
          <div className="flex items-center justify-between text-amber-400">
            <span className="flex items-center gap-1.5 text-slate-400">
              <Hourglass className="h-3.5 w-3.5 text-amber-400" />
              <span>Renew in</span>
            </span>
            <span className="font-bold">{timeLeft(token.nextAvailableAt)}</span>
          </div>
        )}

        <div className="flex items-center justify-between text-slate-300">
          <span className="flex items-center gap-1.5 text-slate-400">
            <Clock className="h-3.5 w-3.5" />
            <span>SMS Validity</span>
          </span>
          <span className="font-mono">{fmt(token.validUntil)}</span>
        </div>

        <div className="flex items-center justify-between text-slate-300">
          <span className="flex items-center gap-1.5 text-slate-400">
            <History className="h-3.5 w-3.5" />
            <span>Last Used Date</span>
          </span>
          <span className="font-mono">{fmt(token.lastUsedAt)}</span>
        </div>
      </div>

      {/* Contact & Owner Section */}
      <div className="rounded-xl border border-slate-800 bg-slate-900 p-3.5 space-y-2.5 text-xs">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-1.5 text-slate-400">
            <Car className="h-3.5 w-3.5 text-slate-500" />
            <span>Vehicle Number</span>
          </span>
          <span className="font-mono font-bold text-white">{token.vehicleNumber}</span>
        </div>

        <div className="flex items-center justify-between">
          <span className="flex items-center gap-1.5 text-slate-400">
            <Phone className="h-3.5 w-3.5 text-slate-500" />
            <span>Phone Number</span>
          </span>
          {token.phoneNumber ? (
            <a
              href={`tel:${token.phoneNumber}`}
              className="font-mono font-semibold text-emerald-400 underline underline-offset-2 hover:text-emerald-300"
            >
              {token.phoneNumber}
            </a>
          ) : (
            <span className="text-slate-500 italic">Not set</span>
          )}
        </div>

        {token.ownerName && (
          <div className="flex items-center justify-between">
            <span className="text-slate-400">Owner Name</span>
            <span className="font-medium text-white">{token.ownerName}</span>
          </div>
        )}

        {token.notes && (
          <div className="border-t border-slate-800 pt-2 text-slate-400">
            <span className="text-slate-500">Note: </span>
            {token.notes}
          </div>
        )}
      </div>

      {/* Quick Action Rows */}
      <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900">
        <button
          onClick={onHistory}
          className="flex w-full items-center justify-between border-b border-slate-800 p-3 text-xs font-semibold text-slate-300 hover:bg-slate-800 transition-colors"
        >
          <span className="flex items-center gap-2">
            <History className="h-4 w-4 text-slate-400" />
            <span>Usage History ({token.usageHistory.length})</span>
          </span>
          <ChevronRight className="h-4 w-4 text-slate-500" />
        </button>

        <button
          onClick={onEdit}
          className="flex w-full items-center justify-between border-b border-slate-800 p-3 text-xs font-semibold text-slate-300 hover:bg-slate-800 transition-colors"
        >
          <span className="flex items-center gap-2">
            <Pencil className="h-4 w-4 text-slate-400" />
            <span>Edit Information</span>
          </span>
          <ChevronRight className="h-4 w-4 text-slate-500" />
        </button>

        <button
          onClick={onDelete}
          className="flex w-full items-center justify-between p-3 text-xs font-semibold text-rose-400 hover:bg-rose-950/30 transition-colors"
        >
          <span className="flex items-center gap-2">
            <Trash2 className="h-4 w-4 text-rose-500" />
            <span>Delete Token</span>
          </span>
          <ChevronRight className="h-4 w-4 text-slate-500" />
        </button>
      </div>

      {/* Raw SMS Box */}
      {token.lastSms && (
        <div>
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
            Original SMS Notification
          </div>
          <div
            dir="rtl"
            className="rounded-xl border border-slate-800 bg-slate-950 p-3 text-xs leading-relaxed text-slate-300"
          >
            {token.lastSms}
          </div>
        </div>
      )}
    </ModalSheet>
  );
}

/* ---------------- Import Sheet ---------------- */

function ImportModal({
  initial,
  onClose,
  onDone,
  onError,
}: {
  initial: string;
  onClose: () => void;
  onDone: (msg: string) => void;
  onError: (m: string) => void;
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
      onDone(c && u ? `${c} added, ${u} updated` : c ? `${c} token(s) added` : `${u} token(s) updated`);
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <ModalSheet
      title="Import Fuel Token"
      subtitle="Paste SMS message to auto-extract details"
      onClose={onClose}
      footer={
        <div className="flex gap-2">
          <button
            className="h-11 flex-1 rounded-xl bg-emerald-500 text-sm font-bold text-slate-950 hover:bg-emerald-400 disabled:opacity-50 active:scale-98 transition-colors"
            disabled={!parsed.length || busy}
            onClick={submit}
          >
            {busy ? (
              <span className="flex items-center justify-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Saving...</span>
              </span>
            ) : parsed.length ? (
              `Save ${parsed.length} Token${parsed.length > 1 ? "s" : ""}`
            ) : (
              "Save Token"
            )}
          </button>
          <button
            className="h-11 rounded-xl border border-slate-700 bg-slate-800 px-4 text-sm font-semibold text-slate-300 hover:text-white active:bg-slate-700"
            onClick={onClose}
          >
            Cancel
          </button>
        </div>
      }
    >
      <div>
        <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
          SMS Message (Urdu / English)
        </label>
        <textarea
          dir="rtl"
          autoFocus={!initial}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="یہاں ٹوکن میسج پیسٹ کریں..."
          className="input h-28 resize-none text-sm leading-relaxed"
        />
      </div>

      <div>
        <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
          Phone Number <span className="text-slate-500 font-normal">(optional)</span>
        </label>
        <input
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          inputMode="tel"
          placeholder="03XXXXXXXXX"
          className="input text-sm"
        />
      </div>

      <div>
        <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
          Detected Tokens ({parsed.length})
        </div>

        {parsed.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-800 bg-slate-900 p-4 text-center text-xs text-slate-500">
            Paste your message above. Vehicle number, token ID, and relief amount will auto-populate.
          </div>
        ) : (
          <div className="space-y-2">
            {parsed.map((p) => (
              <div
                key={p.tokenNumber}
                className="rounded-xl border border-emerald-500/30 bg-emerald-950/20 p-3 text-xs"
              >
                <div className="flex items-center justify-between text-slate-200">
                  <span className="font-mono font-bold text-sm text-emerald-400">
                    {p.tokenNumber}
                  </span>
                  <span className="font-semibold">{p.amount != null ? `Rs ${p.amount}` : ""}</span>
                </div>
                <div className="mt-1 flex items-center justify-between text-slate-400">
                  <span className="font-mono">{p.vehicleNumber || "Unknown Vehicle"}</span>
                  <span>{fmt(p.validUntil)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </ModalSheet>
  );
}

/* ---------------- Edit / Add Modal ---------------- */

function EditModal({
  token,
  onClose,
  onSaved,
  onError,
}: {
  token: Partial<TokenDTO>;
  onClose: () => void;
  onSaved: (t: TokenDTO, isNew: boolean) => void;
  onError: (m: string) => void;
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

  const set = (k: keyof typeof f) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => setF({ ...f, [k]: e.target.value });

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

  const field = (
    label: string,
    k: keyof typeof f,
    props: React.InputHTMLAttributes<HTMLInputElement> = {}
  ) => (
    <div>
      <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
        {label}
      </label>
      <input value={f[k]} onChange={set(k)} className="input text-sm" {...props} />
    </div>
  );

  return (
    <ModalSheet
      title={isNew ? "New Token Record" : "Edit Token"}
      subtitle={isNew ? "Manually add a token" : f.vehicleNumber}
      onClose={onClose}
      footer={
        <div className="flex gap-2">
          <button
            className="flex-1 h-11 rounded-xl bg-emerald-500 text-sm font-bold text-slate-950 hover:bg-emerald-400 active:scale-98 transition-colors"
            onClick={save}
          >
            Save Token
          </button>
          <button
            className="h-11 rounded-xl border border-slate-700 bg-slate-800 px-4 text-sm font-semibold text-slate-300 hover:text-white active:bg-slate-700"
            onClick={onClose}
          >
            Cancel
          </button>
        </div>
      }
    >
      <div className="space-y-3">
        {field("Token Number *", "tokenNumber", { inputMode: "numeric", placeholder: "7541879333" })}
        {field("Vehicle Number *", "vehicleNumber", {
          placeholder: "NBK-11-2610",
          autoCapitalize: "characters",
        })}

        <div className="grid grid-cols-2 gap-2.5">
          {field("Phone", "phoneNumber", { inputMode: "tel", placeholder: "03001234567" })}
          {field("Subsidy Amount (Rs)", "amount", { inputMode: "numeric", placeholder: "500" })}
        </div>

        {field("Registered Owner", "ownerName", { placeholder: "Optional name" })}
        {field("Validity (PKT)", "validUntil", { type: "datetime-local" })}

        <div>
          <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
            Notes
          </label>
          <textarea
            value={f.notes}
            onChange={set("notes")}
            className="input text-sm h-18 resize-none"
            placeholder="Add any reminders..."
          />
        </div>
      </div>
    </ModalSheet>
  );
}

/* ---------------- Usage History Modal ---------------- */

function HistoryModal({ token, onClose }: { token: TokenDTO; onClose: () => void }) {
  const list = [...token.usageHistory].sort((a, b) => +new Date(b.usedAt) - +new Date(a.usedAt));

  return (
    <ModalSheet
      title="Usage Records"
      subtitle={`${token.vehicleNumber} · ${token.tokenNumber}`}
      onClose={onClose}
      footer={
        <button
          className="w-full h-11 rounded-xl border border-slate-700 bg-slate-800 text-sm font-semibold text-slate-200 hover:text-white active:bg-slate-700"
          onClick={onClose}
        >
          Close History
        </button>
      }
    >
      {list.length === 0 ? (
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-8 text-center text-xs text-slate-500">
          No previous usages recorded for this token yet.
        </div>
      ) : (
        <div className="space-y-2">
          {list.map((u, i) => (
            <div
              key={u._id}
              className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-900 p-3 text-xs"
            >
              <div className="flex items-center gap-2">
                <span className="flex h-5 w-5 items-center justify-center rounded bg-slate-800 font-mono text-[10px] text-slate-400">
                  #{list.length - i}
                </span>
                <span className="font-mono text-slate-200">{fmt(u.usedAt)}</span>
              </div>
              <span className="font-semibold text-emerald-400">
                {u.amount != null ? `Rs ${u.amount}` : "Used"}
              </span>
            </div>
          ))}
        </div>
      )}
    </ModalSheet>
  );
}
