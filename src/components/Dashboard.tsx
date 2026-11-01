"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { TokenDTO } from "@/lib/serialize";
import type { UserSession } from "@/lib/auth";
import { UsersManagementModal } from "./UsersManagementModal";
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
  ChevronDown,
  Lock,
  Unlock,
  KeyRound,
  PlusCircle,
  FileText,
  RefreshCw,
  Users,
  Shield,
  ShieldAlert,
  AlertTriangle,
  User as UserIcon,
  Eye,
  EyeOff,
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
    badge: "bg-emerald-500/12 text-emerald-300 border border-emerald-500/25",
    accent: "bg-emerald-500",
    icon: Check,
  },
  used: {
    label: "Cooldown",
    badge: "bg-amber-500/12 text-amber-300 border border-amber-500/25",
    accent: "bg-amber-500",
    icon: Hourglass,
  },
  expired: {
    label: "Expired",
    badge: "bg-rose-500/12 text-rose-300 border border-rose-500/25",
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
  const [isAuth, setIsAuth] = useState(false);
  const [currentUser, setCurrentUser] = useState<UserSession | null>(null);
  const [showUsersModal, setShowUsersModal] = useState(false);
  const [selectedUserFilter, setSelectedUserFilter] = useState<string>("all");
  const [allUsersList, setAllUsersList] = useState<{ id: string; username: string; name: string }[]>([]);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);
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

  const load = useCallback(
    async (userObj = currentUser, filterUser = selectedUserFilter) => {
      setLoading(true);
      try {
        const url =
          userObj?.role === "superadmin" && filterUser && filterUser !== "all"
            ? `/api/tokens?userId=${filterUser}`
            : "/api/tokens";
        const data = await api<TokenDTO[]>(url);
        setTokens(data);

        if (userObj?.role === "superadmin") {
          const uList = await api<{ id: string; username: string; name: string }[]>("/api/users").catch(() => []);
          setAllUsersList(uList);
        }
      } catch {
        setTokens([]);
      } finally {
        setLoading(false);
      }
    },
    [currentUser, selectedUserFilter]
  );

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const res = await api<{ authenticated: boolean; user: UserSession | null }>("/api/auth");
        if (res.authenticated && res.user) {
          setIsAuth(true);
          setCurrentUser(res.user);
          load(res.user);
        } else {
          setIsAuth(false);
          setCurrentUser(null);
          setLoading(false);
        }
      } catch {
        setIsAuth(false);
        setCurrentUser(null);
        setLoading(false);
      }
    };
    checkAuth();
    const i = setInterval(() => setTick((t) => t + 1), 60000);
    return () => clearInterval(i);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const requireAuth = (action: () => void) => {
    if (isAuth) {
      action();
    } else {
      setPendingAction(() => action);
      setShowLoginModal(true);
    }
  };

  const logout = async () => {
    await fetch("/api/auth", { method: "DELETE" }).catch(() => {});
    setIsAuth(false);
    setCurrentUser(null);
    setTokens([]);
    notify("Logged out");
  };

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
    <div className="relative min-h-dvh bg-[#09090b] text-zinc-100">
      {/* Top Header */}
      <header className="pt-safe sticky top-0 z-20 border-b border-zinc-800/80 bg-[#121214]/95 backdrop-blur-md">
        <div className="mx-auto flex max-w-lg items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500 text-zinc-950 shadow-sm shadow-emerald-500/20">
              <Fuel className="h-5 w-5" strokeWidth={2.2} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-sm font-bold text-white tracking-tight">Fuel Token Manager</h1>
                <span className="rounded bg-zinc-800/90 border border-zinc-700/60 px-1.5 py-0.5 text-[10px] font-semibold text-zinc-400">
                  {COOLDOWN_DAYS}d Cooldown
                </span>
              </div>
              <p className="text-[11px] text-zinc-400">Government Fuel Relief Tokens</p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            {isAuth ? (
              <>
                {currentUser?.role === "superadmin" && (
                  <button
                    onClick={() => setShowUsersModal(true)}
                    className="flex h-9 items-center gap-1.5 rounded-xl border border-purple-500/30 bg-purple-500/10 px-2.5 text-xs font-semibold text-purple-300 transition hover:bg-purple-500/20 active:scale-95"
                    title="User Management (Superadmin)"
                  >
                    <Users className="h-3.5 w-3.5 text-purple-400" />
                    <span className="hidden xs:inline">Users</span>
                  </button>
                )}

                <button
                  onClick={() => load()}
                  disabled={loading}
                  className="flex h-9 w-9 items-center justify-center rounded-xl border border-zinc-700/80 bg-zinc-800 text-zinc-300 transition hover:bg-zinc-700 hover:text-white active:scale-95 disabled:opacity-50"
                  title="Refresh data"
                  aria-label="Refresh data"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin text-emerald-400" : ""}`} />
                </button>

                <button
                  onClick={logout}
                  className="flex h-9 items-center gap-1.5 rounded-xl border border-zinc-700/80 bg-zinc-800 px-2.5 text-xs font-semibold text-zinc-300 transition hover:bg-zinc-700 hover:text-white active:scale-95"
                  title="Click to logout"
                >
                  {currentUser?.role === "superadmin" ? (
                    <Shield className="h-3.5 w-3.5 text-purple-400" />
                  ) : (
                    <UserIcon className="h-3.5 w-3.5 text-emerald-400" />
                  )}
                  <span className="hidden xs:inline font-mono">
                    @{currentUser?.username || "user"}
                  </span>
                  <Unlock className="h-3 w-3 text-zinc-500 ml-0.5" />
                </button>

                <button
                  onClick={() => requireAuth(() => setEditing({}))}
                  className="flex h-9 w-9 items-center justify-center rounded-xl border border-zinc-700/80 bg-zinc-800 text-zinc-200 transition hover:bg-zinc-700 hover:text-white active:scale-95"
                  aria-label="Add manually"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </>
            ) : (
              <button
                onClick={() => setShowLoginModal(true)}
                className="flex h-9 items-center gap-1.5 rounded-xl bg-emerald-500 px-3.5 text-xs font-bold text-zinc-950 transition hover:bg-emerald-400 active:scale-95 shadow-sm shadow-emerald-500/20"
                title="Login to unlock"
              >
                <Lock className="h-3.5 w-3.5 text-zinc-950" />
                <span>Login</span>
              </button>
            )}
          </div>
        </div>

        {/* User Scope Selector for Superadmin */}
        {isAuth && currentUser?.role === "superadmin" && (
          <div className="mx-auto max-w-lg px-4 pb-2.5 flex items-center justify-between text-xs">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400 flex items-center gap-1">
              <Users className="h-3 w-3 text-purple-400" />
              <span>Scope:</span>
            </span>
            <select
              value={selectedUserFilter}
              onChange={(e) => {
                const val = e.target.value;
                setSelectedUserFilter(val);
                load(currentUser, val);
              }}
              className="rounded-lg border border-zinc-700/80 bg-zinc-800 px-2.5 py-1 text-xs font-mono text-zinc-200 focus:border-emerald-500 focus:outline-none"
            >
              <option value="all">All Users ({allUsersList.length})</option>
              {allUsersList.map((u) => (
                <option key={u.id} value={u.id}>
                  @{u.username} {u.name ? `(${u.name})` : ""}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Filter Tabs - Only shown when logged in */}
        {isAuth && (
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
                    className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                      active
                        ? "bg-emerald-500/15 text-emerald-300 border border-emerald-500/35 shadow-sm shadow-emerald-500/10"
                        : "border border-zinc-800/80 bg-zinc-900/60 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60 hover:border-zinc-700"
                    }`}
                  >
                    <span>{tab.label}</span>
                    <span
                      className={`rounded px-1.5 py-0.2 text-[10px] font-mono ${
                        active ? "bg-emerald-500/25 text-emerald-200 font-bold" : "bg-zinc-800 text-zinc-400"
                      }`}
                    >
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </header>

      {/* Main Content Area */}
      <main className="mx-auto max-w-lg px-4 pb-36 pt-3">
        {loading && !tokens.length && isAuth ? (
          /* INITIAL LOADING STATE FOR LOGGED IN USER */
          <div className="space-y-3 pt-1">
            <div className="flex items-center justify-between px-1 mb-1">
              <div className="flex items-center gap-2 text-xs font-semibold text-zinc-300">
                <Loader2 className="h-4 w-4 animate-spin text-emerald-400" />
                <span>Loading token records...</span>
              </div>
              <span className="text-[11px] text-zinc-500">Connecting to database</span>
            </div>
            {[0, 1, 2, 3].map((i) => (
              <TokenCardSkeleton key={i} />
            ))}
          </div>
        ) : !isAuth ? (
          /* LOCKED VIEW: Only show Add New Record options + Protected Notice */
          <div className="space-y-4 pt-2">
            {/* Clipboard Banner if token detected */}
            {clipboardHint && (
              <div className="animate-fade rounded-2xl border border-emerald-500/30 bg-emerald-950/20 p-4">
                <div className="flex items-center gap-2 text-xs font-bold text-emerald-400">
                  <ClipboardCheck className="h-4 w-4" />
                  <span>Token detected in clipboard</span>
                </div>
                <p dir="rtl" className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-zinc-300">
                  {clipboardHint}
                </p>
                <div className="mt-3 flex gap-2">
                  <button
                    className="flex-1 rounded-xl bg-emerald-500 py-2 text-xs font-bold text-zinc-950 transition hover:bg-emerald-400 active:scale-98 shadow-sm shadow-emerald-500/20"
                    onClick={() => {
                      setImportText(clipboardHint);
                      setClipboardHint(null);
                    }}
                  >
                    Import Token Now
                  </button>
                  <button
                    className="rounded-xl border border-zinc-700/80 bg-zinc-800 px-3 py-2 text-xs font-semibold text-zinc-400 hover:text-white"
                    onClick={() => setClipboardHint(null)}
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            )}

            {/* Add New Record Section */}
            <div className="rounded-2xl border border-zinc-800/90 bg-[#141416] p-5 shadow-lg shadow-black/20">
              <div className="flex items-center gap-2.5 mb-1.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  <PlusCircle className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-zinc-100">Add New Record</h2>
                  <p className="text-xs text-zinc-400">Paste SMS notification to add or update token</p>
                </div>
              </div>

              <div className="mt-4 space-y-2.5">
                <button
                  onClick={pasteFromClipboard}
                  className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 text-sm font-bold text-zinc-950 transition hover:bg-emerald-400 active:scale-98 shadow-sm shadow-emerald-500/25"
                >
                  <ClipboardPaste className="h-4 w-4 text-zinc-950" />
                  <span>Paste SMS from Clipboard</span>
                </button>

                <button
                  onClick={() => setImportText("")}
                  className="flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-zinc-700/80 bg-zinc-800/80 px-4 text-xs font-bold text-zinc-200 transition hover:bg-zinc-700 hover:text-white active:scale-98"
                >
                  <FileText className="h-4 w-4 text-zinc-400" />
                  <span>Type or Paste SMS Text</span>
                </button>
              </div>
            </div>

            {/* Locked Records Notice */}
            <div className="rounded-2xl border border-zinc-800/80 bg-[#141416]/70 p-6 text-center shadow-lg shadow-black/20">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl border border-amber-500/20 bg-amber-500/10 text-amber-400">
                <Lock className="h-5 w-5" />
              </div>
              <h3 className="text-sm font-bold text-zinc-200">Records Protected</h3>
              <p className="mt-1 text-xs text-zinc-400 max-w-xs mx-auto leading-relaxed">
                Login to view registered vehicles, active tokens, cooldown timers, and manage claims.
              </p>
              <button
                onClick={() => setShowLoginModal(true)}
                className="mt-4 inline-flex items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-800/90 px-5 py-2.5 text-xs font-bold text-white transition hover:bg-zinc-700 active:scale-95 shadow-sm"
              >
                <KeyRound className="h-4 w-4 text-emerald-400" />
                <span>Login to View All Options</span>
              </button>
            </div>
          </div>
        ) : (
          /* UNLOCKED VIEW: Search Bar + Tokens List */
          <>
            {/* Search Bar */}
            <div className="relative mb-3">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
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
                  className="absolute right-3 top-1/2 -translate-y-1/2 flex h-5 w-5 items-center justify-center rounded-full bg-zinc-800 text-zinc-400 hover:text-white"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>

            {/* Clipboard Snippet Detection Banner */}
            {clipboardHint && (
              <div className="animate-fade mb-3 rounded-xl border border-zinc-700 bg-zinc-900 p-3">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-400">
                  <ClipboardCheck className="h-4 w-4" />
                  <span>Token detected in clipboard</span>
                </div>
                <p dir="rtl" className="mt-1 line-clamp-2 text-xs leading-relaxed text-zinc-300">
                  {clipboardHint}
                </p>
                <div className="mt-2.5 flex gap-2">
                  <button
                    className="flex-1 rounded-lg bg-emerald-500 py-1.5 text-xs font-bold text-zinc-950 transition hover:bg-emerald-400 active:scale-98"
                    onClick={() => {
                      setImportText(clipboardHint);
                      setClipboardHint(null);
                    }}
                  >
                    Import Token
                  </button>
                  <button
                    className="rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-xs font-medium text-zinc-400 hover:text-white"
                    onClick={() => setClipboardHint(null)}
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            )}

            {/* Tokens List */}
            {loading ? (
              <div className="space-y-2.5">
                <div className="flex items-center justify-between px-1 mb-1">
                  <div className="flex items-center gap-2 text-xs font-semibold text-zinc-400">
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-emerald-400" />
                    <span>Loading token records...</span>
                  </div>
                  <span className="text-[11px] text-zinc-500">Syncing with database</span>
                </div>
                {[0, 1, 2, 3].map((i) => (
                  <TokenCardSkeleton key={i} />
                ))}
              </div>
            ) : visible.length === 0 ? (
              <div className="mt-12 rounded-2xl border border-zinc-800 bg-zinc-900 p-8 text-center">
                <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-zinc-800 text-zinc-400">
                  <Fuel className="h-6 w-6" />
                </div>
                <h3 className="text-sm font-semibold text-zinc-200">
                  {tokens.length === 0 ? "No tokens yet" : "No matching tokens"}
                </h3>
                <p className="mt-1 text-xs text-zinc-400 max-w-xs mx-auto leading-relaxed">
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
                    onUse={() => requireAuth(() => markUsed(t))}
                    onUndo={() => requireAuth(() => undoUse(t))}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </main>

      {/* Floating Bottom Action Bar */}
      <div className="pb-safe fixed inset-x-0 bottom-0 z-30 border-t border-zinc-800/80 bg-[#121214]/95 backdrop-blur-md p-3">
        <div className="mx-auto max-w-lg">
          {isAuth ? (
            <button
              onClick={pasteFromClipboard}
              className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 text-sm font-bold text-zinc-950 transition-all hover:bg-emerald-400 active:scale-[0.98] shadow-sm shadow-emerald-500/25"
            >
              <ClipboardPaste className="h-4 w-4 text-zinc-950" />
              <span>Paste SMS from Clipboard</span>
            </button>
          ) : (
            <div className="flex gap-2">
              <button
                onClick={pasteFromClipboard}
                className="flex h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 text-sm font-bold text-zinc-950 transition-all hover:bg-emerald-400 active:scale-[0.98] shadow-sm shadow-emerald-500/25"
              >
                <ClipboardPaste className="h-4 w-4 text-zinc-950" />
                <span>Paste SMS</span>
              </button>
              <button
                onClick={() => setShowLoginModal(true)}
                className="flex h-12 items-center justify-center gap-2 rounded-xl border border-zinc-800 bg-zinc-800/90 px-4 text-xs font-bold text-zinc-200 transition-colors hover:bg-zinc-700 hover:text-white active:scale-[0.98] shadow-sm"
              >
                <Lock className="h-4 w-4 text-amber-400" />
                <span>Login</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Full Detail Modal */}
      {detailFor && (
        <DetailModal
          token={detailFor}
          onClose={() => setDetailFor(null)}
          onUse={() => requireAuth(() => markUsed(detailFor))}
          onUndo={() => requireAuth(() => undoUse(detailFor))}
          onCopy={() => copy(detailFor.tokenNumber)}
          onEdit={() => {
            const t = detailFor;
            requireAuth(() => {
              setDetailFor(null);
              setEditing(t);
            });
          }}
          onDelete={() => {
            const t = detailFor;
            requireAuth(() => {
              setDetailFor(null);
              remove(t);
            });
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
          existingTokens={tokens}
          currentUser={currentUser}
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

      {/* Users Management Modal (Superadmin only) */}
      {showUsersModal && currentUser?.role === "superadmin" && (
        <UsersManagementModal
          currentUser={currentUser}
          onClose={() => {
            setShowUsersModal(false);
            load(currentUser);
          }}
          notify={notify}
        />
      )}

      {/* Account Login Modal */}
      {showLoginModal && (
        <LoginModal
          onClose={() => {
            setShowLoginModal(false);
            setPendingAction(null);
          }}
          onSuccess={(user) => {
            setIsAuth(true);
            setCurrentUser(user);
            setShowLoginModal(false);
            notify(`Welcome back, @${user.username}!`);
            load(user);
            if (pendingAction) {
              const act = pendingAction;
              setPendingAction(null);
              act();
            }
          }}
          onError={(m) => notify(m, true)}
        />
      )}

      {/* Confirmation Modal */}
      {confirmState && (
        <ModalSheet title={confirmState.title} onClose={() => setConfirmState(null)}>
          <p className="mb-5 text-sm text-zinc-300 leading-relaxed">{confirmState.message}</p>
          <div className="grid grid-cols-2 gap-2.5">
            <button
              className="h-11 rounded-xl border border-zinc-800 bg-zinc-800/80 text-sm font-semibold text-zinc-300 hover:text-white active:bg-zinc-800 transition-colors"
              onClick={() => setConfirmState(null)}
            >
              Cancel
            </button>
            <button
              className={`h-11 rounded-xl text-sm font-bold text-white transition active:scale-98 shadow-sm ${
                confirmState.danger
                  ? "bg-rose-600 hover:bg-rose-500 active:bg-rose-700 shadow-rose-600/20"
                  : "bg-emerald-500 text-zinc-950 hover:bg-emerald-400 shadow-emerald-500/20"
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
          className={`animate-toast fixed left-1/2 top-[calc(env(safe-area-inset-top)+1rem)] z-[60] flex w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold shadow-2xl ${
            toast.err
              ? "border border-rose-500/40 bg-rose-950/95 text-rose-200"
              : "border border-zinc-800 bg-[#18181b]/95 text-white"
          }`}
        >
          {toast.err ? <X className="h-4 w-4 text-rose-400 shrink-0" /> : <Check className="h-4 w-4 text-emerald-400 shrink-0" />}
          <span>{toast.msg}</span>
        </div>
      )}
    </div>
  );
}

/* ---------------- Skeleton Loader Card ---------------- */

function TokenCardSkeleton() {
  return (
    <div className="relative flex w-full flex-col gap-3 rounded-xl border border-zinc-800/80 bg-[#141416]/60 p-3.5 sm:flex-row sm:items-center sm:justify-between animate-pulse">
      {/* Left indicator bar */}
      <span className="absolute inset-y-3 left-0 w-1 rounded-r bg-zinc-800" />

      {/* Vehicle and Phone placeholders */}
      <div className="min-w-0 flex-1 pl-2 space-y-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5">
            <div className="h-4 w-4 rounded bg-zinc-800/80 shrink-0" />
            <div className="h-5 w-28 rounded-md bg-zinc-800/80" />
          </div>
          <div className="h-4 w-16 rounded bg-zinc-800/60" />
        </div>

        <div className="flex items-center gap-1.5">
          <div className="h-3 w-3 rounded bg-zinc-800/80 shrink-0" />
          <div className="h-3.5 w-32 rounded bg-zinc-800/60" />
        </div>
      </div>

      {/* Action Buttons & Details placeholder */}
      <div className="flex shrink-0 items-center justify-between gap-3 border-t border-zinc-800/60 pt-2.5 pl-2 sm:border-0 sm:pt-0 sm:pl-0 sm:justify-end">
        <div className="h-9 w-16 rounded-lg bg-zinc-800/80" />
        <div className="h-4 w-4 rounded-full bg-zinc-800/50" />
      </div>
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
      className="group relative flex w-full flex-col gap-3 rounded-xl border border-zinc-800/80 bg-[#141416] p-3.5 transition-all hover:border-zinc-700 hover:bg-[#18181b] active:bg-[#101012] cursor-pointer sm:flex-row sm:items-center sm:justify-between shadow-sm"
    >
      {/* Left indicator bar */}
      <span
        className={`absolute inset-y-3 left-0 w-1 rounded-r ${conf.accent}`}
      />

      {/* Vehicle and Phone */}
      <div className="min-w-0 flex-1 pl-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="flex items-center gap-1.5 font-mono text-base font-bold tracking-wider text-white break-all">
            <Car className="h-4 w-4 text-zinc-400 shrink-0" />
            <span>{t.vehicleNumber}</span>
          </span>
          {t.ownerUsername && (
            <span className="rounded bg-purple-500/10 border border-purple-500/25 px-1.5 py-0.5 text-[10px] font-mono text-purple-300">
              @{t.ownerUsername}
            </span>
          )}
          <span
            className={`inline-flex shrink-0 items-center gap-1 rounded px-2 py-0.5 text-[10px] font-semibold ${conf.badge}`}
          >
            <StatusIcon className="h-3 w-3" />
            {conf.label}
          </span>
        </div>

        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-zinc-400">
          <Phone className="h-3 w-3 text-zinc-500 shrink-0" />
          {t.phoneNumber ? (
            <span className="font-mono text-zinc-300 break-all">{t.phoneNumber}</span>
          ) : (
            <span className="italic text-zinc-500">No phone assigned</span>
          )}
          {t.ownerName && <span className="text-zinc-500">· {t.ownerName}</span>}
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex shrink-0 items-center justify-between gap-2 border-t border-zinc-800/80 pt-2.5 pl-2 sm:border-0 sm:pt-0 sm:pl-0 sm:justify-end">
        {t.status === "used" ? (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onUndo();
            }}
            className="flex h-9 items-center gap-1.5 rounded-lg border border-zinc-800 bg-zinc-800/90 px-3 text-xs font-semibold text-zinc-200 transition hover:bg-zinc-700 hover:text-white active:scale-95"
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
            className="flex h-9 items-center gap-1.5 rounded-lg bg-emerald-500 px-3.5 text-xs font-bold text-zinc-950 shadow-sm shadow-emerald-500/20 transition hover:bg-emerald-400 active:scale-95"
          >
            <Check className="h-3.5 w-3.5" strokeWidth={3} />
            <span>Use</span>
          </button>
        )}

        <div className="flex h-8 w-8 items-center justify-center text-zinc-500 group-hover:text-zinc-300 transition-colors">
          <ChevronRight className="h-4 w-4" />
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
      className="animate-fade fixed inset-0 z-50 flex items-end justify-center bg-black/80 backdrop-blur-sm sm:items-center p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="animate-sheet relative flex max-h-[92dvh] w-full max-w-lg flex-col rounded-t-2xl border border-zinc-800/90 bg-[#121214] shadow-2xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drag pill for mobile */}
        <div className="flex justify-center pt-2.5 pb-1 sm:hidden">
          <span className="h-1 w-10 rounded-full bg-zinc-700/80" />
        </div>

        {/* Sticky Header with Close button */}
        <div className="flex items-center justify-between border-b border-zinc-800 px-5 py-3.5">
          <div className="min-w-0 pr-2">
            <h2 className="truncate text-base font-bold text-white tracking-tight">{title}</h2>
            {subtitle && <p className="truncate text-xs text-zinc-400 mt-0.5">{subtitle}</p>}
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-zinc-800 bg-zinc-800/80 text-zinc-400 hover:text-white active:scale-95 transition-colors"
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
          <div className="pb-safe border-t border-zinc-800/90 bg-[#121214] px-5 pt-3">
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
              className="flex h-11 flex-1 items-center justify-center gap-1.5 rounded-xl border border-zinc-800 bg-zinc-800/80 text-sm font-bold text-zinc-200 transition hover:bg-zinc-700 hover:text-white active:scale-98"
              onClick={onUndo}
            >
              <Undo2 className="h-4 w-4" />
              <span>Undo Last Use</span>
            </button>
          ) : (
            <button
              className="flex h-11 flex-1 items-center justify-center gap-1.5 rounded-xl bg-emerald-500 text-sm font-bold text-zinc-950 transition hover:bg-emerald-400 active:scale-98 shadow-sm shadow-emerald-500/20"
              onClick={onUse}
            >
              <Check className="h-4 w-4" strokeWidth={2.5} />
              <span>Mark as Used</span>
            </button>
          )}

          <button
            className="flex h-11 items-center justify-center rounded-xl border border-zinc-800 bg-zinc-800/80 px-4 text-sm font-semibold text-zinc-300 hover:text-white active:bg-zinc-700 transition-colors"
            onClick={onClose}
          >
            Close
          </button>
        </div>
      }
    >
      {/* Token Number Card */}
      <div className="rounded-xl border border-zinc-800/90 bg-[#18181b] p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">
              Government Token Number
            </div>
            <div className="font-mono text-xl font-bold tracking-wider text-white mt-0.5">
              {token.tokenNumber}
            </div>
          </div>
          <button
            onClick={onCopy}
            className="flex items-center gap-1.5 rounded-lg border border-zinc-800 bg-zinc-800/80 px-3 py-1.5 text-xs font-semibold text-zinc-200 hover:text-white active:scale-95 transition-colors"
          >
            <Copy className="h-3.5 w-3.5" />
            <span>Copy</span>
          </button>
        </div>
      </div>

      {/* Status & Subsidized Amount Cards */}
      <div className="grid grid-cols-2 gap-2.5">
        <div className="rounded-xl border border-zinc-800/90 bg-[#18181b] p-3.5 shadow-sm">
          <div className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-zinc-400">
            <Banknote className="h-3.5 w-3.5 text-emerald-400" />
            <span>Relief Value</span>
          </div>
          <div className="mt-1 text-xl font-bold text-white">
            {token.amount != null ? `Rs ${token.amount}` : "—"}
          </div>
          <div className="mt-0.5 text-[11px] text-zinc-400">Gov fuel subsidy</div>
        </div>

        <div className="rounded-xl border border-zinc-800/90 bg-[#18181b] p-3.5 shadow-sm">
          <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">
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
          <div className="mt-1 text-[11px] text-zinc-400 truncate">
            {token.status === "used"
              ? `Renew: ${fmt(token.nextAvailableAt)}`
              : token.status === "available" && validFuture
              ? `Expires: ${fmt(token.validUntil)}`
              : "Ready to use"}
          </div>
        </div>
      </div>

      {/* Timing Details */}
      <div className="rounded-xl border border-zinc-800/90 bg-[#18181b] p-3.5 space-y-2 text-xs shadow-sm">
        {token.status === "used" && (
          <div className="flex items-center justify-between text-amber-300">
            <span className="flex items-center gap-1.5 text-zinc-400">
              <Hourglass className="h-3.5 w-3.5 text-amber-400" />
              <span>Renew in</span>
            </span>
            <span className="font-bold">{timeLeft(token.nextAvailableAt)}</span>
          </div>
        )}

        <div className="flex items-center justify-between text-zinc-300">
          <span className="flex items-center gap-1.5 text-zinc-400">
            <Clock className="h-3.5 w-3.5" />
            <span>SMS Validity</span>
          </span>
          <span className="font-mono">{fmt(token.validUntil)}</span>
        </div>

        <div className="flex items-center justify-between text-zinc-300">
          <span className="flex items-center gap-1.5 text-zinc-400">
            <History className="h-3.5 w-3.5" />
            <span>Last Used Date</span>
          </span>
          <span className="font-mono">{fmt(token.lastUsedAt)}</span>
        </div>
      </div>

      {/* Contact & Owner Section */}
      <div className="rounded-xl border border-zinc-800/90 bg-[#18181b] p-3.5 space-y-2.5 text-xs shadow-sm">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-1.5 text-zinc-400">
            <Car className="h-3.5 w-3.5 text-zinc-500" />
            <span>Vehicle Number</span>
          </span>
          <span className="font-mono font-bold text-white">{token.vehicleNumber}</span>
        </div>

        <div className="flex items-center justify-between">
          <span className="flex items-center gap-1.5 text-zinc-400">
            <Phone className="h-3.5 w-3.5 text-zinc-500" />
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
            <span className="text-zinc-500 italic">Not set</span>
          )}
        </div>

        {token.ownerName && (
          <div className="flex items-center justify-between">
            <span className="text-zinc-400">Owner Name</span>
            <span className="font-medium text-white">{token.ownerName}</span>
          </div>
        )}

        {token.notes && (
          <div className="border-t border-zinc-800 pt-2 text-zinc-400">
            <span className="text-zinc-500">Note: </span>
            {token.notes}
          </div>
        )}
      </div>

      {/* Quick Action Rows */}
      <div className="overflow-hidden rounded-xl border border-zinc-800/90 bg-[#18181b] shadow-sm">
        <button
          onClick={onHistory}
          className="flex w-full items-center justify-between border-b border-zinc-800/80 p-3 text-xs font-semibold text-zinc-300 hover:bg-zinc-800/60 transition-colors"
        >
          <span className="flex items-center gap-2">
            <History className="h-4 w-4 text-zinc-400" />
            <span>Usage History ({token.usageHistory.length})</span>
          </span>
          <ChevronRight className="h-4 w-4 text-zinc-500" />
        </button>

        <button
          onClick={onEdit}
          className="flex w-full items-center justify-between border-b border-zinc-800/80 p-3 text-xs font-semibold text-zinc-300 hover:bg-zinc-800/60 transition-colors"
        >
          <span className="flex items-center gap-2">
            <Pencil className="h-4 w-4 text-zinc-400" />
            <span>Edit Information</span>
          </span>
          <ChevronRight className="h-4 w-4 text-zinc-500" />
        </button>

        <button
          onClick={onDelete}
          className="flex w-full items-center justify-between p-3 text-xs font-semibold text-rose-400 hover:bg-rose-950/30 transition-colors"
        >
          <span className="flex items-center gap-2">
            <Trash2 className="h-4 w-4 text-rose-500" />
            <span>Delete Token</span>
          </span>
          <ChevronRight className="h-4 w-4 text-zinc-500" />
        </button>
      </div>

      {/* Raw SMS Box */}
      {token.lastSms && (
        <div>
          <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 mb-1">
            Original SMS Notification
          </div>
          <div
            dir="rtl"
            className="rounded-xl border border-zinc-800/90 bg-[#09090b] p-3 text-xs leading-relaxed text-zinc-300"
          >
            {token.lastSms}
          </div>
        </div>
      )}
    </ModalSheet>
  );
}

/* ---------------- Import Sheet ---------------- */

const safeStorage = {
  get: (key: string): string | null => {
    try {
      if (typeof window === "undefined") return null;
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set: (key: string, val: string) => {
    try {
      if (typeof window !== "undefined") {
        localStorage.setItem(key, val);
      }
    } catch {}
  },
};

// Storage key scoped specifically for each actor (different for each logged-in user vs public)
const getActorStorageKey = (currentUser?: UserSession | null) => {
  if (!currentUser?.userId) {
    return "fsm_last_import_user_public";
  }
  return `fsm_last_import_user_${currentUser.userId}`;
};

// Storage key mapping vehicle numbers to their assigned user
const getVehicleStorageKey = (vehicle: string) => {
  const clean = vehicle.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return `fsm_vehicle_user_${clean}`;
};

function ImportModal({
  initial,
  existingTokens = [],
  currentUser,
  onClose,
  onDone,
  onError,
}: {
  initial: string;
  existingTokens?: TokenDTO[];
  currentUser?: UserSession | null;
  onClose: () => void;
  onDone: (msg: string) => void;
  onError: (m: string) => void;
}) {
  const isPublic = !currentUser;
  const isSuperadmin = currentUser?.role === "superadmin";
  const canChooseUser = isPublic || isSuperadmin;

  const [text, setText] = useState(initial);
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmingUser, setConfirmingUser] = useState(false);
  const [inlineError, setInlineError] = useState<string | null>(null);
  const [users, setUsers] = useState<{ id: string; username: string; name: string; role: string }[]>([]);

  const parsed: ParsedToken[] = useMemo(() => parseTokenSms(text), [text]);
  const primaryVehicle = parsed[0]?.vehicleNumber;

  // Resolves the best user ID for this actor and vehicle from localStorage
  const resolveTargetUserId = useCallback(
    (availableUsers: { id: string }[], vehicle?: string) => {
      if (!availableUsers.length) return "";
      // Non-superadmin logged-in users are always bound to their own account
      if (currentUser && !isSuperadmin) {
        return currentUser.userId;
      }

      // 1. Check if vehicle has a specifically remembered user in localStorage
      if (vehicle) {
        const vehicleSaved = safeStorage.get(getVehicleStorageKey(vehicle));
        if (vehicleSaved && availableUsers.some((u) => u.id === vehicleSaved)) {
          return vehicleSaved;
        }
      }

      // 2. Check if this specific actor (public or specific superadmin) has a remembered user in localStorage
      const actorSaved = safeStorage.get(getActorStorageKey(currentUser));
      if (actorSaved && availableUsers.some((u) => u.id === actorSaved)) {
        return actorSaved;
      }

      // 3. Fallback: if logged in as superadmin, default to superadmin; else first active user
      if (currentUser?.userId && availableUsers.some((u) => u.id === currentUser.userId)) {
        return currentUser.userId;
      }
      return availableUsers[0]?.id || "";
    },
    [currentUser, isSuperadmin]
  );

  const [selectedUserId, setSelectedUserId] = useState<string>(() => {
    if (currentUser && !isSuperadmin) return currentUser.userId;
    const actorSaved = safeStorage.get(getActorStorageKey(currentUser));
    if (actorSaved) return actorSaved;
    return currentUser?.userId || "";
  });

  const selectedUser = useMemo(
    () => users.find((u) => u.id === selectedUserId),
    [users, selectedUserId]
  );

  useEffect(() => {
    let mounted = true;
    fetch("/api/users?simple=true")
      .then((res) => res.json())
      .then((data) => {
        if (!mounted || !Array.isArray(data) || data.length === 0) return;
        setUsers(data);
        setSelectedUserId((prev) => {
          if (prev && data.some((u) => u.id === prev)) return prev;
          return resolveTargetUserId(data, primaryVehicle);
        });
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, [resolveTargetUserId, primaryVehicle]);

  const handleUserChange = (id: string) => {
    setSelectedUserId(id);
    setInlineError(null);
    // Remember for this specific actor in localStorage
    safeStorage.set(getActorStorageKey(currentUser), id);
    // If vehicle is present in parsed SMS, also remember this vehicle's user in localStorage
    parsed.forEach((p) => {
      if (p.vehicleNumber) {
        safeStorage.set(getVehicleStorageKey(p.vehicleNumber), id);
      }
    });
  };

  const handleTextChange = (newText: string) => {
    setText(newText);
    setInlineError(null);

    // If a vehicle is detected, check if that vehicle has a remembered user in localStorage
    if (canChooseUser) {
      const detected = parseTokenSms(newText);
      const v = detected[0]?.vehicleNumber;
      if (v) {
        const vehicleSaved = safeStorage.get(getVehicleStorageKey(v));
        if (vehicleSaved && users.some((u) => u.id === vehicleSaved)) {
          setSelectedUserId(vehicleSaved);
        }
      }
    }
  };

  const previewMatches = useMemo(() => {
    return parsed.map((p) => {
      const match = existingTokens.find(
        (t) =>
          (!selectedUserId || t.userId === selectedUserId) &&
          (t.tokenNumber === p.tokenNumber ||
            (p.vehicleNumber &&
              t.vehicleNumber.toUpperCase() === p.vehicleNumber.toUpperCase() &&
              (!phone.trim() || !t.phoneNumber || t.phoneNumber === phone.trim())))
      );
      return { p, match };
    });
  }, [parsed, existingTokens, phone, selectedUserId]);

  const hasUpdates = previewMatches.some((m) => !!m.match);

  const handleInitialClick = () => {
    setInlineError(null);
    if (!parsed.length) return;
    if (!selectedUserId) {
      setInlineError("Please select a user to assign this token to.");
      return;
    }
    if (isPublic) {
      // For public additions, require explicit confirmation of the target user!
      setConfirmingUser(true);
    } else {
      executeSubmit();
    }
  };

  const executeSubmit = async () => {
    setBusy(true);
    setInlineError(null);
    try {
      if (selectedUserId) {
        // Save remembered user for this actor in localStorage
        safeStorage.set(getActorStorageKey(currentUser), selectedUserId);
        // Save remembered user for each vehicle in localStorage
        parsed.forEach((p) => {
          if (p.vehicleNumber) {
            safeStorage.set(getVehicleStorageKey(p.vehicleNumber), selectedUserId);
          }
        });
      }
      const { results } = await api<{ results: { action: string }[] }>("/api/tokens/import", {
        method: "POST",
        body: JSON.stringify({
          text,
          phoneNumber: phone,
          userId: selectedUserId || undefined,
        }),
      });
      const c = results.filter((r) => r.action === "created").length;
      const u = results.length - c;
      onDone(c && u ? `${c} added, ${u} updated` : c ? `${c} token(s) added` : `${u} token(s) updated`);
    } catch (e) {
      const msg = (e as Error).message;
      setInlineError(msg);
      onError(msg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <ModalSheet
      title={confirmingUser ? "Confirm User Assignment" : "Import Fuel Token"}
      subtitle={
        confirmingUser
          ? `Adding for @${selectedUser?.username || "user"}`
          : "Paste SMS message to auto-extract details"
      }
      onClose={onClose}
      footer={
        confirmingUser ? (
          <div className="flex gap-2">
            <button
              className="h-11 flex-1 rounded-xl bg-emerald-500 text-xs sm:text-sm font-bold text-zinc-950 hover:bg-emerald-400 disabled:opacity-50 active:scale-98 transition-colors flex items-center justify-center gap-2 shadow-sm shadow-emerald-500/20"
              disabled={busy || !selectedUserId}
              onClick={executeSubmit}
            >
              {busy ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Adding Token...</span>
                </>
              ) : (
                <>
                  <Check className="h-4 w-4" strokeWidth={3} />
                  <span>Confirm & Add for @{selectedUser?.username || "User"}</span>
                </>
              )}
            </button>
            <button
              className="h-11 rounded-xl border border-zinc-800 bg-zinc-800/80 px-4 text-xs sm:text-sm font-semibold text-zinc-300 hover:text-white active:bg-zinc-800 transition-colors"
              onClick={() => {
                setConfirmingUser(false);
                setInlineError(null);
              }}
              disabled={busy}
            >
              Back
            </button>
          </div>
        ) : (
          <div className="flex gap-2">
            <button
              className="h-11 flex-1 rounded-xl bg-emerald-500 text-sm font-bold text-zinc-950 hover:bg-emerald-400 disabled:opacity-50 active:scale-98 transition-colors"
              disabled={!parsed.length || busy}
              onClick={handleInitialClick}
            >
              {isPublic
                ? parsed.length > 1
                  ? `Confirm User & Add ${parsed.length} Tokens`
                  : "Confirm User & Add Token"
                : hasUpdates
                ? parsed.length > 1
                  ? `Save & Update ${parsed.length} Tokens`
                  : "Save & Update Token"
                : parsed.length
                ? `Save ${parsed.length} Token${parsed.length > 1 ? "s" : ""}`
                : "Save Token"}
            </button>
            <button
              className="h-11 rounded-xl border border-zinc-800 bg-zinc-800/80 px-4 text-sm font-semibold text-zinc-300 hover:text-white active:bg-zinc-800 transition-colors"
              onClick={onClose}
            >
              Cancel
            </button>
          </div>
        )
      }
    >
      {confirmingUser ? (
        /* Confirmation View before adding from public */
        <div className="space-y-4">
          <div className="rounded-xl border border-amber-500/30 bg-amber-950/20 p-4">
            <div className="flex items-center gap-2 text-xs font-bold text-amber-400">
              <ShieldAlert className="h-4 w-4 shrink-0" />
              <span>Public Token Assignment</span>
            </div>
            <p className="mt-1.5 text-xs text-zinc-300 leading-relaxed">
              You are adding this token from public view. Please confirm the owner user account before saving to the database.
            </p>
          </div>

          {/* User Confirmation Card */}
          <div className="rounded-xl border border-zinc-700/80 bg-zinc-900/90 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                Assigned User Account
              </span>
              <span className="text-[10px] text-emerald-400 font-semibold flex items-center gap-1">
                <Check className="h-3 w-3" />
                <span>Selected Owner</span>
              </span>
            </div>

            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-purple-500/10 text-purple-400 border border-purple-500/25 shrink-0">
                <UserIcon className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm font-bold text-white">
                    @{selectedUser?.username || "unknown"}
                  </span>
                  {selectedUser?.role === "superadmin" && (
                    <span className="rounded bg-purple-500/20 px-1.5 py-0.5 text-[9px] font-bold text-purple-300">
                      Superadmin
                    </span>
                  )}
                </div>
                {selectedUser?.name && (
                  <p className="text-xs text-zinc-400 mt-0.5">{selectedUser.name}</p>
                )}
              </div>
            </div>

            {/* Quick change dropdown if user made a wrong selection */}
            <div className="pt-2 border-t border-zinc-800">
              <label className="text-[10px] font-semibold text-zinc-400 block mb-1">
                Wrong user? Assign to a different user:
              </label>
              <div className="relative">
                <select
                  value={selectedUserId}
                  onChange={(e) => handleUserChange(e.target.value)}
                  className="w-full rounded-xl border border-zinc-800 bg-zinc-950 py-2 pl-3 pr-8 text-xs font-mono text-zinc-200 focus:border-emerald-500 focus:outline-none appearance-none cursor-pointer"
                >
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      @{u.username} {u.name ? `· ${u.name}` : ""} {u.role === "superadmin" ? "(Superadmin)" : ""}
                    </option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400" />
              </div>
            </div>
          </div>

          {/* Tokens Summary */}
          <div className="rounded-xl border border-zinc-800 bg-[#141416] p-3.5 space-y-2">
            <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">
              Token Details ({parsed.length})
            </div>
            {parsed.map((p) => (
              <div
                key={p.tokenNumber}
                className="flex items-center justify-between text-xs py-1 border-b border-zinc-800/60 last:border-0"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <Car className="h-3.5 w-3.5 text-zinc-400 shrink-0" />
                  <span className="font-mono font-bold text-white break-all">
                    {p.vehicleNumber || "Unknown Vehicle"}
                  </span>
                  <span className="font-mono text-zinc-400">· #{p.tokenNumber}</span>
                </div>
                <span className="font-semibold text-emerald-400 shrink-0 ml-2">
                  {p.amount != null ? `Rs ${p.amount}` : ""}
                </span>
              </div>
            ))}
          </div>

          {/* Inline Error Alert (e.g. if already assigned to other user) */}
          {inlineError && (
            <div className="rounded-xl border border-rose-500/40 bg-rose-950/30 p-3.5 text-xs text-rose-300 flex items-start gap-2.5">
              <AlertTriangle className="h-4 w-4 text-rose-400 shrink-0 mt-0.5" />
              <div className="flex-1">
                <div className="font-bold text-rose-200">Assignment Conflict</div>
                <div className="mt-0.5 leading-relaxed">{inlineError}</div>
              </div>
            </div>
          )}
        </div>
      ) : (
        /* Standard Import Form */
        <>
          {/* Target User Selector or Current User Badge */}
          {canChooseUser ? (
            users.length > 0 && (
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-3">
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-300 block flex items-center gap-1.5">
                    <UserIcon className="h-3.5 w-3.5 text-emerald-400" />
                    <span>Assign to User</span>
                    {isPublic && (
                      <span className="rounded bg-amber-500/10 border border-amber-500/20 px-1.5 py-0.2 text-[9px] font-semibold text-amber-300">
                        Confirmation Required
                      </span>
                    )}
                  </label>
                  <span className="text-[10px] text-emerald-400 font-semibold flex items-center gap-1">
                    <Check className="h-3 w-3" />
                    <span>{isPublic ? "Public Remembered" : "Remembered for you"}</span>
                  </span>
                </div>
                <div className="relative">
                  <UserIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
                  <select
                    value={selectedUserId}
                    onChange={(e) => handleUserChange(e.target.value)}
                    className="w-full rounded-xl border border-zinc-800 bg-zinc-900/90 py-2.5 pl-9 pr-9 text-xs font-mono text-zinc-100 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/40 focus:outline-none appearance-none cursor-pointer"
                  >
                    {users.map((u) => (
                      <option key={u.id} value={u.id} className="bg-zinc-900 text-zinc-100 font-mono">
                        @{u.username} {u.name ? `· ${u.name}` : ""} {u.role === "superadmin" ? "(Superadmin)" : ""}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
                </div>
              </div>
            )
          ) : (
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <UserIcon className="h-4 w-4 text-emerald-400" />
                <span className="text-xs font-medium text-zinc-300">
                  Assigning to your account: <strong className="font-mono text-white">@{currentUser?.username}</strong>
                </span>
              </div>
              <span className="rounded bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 text-[10px] font-semibold text-emerald-400">
                Current User
              </span>
            </div>
          )}

          {/* Inline Error on normal form if any */}
          {inlineError && (
            <div className="rounded-xl border border-rose-500/40 bg-rose-950/30 p-3.5 text-xs text-rose-300 flex items-start gap-2.5">
              <AlertTriangle className="h-4 w-4 text-rose-400 shrink-0 mt-0.5" />
              <div className="flex-1">
                <div className="font-bold text-rose-200">Unable to Add Token</div>
                <div className="mt-0.5 leading-relaxed">{inlineError}</div>
              </div>
            </div>
          )}

          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 block mb-1">
              SMS Message (Urdu / English)
            </label>
            <textarea
              dir="rtl"
              autoFocus={!initial}
              value={text}
              onChange={(e) => handleTextChange(e.target.value)}
              placeholder="یہاں ٹوکن میسج پیسٹ کریں..."
              className="input h-28 resize-none text-sm leading-relaxed"
            />
          </div>

          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 block mb-1">
              Phone Number <span className="text-zinc-500 font-normal">(optional)</span>
            </label>
            <input
              value={phone}
              onChange={(e) => {
                setPhone(e.target.value);
                setInlineError(null);
              }}
              inputMode="tel"
              placeholder="03XXXXXXXXX"
              className="input text-sm"
            />
          </div>

          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 mb-1.5">
              Detected Tokens ({parsed.length})
            </div>

            {parsed.length === 0 ? (
              <div className="rounded-xl border border-dashed border-zinc-800 bg-zinc-900 p-4 text-center text-xs text-zinc-500">
                Paste your message above. Vehicle number, token ID, and relief amount will auto-populate.
              </div>
            ) : (
              <div className="space-y-2">
                {previewMatches.map(({ p, match }) => (
                  <div
                    key={p.tokenNumber}
                    className={`rounded-xl border p-3 text-xs ${
                      match
                        ? "border-amber-500/30 bg-amber-950/20"
                        : "border-emerald-500/30 bg-emerald-950/20"
                    }`}
                  >
                    <div className="flex items-center justify-between text-zinc-200">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-sm text-emerald-400">
                          {p.tokenNumber}
                        </span>
                        {match && (
                          <span className="rounded bg-amber-500/15 border border-amber-500/30 px-1.5 py-0.5 text-[10px] font-medium text-amber-300">
                            {match.tokenNumber === p.tokenNumber
                              ? "Updates existing token"
                              : `Updates existing vehicle (${match.vehicleNumber})`}
                          </span>
                        )}
                      </div>
                      <span className="font-semibold">{p.amount != null ? `Rs ${p.amount}` : ""}</span>
                    </div>
                    <div className="mt-1 flex items-center justify-between text-zinc-400">
                      <span className="font-mono">{p.vehicleNumber || "Unknown Vehicle"}</span>
                      <span>{fmt(p.validUntil)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
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
      <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 block mb-1">
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
            className="flex-1 h-11 rounded-xl bg-emerald-500 text-sm font-bold text-zinc-950 hover:bg-emerald-400 active:scale-98 transition-colors"
            onClick={save}
          >
            Save Token
          </button>
          <button
            className="h-11 rounded-xl border border-zinc-800 bg-zinc-800/80 px-4 text-sm font-semibold text-zinc-300 hover:text-white active:bg-zinc-800 transition-colors"
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
          <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 block mb-1">
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
          className="w-full h-11 rounded-xl border border-zinc-800 bg-zinc-800/80 text-sm font-semibold text-zinc-200 hover:text-white active:bg-zinc-800 transition-colors"
          onClick={onClose}
        >
          Close History
        </button>
      }
    >
      {list.length === 0 ? (
        <div className="rounded-xl border border-zinc-800/90 bg-[#18181b] p-8 text-center text-xs text-zinc-500">
          No previous usages recorded for this token yet.
        </div>
      ) : (
        <div className="space-y-2">
          {list.map((u, i) => (
            <div
              key={u._id}
              className="flex items-center justify-between rounded-xl border border-zinc-800/90 bg-[#18181b] p-3 text-xs shadow-sm"
            >
              <div className="flex items-center gap-2">
                <span className="flex h-5 w-5 items-center justify-center rounded bg-zinc-800/90 font-mono text-[10px] text-zinc-400 border border-zinc-700/60">
                  #{list.length - i}
                </span>
                <span className="font-mono text-zinc-200">{fmt(u.usedAt)}</span>
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

/* ---------------- Login Modal (Username & Custom Password) ---------------- */

function LoginModal({
  onClose,
  onSuccess,
  onError,
}: {
  onClose: () => void;
  onSuccess: (user: UserSession) => void;
  onError: (m: string) => void;
}) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!password.trim()) return;
    setLoading(true);
    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: username.trim() || "admin",
          password: password.trim(),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || "Invalid username or password");
      }
      onSuccess(data.user);
    } catch (err: unknown) {
      onError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <ModalSheet
      title="Login to Account"
      subtitle="Enter your username and password to unlock records"
      onClose={onClose}
      footer={
        <div className="flex gap-2">
          <button
            className="flex-1 h-11 rounded-xl bg-emerald-500 text-sm font-bold text-zinc-950 hover:bg-emerald-400 active:scale-98 transition-colors disabled:opacity-50 shadow-sm shadow-emerald-500/20"
            onClick={() => handleSubmit()}
            disabled={!password.trim() || loading}
          >
            {loading ? "Verifying..." : "Login"}
          </button>
          <button
            className="h-11 rounded-xl border border-zinc-800 bg-zinc-800/80 px-4 text-sm font-semibold text-zinc-300 hover:text-white active:bg-zinc-800 transition-colors"
            onClick={onClose}
          >
            Cancel
          </button>
        </div>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-3.5 py-1">
        <div>
          <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 block mb-1">
            Username
          </label>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/\s+/g, ""))}
            placeholder="Username (e.g. admin)"
            className="w-full rounded-xl border border-zinc-800 bg-zinc-900/90 px-3.5 py-2.5 text-sm text-white font-mono placeholder-zinc-500 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/40 focus:outline-none"
            autoFocus
          />
        </div>

        <div>
          <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 block mb-1">
            Custom Password
          </label>
          <div className="relative">
            <input
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter password"
              className="w-full rounded-xl border border-zinc-800 bg-zinc-900/90 px-3.5 py-2.5 text-sm text-white placeholder-zinc-500 pr-10 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/40 focus:outline-none"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-white"
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>
      </form>
    </ModalSheet>
  );
}
